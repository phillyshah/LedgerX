#!/usr/bin/env bash
# ledgerx-keepalive.sh — keep the free-tier Supabase project from getting paused.
#
# Supabase pauses free-tier projects after ~7 days with no database activity.
# This script runs three lightweight read queries against the project's REST
# API; PostgREST translates each into a real SELECT against the database,
# which is what Supabase counts as activity. RLS may return zero rows for
# anon — that's fine, the query still executes.
#
# Recommended cron cadence: every 3 days, so a single missed run never
# trips the 7-day pause threshold. Example crontab line at the bottom.
#
# Required env vars (or place them in a sibling .env file):
#   SUPABASE_URL       — e.g. https://abcdefgh.supabase.co
#   SUPABASE_ANON_KEY  — the project's anon key (safe to keep on a VPS;
#                        it's the same key the frontend ships with)
#
# Optional:
#   LOG_FILE           — defaults to /var/log/ledgerx-keepalive.log,
#                        falls back to a sibling file if the default
#                        isn't writable.
#   ENV_FILE           — defaults to .env next to this script.
#
# Exit code:
#   0 — at least one endpoint succeeded (DB was hit, project stays active)
#   1 — all three endpoints failed (something is wrong — investigate)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/ledgerx-keepalive.env}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  . "$ENV_FILE"
  set +a
fi

: "${SUPABASE_URL:?Set SUPABASE_URL (e.g. https://xxx.supabase.co)}"
: "${SUPABASE_ANON_KEY:?Set SUPABASE_ANON_KEY (project anon key)}"

LOG_FILE="${LOG_FILE:-/var/log/ledgerx-keepalive.log}"
if ! touch "$LOG_FILE" 2>/dev/null; then
  LOG_FILE="$SCRIPT_DIR/ledgerx-keepalive.log"
  touch "$LOG_FILE"
fi

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG_FILE"
}

ping_rest() {
  local path="$1"
  local label="$2"
  local status
  status=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    "$SUPABASE_URL$path" 2>/dev/null || printf '000')
  log "$label HTTP $status ($path)"
  [[ "$status" =~ ^2[0-9][0-9]$ ]]
}

log "==== keepalive start ===="
ok=0
# Three diverse tables; each request runs a real SQL query against the DB
# even when RLS returns zero rows to anon. Three is enough redundancy if
# one table is renamed or its policy changes; a single success is enough
# to reset the activity clock.
ping_rest '/rest/v1/households?select=id&limit=1' 'households' && ok=$((ok+1)) || true
ping_rest '/rest/v1/categories?select=id&limit=1' 'categories' && ok=$((ok+1)) || true
ping_rest '/rest/v1/expenses?select=id&limit=1'   'expenses'   && ok=$((ok+1)) || true
log "==== keepalive done (successes=$ok/3) ===="

[[ "$ok" -ge 1 ]]

# ─── Deploy on a VPS ─────────────────────────────────────────────────────────
#
# 1. Copy this script + the env example onto the box (anywhere writable):
#
#      sudo mkdir -p /opt/ledgerx-keepalive
#      sudo cp scripts/ledgerx-keepalive.sh         /opt/ledgerx-keepalive/
#      sudo cp scripts/ledgerx-keepalive.env.example /opt/ledgerx-keepalive/ledgerx-keepalive.env
#      sudo chmod +x /opt/ledgerx-keepalive/ledgerx-keepalive.sh
#      sudo chmod 600 /opt/ledgerx-keepalive/ledgerx-keepalive.env
#
# 2. Fill in SUPABASE_URL and SUPABASE_ANON_KEY in the .env file.
#
# 3. Smoke-test once by hand:
#
#      /opt/ledgerx-keepalive/ledgerx-keepalive.sh
#      tail /var/log/ledgerx-keepalive.log   # or the sibling fallback
#
# 4. Add a crontab entry — every 3 days at 04:17 UTC (any quiet time works):
#
#      sudo crontab -e
#      17 4 */3 * * /opt/ledgerx-keepalive/ledgerx-keepalive.sh >/dev/null 2>&1
#
# That's it. Inspect /var/log/ledgerx-keepalive.log after a few runs to
# confirm 2xx responses.
