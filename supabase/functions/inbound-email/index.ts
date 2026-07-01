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
 *   6. If no attachment OCR succeeded, runs text extraction on the
 *      forwarded email body (text or stripped-HTML). Many vendor
 *      receipts (Uber, airline, SaaS invoices, etc.) ship the receipt
 *      inline rather than as an attachment.
 *   7. When the email has no attachments at all but has a body, the
 *      stripped body is saved to storage as a `.html` "synthetic
 *      attachment" so the user has something to look at on the card.
 *   8. Inserts a pending email_inbox row
 *
 * Payload shape (from the polling script):
 * {
 *   "from_email":   "alice@gmail.com",
 *   "subject":      "Fwd: Your Amazon receipt",
 *   "message_id":   "<unique-id@mail.gmail.com>",
 *   "attachments":  [
 *     { "filename": "receipt.jpg", "content_type": "image/jpeg", "data": "<base64>" }
 *   ],
 *   "body_text":    "Thanks for riding with Uber...",
 *   "body_html":    "<html>..."
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── Year repair for OCR'd receipt dates ───────────────────────────────────────
// gpt-4o-mini reading low-detail images occasionally misreads year digits
// (most commonly 6→3, 8→3). If the extracted year sits outside a plausible
// window around today, rebuild it using the current year — falling back to
// the previous calendar year if that lands in the future. Receipt-only;
// invoices intentionally untouched (their dates can legitimately span wider
// ranges and are reviewed before being marked paid).
function repairImplausibleYear(date: unknown, todayIso: string): unknown {
  if (typeof date !== "string") return date;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayIso);
  if (!m || !t) return date;
  const exYear = parseInt(m[1], 10);
  const mon = m[2];
  const day = m[3];
  const tYear = parseInt(t[1], 10);
  const tMon = parseInt(t[2], 10);
  const tDay = parseInt(t[3], 10);
  const ex = new Date(exYear, parseInt(mon, 10) - 1, parseInt(day, 10));
  const today = new Date(tYear, tMon - 1, tDay);
  const monthsDiff =
    (today.getFullYear() - ex.getFullYear()) * 12 +
    (today.getMonth() - ex.getMonth());
  if (monthsDiff >= 0 && monthsDiff <= 13) return date;
  if (monthsDiff < 0 && ex.getTime() - today.getTime() <= 86_400_000) return date;
  const candidate = new Date(tYear, parseInt(mon, 10) - 1, parseInt(day, 10));
  const year = candidate.getTime() > today.getTime() ? tYear - 1 : tYear;
  return `${year}-${mon}-${day}`;
}

// ── From-header normalization ─────────────────────────────────────────────────
// IMAP `From` headers come in several shapes — `alice@example.com`,
// `Alice <alice@example.com>`, `"Alice Q" <alice@example.com>`, etc. The
// resolve_sender_email RPC does an exact (lowercased) match, so we have to
// reduce whatever the polling script sends down to just the bare address
// before looking it up. Prefer the value inside `<...>` if present; fall
// back to the first email-looking token; lowercase + trim the result.
function extractEmailAddress(input: string): string {
  if (!input) return "";
  const angle = input.match(/<([^>]+)>/);
  if (angle) return angle[1].trim().toLowerCase();
  const bare = input.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (bare) return bare[0].trim().toLowerCase();
  return input.trim().toLowerCase();
}

// ── Message-ID normalization ──────────────────────────────────────────────────
// Mail clients wrap Message-IDs in angle brackets per RFC: `<abc@host.com>`.
// Strip them (and surrounding whitespace) so the dedup lookup matches what
// we previously stored, regardless of which side of the bracket the client
// added trailing whitespace.
function normalizeMessageId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().replace(/^<|>$/g, "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ── Attachment content-type filter ────────────────────────────────────────────
// OpenAI vision only accepts JPEG, PNG, WEBP, GIF data URLs — HEIC files
// (common from iPhone forwards) return 400. Skip OCR for those rather than
// burn a token round-trip that's guaranteed to fail; the row still gets
// inserted so the user can open the attachment and fill the form by hand.
function isOcrSupportedImage(contentType: string): boolean {
  return /^image\/(jpe?g|png|webp|gif)$/i.test(contentType);
}

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

// ── Inline body extractors ────────────────────────────────────────────────────
// When the receipt is in the email body itself (no PDF/image attached),
// run a plain-text extraction prompt against the forwarded HTML/text.
async function runReceiptTextExtraction(
  apiKey: string,
  text: string,
): Promise<Record<string, unknown>> {
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
          content: `Extract from this forwarded receipt email body as JSON:
- vendor_name: store or business name
- total_amount: total as a number (e.g. 42.50)
- transaction_date: date in YYYY-MM-DD format
- handwritten_notes: short description of what was purchased (null if unclear)
Use null for any field you cannot determine.

EMAIL BODY:
${text.slice(0, 8000)}`,
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

async function runInvoiceTextExtraction(
  apiKey: string,
  text: string,
): Promise<Record<string, unknown>> {
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
          content: `Extract from this forwarded invoice email body as JSON:
- vendor_name: business issuing the invoice
- invoice_number: invoice or reference number
- total_amount: total amount due as a number
- invoice_date: date in YYYY-MM-DD format
- due_date: payment due date in YYYY-MM-DD format (null if not shown)
- description: brief description of services/goods
Use null for any field you cannot determine.

EMAIL BODY:
${text.slice(0, 8000)}`,
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

// Strip HTML tags (and script/style blocks) to a readable plain-text version.
// Good enough for GPT extraction — we don't need fidelity, just the prose.
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Did the OCR call return anything substantive? Empty objects and
// all-null payloads count as misses so we can fall through to the
// inline-body extractor.
function hasUsefulFields(data: Record<string, unknown>): boolean {
  return Object.values(data).some((v) => v !== null && v !== undefined && v !== "");
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
    const {
      from_email,
      subject = "",
      message_id,
      attachments = [],
      body_text,
      body_html,
    } = body as {
      from_email: string;
      subject?: string;
      message_id?: string;
      attachments?: Array<{ filename: string; content_type: string; data: string }>;
      body_text?: string | null;
      body_html?: string | null;
    };

    if (!from_email) {
      return new Response(JSON.stringify({ error: "from_email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize: pull the bare address out of "Name <addr>" forms so the
    // RPC lookup matches what the user stored in their settings.
    const senderAddress = extractEmailAddress(from_email);
    const normalizedMessageId = normalizeMessageId(message_id);
    console.log(
      `[inbound-email] received from="${from_email}" ` +
        `normalized=${senderAddress} message_id=${normalizedMessageId} ` +
        `attachments=${attachments.length} subject="${String(subject ?? "").slice(0, 80)}"`,
    );
    if (!senderAddress) {
      console.log("[inbound-email] no sender address extracted — dropping");
      return new Response(JSON.stringify({ ok: true, matched: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1b. Command dispatch — an attachment-free email whose subject is a known
    //     command word (help / estimates / invoices) is a request to the
    //     email-command bot, not a receipt. Forward the payload to that
    //     function and return before any receipt processing. Receipts almost
    //     always carry an attachment, so this never intercepts a real forward.
    const commandWord =
      (String(subject ?? "").trim().toLowerCase().split(/\s+/)[0] ?? "")
        .replace(/[^a-z]/g, "");
    const KNOWN_COMMANDS = ["help", "estimates", "invoices"];
    if (attachments.length === 0 && KNOWN_COMMANDS.includes(commandWord)) {
      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/email-command`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Authenticate with the service-role key so the platform JWT gate
            // accepts the call regardless of the function's verify_jwt setting.
            // email-command then verifies the shared secret from the body.
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ from_email, subject, body_text, secret }),
        });
      } catch (e) {
        console.error("[inbound-email] command forward failed:", e);
      }
      return new Response(JSON.stringify({ ok: true, command: commandWord }), {
        status: 200,
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
      { p_email: senderAddress },
    );
    if (resolveErr || !userId) {
      // Silent ignore — don't leak whether the address is registered.
      // Logged so we can see why a forward never appears in someone's inbox.
      console.log(
        `[inbound-email] no user match for sender="${senderAddress}" ` +
          `(resolveErr=${resolveErr?.message ?? "none"}) — dropping`,
      );
      return new Response(JSON.stringify({ ok: true, matched: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[inbound-email] matched user_id=${userId}`);

    // 4. Deduplicate by Message-ID — only against rows the user hasn't yet
    //    handled. If they discarded or accepted an earlier copy, a fresh
    //    forward should produce a new pending row rather than vanish.
    if (normalizedMessageId) {
      const { data: existing } = await supabase
        .from("email_inbox")
        .select("id")
        .eq("user_id", userId)
        .eq("message_id", normalizedMessageId)
        .eq("status", "pending")
        .maybeSingle();
      if (existing) {
        console.log(
          `[inbound-email] dedup hit on pending row=${existing.id} for ` +
            `message_id=${normalizedMessageId} — skipping insert`,
        );
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
      if (uploadErr) {
        console.log(
          `[inbound-email] storage upload failed for ${att.filename}: ${uploadErr.message}`,
        );
      } else {
        storedPaths.push(path);
      }
    }

    // 7. OCR the first OpenAI-vision-compatible image or PDF attachment.
    //    HEIC from iPhone forwards is intentionally excluded — the vision
    //    API rejects it, so we'd just be burning a round-trip. The row
    //    still gets inserted and the user can open the attachment by hand.
    const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    let prefilled: Record<string, unknown> = {};
    const ocrTarget = attachments.find(
      (a) => isOcrSupportedImage(a.content_type) || a.content_type === "application/pdf",
    );
    if (ocrTarget && apiKey) {
      prefilled =
        kind === "invoice"
          ? await runInvoiceOCR(apiKey, ocrTarget.data, ocrTarget.content_type)
          : await runReceiptOCR(apiKey, ocrTarget.data, ocrTarget.content_type);
      console.log(
        `[inbound-email] attachment OCR (${ocrTarget.content_type}) ` +
          `useful=${hasUsefulFields(prefilled)}`,
      );
    } else if (ocrTarget && !apiKey) {
      console.log("[inbound-email] OCR skipped — no OPENAI_API_KEY");
    }

    // 7b. Inline body fallback — only when attachment OCR didn't yield
    //     anything we can prefill with.
    const inlineText = body_text ?? (body_html ? stripHtml(body_html) : "");
    if (!hasUsefulFields(prefilled) && inlineText.length > 20 && apiKey) {
      prefilled =
        kind === "invoice"
          ? await runInvoiceTextExtraction(apiKey, inlineText)
          : await runReceiptTextExtraction(apiKey, inlineText);
    }

    // 7d. Repair OCR'd receipt year if the model misread a digit.
    if (kind === "expense" && prefilled.transaction_date) {
      const todayIso = new Date().toISOString().slice(0, 10);
      prefilled.transaction_date = repairImplausibleYear(
        prefilled.transaction_date,
        todayIso,
      );
    }

    // 7c. Synthetic attachment — when there are no real attachments but
    //     we *do* have an HTML body, save it so the inbox card has
    //     something for the user to click through to. Plain text emails
    //     without HTML are skipped (no useful preview to render).
    if (storedPaths.length === 0 && body_html && body_html.length > 0) {
      const path = `email-inbox/${userId}/${crypto.randomUUID()}.html`;
      const bytes = new TextEncoder().encode(body_html);
      const { error: uploadErr } = await supabase.storage
        .from("receipts")
        .upload(path, bytes, { contentType: "text/html", upsert: false });
      if (!uploadErr) storedPaths.push(path);
    }

    // 8. Insert pending inbox row
    const { data: inserted, error: insertErr } = await supabase
      .from("email_inbox")
      .insert({
        user_id: userId,
        from_email: senderAddress,
        subject: String(subject ?? ""),
        message_id: normalizedMessageId,
        attachment_paths: storedPaths,
        kind,
        prefilled,
        status: "pending",
      })
      .select("id")
      .single();
    if (insertErr) {
      console.error(
        `[inbound-email] insert failed for user=${userId} ` +
          `message_id=${normalizedMessageId}: ${insertErr.message}`,
      );
      throw insertErr;
    }
    console.log(
      `[inbound-email] inserted row=${inserted?.id} kind=${kind} ` +
        `attachments=${storedPaths.length}`,
    );

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
