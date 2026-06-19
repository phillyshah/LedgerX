#!/usr/bin/env python3
"""
Inbound-email IMAP poller (minimal version).

Cron-driven helper that runs on a VPS, fetches UNSEEN messages from a mailbox
you control, and forwards each one as JSON to the Supabase inbound-email edge
function. Only marks a message \\Seen if the function returned 200, so a
transient failure just retries next run.

Recommended cron entry:
    */5 * * * * /usr/bin/python3 /opt/inbox-poller/poll_inbox.py >> /var/log/inbox-poller.log 2>&1

Configuration is read from environment variables (or a sibling .env file
named poll_inbox.env). See poll_inbox.env.example.
"""

import imaplib
import email
import email.policy
import base64
import json
import os
import re
import sys
import urllib.request
import urllib.error
from datetime import datetime


# ─── Config (env or .env file) ───────────────────────────────────────────────
def _load_env_file():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.environ.get("POLL_INBOX_ENV", os.path.join(script_dir, "poll_inbox.env"))
    if not os.path.isfile(env_path):
        return
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env_file()

CONFIG = {
    "IMAP_HOST":      os.environ["INBOX_IMAP_HOST"],
    "IMAP_PORT":      int(os.environ.get("INBOX_IMAP_PORT", "993")),
    "IMAP_USER":      os.environ["INBOX_IMAP_USER"],
    "IMAP_PASSWORD":  os.environ["INBOX_IMAP_PASSWORD"],
    "FUNCTION_URL":   os.environ["INBOX_FUNCTION_URL"],
    "INBOUND_SECRET": os.environ["INBOX_INBOUND_SECRET"],
    "MAX_ATTACH_BYTES": int(os.environ.get("INBOX_MAX_ATTACH_BYTES", str(10 * 1024 * 1024))),
}

# MIME types we forward. Anything else is dropped to save edge-function cycles.
ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/heic", "image/gif",
    "application/pdf",
}


# ─── Logging ─────────────────────────────────────────────────────────────────
def log(msg: str):
    ts = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    print(f"[{ts}] {msg}", flush=True)


# ─── IMAP helpers ────────────────────────────────────────────────────────────
def fetch_unseen(imap):
    """Yield (uid_bytes, parsed_email_message) for every UNSEEN message."""
    imap.select("INBOX")
    _, uid_data = imap.uid("search", None, "UNSEEN")
    for uid in uid_data[0].split():
        _, msg_data = imap.uid("fetch", uid, "(BODY.PEEK[])")
        raw = msg_data[0][1]
        yield uid, email.message_from_bytes(raw, policy=email.policy.default)


def mark_seen(imap, uid: bytes):
    imap.uid("store", uid, "+FLAGS", "\\Seen")


def extract_attachments(msg):
    """Return list of {filename, content_type, data (base64)} for allowed parts."""
    out = []
    for part in msg.walk():
        ct = part.get_content_type()
        if ct not in ALLOWED_TYPES:
            continue
        payload = part.get_payload(decode=True)
        if not payload or len(payload) > CONFIG["MAX_ATTACH_BYTES"]:
            continue
        filename = part.get_filename() or f"attachment.{ct.split('/')[-1]}"
        out.append({
            "filename": str(filename),
            "content_type": ct,
            "data": base64.b64encode(payload).decode("ascii"),
        })
    return out


def extract_body(msg):
    """Return (text, html) for the first non-attachment text/plain and text/html parts."""
    body_text, body_html = None, None
    for part in msg.walk():
        ct = part.get_content_type()
        cd = str(part.get("Content-Disposition", ""))
        if "attachment" in cd:
            continue
        if ct == "text/plain" and body_text is None:
            payload = part.get_payload(decode=True)
            if payload:
                charset = part.get_content_charset() or "utf-8"
                try:
                    body_text = payload.decode(charset, errors="replace")
                except Exception:
                    body_text = payload.decode("utf-8", errors="replace")
        elif ct == "text/html" and body_html is None:
            payload = part.get_payload(decode=True)
            if payload:
                charset = part.get_content_charset() or "utf-8"
                try:
                    body_html = payload.decode(charset, errors="replace")
                except Exception:
                    body_html = payload.decode("utf-8", errors="replace")
    return body_text, body_html


# ─── Edge-function POST ──────────────────────────────────────────────────────
def post_to_function(payload: dict) -> bool:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        CONFIG["FUNCTION_URL"],
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {CONFIG['INBOUND_SECRET']}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            log(f"  → function response: {result}")
            return True
    except urllib.error.HTTPError as e:
        log(f"  → HTTP {e.code}: {e.read().decode()}")
        return False
    except Exception as ex:
        log(f"  → error: {ex}")
        return False


# ─── Main ────────────────────────────────────────────────────────────────────
def main():
    log(f"connecting to {CONFIG['IMAP_HOST']}:{CONFIG['IMAP_PORT']} as {CONFIG['IMAP_USER']}")
    try:
        imap = imaplib.IMAP4_SSL(CONFIG["IMAP_HOST"], CONFIG["IMAP_PORT"])
        imap.login(CONFIG["IMAP_USER"], CONFIG["IMAP_PASSWORD"])
    except Exception as ex:
        log(f"IMAP connection failed: {ex}")
        sys.exit(1)

    processed = 0
    for uid, msg in fetch_unseen(imap):
        # policy.default may return Header objects; coerce to str so json.dumps
        # doesn't choke and downstream string ops are safe.
        from_addr = str(msg.get("From", "") or "")
        subject = str(msg.get("Subject", "") or "")
        msg_id = str(msg.get("Message-ID", "") or "").strip().strip("<>").strip()
        m = re.search(r"<([^>]+)>", from_addr)
        from_email = m.group(1).strip() if m else from_addr.strip()

        log(f"processing from={from_email!r} subject={subject[:80]!r}")

        attachments = extract_attachments(msg)
        body_text, body_html = extract_body(msg)

        payload = {
            "from_email": from_email,
            "subject": subject,
            "message_id": msg_id or None,
            "attachments": attachments,
            "body_text": body_text,
            "body_html": body_html,
        }

        if post_to_function(payload):
            mark_seen(imap, uid)
            processed += 1

    imap.logout()
    log(f"done; processed={processed}")


if __name__ == "__main__":
    main()
