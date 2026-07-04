/**
 * email-command edge function
 *
 * An email-command bot. A user emails receipts@90ten.life with a one-word
 * command as the SUBJECT (help / estimates / invoices / pending / todo /
 * activity). The inbound-email function forwards command emails here with the
 * same shared secret. This
 * function:
 *
 *   1. Verifies the shared secret (INBOUND_EMAIL_SECRET env var)
 *   2. Resolves the sender email → user_id via resolve_sender_email()
 *   3. Parses the command from the subject line
 *   4. Runs the appropriate report query and emails back a short summary
 *
 * Auth is intentionally minimal: the sender's address must map to a real
 * user profile. Unknown senders are silently dropped — no email is ever
 * sent to an address we can't resolve, so this can't be used to spam.
 *
 * Payload shape (from the inbound-email forwarder):
 * {
 *   "from_email":  "alice@gmail.com",
 *   "subject":     "estimates",
 *   "body_text":   "..."
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── From-header normalization ─────────────────────────────────────────────────
// IMAP `From` headers come in several shapes — `alice@example.com`,
// `Alice <alice@example.com>`, `"Alice Q" <alice@example.com>`, etc. The
// resolve_sender_email RPC does an exact (lowercased) match, so we have to
// reduce whatever the forwarder sends down to just the bare address before
// looking it up. Prefer the value inside `<...>` if present; fall back to
// the first email-looking token; lowercase + trim the result.
function extractEmailAddress(input: string): string {
  if (!input) return "";
  const angle = input.match(/<([^>]+)>/);
  if (angle) return angle[1].trim().toLowerCase();
  const bare = input.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (bare) return bare[0].trim().toLowerCase();
  return input.trim().toLowerCase();
}

// ── Command parsing ───────────────────────────────────────────────────────────
// Take the subject, lowercase it, grab the first whitespace-delimited token,
// and strip any surrounding non-letters (so "Estimates:", "[help]" etc. all
// resolve). Anything we don't recognize (including empty) falls back to help.
type Command = "help" | "estimates" | "invoices" | "pending" | "activity";

function parseCommand(subject: string | undefined): Command {
  const first = (subject ?? "").trim().toLowerCase().split(/\s+/)[0] ?? "";
  const cleaned = first.replace(/^[^a-z]+|[^a-z]+$/g, "");
  if (cleaned === "estimates" || cleaned === "invoices") return cleaned;
  // "todo" is an alias for the "pending" action digest.
  if (cleaned === "pending" || cleaned === "todo") return "pending";
  if (cleaned === "activity") return "activity";
  return "help";
}

type Lang = "en" | "pt-BR";

// ── Report shape returned by email_command_report ─────────────────────────────
interface EmailCommandReport {
  role: "admin" | "household_admin" | "member";
  estimates: {
    total: number;
    open: number;
    accepted: number;
    rejected: number;
    aging_over_14: number;
  };
  invoices: {
    pending: number;
    paid: number;
    pending_total: number;
  };
}

// ── Report shapes for the "pending" and "activity" commands ───────────────────
interface EmailCommandPending {
  role: "admin" | "household_admin" | "member";
  invoices_pending: number;
  estimates_aging: number;
  uncategorized: number;
}

interface EmailCommandActivity {
  role: "admin" | "household_admin" | "member";
  new_estimates: number;
  new_invoices: number;
  new_expenses: number;
  inactive_members: number;
}

// Shared "admin-only command" reply body. Returns the localized subject+html.
function adminOnlyReply(lang: Lang): { subject: string; html: string } {
  return lang === "pt-BR"
    ? {
        subject: "Comando disponível apenas para administradores",
        html: `<p style="margin:0;">Este comando está disponível apenas para administradores e administradores de residência.</p>`,
      }
    : {
        subject: "Admin-only command",
        html: `<p style="margin:0;">This command is only available to admins and household admins.</p>`,
      };
}

// ── Small inline HTML shell ───────────────────────────────────────────────────
function wrap(headerTitle: string, bodyHtml: string, appUrl: string, openLabel: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#065f46,#14532d);padding:28px 32px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.1em;color:#6ee7b7;text-transform:uppercase;">LedgerX</p>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">${headerTitle}</h1>
    </div>
    <div style="padding:28px 32px;color:#334155;font-size:15px;line-height:1.6;">
      ${bodyHtml}
      <a href="${appUrl}" style="display:inline-block;margin-top:20px;background:linear-gradient(135deg,#059669,#0d9488);color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:10px;">
        ${openLabel} →
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
    // 1. Verify the shared secret. It arrives in the BODY (not the auth
    //    header): the platform JWT gate consumes the Authorization header
    //    (inbound-email sends the service-role key there), so the internal
    //    secret rides in the payload instead. This keeps the function working
    //    whether or not verify_jwt is enabled for it.
    const body = (await req.json()) as {
      from_email: string;
      subject?: string;
      body_text?: string | null;
      secret?: string;
    };

    const secret = Deno.env.get("INBOUND_EMAIL_SECRET");
    if (!secret || body.secret !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { from_email, subject } = body;

    // 2. Resolve sender → bare address, then user.
    const senderAddress = extractEmailAddress(from_email ?? "");
    if (!senderAddress) {
      return new Response(JSON.stringify({ ok: true, matched: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: userId } = await supabase.rpc("resolve_sender_email", {
      p_email: senderAddress,
    });
    if (!userId) {
      // Silent ignore — never email an address we can't resolve.
      console.log(`[email-command] no user match for "${senderAddress}" — dropping`);
      return new Response(JSON.stringify({ ok: true, matched: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[email-command] matched user=${userId} sender=${senderAddress}`);

    // 3. Load the profile for language + greeting.
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("username, preferred_language")
      .eq("id", userId)
      .maybeSingle();
    const username = (profile?.username as string | undefined) ?? "there";
    const lang: Lang = profile?.preferred_language === "pt-BR" ? "pt-BR" : "en";

    const appUrl = Deno.env.get("APP_URL") ?? "https://ledger.90ten.life";
    const openLabel = lang === "pt-BR" ? "Abrir o LedgerX" : "Open LedgerX";

    // 4. Parse the command.
    const command = parseCommand(subject);

    // 5. Build the reply per command.
    let replySubject: string;
    let bodyHtml: string;

    if (command === "help") {
      if (lang === "pt-BR") {
        replySubject = "Comandos do LedgerX";
        bodyHtml = `
          <p style="margin:0 0 12px;">Olá <strong>@${username}</strong>! Você pode responder a este endereço com um destes comandos no assunto:</p>
          <p style="margin:0 0 6px;"><strong>help</strong> — mostra esta lista de comandos.</p>
          <p style="margin:0 0 6px;"><strong>estimates</strong> — resumo dos orçamentos (requer conta de administrador ou administrador de residência).</p>
          <p style="margin:0 0 6px;"><strong>invoices</strong> — resumo das faturas (requer conta de administrador ou administrador de residência).</p>
          <p style="margin:0 0 6px;"><strong>pending</strong> — o que precisa de atenção: faturas a aprovar e orçamentos parados (admin / administrador de residência).</p>
          <p style="margin:0 0 6px;"><strong>activity</strong> — resumo dos últimos 7 dias (admin / administrador de residência).</p>`;
      } else {
        replySubject = "LedgerX commands";
        bodyHtml = `
          <p style="margin:0 0 12px;">Hi <strong>@${username}</strong>! You can reply to this address with any of these commands in the subject line:</p>
          <p style="margin:0 0 6px;"><strong>help</strong> — shows this list of commands.</p>
          <p style="margin:0 0 6px;"><strong>estimates</strong> — a summary of your estimates (requires an admin or household-admin account).</p>
          <p style="margin:0 0 6px;"><strong>invoices</strong> — a summary of your invoices (requires an admin or household-admin account).</p>
          <p style="margin:0 0 6px;"><strong>pending</strong> — what needs attention: invoices to approve and stalled estimates (admin / household admin).</p>
          <p style="margin:0 0 6px;"><strong>activity</strong> — a last-7-days summary (admin / household admin).</p>`;
      }
    } else if (command === "pending") {
      // "What needs attention" digest — admin / household-admin only.
      const { data } = await supabase.rpc("email_command_pending", { p_user_id: userId });
      const report = data as EmailCommandPending | null;

      if (!report || report.role === "member") {
        const r = adminOnlyReply(lang);
        replySubject = r.subject;
        bodyHtml = r.html;
      } else if (lang === "pt-BR") {
        replySubject = "O que precisa de atenção";
        bodyHtml = `
          <p style="margin:0 0 6px;">Faturas aguardando aprovação: <strong>${report.invoices_pending}</strong></p>
          <p style="margin:0 0 6px;">Orçamentos em aberto há mais de 2 semanas: <strong>${report.estimates_aging}</strong></p>` +
          (report.role === "admin"
            ? `<p style="margin:0;">Transações sem categoria: <strong>${report.uncategorized}</strong></p>`
            : "");
      } else {
        replySubject = "What needs attention";
        bodyHtml = `
          <p style="margin:0 0 6px;">Invoices awaiting approval: <strong>${report.invoices_pending}</strong></p>
          <p style="margin:0 0 6px;">Estimates open for over 2 weeks: <strong>${report.estimates_aging}</strong></p>` +
          (report.role === "admin"
            ? `<p style="margin:0;">Uncategorized transactions: <strong>${report.uncategorized}</strong></p>`
            : "");
      }
    } else if (command === "activity") {
      // Last-7-days pulse — admin / household-admin only.
      const { data } = await supabase.rpc("email_command_activity", { p_user_id: userId });
      const report = data as EmailCommandActivity | null;

      if (!report || report.role === "member") {
        const r = adminOnlyReply(lang);
        replySubject = r.subject;
        bodyHtml = r.html;
      } else if (lang === "pt-BR") {
        replySubject = "Atividade dos últimos 7 dias";
        bodyHtml = `
          <p style="margin:0 0 6px;">Novos orçamentos: <strong>${report.new_estimates}</strong></p>
          <p style="margin:0 0 6px;">Novas faturas: <strong>${report.new_invoices}</strong></p>
          <p style="margin:0 0 6px;">Novos recibos: <strong>${report.new_expenses}</strong></p>
          <p style="margin:0;">Membros sem acesso há mais de 2 semanas: <strong>${report.inactive_members}</strong></p>`;
      } else {
        replySubject = "Last 7 days activity";
        bodyHtml = `
          <p style="margin:0 0 6px;">New estimates: <strong>${report.new_estimates}</strong></p>
          <p style="margin:0 0 6px;">New invoices: <strong>${report.new_invoices}</strong></p>
          <p style="margin:0 0 6px;">New receipts: <strong>${report.new_expenses}</strong></p>
          <p style="margin:0;">Members inactive for over 2 weeks: <strong>${report.inactive_members}</strong></p>`;
      }
    } else {
      // estimates / invoices — both need the report + an admin-ish role.
      const { data: reportData } = await supabase.rpc("email_command_report", {
        p_user_id: userId,
      });
      const report = reportData as EmailCommandReport | null;

      if (!report || report.role === "member") {
        if (lang === "pt-BR") {
          replySubject = "Comando disponível apenas para administradores";
          bodyHtml = `<p style="margin:0;">Este comando está disponível apenas para administradores e administradores de residência.</p>`;
        } else {
          replySubject = "Admin-only command";
          bodyHtml = `<p style="margin:0;">This command is only available to admins and household admins.</p>`;
        }
      } else if (command === "estimates") {
        const e = report.estimates;
        const decided = e.accepted + e.rejected;
        const rate = decided === 0 ? "—" : `${Math.round((e.accepted / decided) * 100)}%`;
        if (lang === "pt-BR") {
          replySubject = "Resumo dos orçamentos";
          bodyHtml = `
            <p style="margin:0 0 6px;">Em aberto: <strong>${e.open}</strong></p>
            <p style="margin:0 0 6px;">Aceitos: <strong>${e.accepted}</strong></p>
            <p style="margin:0 0 6px;">Recusados: <strong>${e.rejected}</strong></p>
            <p style="margin:0 0 6px;">Total: <strong>${e.total}</strong></p>
            <p style="margin:0 0 6px;">Taxa de aceitação: <strong>${rate}</strong></p>
            <p style="margin:0;"><strong>${e.aging_over_14}</strong> aguardando decisão há mais de 2 semanas.</p>`;
        } else {
          replySubject = "Estimates summary";
          bodyHtml = `
            <p style="margin:0 0 6px;">Open: <strong>${e.open}</strong></p>
            <p style="margin:0 0 6px;">Accepted: <strong>${e.accepted}</strong></p>
            <p style="margin:0 0 6px;">Rejected: <strong>${e.rejected}</strong></p>
            <p style="margin:0 0 6px;">Total: <strong>${e.total}</strong></p>
            <p style="margin:0 0 6px;">Acceptance rate: <strong>${rate}</strong></p>
            <p style="margin:0;"><strong>${e.aging_over_14}</strong> awaiting a decision for over 2 weeks.</p>`;
        }
      } else {
        // invoices
        const i = report.invoices;
        if (lang === "pt-BR") {
          replySubject = "Resumo das faturas";
          bodyHtml = `
            <p style="margin:0 0 6px;">Pendentes: <strong>${i.pending}</strong></p>
            <p style="margin:0 0 6px;">Pagas: <strong>${i.paid}</strong></p>
            <p style="margin:0;">Total pendente: <strong>${i.pending_total}</strong></p>`;
        } else {
          replySubject = "Invoices summary";
          bodyHtml = `
            <p style="margin:0 0 6px;">Pending: <strong>${i.pending}</strong></p>
            <p style="margin:0 0 6px;">Paid: <strong>${i.paid}</strong></p>
            <p style="margin:0;">Pending total: <strong>${i.pending_total}</strong></p>`;
        }
      }
    }

    const html = wrap(replySubject, bodyHtml, appUrl, openLabel);

    // 6. Send via Resend. If the key is missing, log and return 200 rather
    //    than throwing — a misconfigured secret shouldn't 500 the forwarder.
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("NOTIFICATION_FROM_EMAIL") ?? "LedgerX <notifications@ledger.90ten.life>";
    if (!resendApiKey) {
      console.log("[email-command] RESEND_API_KEY not configured — skipping send");
      return new Response(JSON.stringify({ ok: true, matched: true, command }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: senderAddress,
        subject: replySubject,
        html,
      }),
    });
    if (!resendRes.ok) {
      console.error(
        `[email-command] Resend send FAILED (${resendRes.status}) ` +
          `to=${senderAddress} from=${fromEmail}: ${await resendRes.text()}`,
      );
    } else {
      console.log(`[email-command] sent command="${command}" to=${senderAddress}`);
    }

    // 7. Done.
    return new Response(JSON.stringify({ ok: true, matched: true, command }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("email-command error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
