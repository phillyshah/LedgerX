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

## Hostinger VPS Deploy (ledger.phillyshah.com)

```bash
# 1. Build on Mac
npm run build

# 2. Upload dist/ to VPS
rsync -avz --delete /Users/MACBOOK/Downloads/LedgerX/dist/ root@72.62.174.193:/var/www/ledger.phillyshah.com/
```

nginx config: `/etc/nginx/sites-enabled/ledger.phillyshah.com`  
SSL cert: auto-renews via certbot (expires 2026-07-20)  
VPS IP: `72.62.174.193`

## Supabase Auth Config (dashboard)

- **Authentication → URL Configuration → Site URL**: `https://ledger.phillyshah.com`
- **Redirect URLs**: `https://ledger.phillyshah.com/**`
- **SMTP**: configure custom SMTP for password reset emails (Resend recommended)

## Testing Changes

1. Run `npm run build` to verify production build
2. No test suite — verify manually in browser at https://ledger.phillyshah.com
