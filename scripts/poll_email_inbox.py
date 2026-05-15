#!/usr/bin/env python3
"""
LedgerX inbound-email poller
────────────────────────────
Runs on the VPS as a cron job (every 5 minutes).
Connects to the receipts@90ten.life IMAP mailbox, fetches unseen messages,
and forwards each one to the Supabase inbound-email edge function.

Cron entry (crontab -e):
    */5 * * * * /usr/bin/python3 /opt/ledgerx/poll_email_inbox.py >> /var/log/ledgerx_email.log 2>&1

Configuration: edit the CONFIG block below, or set the equivalent
environment variables (env vars take precedence).
"""

import imaplib
import email
import email.policy
import base64
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime

# ── Configuration ─────────────────────────────────────────────────────────────
# Fill these in once you have the Hostinger mailbox credentials.
# You can also set them as environment variables on the VPS.

CONFIG = {
    # Hostinger IMAP settings for receipts@90ten.life
    "IMAP_HOST":     os.environ.get("LEDGERX_IMAP_HOST",     "imap.hostinger.com"),
    "IMAP_PORT":     int(os.environ.get("LEDGERX_IMAP_PORT", "993")),
    "IMAP_USER":     os.environ.get("LEDGERX_IMAP_USER",     "receipts@90ten.life"),
    "IMAP_PASSWORD": os.environ.get("LEDGERX_IMAP_PASSWORD", "REPLACE_WITH_MAILBOX_PASSWORD"),

    # Supabase edge function endpoint
    "FUNCTION_URL":  os.environ.get("LEDGERX_FUNCTION_URL",
                                    "https://bkxccrbfjoqtxbtekrgw.supabase.co/functions/v1/inbound-email"),

    # Shared secret — must match INBOUND_EMAIL_SECRET in Supabase secrets
    "INBOUND_SECRET": os.environ.get("LEDGERX_INBOUND_SECRET", "REPLACE_WITH_SHARED_SECRET"),

    # Max attachment size to upload (bytes). Larger attachments are skipped.
    "MAX_ATTACH_BYTES": 10 * 1024 * 1024,  # 10 MB
}

# Allowed attachment MIME types
ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/heic",
    "application/pdf",
}

# ── Logging ───────────────────────────────────────────────────────────────────
def log(msg: str):
    print(f"[{datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')}] {msg}", flush=True)

# ── IMAP helpers ──────────────────────────────────────────────────────────────
def fetch_unseen(imap: imaplib.IMAP4_SSL):
    """Return list of (uid_bytes, email.message.Message) for UNSEEN messages."""
    imap.select("INBOX")
    _, uid_data = imap.uid("search", None, "UNSEEN")
    uids = uid_data[0].split()
    messages = []
    for uid in uids:
        _, msg_data = imap.uid("fetch", uid, "(BODY.PEEK[])")
        raw = msg_data[0][1]
        msg = email.message_from_bytes(raw, policy=email.policy.default)
        messages.append((uid, msg))
    return messages

def mark_seen(imap: imaplib.IMAP4_SSL, uid: bytes):
    imap.uid("store", uid, "+FLAGS", "\\Seen")

def extract_attachments(msg):
    """Return list of {filename, content_type, data (base64 str)} for relevant parts.

    Accepts images regardless of disposition, and PDFs whether marked
    as inline or attachment — some vendors (DocuSign, Square, European
    e-invoice senders) ship the receipt PDF with `Content-Disposition: inline`
    and the previous attachment-only filter dropped them on the floor.
    """
    attachments = []
    for part in msg.walk():
        ct = part.get_content_type()
        if ct not in ALLOWED_TYPES:
            continue
        payload = part.get_payload(decode=True)
        if not payload or len(payload) > CONFIG["MAX_ATTACH_BYTES"]:
            continue
        filename = part.get_filename() or f"attachment.{ct.split('/')[-1]}"
        attachments.append({
            "filename": str(filename),
            "content_type": ct,
            "data": base64.b64encode(payload).decode("ascii"),
        })
    return attachments

def extract_body(msg):
    """Return (body_text, body_html) for the first text/plain and text/html parts.

    Many vendors (Uber, Lyft, airline/hotel "your receipt" emails, SaaS
    invoices, etc.) embed the receipt directly in the message body — no
    PDF or image attached. We forward both flavors when present so the
    edge function can OCR the inline content the same way it handles
    attached images.
    """
    body_text = None
    body_html = None
    for part in msg.walk():
        ct = part.get_content_type()
        cd = str(part.get("Content-Disposition", ""))
        # Skip anything explicitly attached — that's handled by extract_attachments.
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

# ── Edge function call ────────────────────────────────────────────────────────
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
        log(f"  → error calling function: {ex}")
        return False

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    if CONFIG["IMAP_PASSWORD"] == "REPLACE_WITH_MAILBOX_PASSWORD":
        log("ERROR: IMAP password not configured. Set LEDGERX_IMAP_PASSWORD env var.")
        sys.exit(1)
    if CONFIG["INBOUND_SECRET"] == "REPLACE_WITH_SHARED_SECRET":
        log("ERROR: Inbound secret not configured. Set LEDGERX_INBOUND_SECRET env var.")
        sys.exit(1)

    log(f"Connecting to {CONFIG['IMAP_HOST']}:{CONFIG['IMAP_PORT']} as {CONFIG['IMAP_USER']}")
    try:
        imap = imaplib.IMAP4_SSL(CONFIG["IMAP_HOST"], CONFIG["IMAP_PORT"])
        imap.login(CONFIG["IMAP_USER"], CONFIG["IMAP_PASSWORD"])
    except Exception as ex:
        log(f"IMAP connection failed: {ex}")
        sys.exit(1)

    messages = fetch_unseen(imap)
    log(f"Found {len(messages)} unseen message(s)")

    for uid, msg in messages:
        # `policy.default` can return Header objects for encoded values
        # (e.g. RFC2047-encoded non-ASCII subjects). Coerce to plain str
        # so json.dumps in post_to_function() doesn't choke and so
        # downstream string ops are safe.
        from_addr = str(msg.get("From", "") or "")
        subject   = str(msg.get("Subject", "") or "")
        # Strip angle brackets so the edge function's dedup lookup
        # matches consistently regardless of which mail client added them.
        msg_id    = str(msg.get("Message-ID", "") or "").strip().strip("<>").strip()

        # Extract just the email address from "Name <addr>" format
        import re
        m = re.search(r"<([^>]+)>", from_addr)
        from_email = m.group(1).strip() if m else from_addr.strip()

        log(f"Processing: from={from_email!r} subject={subject[:80]!r} msg_id={msg_id!r}")

        attachments = extract_attachments(msg)
        log(f"  Attachments: {[a['filename'] for a in attachments]}")

        body_text, body_html = extract_body(msg)
        log(f"  Body: text={'yes' if body_text else 'no'} html={'yes' if body_html else 'no'}")

        payload = {
            "from_email": from_email,
            "subject": subject,
            "message_id": msg_id or None,
            "attachments": attachments,
            "body_text": body_text,
            "body_html": body_html,
        }

        success = post_to_function(payload)
        if success:
            mark_seen(imap, uid)
            log(f"  Marked as seen.")
        else:
            log(f"  Left as unseen (will retry next poll).")

    imap.logout()
    log("Done.")

if __name__ == "__main__":
    main()
