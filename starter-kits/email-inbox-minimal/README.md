# Email Inbox — minimal starter kit

A no-frills pipeline that turns forwarded emails into rows in your Supabase
database. Strips out the OCR / vision / prefilled-form logic from the full
LedgerX version — you store the raw email and process it however your app
needs to.

```
   User's email client
         │  (forwards a message)
         ▼
   Inbound mailbox  receipts@your-domain.com   ← any IMAP host
         │
         │  fetch unseen, every 5 min from a VPS
         ▼
   poll_inbox.py
         │
         │  POST JSON  + Bearer <INBOUND_SECRET>
         ▼
   Supabase Edge Function  (inbound-email)
         │
         │  1. verify secret
         │  2. resolve sender email → user_id   (RPC, SECURITY DEFINER)
         │  3. dedupe by (user_id, message_id, status='pending')
         │  4. upload attachments → Storage
         │  5. insert pending row with from / subject / body_text / body_html
         ▼
   email_inbox  (per-user RLS)
         │
         │  Your app reads this table and does whatever it likes.
         ▼
   Your processing — anything from a manual review UI to a worker that
   reads body_text / body_html / attachments and turns them into domain rows.
```

## What's in (and what isn't)

In:
- Tables + RLS (`user_sender_emails`, `email_inbox`)
- Sender → user lookup RPC (SECURITY DEFINER)
- Storage RLS for `email-inbox/{user_id}/...` attachments
- Edge function: secret check, sender resolution, dedup, attachment upload, row insert
- IMAP poller (Python + cron)
- Reference React hook + panel for browsing the raw inbox

Out (compared to the full LedgerX kit):
- OpenAI vision OCR
- Email body OCR fallback
- `prefilled` JSONB column
- `kind` heuristic
- WeasyPrint HTML → PDF rendering

What lands in `email_inbox` per email:

| Column | Source |
|---|---|
| `from_email` | the bare sender address |
| `subject` | the email subject |
| `body_text` | first `text/plain` part |
| `body_html` | first `text/html` part |
| `attachment_paths` | array of storage paths (`email-inbox/<user_id>/<uuid>.<ext>`) |
| `message_id` | unwrapped Message-ID header (for dedup) |
| `status` | `pending` / `accepted` / `discarded` |
| `received_at` | when the row was inserted |

## Setup

### 1. Mailbox

Any IMAP-accessible mailbox you control (Hostinger, Fastmail, Migadu, etc.).
Users forward to it from addresses they've registered.

### 2. Supabase schema + bucket

```
supabase migration new email_inbox            # paste migrations/0001_schema.sql
supabase migration new email_inbox_storage    # paste migrations/0002_storage_policy.sql
supabase db push
```

Create a private storage bucket. The starter assumes `attachments` — change
the `STORAGE_BUCKET` constant in two places (`edge-function/index.ts` and
`frontend/EmailInboxPanel.tsx`) and the bucket name in `0002_storage_policy.sql`
if you call yours something else.

### 3. Edge function

```
supabase functions new inbound-email
cp edge-function/index.ts supabase/functions/inbound-email/
supabase secrets set INBOUND_EMAIL_SECRET="$(openssl rand -hex 32)"
supabase functions deploy inbound-email --no-verify-jwt
```

`--no-verify-jwt` is required — the function authenticates with its own
shared bearer secret, not a Supabase JWT.

### 4. VPS poller

```
sudo mkdir -p /opt/inbox-poller
sudo cp scripts/poll_inbox.py        /opt/inbox-poller/
sudo cp scripts/poll_inbox.env.example /opt/inbox-poller/poll_inbox.env
sudo chmod 600 /opt/inbox-poller/poll_inbox.env
sudo nano /opt/inbox-poller/poll_inbox.env   # fill in IMAP creds + secret + URL
sudo crontab -e
# add:
*/5 * * * * /usr/bin/python3 /opt/inbox-poller/poll_inbox.py >> /var/log/inbox-poller.log 2>&1
```

### 5. Frontend (optional)

The included `useEmailInbox` hook + `EmailInboxPanel` are a reference UI for
browsing the inbox manually. If your app processes inbox rows programmatically,
you can skip them entirely — just read from the `email_inbox` table.

Don't forget a settings UI for `useSenderEmails().add(email)` so users can
register the addresses they'll forward from.

## Files

```
email-inbox-minimal/
├── README.md
├── migrations/
│   ├── 0001_schema.sql
│   └── 0002_storage_policy.sql
├── edge-function/
│   └── index.ts
├── scripts/
│   ├── poll_inbox.py
│   └── poll_inbox.env.example
└── frontend/
    ├── useEmailInbox.ts
    └── EmailInboxPanel.tsx
```

## Trust model

You trust that the address a user registers actually belongs to them, and
that nobody else knows their exact registered address well enough to spoof
the `From` header. Good enough for a personal / internal tool. For
higher-stakes apps validate DKIM in the polling script before posting to
the edge function.
