// send-review-reminder
//
// Daily cron entry point. Emails whoever OWNS something that has been sitting
// unreviewed for more than 3 days:
//   * a receipt they forwarded that is still 'pending' in their email inbox
//   * a transaction they saved that still has no (valid) category
//
// Why this exists: forwarded receipts were disappearing into a queue nobody
// watched. The inbox panel hides itself entirely at zero and is easy to scroll
// past, so a 24-item backlog built up unnoticed in production. The bell now
// carries a live count (review_queue_summary), and this closes the loop for
// people who aren't in the app that day.
//
// Recipient is the OWNER, deliberately — the forwarder, or whoever saved the
// uncategorized transaction. They're the one who can resolve it, and it keeps
// admin inboxes quiet.
//
// Cadence: at most one reminder per user per 3 days, enforced against
// notification_log (kind='review_reminder'). Persistent enough to actually
// clear a backlog, infrequent enough not to get filtered to trash — which
// would also kill the other transactional mail from this sender.
//
// Authentication: triggered by pg_cron via pg_net. Requires an X-Cron-Secret
// header matching the CRON_SECRET env var. No user JWT is involved.
//
// All recipient selection (including the "older than N days" boundary and the
// real-email filter) lives in list_review_reminder_recipients so the rule has
// one home. That RPC is granted to service_role ONLY — it returns real contact
// addresses.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Cron-Secret",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_DAYS = 3;
const REMINDER_EVERY_DAYS = 3;

type Lang = "en" | "pt-BR";

interface Recipient {
  user_id: string;
  email: string;
  username: string;
  preferred_language: string;
  notify_channel: string;
  pending_inbox: number;
  uncategorized_expenses: number;
  oldest_at: string | null;
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Portuguese pluralization differs from English (and "receipt"/"recibo" don't
// share a plural rule), so each language owns its own sentence builders rather
// than interpolating into a shared template.
const STRINGS = {
  en: {
    subject: (n: number) =>
      n === 1 ? "1 item is waiting for your review" : `${n} items are waiting for your review`,
    heading: "Still waiting on you",
    greeting: (name: string) => `Hi ${name},`,
    intro: (days: number) =>
      `A few things have been sitting in LedgerX for more than ${days} days. A couple of taps and they're done.`,
    inbox: (n: number) =>
      n === 1
        ? "1 forwarded receipt is waiting to be reviewed"
        : `${n} forwarded receipts are waiting to be reviewed`,
    uncategorized: (n: number) =>
      n === 1 ? "1 transaction still needs a category" : `${n} transactions still need a category`,
    oldest: (days: number) =>
      days === 1 ? "Oldest item: 1 day old." : `Oldest item: ${days} days old.`,
    cta: "Review them now",
    footer:
      "You're getting this because these items are yours to review. We'll stop as soon as they're cleared.",
  },
  "pt-BR": {
    subject: (n: number) =>
      n === 1 ? "1 item aguardando sua revisão" : `${n} itens aguardando sua revisão`,
    heading: "Ainda esperando por você",
    greeting: (name: string) => `Olá ${name},`,
    intro: (days: number) =>
      `Alguns itens estão parados no LedgerX há mais de ${days} dias. Com poucos toques você resolve.`,
    inbox: (n: number) =>
      n === 1
        ? "1 recibo encaminhado aguardando revisão"
        : `${n} recibos encaminhados aguardando revisão`,
    uncategorized: (n: number) =>
      n === 1
        ? "1 transação ainda precisa de categoria"
        : `${n} transações ainda precisam de categoria`,
    oldest: (days: number) =>
      days === 1 ? "Item mais antigo: 1 dia." : `Item mais antigo: ${days} dias.`,
    cta: "Revisar agora",
    footer:
      "Você recebeu este e-mail porque estes itens são seus para revisar. Paramos assim que forem resolvidos.",
  },
} as const;

function reminderEmailHtml(params: {
  lang: Lang;
  name: string;
  pendingInbox: number;
  uncategorized: number;
  oldestDays: number | null;
  appUrl: string;
}): string {
  const t = STRINGS[params.lang];
  const bullets: string[] = [];
  if (params.pendingInbox > 0) bullets.push(t.inbox(params.pendingInbox));
  if (params.uncategorized > 0) bullets.push(t.uncategorized(params.uncategorized));

  const bulletHtml = bullets
    .map(
      (b) =>
        `<li style="margin:0 0 8px;color:#334155;font-size:15px;line-height:1.5;">${htmlEscape(b)}</li>`,
    )
    .join("");

  const oldestHtml =
    params.oldestDays !== null
      ? `<p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">${htmlEscape(t.oldest(params.oldestDays))}</p>`
      : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0f766e,#065f46);padding:28px 32px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.1em;color:#a7f3d0;text-transform:uppercase;">LedgerX</p>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">${htmlEscape(t.heading)}</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 14px;color:#334155;font-size:15px;">${htmlEscape(t.greeting(params.name))}</p>
      <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.5;">${htmlEscape(t.intro(STALE_AFTER_DAYS))}</p>
      <ul style="margin:0 0 22px;padding-left:20px;">${bulletHtml}</ul>
      <a href="${params.appUrl}" style="display:inline-block;background:linear-gradient(135deg,#059669,#0d9488);color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:10px;">
        ${htmlEscape(t.cta)} &rarr;
      </a>
      ${oldestHtml}
    </div>
    <div style="padding:16px 32px;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">${htmlEscape(t.footer)}</p>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const cronSecret = Deno.env.get("CRON_SECRET");
    const provided = req.headers.get("X-Cron-Secret");
    if (!cronSecret || provided !== cronSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const fromEmail = Deno.env.get("NOTIFICATION_FROM_EMAIL") ??
      "LedgerX <notifications@ledger.90ten.life>";
    const appUrl = Deno.env.get("APP_URL") ?? "https://ledger.90ten.life";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // A dry run reports exactly who WOULD be emailed without sending anything
    // or writing notification_log — used to sanity-check the query in
    // production before the cron is first scheduled.
    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
    } catch {
      // No body (the cron posts '{}') — normal path.
    }

    const { data: recipients, error: rpcErr } = await supabase
      .rpc("list_review_reminder_recipients", { p_days: STALE_AFTER_DAYS });
    if (rpcErr) throw rpcErr;

    const rows = (recipients ?? []) as Recipient[];
    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, candidates: 0, sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const now = Date.now();
    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];
    const wouldSend: string[] = [];

    for (const r of rows) {
      // Channel preference: suppress email only when the user has explicitly
      // chosen WhatsApp *and* actually has a number linked — otherwise a
      // preference would silently make them unreachable. Same rule as the
      // v12.2-patched send-* functions.
      if (r.notify_channel === "whatsapp") {
        const { count } = await supabase
          .from("user_phone_numbers")
          .select("id", { count: "exact", head: true })
          .eq("user_id", r.user_id);
        if ((count ?? 0) > 0) {
          skipped++;
          continue;
        }
      }

      // Cadence gate: at most one every REMINDER_EVERY_DAYS days.
      const { data: last } = await supabase
        .from("notification_log")
        .select("sent_at")
        .eq("user_id", r.user_id)
        .eq("kind", "review_reminder")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (last?.sent_at) {
        const daysSince = Math.floor((now - new Date(last.sent_at).getTime()) / DAY_MS);
        if (daysSince < REMINDER_EVERY_DAYS) {
          skipped++;
          continue;
        }
      }

      const total = r.pending_inbox + r.uncategorized_expenses;
      const lang: Lang = r.preferred_language === "pt-BR" ? "pt-BR" : "en";
      const oldestDays = r.oldest_at
        ? Math.floor((now - new Date(r.oldest_at).getTime()) / DAY_MS)
        : null;

      if (dryRun) {
        wouldSend.push(`${r.username} <${r.email}> — ${total} item(s)`);
        continue;
      }

      const html = reminderEmailHtml({
        lang,
        name: r.username,
        pendingInbox: r.pending_inbox,
        uncategorized: r.uncategorized_expenses,
        oldestDays,
        appUrl,
      });

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: r.email,
          subject: STRINGS[lang].subject(total),
          html,
        }),
      });

      if (res.ok) {
        sent++;
        await supabase.from("notification_log").insert({
          user_id: r.user_id,
          kind: "review_reminder",
          context: {
            pending_inbox: r.pending_inbox,
            uncategorized_expenses: r.uncategorized_expenses,
            oldest_days: oldestDays,
            to: r.email,
          },
        });
      } else {
        errors.push(`${r.email}: ${await res.text()}`);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        candidates: rows.length,
        sent,
        skipped,
        ...(dryRun ? { dry_run: true, would_send: wouldSend } : {}),
        ...(errors.length ? { errors } : {}),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
