# Quick Start

## Dev Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) — has known pre-existing errors, build still succeeds |
| `npm run lint` | ESLint |
| `npm run preview` | Preview production build |

## Environment Variables

Required in `.env`:
```
VITE_SUPABASE_URL=https://bkxccrbfjoqtxbtekrgw.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Edge functions need in Supabase dashboard (Settings → Edge Functions → Secrets):
- `OPENAI_API_KEY` — for extract-receipt OCR
- `INBOUND_EMAIL_SECRET` — shared secret for IMAP poller auth (must match VPS env var `LEDGERX_INBOUND_SECRET`)

## Supabase

```bash
# Link project (one-time)
supabase link --project-ref bkxccrbfjoqtxbtekrgw

# Apply migrations
supabase db push

# Deploy edge functions
supabase functions deploy extract-receipt
supabase functions deploy update-user-email --no-verify-jwt   # ES256 workaround — see COMMON_MISTAKES #5
supabase functions deploy admin-create-user
supabase functions deploy admin-delete-user
supabase functions deploy admin-change-password
```

## Hostinger VPS Deploy (ledger.90ten.life)

```bash
# 1. Build on Mac
npm run build

# 2. Upload dist/ to VPS
rsync -avz --delete /Users/MACBOOK/Downloads/LedgerX/dist/ root@72.62.174.193:/var/www/ledger.90ten.life/
```

nginx config: `/etc/nginx/sites-enabled/ledger.90ten.life`  
SSL cert: auto-renews via certbot (issued 2026-04-28, renews on schedule)  
VPS IP: `72.62.174.193`

**Legacy domain:** `ledger.phillyshah.com` is preserved as a pure 301
redirect to `https://ledger.90ten.life` (config at
`/etc/nginx/sites-enabled/ledger.phillyshah.com`). Old bookmarks and
shared links keep working. Plan to retire the legacy vhost ~60 days
after cutover (2026-04-28).

## Supabase Auth Config (dashboard)

- **Authentication → URL Configuration → Site URL**: `https://ledger.90ten.life`
- **Redirect URLs**: `https://ledger.90ten.life/**` (keep `https://ledger.phillyshah.com/**` listed during the redirect transition window)
- **SMTP**: configure custom SMTP for password reset emails (Resend recommended)

## Email Inbox (VPS Setup)

The email forwarding feature requires:

1. **IMAP Mailbox**: Hostinger mailbox for `receipts@90ten.life` (configured once, ongoing)
2. **VPS Polling Script**: Python script runs every 5 minutes via cron (see `scripts/poll_email_inbox.py`)

Setup on VPS:
```bash
# Copy script to VPS
scp scripts/poll_email_inbox.py root@72.62.174.193:/opt/ledgerx/

# Set environment variables in crontab or systemd
# LEDGERX_IMAP_HOST, LEDGERX_IMAP_PORT, LEDGERX_IMAP_USER, LEDGERX_IMAP_PASSWORD
# LEDGERX_FUNCTION_URL (should be https://bkxccrbfjoqtxbtekrgw.supabase.co/functions/v1/inbound-email)
# LEDGERX_INBOUND_SECRET (must match the Supabase function secret INBOUND_EMAIL_SECRET)

# Add cron job (crontab -e):
*/5 * * * * /usr/bin/python3 /opt/ledgerx/poll_email_inbox.py >> /var/log/ledgerx_email.log 2>&1
```

## Testing Changes

1. Run `npm run build` to verify production build
2. No test suite — verify manually in browser at https://ledger.90ten.life

## Testing Email Inbox

After deploying the migrations and edge functions:
1. Forward a test email to `receipts@90ten.life`
2. Wait ~5 minutes for IMAP poller to run
3. Login and check Email Inbox (Dashboard for regular users, Admin Home for admins)
4. Verify attachment thumbnails appear (not empty rows)
