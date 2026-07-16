// send-reconcile-mention
//
// When an admin posts a comment on a credit-card statement line item that names
// someone with "@username", email that person the question plus the full line
// item context (card, date, amount, description) so it's actionable on its own.
// Admins who can open the reconcile screen get a deep link; everyone else (a
// receipt submitter who can't open Labs) gets an informational email with no
// link and a "reply to @asker directly" note.
//
// Security mirrors send-mention-notification: the actor is the AUTHENTICATED
// caller (JWT), never the body. reconciliation_mention_recipients() returns
// addresses only for @mentioned mentionable users, and only when the verified
// actor is itself a Labs admin. This function never picks recipients from raw
// @names. Bell + WhatsApp are handled by the DB trigger; this is email only.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type Lang = "en" | "pt-BR";

interface RecipientRow {
  email: string;
  preferred_language: string | null;
  username: string | null;
  can_open: boolean | null;
}

const SUBJECT: Record<Lang, (actor: string) => string> = {
  en: (actor) => `LedgerX: ${actor} asked you about a card charge`,
  "pt-BR": (actor) => `LedgerX: ${actor} perguntou sobre uma cobrança do cartão`,
};

function htmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(s: string, max = 400): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function emailHtml(
  actor: string,
  contextLine: string,
  question: string,
  lang: Lang,
  link: string | null,
): string {
  const intro = lang === "pt-BR"
    ? `${actor} perguntou sobre esta cobrança do cartão de crédito:`
    : `${actor} asked you about this credit card charge:`;
  const openLabel = lang === "pt-BR" ? "Abrir a conciliação →" : "Open reconciliation →";
  const replyNote = lang === "pt-BR"
    ? `Responda diretamente a @${htmlEscape(actor)}.`
    : `Reply to @${htmlEscape(actor)} directly.`;
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#6d28d9,#4c1d95);padding:28px 32px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.1em;color:#ddd6fe;text-transform:uppercase;">LedgerX Labs</p>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">${htmlEscape(lang === "pt-BR" ? "Você foi perguntado" : "A question for you")}</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 12px;color:#334155;font-size:15px;">${htmlEscape(intro)}</p>
      <p style="margin:0 0 16px;padding:12px 16px;background:#f5f3ff;border-left:3px solid #7c3aed;border-radius:8px;color:#4c1d95;font-size:14px;font-weight:600;">${htmlEscape(contextLine)}</p>
      ${question ? `<blockquote style="margin:0 0 20px;padding:12px 16px;background:#f1f5f9;border-left:3px solid #94a3b8;border-radius:8px;color:#475569;font-size:14px;white-space:pre-wrap;">${htmlEscape(question)}</blockquote>` : ""}
      ${link
        ? `<a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:10px;">${htmlEscape(openLabel)}</a>`
        : `<p style="margin:0;color:#64748b;font-size:13px;">${replyNote}</p>`}
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user: caller } } = await supabase.auth.getUser(token);
    if (!caller) {
      return new Response(JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const actorId = caller.id;

    const payload = await req.json();
    const lineItemId = payload.line_item_id as string | undefined;
    const body = (payload.body as string | undefined) ?? "";
    if (!lineItemId) {
      return new Response(JSON.stringify({ error: "line_item_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: recipientsData } = await supabase.rpc("reconciliation_mention_recipients", {
      p_line_item_id: lineItemId,
      p_actor: actorId,
      p_body: body,
    });
    let recipients = (recipientsData ?? []) as RecipientRow[];

    // Suppress whatsapp-only recipients with a linked phone (they get WhatsApp).
    if (recipients.length > 0) {
      const { data: prefs } = await supabase
        .from("user_profiles")
        .select("id, real_email, notify_channel")
        .in("real_email", recipients.map((r) => r.email).filter(Boolean));
      const prefRows = (prefs ?? []) as Array<{ id: string; real_email: string | null; notify_channel: string }>;
      const { data: phones } = prefRows.length > 0
        ? await supabase.from("user_phone_numbers").select("user_id").in("user_id", prefRows.map((p) => p.id))
        : { data: [] };
      const phoneIds = new Set((phones ?? []).map((p) => p.user_id as string));
      const whatsappOnly = new Set(
        prefRows.filter((p) => p.notify_channel === "whatsapp" && p.real_email && phoneIds.has(p.id))
          .map((p) => p.real_email as string),
      );
      recipients = recipients.filter((r) => !r.email || !whatsappOnly.has(r.email));
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Line-item context + actor name for the email copy.
    const [{ data: li }, { data: actorProfile }] = await Promise.all([
      supabase
        .from("statement_line_items")
        .select("description, amount, line_date, credit_card_statements(card_label)")
        .eq("id", lineItemId)
        .maybeSingle(),
      supabase.from("user_profiles").select("username").eq("id", actorId).maybeSingle(),
    ]);
    const actorName = (actorProfile?.username as string | undefined) || "Someone";
    const card = ((li?.credit_card_statements as unknown as { card_label: string } | null)?.card_label) || "card";
    const desc = (li?.description as string | undefined) || "a charge";
    const amount = li?.amount != null ? `$${Number(li.amount).toFixed(2)}` : "";
    const date = (li?.line_date as string | undefined) || "";
    const contextLine = `${desc} · ${amount} · ${date} · ${card}`;
    const question = truncate(body);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.log("RESEND_API_KEY not configured — skipping send.");
      return new Response(JSON.stringify({ ok: true, sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const fromEmail = Deno.env.get("NOTIFICATION_FROM_EMAIL") ?? "LedgerX <notifications@ledger.90ten.life>";
    const appUrl = Deno.env.get("APP_URL") ?? "https://ledger.90ten.life";

    let sent = 0;
    for (const r of recipients) {
      if (!r.email) continue;
      const lang: Lang = r.preferred_language === "pt-BR" ? "pt-BR" : "en";
      // Deep link only for recipients who can open the Labs screen.
      const link = r.can_open ? `${appUrl}/?line=${encodeURIComponent(lineItemId)}` : null;
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: fromEmail,
            to: r.email,
            subject: SUBJECT[lang](actorName),
            html: emailHtml(actorName, contextLine, question, lang, link),
          }),
        });
        if (res.ok) sent++;
        else console.log(`Failed to send to ${r.email}: ${await res.text()}`);
      } catch (err) {
        console.log(`Error sending to ${r.email}: ${(err as Error).message}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
