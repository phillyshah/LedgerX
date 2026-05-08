import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LEDGERX_DOMAIN = "@ledgerx.local";

function isRealEmail(email: string): boolean {
  return !!email && !email.endsWith(LEDGERX_DOMAIN) && email.includes("@");
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

function submittedEmailHtml(params: {
  submitterUsername: string;
  householdName: string;
  amount: number;
  currency: string;
  invoiceNumber: string | null;
  description: string | null;
  appUrl: string;
}): string {
  const amountStr = formatCurrency(params.amount, params.currency);
  const ref = params.invoiceNumber ? `Invoice #${params.invoiceNumber}` : "Invoice";
  const desc = params.description ? `<p style="margin:8px 0;color:#475569;">${params.description}</p>` : "";
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#065f46,#14532d);padding:28px 32px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.1em;color:#6ee7b7;text-transform:uppercase;">LedgerX</p>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">New Invoice Submitted</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 20px;color:#334155;font-size:15px;">
        <strong>${params.submitterUsername}</strong> submitted an invoice for <strong>${params.householdName}</strong>.
      </p>
      <div style="background:#f1f5f9;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">${ref}</p>
        <p style="margin:0;font-size:28px;font-weight:700;color:#065f46;">${amountStr}</p>
        ${desc}
      </div>
      <a href="${params.appUrl}" style="display:inline-block;background:linear-gradient(135deg,#059669,#0d9488);color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:10px;">
        Review in LedgerX →
      </a>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">You're receiving this because you're a LedgerX admin. Reply to this email if you have questions.</p>
    </div>
  </div>
</body>
</html>`;
}

function paidEmailHtml(params: {
  adminUsername: string;
  householdName: string;
  amount: number;
  currency: string;
  invoiceNumber: string | null;
  adminNotes: string | null;
  appUrl: string;
}): string {
  const amountStr = formatCurrency(params.amount, params.currency);
  const ref = params.invoiceNumber ? `Invoice #${params.invoiceNumber}` : "Invoice";
  const notes = params.adminNotes
    ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px 16px;margin-top:16px;">
         <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#166534;text-transform:uppercase;letter-spacing:0.05em;">Note from admin</p>
         <p style="margin:0;color:#15803d;font-size:14px;">${params.adminNotes}</p>
       </div>`
    : "";
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#065f46,#14532d);padding:28px 32px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.1em;color:#6ee7b7;text-transform:uppercase;">LedgerX</p>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">Invoice Marked as Paid ✓</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 20px;color:#334155;font-size:15px;">
        Great news — your invoice for <strong>${params.householdName}</strong> has been marked as paid by <strong>${params.adminUsername}</strong>.
      </p>
      <div style="background:#f1f5f9;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">${ref}</p>
        <p style="margin:0;font-size:28px;font-weight:700;color:#065f46;">${amountStr}</p>
      </div>
      ${notes}
      <a href="${params.appUrl}" style="display:inline-block;margin-top:20px;background:linear-gradient(135deg,#059669,#0d9488);color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:10px;">
        View in LedgerX →
      </a>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">You submitted this invoice through LedgerX. Reply to this email if you have questions.</p>
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
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fromEmail = Deno.env.get("NOTIFICATION_FROM_EMAIL") ?? "LedgerX <notifications@ledger.90ten.life>";
    const appUrl = Deno.env.get("APP_URL") ?? "https://ledger.90ten.life";

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: callerUser }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { type, invoice_id } = await req.json();
    if (!type || !invoice_id || !["submitted", "paid"].includes(type)) {
      return new Response(
        JSON.stringify({ error: "type ('submitted'|'paid') and invoice_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch invoice with household and submitter info
    const { data: invoice, error: invErr } = await supabase
      .from("contractor_invoices")
      .select(`
        id, invoice_number, amount, currency, description, status, admin_notes,
        household_id,
        created_by
      `)
      .eq("id", invoice_id)
      .single();

    if (invErr || !invoice) {
      return new Response(
        JSON.stringify({ error: "Invoice not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch household name
    const { data: household } = await supabase
      .from("households")
      .select("name")
      .eq("id", invoice.household_id)
      .single();

    const householdName = household?.name ?? "Unknown Property";

    // Fetch submitter profile (username + real email)
    const { data: submitterProfile } = await supabase
      .from("user_profiles")
      .select("username, real_email, email")
      .eq("id", invoice.created_by)
      .single();

    const submitterUsername = submitterProfile?.username ?? "Unknown";
    const submitterEmail = submitterProfile?.real_email
      ? (isRealEmail(submitterProfile.real_email) ? submitterProfile.real_email : null)
      : (isRealEmail(submitterProfile?.email ?? "") ? submitterProfile?.email : null);

    // Fetch caller profile for "paid by" attribution
    const { data: callerProfile } = await supabase
      .from("user_profiles")
      .select("username")
      .eq("id", callerUser.id)
      .single();

    const callerUsername = callerProfile?.username ?? "Admin";

    let toEmails: string[] = [];
    let subject = "";
    let html = "";

    if (type === "submitted") {
      // Notify all admins with real emails
      const { data: adminProfiles } = await supabase
        .from("user_profiles")
        .select("username, real_email, email, user_id:id")
        .in(
          "id",
          (await supabase
            .from("user_roles")
            .select("user_id")
            .eq("is_admin", true)
            .then((r) => (r.data ?? []).map((x) => x.user_id)))
        );

      toEmails = (adminProfiles ?? [])
        .map((p) => p.real_email && isRealEmail(p.real_email) ? p.real_email : (isRealEmail(p.email ?? "") ? p.email : null))
        .filter((e): e is string => !!e);

      subject = `New invoice from ${submitterUsername} — ${formatCurrency(invoice.amount, invoice.currency)}`;
      html = submittedEmailHtml({
        submitterUsername,
        householdName,
        amount: invoice.amount,
        currency: invoice.currency,
        invoiceNumber: invoice.invoice_number,
        description: invoice.description,
        appUrl,
      });
    } else {
      // type === "paid" — notify submitter only
      if (submitterEmail) {
        toEmails = [submitterEmail];
      }
      subject = `Your invoice has been paid — ${formatCurrency(invoice.amount, invoice.currency)}`;
      html = paidEmailHtml({
        adminUsername: callerUsername,
        householdName,
        amount: invoice.amount,
        currency: invoice.currency,
        invoiceNumber: invoice.invoice_number,
        adminNotes: invoice.admin_notes,
        appUrl,
      });
    }

    if (toEmails.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, note: "No real email addresses found for recipients" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send via Resend (one email per recipient to avoid exposing addresses)
    let sent = 0;
    const sendErrors: string[] = [];

    for (const to of toEmails) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: fromEmail, to, subject, html }),
      });

      if (res.ok) {
        sent++;
      } else {
        const errText = await res.text();
        sendErrors.push(`${to}: ${errText}`);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent, errors: sendErrors.length ? sendErrors : undefined }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
