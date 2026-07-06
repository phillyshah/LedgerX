// send-submission-notification
//
// Generalized notifier for "a contractor / user just submitted something."
// Supports three payload shapes:
//   { type: "invoice_submitted", invoice_id: "..." }
//   { type: "expense_submitted", expense_id: "..." }
//   { type: "estimate_submitted", estimate_id: "..." }
//
// Recipients:
//   - All users with is_admin = true and a real (non-@ledgerx.local) email.
//   - All users with is_household_admin = true who belong (via
//     household_members) to the household this submission was filed under
//     and who have a real email.
//
// The submitter themselves is never emailed even if they happen to also be
// an admin — that would be noise.
//
// Each send is logged to public.notification_log via the service role.
//
// Replaces the old send-invoice-notification path for the "submitted"
// branch. The "paid" notifier still lives in send-invoice-notification
// because that one targets the submitter, not admins, and has different
// copy / lifecycle.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LEDGERX_DOMAIN = "@ledgerx.local";

function isRealEmail(email: string | null | undefined): email is string {
  return !!email && !email.endsWith(LEDGERX_DOMAIN) && email.includes("@");
}

// Constant-time string compare for the service-role key check below.
function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface SubmissionEmailParams {
  kind: "invoice" | "expense" | "estimate";
  submitterUsername: string;
  householdName: string;
  /** Estimates carry no amount — null renders the title block instead. */
  amount: number | null;
  currency: string;
  /** Invoice number / vendor name / estimate title */
  reference: string | null;
  description: string | null;
  appUrl: string;
}

function submissionEmailHtml(p: SubmissionEmailParams): string {
  const kindLabel = p.kind === "invoice" ? "Invoice" : p.kind === "estimate" ? "Estimate" : "Receipt";
  const headerTitle = `New ${kindLabel} Submitted`;
  const ref = p.reference
    ? `${kindLabel} · ${htmlEscape(p.reference)}`
    : kindLabel;
  const desc = p.description
    ? `<p style="margin:8px 0 0;color:#475569;">${htmlEscape(p.description)}</p>`
    : "";
  // Estimates have no monetary amount — show the title prominently instead.
  const highlight = p.amount != null
    ? `<p style="margin:0;font-size:28px;font-weight:700;color:#065f46;">${formatCurrency(p.amount, p.currency)}</p>`
    : `<p style="margin:0;font-size:20px;font-weight:700;color:#065f46;">${htmlEscape(p.reference ?? "Estimate")}</p>`;
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
    <div style="padding:28px 32px;">
      <p style="margin:0 0 20px;color:#334155;font-size:15px;">
        <strong>${htmlEscape(p.submitterUsername)}</strong> submitted ${p.kind === "estimate" ? "an" : "a"} ${p.kind} for <strong>${htmlEscape(p.householdName)}</strong>.
      </p>
      <div style="background:#f1f5f9;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">${ref}</p>
        ${highlight}
        ${desc}
      </div>
      <a href="${p.appUrl}" style="display:inline-block;background:linear-gradient(135deg,#059669,#0d9488);color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:10px;">
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

interface RecipientRow {
  user_id: string;
  email: string;
  is_admin: boolean;
  is_household_admin: boolean;
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
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const fromEmail = Deno.env.get("NOTIFICATION_FROM_EMAIL") ?? "LedgerX <notifications@ledger.90ten.life>";
    const appUrl = Deno.env.get("APP_URL") ?? "https://ledger.90ten.life";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const payload = await req.json();

    // Two auth paths:
    //  a) A user JWT — the actor is whoever the token belongs to (frontend).
    //  b) The service-role key + an explicit actor_id in the body — server-to-
    //     server callers (the WhatsApp bot) that act on a user's behalf. Only
    //     holders of the service key can use this, the same trust model as
    //     inbound-email → email-command. The ownership check below still runs
    //     against the supplied actor, so a bot bug can't announce someone
    //     else's rows.
    const token = authHeader.replace("Bearer ", "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    let callerId: string;
    if (serviceKey && timingSafeEqual(token, serviceKey) && typeof payload.actor_id === "string" && payload.actor_id) {
      callerId = payload.actor_id;
    } else {
      const { data: { user: callerUser }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !callerUser) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      callerId = callerUser.id;
    }
    const { type } = payload;
    if (!type || !["invoice_submitted", "expense_submitted", "estimate_submitted"].includes(type)) {
      return new Response(
        JSON.stringify({ error: "type must be 'invoice_submitted', 'expense_submitted', or 'estimate_submitted'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let householdId: string;
    let submitterId: string;
    let amount: number | null;
    let currency: string;
    let reference: string | null;
    let description: string | null;
    let kind: "invoice" | "expense" | "estimate";
    let notifKind: "submission_invoice" | "submission_expense" | "submission_estimate";
    let contextRow: Record<string, unknown>;

    if (type === "invoice_submitted") {
      const invoiceId = payload.invoice_id;
      if (!invoiceId) {
        return new Response(
          JSON.stringify({ error: "invoice_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { data: inv, error: invErr } = await supabase
        .from("contractor_invoices")
        .select("id, invoice_number, amount, currency, description, household_id, created_by")
        .eq("id", invoiceId)
        .single();
      if (invErr || !inv) {
        return new Response(
          JSON.stringify({ error: "Invoice not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      householdId = inv.household_id;
      submitterId = inv.created_by;
      amount = inv.amount;
      currency = inv.currency || "USD";
      reference = inv.invoice_number ? `#${inv.invoice_number}` : null;
      description = inv.description;
      kind = "invoice";
      notifKind = "submission_invoice";
      contextRow = { invoice_id: inv.id };
    } else if (type === "expense_submitted") {
      const expenseId = payload.expense_id;
      if (!expenseId) {
        return new Response(
          JSON.stringify({ error: "expense_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { data: exp, error: expErr } = await supabase
        .from("expenses")
        .select("id, vendor, total, currency, notes, household_id, created_by")
        .eq("id", expenseId)
        .single();
      if (expErr || !exp) {
        return new Response(
          JSON.stringify({ error: "Expense not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      householdId = exp.household_id;
      submitterId = exp.created_by;
      amount = exp.total;
      currency = exp.currency || "USD";
      reference = exp.vendor;
      description = exp.notes;
      kind = "expense";
      notifKind = "submission_expense";
      contextRow = { expense_id: exp.id };
    } else {
      // estimate_submitted — estimates carry a title, not an amount.
      const estimateId = payload.estimate_id;
      if (!estimateId) {
        return new Response(
          JSON.stringify({ error: "estimate_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { data: est, error: estErr } = await supabase
        .from("estimates")
        .select("id, title, description, household_id, created_by")
        .eq("id", estimateId)
        .single();
      if (estErr || !est) {
        return new Response(
          JSON.stringify({ error: "Estimate not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      householdId = est.household_id;
      submitterId = est.created_by;
      amount = null;
      currency = "USD";
      reference = est.title;
      description = est.description;
      kind = "estimate";
      notifKind = "submission_estimate";
      contextRow = { estimate_id: est.id };
    }

    // Authorization: the caller must own the row they're announcing (the
    // submitter notifies admins about their own submission right after
    // insert). Full admins are also allowed for any admin-on-behalf tooling.
    // Without this, any authenticated user could trigger admin emails for
    // arbitrary invoice/expense ids.
    if (callerId !== submitterId) {
      const { data: callerRole } = await supabase
        .from("user_roles")
        .select("is_admin")
        .eq("user_id", callerId)
        .maybeSingle();
      if (!callerRole?.is_admin) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Household name
    const { data: household } = await supabase
      .from("households")
      .select("name")
      .eq("id", householdId)
      .single();
    const householdName = household?.name ?? "Unknown Property";

    // Submitter username
    const { data: submitterProfile } = await supabase
      .from("user_profiles")
      .select("username")
      .eq("id", submitterId)
      .single();
    const submitterUsername = submitterProfile?.username ?? "Someone";

    // Build the recipient set:
    //   (full admins) ∪ (household admins who are members of this household)
    //   minus the submitter themselves.
    //
    // We do this with two queries and merge in code rather than fighting
    // PostgREST joins.

    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id, is_admin, is_household_admin")
      .or("is_admin.eq.true,is_household_admin.eq.true");

    const fullAdminIds = new Set<string>();
    const householdAdminIds = new Set<string>();
    for (const r of adminRoles ?? []) {
      if (r.is_admin) fullAdminIds.add(r.user_id);
      else if (r.is_household_admin) householdAdminIds.add(r.user_id);
    }

    // One membership query covers two needs: scoping household admins to this
    // household, AND knowing which full admins are members (only members get
    // a notifications/WhatsApp fan-out row, which decides email suppression).
    const allCandidateIds = new Set<string>([...fullAdminIds, ...householdAdminIds]);
    let householdMemberIds = new Set<string>();
    if (allCandidateIds.size > 0) {
      const { data: members } = await supabase
        .from("household_members")
        .select("user_id")
        .eq("household_id", householdId)
        .in("user_id", Array.from(allCandidateIds));
      householdMemberIds = new Set((members ?? []).map((m) => m.user_id));
    }
    const scopedHouseholdAdminIds = new Set(
      [...householdAdminIds].filter((id) => householdMemberIds.has(id)),
    );

    const recipientIds = new Set<string>([
      ...fullAdminIds,
      ...scopedHouseholdAdminIds,
    ]);
    recipientIds.delete(submitterId);

    if (recipientIds.size === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, note: "No eligible admins" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve real emails.
    const [{ data: recipProfiles }, { data: recipPhones }] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("id, username, real_email, email, notify_channel")
        .in("id", Array.from(recipientIds)),
      supabase
        .from("user_phone_numbers")
        .select("user_id")
        .in("user_id", Array.from(recipientIds)),
    ]);
    const phoneIds = new Set((recipPhones ?? []).map((r) => r.user_id as string));

    const recipients: RecipientRow[] = [];
    for (const p of recipProfiles ?? []) {
      // Channel preference: skip the email ONLY when this recipient will
      // actually get the WhatsApp instead — i.e. the event has a bell/outbox
      // equivalent (invoice/estimate created fan out to HOUSEHOLD MEMBERS via
      // the notifications trigger — a non-member full admin gets no bell row),
      // AND the recipient is such a member, AND they have a linked phone.
      // Expense submissions have no bell/WhatsApp equivalent at all, so those
      // emails always ignore the preference.
      if (
        p.notify_channel === "whatsapp" &&
        kind !== "expense" &&
        householdMemberIds.has(p.id) &&
        phoneIds.has(p.id)
      ) continue;
      const realEmail = isRealEmail(p.real_email) ? p.real_email : (isRealEmail(p.email) ? p.email : null);
      if (!realEmail) continue;
      recipients.push({
        user_id: p.id,
        email: realEmail,
        is_admin: fullAdminIds.has(p.id),
        is_household_admin: scopedHouseholdAdminIds.has(p.id),
      });
    }

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, note: "No real email addresses found for recipients" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const subject = kind === "estimate"
      ? `New estimate from ${submitterUsername}${reference ? ` — ${reference}` : ""}`
      : kind === "invoice"
        ? `New invoice from ${submitterUsername} — ${formatCurrency(amount ?? 0, currency)}`
        : `New receipt from ${submitterUsername} — ${formatCurrency(amount ?? 0, currency)}`;

    const html = submissionEmailHtml({
      kind,
      submitterUsername,
      householdName,
      amount,
      currency,
      reference,
      description,
      appUrl,
    });

    let sent = 0;
    const sendErrors: string[] = [];
    for (const r of recipients) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: fromEmail, to: r.email, subject, html }),
      });

      if (res.ok) {
        sent++;
        await supabase.from("notification_log").insert({
          user_id: r.user_id,
          kind: notifKind,
          context: { ...contextRow, household_id: householdId, to: r.email },
        });
      } else {
        const errText = await res.text();
        sendErrors.push(`${r.email}: ${errText}`);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent, errors: sendErrors.length ? sendErrors : undefined }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
