# Email Inbox starter kit

An end-to-end pattern for letting users forward emails to an inbound mailbox
and have them turn into pending in-app cards (OCR'd, attachment-aware, with a
"Review" CTA that opens whatever form they should open).

Lifted from LedgerX and stripped of app-specific bits. The architecture is:

```
   User's email client
         │  (forwards a message)
         ▼
   Inbound mailbox at receipts@your-domain.com   ← any IMAP host (Hostinger, Fastmail, etc.)
         │
         │  IMAP fetch unseen (every 5 min cron on a VPS)
         ▼
   poll_inbox.py
         │
         │  POST JSON  + Bearer <INBOUND_SECRET>
         ▼
   Supabase Edge Function  (inbound-email)
         │
         │  1. verify secret
         │  2. resolve sender email → user_id    (RPC, SECURITY DEFINER)
         │  3. dedupe by (user_id, message_id, status='pending')
         │  4. upload attachments → Storage
         │  5. OCR (vision or body text fallback)
         │  6. insert pending row
         ▼
   email_inbox table (per-user RLS)
         │
         │  React hook re-fetches on focus/visibilitychange
         ▼
   EmailInboxPanel — cards with "Review" CTA → opens domain form prefilled
```

## What you swap for your app

1. **OCR prompts and `prefilled` schema** — see the TODO blocks in `edge-function/index.ts`. Replace the receipt/invoice prompts with whatever fields you need.
2. **`kind` heuristic** — `detectKind()` looks for keyword matches in subject + filenames. Adapt or remove.
3. **The "Review" CTA target** — `EmailInboxPanel` calls back into your app to open the right form prefilled.

Everything else (tables, RLS, storage policy, IMAP poller, dedup logic, year-repair) ports verbatim.

## Setup checklist

### 1. Mailbox

Set up any IMAP-accessible mailbox you control. Catch-all (`*@your-domain.com`)
is convenient so users can forward to `receipts+gmail@your-domain.com` and
similar variants, but a single inbox works fine.

### 2. Supabase schema

```
supabase db reset --linked   # or apply files manually in SQL editor
supabase migration new email_inbox   # then paste migrations/0001_schema.sql
supabase migration new email_inbox_storage_policy   # paste 0002_storage_policy.sql
supabase db push
```

Storage bucket: create a private bucket (the starter assumes the name
`attachments` — change it in one place if yours is different).

### 3. Edge function

```
supabase functions new inbound-email
cp edge-function/index.ts supabase/functions/inbound-email/
supabase secrets set \
  INBOUND_EMAIL_SECRET="$(openssl rand -hex 32)" \
  OPENAI_API_KEY="sk-..."
supabase functions deploy inbound-email --no-verify-jwt
```

`--no-verify-jwt` is important: the function does its own bearer-secret auth.

### 4. VPS polling

```
sudo mkdir -p /opt/inbox-poller
sudo cp scripts/poll_inbox.py        /opt/inbox-poller/
sudo cp scripts/poll_inbox.env.example /opt/inbox-poller/poll_inbox.env
sudo chmod 600 /opt/inbox-poller/poll_inbox.env
sudo nano /opt/inbox-poller/poll_inbox.env
sudo apt install -y python3-weasyprint   # optional, enables HTML→PDF
sudo crontab -e
# Add:
*/5 * * * * /usr/bin/python3 /opt/inbox-poller/poll_inbox.py >> /var/log/inbox-poller.log 2>&1
```

### 5. Frontend

Copy `frontend/useEmailInbox.ts` and `frontend/EmailInboxPanel.tsx` into your
React project. Wire `EmailInboxPanel` into wherever you want the cards to
appear; pass `onOpenForm(item)` to handle the "Review" click.

Add a settings UI for `useSenderEmails().add(email)` so users can register the
addresses they forward from.

## Trust model in one line

You trust that the address a user registers actually belongs to them, and that
nobody else knows their exact registered address well enough to spoof the
`From` header. Good enough for a personal/internal tool. For higher-stakes
apps, validate DKIM in the polling script before forwarding to the edge
function.

## Files

```
starter-kits/email-inbox/
├── README.md                            ← you are here
├── migrations/
│   ├── 0001_schema.sql                  ← tables, RLS, resolve_sender_email RPC
│   └── 0002_storage_policy.sql          ← storage bucket RLS
├── edge-function/
│   └── index.ts                         ← Deno handler
├── scripts/
│   ├── poll_inbox.py                    ← IMAP poller
│   └── poll_inbox.env.example
└── frontend/
    ├── useEmailInbox.ts                 ← React hook
    └── EmailInboxPanel.tsx              ← Card list UI
```
