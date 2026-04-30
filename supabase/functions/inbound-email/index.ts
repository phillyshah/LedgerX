/**
 * inbound-email edge function
 *
 * Called by the VPS IMAP polling script whenever a new email arrives at
 * receipts@90ten.life. The script sends a JSON payload; this function:
 *
 *   1. Verifies the shared secret (INBOUND_EMAIL_SECRET env var)
 *   2. Resolves the sender email → user_id via resolve_sender_email()
 *   3. Skips silently if no user match or duplicate Message-ID
 *   4. Uploads each attachment to the 'receipts' storage bucket
 *   5. Runs OCR on the first image/PDF attachment
 *   6. Inserts a pending email_inbox row
 *
 * Payload shape (from the polling script):
 * {
 *   "from_email":   "alice@gmail.com",
 *   "subject":      "Fwd: Your Amazon receipt",
 *   "message_id":   "<unique-id@mail.gmail.com>",
 *   "attachments":  [
 *     { "filename": "receipt.jpg", "content_type": "image/jpeg", "data": "<base64>" }
 *   ]
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── Kind detection ────────────────────────────────────────────────────────────
// Heuristic: if the subject or any attachment filename contains invoice-like
// keywords, treat as invoice; otherwise default to expense.
function detectKind(subject: string, filenames: string[]): "expense" | "invoice" {
  const haystack = [subject, ...filenames].join(" ").toLowerCase();
  const invoiceKeywords = ["invoice", "factura", "nota fiscal", "bill", "fatura"];
  return invoiceKeywords.some((k) => haystack.includes(k)) ? "invoice" : "expense";
}

// ── OCR calls ─────────────────────────────────────────────────────────────────
async function runReceiptOCR(
  apiKey: string,
  base64Data: string,
  contentType: string,
): Promise<Record<string, unknown>> {
  const dataUrl = `data:${contentType};base64,${base64Data}`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract from this receipt image as JSON:
- vendor_name: store or business name
- total_amount: total as a number (e.g. 42.50)
- transaction_date: date in YYYY-MM-DD format
- handwritten_notes: any handwritten text (null if none)
Use null for any field you cannot determine.`,
            },
            { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) return {};
  const json = await resp.json();
  try {
    return JSON.parse(json.choices[0].message.content);
  } catch {
    return {};
  }
}

async function runInvoiceOCR(
  apiKey: string,
  base64Data: string,
  contentType: string,
): Promise<Record<string, unknown>> {
  const dataUrl = `data:${contentType};base64,${base64Data}`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract from this invoice image or PDF as JSON:
- vendor_name: business issuing the invoice
- invoice_number: invoice or reference number
- total_amount: total amount due as a number
- invoice_date: date in YYYY-MM-DD format
- due_date: payment due date in YYYY-MM-DD format (null if not shown)
- description: brief description of services/goods
Use null for any field you cannot determine.`,
            },
            { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) return {};
  const json = await resp.json();
  try {
    return JSON.parse(json.choices[0].message.content);
  } catch {
    return {};
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // 1. Verify shared secret
    const secret = Deno.env.get("INBOUND_EMAIL_SECRET");
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!secret || token !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { from_email, subject = "", message_id, attachments = [] } = body as {
      from_email: string;
      subject?: string;
      message_id?: string;
      attachments?: Array<{ filename: string; content_type: string; data: string }>;
    };

    if (!from_email) {
      return new Response(JSON.stringify({ error: "from_email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Service-role client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 3. Resolve sender → user
    const { data: userId, error: resolveErr } = await supabase.rpc(
      "resolve_sender_email",
      { p_email: from_email },
    );
    if (resolveErr || !userId) {
      // Silent ignore — don't leak whether the address is registered
      return new Response(JSON.stringify({ ok: true, matched: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Deduplicate by Message-ID
    if (message_id) {
      const { data: existing } = await supabase
        .from("email_inbox")
        .select("id")
        .eq("message_id", message_id)
        .maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 5. Detect kind
    const filenames = attachments.map((a) => a.filename);
    const kind = detectKind(subject, filenames);

    // 6. Upload attachments → storage
    const storedPaths: string[] = [];
    for (const att of attachments) {
      const ext = att.filename.split(".").pop() ?? "bin";
      const path = `email-inbox/${userId}/${crypto.randomUUID()}.${ext}`;
      const bytes = Uint8Array.from(atob(att.data), (c) => c.charCodeAt(0));
      const { error: uploadErr } = await supabase.storage
        .from("receipts")
        .upload(path, bytes, { contentType: att.content_type, upsert: false });
      if (!uploadErr) storedPaths.push(path);
    }

    // 7. OCR the first image or PDF attachment
    const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    let prefilled: Record<string, unknown> = {};
    const ocrTarget = attachments.find(
      (a) =>
        a.content_type.startsWith("image/") ||
        a.content_type === "application/pdf",
    );
    if (ocrTarget && apiKey) {
      prefilled =
        kind === "invoice"
          ? await runInvoiceOCR(apiKey, ocrTarget.data, ocrTarget.content_type)
          : await runReceiptOCR(apiKey, ocrTarget.data, ocrTarget.content_type);
    }

    // 8. Insert pending inbox row
    const { error: insertErr } = await supabase.from("email_inbox").insert({
      user_id: userId,
      from_email,
      subject,
      message_id: message_id ?? null,
      attachment_paths: storedPaths,
      kind,
      prefilled,
      status: "pending",
    });
    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ ok: true, matched: true, kind }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("inbound-email error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
