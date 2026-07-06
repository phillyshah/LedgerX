// send-household-activity
//
// Short "there's new activity — go take a look" nudge for the other members
// of a household when something happens on an invoice or estimate.
//
// This function deliberately carries NO financial detail: no amounts, names,
// or descriptions. It just says which kind of thing changed and a light event
// phrase, then links back to the app. The whole point is to prompt the user to
// open LedgerX, where the real (RLS-protected) detail lives.
//
// The recipient list — every household member with a real email on file, minus
// the actor, minus contractors who didn't create the item — is computed by the
// SQL function public.household_activity_recipients. This edge function just
// formats and sends; it does not re-implement those rules.
//
// Invoked from the authenticated frontend via supabase.functions.invoke(...),
// exactly like send-submission-notification: no custom shared secret, just a
// service-role client used internally.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type Kind = "estimate" | "invoice";
type Event = "submitted" | "accepted" | "rejected" | "paid";
type Lang = "en" | "pt-BR";

interface RecipientRow {
  email: string;
  preferred_language: string | null;
}

// event → short phrase, per kind, per language. Missing combinations fall back
// to a generic phrase so we never render an empty subject/body.
const PHRASES: Record<Kind, Partial<Record<Event, Record<Lang, string>>>> = {
  estimate: {
    submitted: { en: "a new estimate was submitted", "pt-BR": "um novo orçamento foi enviado" },
    accepted: { en: "an estimate was accepted", "pt-BR": "um orçamento foi aceito" },
    rejected: { en: "an estimate was rejected", "pt-BR": "um orçamento foi recusado" },
  },
  invoice: {
    submitted: { en: "a new invoice was submitted", "pt-BR": "uma nova nota foi enviada" },
    paid: { en: "an invoice was marked paid", "pt-BR": "uma nota foi marcada como paga" },
  },
};

const FALLBACK_PHRASE: Record<Lang, string> = {
  en: "there's new activity",
  "pt-BR": "há uma nova atividade",
};

const SUBJECT: Record<Lang, string> = {
  en: "LedgerX: new activity",
  "pt-BR": "LedgerX: nova atividade",
};

const OPEN_LABEL: Record<Lang, string> = {
  en: "Open LedgerX →",
  "pt-BR": "Abrir o LedgerX →",
};

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function phraseFor(kind: Kind, event: Event, lang: Lang): string {
  return PHRASES[kind][event]?.[lang] ?? FALLBACK_PHRASE[lang];
}

function bodyText(phrase: string, lang: Lang): string {
  return lang === "pt-BR"
    ? `Aviso — ${phrase} em uma das suas propriedades. Abra o LedgerX para dar uma olhada.`
    : `Heads up — ${phrase} in one of your properties. Open LedgerX to take a look.`;
}

function activityEmailHtml(kind: Kind, event: Event, lang: Lang, appUrl: string): string {
  const phrase = phraseFor(kind, event, lang);
  const body = bodyText(phrase, lang);
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#065f46,#14532d);padding:28px 32px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.1em;color:#6ee7b7;text-transform:uppercase;">LedgerX</p>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">${htmlEscape(SUBJECT[lang])}</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 20px;color:#334155;font-size:15px;">${htmlEscape(body)}</p>
      <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#059669,#0d9488);color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:10px;">
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

    const payload = await req.json();
    const kind = payload.kind as Kind;
    const event = payload.event as Event;
    const entityId = payload.entity_id as string | undefined;
    const actorId = payload.actor_id as string | undefined;

    if (kind !== "estimate" && kind !== "invoice") {
      return new Response(
        JSON.stringify({ error: "kind must be 'estimate' or 'invoice'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!entityId || !actorId) {
      return new Response(
        JSON.stringify({ error: "entity_id and actor_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // The SQL function encodes all the "who should hear about this" rules.
    const { data: recipientsData } = await supabase.rpc("household_activity_recipients", {
      p_kind: kind,
      p_entity_id: entityId,
      p_actor: actorId,
    });

    let recipients = (recipientsData ?? []) as RecipientRow[];

    // Channel preference: estimate/invoice activity also reaches the bell +
    // WhatsApp outbox via the notifications triggers, so recipients whose
    // notify_channel is 'whatsapp' AND who have a linked phone (the outbox
    // no-ops without one) get no email nudge. The RPC returns real_email
    // (unique), so it doubles as the lookup key.
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
        prefRows
          .filter((p) => p.notify_channel === "whatsapp" && p.real_email && phoneIds.has(p.id))
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

    let sent = 0;
    // Each email is sent individually with a single `to` so recipients never
    // see one another's addresses.
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
            subject: SUBJECT[lang],
            html: activityEmailHtml(kind, event, lang, appUrl),
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
