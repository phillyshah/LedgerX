// send-mention-notification
//
// When a chat message on an estimate names someone with "@username", email that
// person a short "you were mentioned — come take a look" nudge with a link that
// opens the app straight to that estimate (and thus its chat thread).
//
// Security: the actor is the AUTHENTICATED caller (derived from their JWT), never
// a value taken from the request body — otherwise a signed-in user could name any
// estimate member as the "sender" and fire impersonated, arbitrarily-worded emails
// at the rest of the thread. estimate_mention_recipients() then only returns
// addresses for @mentioned members of the estimate's real audience, and only when
// that verified actor is themselves in the audience. This function trusts that RPC
// — it never picks recipients from the raw @names itself. Invoked from the
// authenticated frontend via supabase.functions.invoke(...).

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
}

const SUBJECT: Record<Lang, (title: string) => string> = {
  en: (title) => `LedgerX: you were mentioned in “${title}”`,
  "pt-BR": (title) => `LedgerX: você foi mencionado em “${title}”`,
};

const OPEN_LABEL: Record<Lang, string> = {
  en: "Open the conversation →",
  "pt-BR": "Abrir a conversa →",
};

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, max = 240): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function bodyIntro(actor: string, title: string, lang: Lang): string {
  return lang === "pt-BR"
    ? `${actor} mencionou você em uma mensagem no orçamento “${title}”.`
    : `${actor} mentioned you in a message on the estimate “${title}”.`;
}

function mentionEmailHtml(
  actor: string,
  title: string,
  snippet: string,
  lang: Lang,
  link: string,
): string {
  const intro = bodyIntro(actor, title, lang);
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#065f46,#14532d);padding:28px 32px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.1em;color:#6ee7b7;text-transform:uppercase;">LedgerX</p>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">${htmlEscape(lang === "pt-BR" ? "Você foi mencionado" : "You were mentioned")}</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;color:#334155;font-size:15px;">${htmlEscape(intro)}</p>
      ${snippet ? `<blockquote style="margin:0 0 20px;padding:12px 16px;background:#f1f5f9;border-left:3px solid #059669;border-radius:8px;color:#475569;font-size:14px;white-space:pre-wrap;">${htmlEscape(snippet)}</blockquote>` : ""}
      <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#059669,#0d9488);color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:10px;">
        ${htmlEscape(OPEN_LABEL[lang])}
      </a>
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

    // Derive the actor from the caller's JWT — NOT from the request body. The
    // frontend forwards the signed-in user's access token as the Authorization
    // header; validating it here is what stops one member impersonating another.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user: caller } } = await supabase.auth.getUser(token);
    if (!caller) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const actorId = caller.id;

    const payload = await req.json();
    const estimateId = payload.estimate_id as string | undefined;
    const body = (payload.body as string | undefined) ?? "";

    if (!estimateId) {
      return new Response(
        JSON.stringify({ error: "estimate_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // All the "who should be emailed" rules (audience membership, @name match,
    // actor-is-in-audience, has a real email) live in this RPC.
    const { data: recipientsData } = await supabase.rpc("estimate_mention_recipients", {
      p_estimate_id: estimateId,
      p_actor: actorId,
      p_body: body,
    });

    let recipients = (recipientsData ?? []) as RecipientRow[];

    // Channel preference: mentions also land as chat_mention bell entries and
    // fan out to the WhatsApp outbox, so 'whatsapp'-preference members get no
    // email. real_email is unique, so it doubles as the lookup key.
    if (recipients.length > 0) {
      const { data: prefs } = await supabase
        .from("user_profiles")
        .select("real_email, notify_channel")
        .in("real_email", recipients.map((r) => r.email).filter(Boolean));
      const whatsappOnly = new Set(
        ((prefs ?? []) as Array<{ real_email: string | null; notify_channel: string }>)
          .filter((p) => p.notify_channel === "whatsapp" && p.real_email)
          .map((p) => p.real_email as string),
      );
      recipients = recipients.filter((r) => !r.email || !whatsappOnly.has(r.email));
    }

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Estimate title + sender username for the email copy.
    const [{ data: est }, { data: actorProfile }] = await Promise.all([
      supabase.from("estimates").select("title").eq("id", estimateId).maybeSingle(),
      supabase.from("user_profiles").select("username").eq("id", actorId).maybeSingle(),
    ]);
    const title = (est?.title as string | undefined) || "an estimate";
    const actorName = (actorProfile?.username as string | undefined) || "Someone";
    const snippet = truncate(body);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.log("RESEND_API_KEY is not configured — skipping send.");
      return new Response(
        JSON.stringify({ ok: true, sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const fromEmail = Deno.env.get("NOTIFICATION_FROM_EMAIL") ?? "LedgerX <notifications@ledger.90ten.life>";
    const appUrl = Deno.env.get("APP_URL") ?? "https://ledger.90ten.life";
    // Deep link the frontend understands (see useInitialDeepLink): open this
    // estimate's detail, which contains the chat thread.
    const link = `${appUrl}/?estimate=${encodeURIComponent(estimateId)}`;

    let sent = 0;
    // One email per recipient (single `to`) so addresses aren't leaked.
    for (const r of recipients) {
      if (!r.email) continue;
      const lang: Lang = r.preferred_language === "pt-BR" ? "pt-BR" : "en";
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: r.email,
            subject: SUBJECT[lang](title),
            html: mentionEmailHtml(actorName, title, snippet, lang, link),
          }),
        });
        if (res.ok) {
          sent++;
        } else {
          const errText = await res.text();
          console.log(`Failed to send to ${r.email}: ${errText}`);
        }
      } catch (err) {
        console.log(`Error sending to ${r.email}: ${(err as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
