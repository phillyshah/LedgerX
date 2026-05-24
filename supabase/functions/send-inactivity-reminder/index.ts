// send-inactivity-reminder
//
// Daily cron entry point. Walks every full admin and household admin who
// has a real email, checks how long it's been since they last did anything
// (auth login OR submitted a receipt OR submitted an invoice), and emails
// them a gentle, randomly-worded nudge if they're overdue.
//
// Cadence — escalating to avoid auto-spam:
//   - 14 days since last activity AND no reminder ever sent in the past 14
//     days → send. (First nudge.)
//   - 30 days since last activity AND last reminder was at least 14 days
//     ago → send. (Second nudge.)
//   - Beyond that, at most one reminder per 28 days. (Monthly nudge for
//     chronically inactive admins.)
//
// The "last activity" is computed by the get_user_last_activity SQL
// function so the data source stays in one place.
//
// Authentication: this function is meant to be triggered by pg_cron via
// pg_net. We require an X-Cron-Secret header matching the CRON_SECRET env
// var. There is no user JWT involved.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Cron-Secret",
};

const LEDGERX_DOMAIN = "@ledgerx.local";
const DAY_MS = 24 * 60 * 60 * 1000;

function isRealEmail(email: string | null | undefined): email is string {
  return !!email && !email.endsWith(LEDGERX_DOMAIN) && email.includes("@");
}

// Fun, low-pressure reminder copy. The cron pulls a random pair (subject
// + body intro) per send so back-to-back nudges to the same admin don't
// look like the same robot every time.
interface ReminderCopy {
  subject: string;
  greeting: string;
  body: string;
  cta: string;
}

const COPY_POOL: ReminderCopy[] = [
  {
    subject: "👋 LedgerX misses you",
    greeting: "Hi {name},",
    body:
      "It's been a hot minute since your last LedgerX activity. If a receipt has been hiding in your wallet (or your inbox), now's a great time to set it free.",
    cta: "Open LedgerX",
  },
  {
    subject: "Your receipts are getting lonely 🧾",
    greeting: "Hey {name},",
    body:
      "Two-ish weeks have passed and your receipts haven't seen the inside of LedgerX. Take 30 seconds — your future self doing the books will thank you.",
    cta: "Upload a receipt",
  },
  {
    subject: "Quick LedgerX nudge",
    greeting: "Hey {name},",
    body:
      "Just a friendly check-in. No pressure — if you've got receipts or invoices to log, the door's open. If not, ignore this email and we'll catch up next time.",
    cta: "Jump back in",
  },
  {
    subject: "Don't make us send the carrier pigeon 🐦",
    greeting: "Hi {name},",
    body:
      "We noticed it's been a while. The spreadsheet gods reward those who file as they go. One tap on the link below, drop your photos, done.",
    cta: "Log a transaction",
  },
  {
    subject: "Tiny reminder from LedgerX",
    greeting: "Hi {name},",
    body:
      "Hope you're well. This is your soft, friendly nudge — if any expenses or contractor invoices are due to be logged, the form takes less than a minute.",
    cta: "Open the app",
  },
  {
    subject: "Receipts on your phone? 📱",
    greeting: "Hey {name},",
    body:
      "Your last activity was a couple weeks back. If there are photos sitting on your camera roll or sneaking up in WhatsApp, LedgerX is ready for them.",
    cta: "Add it now",
  },
  {
    subject: "A gentle ledger poke",
    greeting: "Hello {name},",
    body:
      "Bookkeeping confession time: it's been a bit since you last opened LedgerX. We made the form short and the link below shorter still.",
    cta: "Catch up",
  },
];

function pickCopy(): ReminderCopy {
  return COPY_POOL[Math.floor(Math.random() * COPY_POOL.length)];
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reminderEmailHtml(params: {
  name: string;
  daysInactive: number;
  appUrl: string;
  copy: ReminderCopy;
}): string {
  const greeting = htmlEscape(params.copy.greeting.replace("{name}", params.name));
  const body = htmlEscape(params.copy.body);
  const cta = htmlEscape(params.copy.cta);
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0f766e,#065f46);padding:28px 32px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.1em;color:#a7f3d0;text-transform:uppercase;">LedgerX</p>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">A quick reminder</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 14px;color:#334155;font-size:15px;">${greeting}</p>
      <p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.5;">${body}</p>
      <a href="${params.appUrl}" style="display:inline-block;background:linear-gradient(135deg,#059669,#0d9488);color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:10px;">
        ${cta} →
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">Last activity: ${params.daysInactive} days ago.</p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">You're getting this because you're a LedgerX admin. We'll back off once you log in or submit a transaction.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Decide whether `userId` is due for a reminder right now.
 * @returns null if not due; otherwise an object describing the nudge.
 */
function shouldRemind(
  daysInactive: number,
  daysSinceLastReminder: number | null,
): { tier: "first" | "second" | "monthly" } | null {
  if (daysInactive < 14) return null;

  // Tier 1: first nudge at 14 days.
  if (daysInactive < 30) {
    if (daysSinceLastReminder === null || daysSinceLastReminder >= 14) {
      return { tier: "first" };
    }
    return null;
  }

  // Tier 2: second nudge at 30 days, but only if the first reminder was at
  // least 14 days ago. This handles the case where the admin got the
  // 14-day nudge but ignored it.
  if (daysInactive < 60) {
    if (daysSinceLastReminder === null || daysSinceLastReminder >= 14) {
      return { tier: "second" };
    }
    return null;
  }

  // Tier 3: monthly thereafter. 28-day spacing keeps it ~once a month.
  if (daysSinceLastReminder === null || daysSinceLastReminder >= 28) {
    return { tier: "monthly" };
  }
  return null;
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

    const fromEmail = Deno.env.get("NOTIFICATION_FROM_EMAIL") ?? "LedgerX <notifications@ledger.90ten.life>";
    const appUrl = Deno.env.get("APP_URL") ?? "https://ledger.90ten.life";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Pull every admin (full or household) with their profile bits.
    const { data: roles, error: rolesErr } = await supabase
      .from("user_roles")
      .select("user_id, is_admin, is_household_admin")
      .or("is_admin.eq.true,is_household_admin.eq.true");
    if (rolesErr) throw rolesErr;

    if (!roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, checked: 0, sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userIds = roles.map((r) => r.user_id);

    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, username, real_email, email")
      .in("id", userIds);

    const profileById = new Map<string, { username: string; email: string | null }>();
    for (const p of profiles ?? []) {
      const realEmail = isRealEmail(p.real_email) ? p.real_email : (isRealEmail(p.email) ? p.email : null);
      profileById.set(p.id, { username: p.username ?? "there", email: realEmail });
    }

    const now = Date.now();
    let sent = 0;
    let checked = 0;
    const errors: string[] = [];

    for (const role of roles) {
      const profile = profileById.get(role.user_id);
      if (!profile || !profile.email) continue;
      checked++;

      // Last activity timestamp via the SQL helper.
      const { data: lastActivityRaw, error: actErr } = await supabase
        .rpc("get_user_last_activity", { target_user_id: role.user_id });
      if (actErr) {
        errors.push(`${role.user_id}: ${actErr.message}`);
        continue;
      }
      const lastActivity = lastActivityRaw ? new Date(lastActivityRaw as string).getTime() : 0;
      const daysInactive = Math.floor((now - lastActivity) / DAY_MS);

      // Most recent inactivity reminder for this user.
      const { data: lastReminder } = await supabase
        .from("notification_log")
        .select("sent_at")
        .eq("user_id", role.user_id)
        .eq("kind", "inactivity_reminder")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const daysSinceLastReminder = lastReminder?.sent_at
        ? Math.floor((now - new Date(lastReminder.sent_at).getTime()) / DAY_MS)
        : null;

      const decision = shouldRemind(daysInactive, daysSinceLastReminder);
      if (!decision) continue;

      const copy = pickCopy();
      const html = reminderEmailHtml({
        name: profile.username,
        daysInactive,
        appUrl,
        copy,
      });

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: profile.email,
          subject: copy.subject,
          html,
        }),
      });

      if (res.ok) {
        sent++;
        await supabase.from("notification_log").insert({
          user_id: role.user_id,
          kind: "inactivity_reminder",
          context: { tier: decision.tier, days_inactive: daysInactive, to: profile.email },
        });
      } else {
        const errText = await res.text();
        errors.push(`${profile.email}: ${errText}`);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, checked, sent, errors: errors.length ? errors : undefined }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
