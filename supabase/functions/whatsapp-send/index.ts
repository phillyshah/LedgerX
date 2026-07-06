/**
 * whatsapp-send edge function
 *
 * Drains the whatsapp_outbox queue (filled by the enqueue_whatsapp_notification
 * trigger on the notifications table) and delivers each row via the Twilio
 * WhatsApp API. Invoked by pg_cron every minute (see migration
 * 20260717000000_whatsapp_integration.sql) with the same X-Cron-Secret
 * handshake as send-inactivity-reminder.
 *
 * Delivery rules (WhatsApp policy):
 *   - If the recipient messaged the bot within the last ~24h (tracked in
 *     user_phone_numbers.last_inbound_at), a free-form message is allowed.
 *     We use a 23h cutoff for safety margin.
 *   - Outside the window, business-initiated messages require a pre-approved
 *     template: if TWILIO_TEMPLATE_SID is set, send it with the body as the
 *     single content variable ("LedgerX: {{1}}").
 *   - No window and no template (sandbox reality) → mark the row 'skipped'.
 *
 * Outcomes: Twilio 2xx → sent · error 63016/63015 (outside window / not in
 * sandbox) → skipped · other 4xx → failed (finish_whatsapp_outbox requeues
 * with backoff until 4 attempts) · 5xx/429 → failed (same backoff).
 *
 * Housekeeping per run: purge_whatsapp_dedup() and garbage-collect
 * whatsapp-staging/ files older than 24h that no live session references.
 *
 * Secrets: CRON_SECRET, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 * TWILIO_WHATSAPP_FROM, TWILIO_TEMPLATE_SID (optional), APP_URL,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

type Lang = "en" | "pt-BR";

interface OutboxRow {
  id: string;
  user_id: string;
  phone: string;
  payload: {
    kind: string;
    entity_type: string | null;
    entity_id: string | null;
    household_id: string | null;
    title: string | null;
    actor_username: string | null;
    lang: string;
  };
  attempts: number;
}

// One line per notification kind, mirroring the bell's wording.
const BODIES: Record<Lang, Record<string, string>> = {
  en: {
    estimate_created: '📋 *LedgerX*: New estimate "{title}" from @{actor}. {link}',
    estimate_status: '📋 *LedgerX*: Estimate "{title}" has a decision. {link}',
    chat_message: '💬 *LedgerX*: New message from @{actor} on "{title}". {link}',
    chat_mention: '💬 *LedgerX*: @{actor} mentioned you on "{title}". {link}',
    invoice_created: '🧾 *LedgerX*: New invoice {title} from @{actor}. {link}',
    invoice_paid: '✅ *LedgerX*: Invoice {title} was marked paid. {link}',
    fallback: '🔔 *LedgerX*: You have a new notification. {link}',
  },
  "pt-BR": {
    estimate_created: '📋 *LedgerX*: Novo orçamento "{title}" de @{actor}. {link}',
    estimate_status: '📋 *LedgerX*: O orçamento "{title}" teve uma decisão. {link}',
    chat_message: '💬 *LedgerX*: Nova mensagem de @{actor} em "{title}". {link}',
    chat_mention: '💬 *LedgerX*: @{actor} mencionou você em "{title}". {link}',
    invoice_created: '🧾 *LedgerX*: Nova fatura {title} de @{actor}. {link}',
    invoice_paid: '✅ *LedgerX*: A fatura {title} foi marcada como paga. {link}',
    fallback: '🔔 *LedgerX*: Você tem uma nova notificação. {link}',
  },
};

function renderBody(row: OutboxRow, appUrl: string): string {
  const p = row.payload;
  const lang: Lang = p.lang === "pt-BR" ? "pt-BR" : "en";
  const link = p.entity_type && p.entity_id
    ? `${appUrl}/?${p.entity_type}=${encodeURIComponent(p.entity_id)}`
    : appUrl;
  const template = BODIES[lang][p.kind] ?? BODIES[lang].fallback;
  return template
    .split("{title}").join(p.title ?? "—")
    .split("{actor}").join(p.actor_username ?? "someone")
    .split("{link}").join(link)
    .slice(0, 1500);
}

interface SendResult {
  status: "sent" | "failed" | "skipped";
  error?: string;
}

async function twilioSend(
  to: string,
  body: string,
  inWindow: boolean,
): Promise<SendResult> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
  const token = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  const from = Deno.env.get("TWILIO_WHATSAPP_FROM") ?? "";
  const templateSid = Deno.env.get("TWILIO_TEMPLATE_SID") ?? "";
  if (!sid || !token || !from) {
    return { status: "failed", error: "twilio secrets not configured" };
  }

  const form = new URLSearchParams({
    From: `whatsapp:${from}`,
    To: `whatsapp:${to}`,
  });
  if (inWindow) {
    form.set("Body", body);
  } else if (templateSid) {
    // Approved utility template with the whole line as its one variable.
    form.set("ContentSid", templateSid);
    form.set("ContentVariables", JSON.stringify({ "1": body }));
  } else {
    return { status: "skipped", error: "no_session_window" };
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  if (res.ok) return { status: "sent" };

  const text = await res.text();
  let code = 0;
  try {
    code = (JSON.parse(text) as { code?: number }).code ?? 0;
  } catch {
    // non-JSON error body
  }
  // 63016: outside the messaging window; 63015: recipient not in sandbox.
  if (code === 63016 || code === 63015) {
    return { status: "skipped", error: `twilio ${code}` };
  }
  return { status: "failed", error: `twilio ${res.status} ${text.slice(0, 300)}` };
}

// GC whatsapp-staging/ files older than 24h that no live session references.
async function gcStaging(supabase: SupabaseClient): Promise<number> {
  try {
    const { data: sessions } = await supabase
      .from("whatsapp_sessions")
      .select("pending_action");
    const live = new Set<string>();
    for (const s of (sessions ?? []) as Array<{ pending_action: { staged_media?: Array<{ path: string }> } | null }>) {
      for (const m of s.pending_action?.staged_media ?? []) live.add(m.path);
    }

    const { data: folders } = await supabase.storage.from("receipts").list("whatsapp-staging");
    let removed = 0;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const folder of (folders ?? []).slice(0, 5)) {
      if (!folder.name) continue;
      const prefix = `whatsapp-staging/${folder.name}`;
      const { data: files } = await supabase.storage.from("receipts").list(prefix, { limit: 100 });
      const stale = (files ?? [])
        .filter((f) => f.name && f.created_at && new Date(f.created_at).getTime() < cutoff)
        .map((f) => `${prefix}/${f.name}`)
        .filter((p) => !live.has(p));
      if (stale.length > 0) {
        const { error } = await supabase.storage.from("receipts").remove(stale);
        if (!error) removed += stale.length;
      }
    }
    return removed;
  } catch (err) {
    console.error("[whatsapp-send] staging GC error:", err);
    return 0;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200 });

  // Same handshake as send-inactivity-reminder: pg_cron calls with the shared
  // X-Cron-Secret header; anything else is rejected.
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("X-Cron-Secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const appUrl = (Deno.env.get("APP_URL") ?? "https://ledger.90ten.life").replace(/\/$/, "");

    const { data: claimedData, error: claimErr } = await supabase.rpc("claim_whatsapp_outbox", {
      p_limit: 20,
    });
    if (claimErr) throw new Error(`claim failed: ${claimErr.message}`);
    const rows = (claimedData ?? []) as OutboxRow[];

    // Batch the 24h-window lookup: one query for all claimed phones.
    const phones = [...new Set(rows.map((r) => r.phone))];
    const windowByPhone = new Map<string, string | null>();
    if (phones.length > 0) {
      const { data: phoneRows } = await supabase
        .from("user_phone_numbers")
        .select("phone, last_inbound_at")
        .in("phone", phones);
      for (const p of (phoneRows ?? []) as Array<{ phone: string; last_inbound_at: string | null }>) {
        windowByPhone.set(p.phone, p.last_inbound_at);
      }
    }
    const windowCutoff = Date.now() - 23 * 60 * 60 * 1000; // 23h safety margin

    let sent = 0, skipped = 0, failed = 0;
    for (const row of rows) {
      const lastInbound = windowByPhone.get(row.phone);
      const inWindow = !!lastInbound && new Date(lastInbound).getTime() > windowCutoff;
      const body = renderBody(row, appUrl);
      const result = await twilioSend(row.phone, body, inWindow);
      await supabase.rpc("finish_whatsapp_outbox", {
        p_id: row.id,
        p_status: result.status,
        p_error: result.error ?? null,
      });
      if (result.status === "sent") sent++;
      else if (result.status === "skipped") skipped++;
      else failed++;
    }

    // Housekeeping — cheap, once per run.
    await supabase.rpc("purge_whatsapp_dedup");
    const gcRemoved = await gcStaging(supabase);

    const summary = { claimed: rows.length, sent, skipped, failed, gcRemoved };
    console.log(`[whatsapp-send] ${JSON.stringify(summary)}`);
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[whatsapp-send] error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
