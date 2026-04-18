# Quick Start

## Dev Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm run lint` | ESLint |
| `npm run preview` | Preview production build |

## Environment Variables

Required in `.env`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Edge functions also need `OPENAI_API_KEY` set in Supabase dashboard (Settings → Edge Functions → Secrets).

## Supabase

```bash
# Apply migrations
supabase db push

# Deploy edge functions
supabase functions deploy extract-receipt
supabase functions deploy admin-create-user
supabase functions deploy admin-delete-user
supabase functions deploy admin-change-password
```

## Testing Changes

1. Run `npm run typecheck` after any code change
2. Run `npm run build` to verify production build
3. No test suite exists — verify manually in browser
