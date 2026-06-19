/**
 * inbound-email edge function (Deno).
 *
 * Called by the VPS IMAP polling script for every unseen message.
 * Pipeline:
 *
 *   1. Verify shared secret (INBOUND_EMAIL_SECRET)
 *   2. Normalize sender + Message-ID; resolve sender → user_id via RPC
 *   3. Dedupe against (user_id, message_id, status='pending')
 *   4. Upload each attachment to Storage at email-inbox/{user_id}/{uuid}.{ext}
 *   5. OCR cascade: vision on first compatible attachment → fallback to
 *      inline body text → final fallback to a synthetic HTML attachment
 *      so the card always has something to click through to
 *   6. Insert pending email_inbox row
 *
 * Payload (from the polling script):
 * {
 *   "from_email":   "alice@gmail.com",
 *   "subject":      "Fwd: Your Amazon receipt",
 *   "message_id":   "<unique-id@mail.gmail.com>",
 *   "attachments":  [{ "filename": "...", "content_type": "...", "data": "<base64>" }],
 *   "body_text":    "...",
 *   "body_html":    "<html>..."
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ─── CONFIGURE: bucket name ──────────────────────────────────────────────────
// Must match the bucket in 0002_storage_policy.sql.
const STORAGE_BUCKET = "attachments";

// ─── CONFIGURE: OCR prompts ──────────────────────────────────────────────────
// Replace these for your domain. The `prefilled` JSONB column will be set to
// whatever object these prompts produce, and your frontend reads from it.
const ATTACHMENT_PROMPT = `Extract from this image or PDF as JSON. Use null
for any field you cannot determine. Fields:
- vendor_name: name of the business or sender
- total_amount: total amount as a number (e.g. 42.50)
- transaction_date: date in YYYY-MM-DD format
- notes: short summary of what this document is about`;

const BODY_PROMPT_PREFIX = `Extract from this forwarded email body as JSON.
Use null for any field you cannot determine. Fields:
- vendor_name: name of the business or sender
- total_amount: total amount as a number
- transaction_date: date in YYYY-MM-DD format
- notes: short summary of what this email is about

EMAIL BODY:
`;

// ─── CONFIGURE: kind heuristic ───────────────────────────────────────────────
// Simple keyword match against subject + filenames. Adapt the keyword list or
// remove this entirely if your app only has one kind.
function detectKind(subject: string, filenames: string[]): string {
  const haystack = [subject, ...filenames].join(" ").toLowerCase();
  const invoiceKeywords = ["invoice", "factura", "nota fiscal", "bill", "fatura"];
  if (invoiceKeywords.some((k) => haystack.includes(k))) return "invoice";
  return "default";
}

// ─── Headers + helpers ───────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Pull the bare address out of `Name <addr>` / `"Name" <addr>` / `addr` forms.
function extractEmailAddress(input: string): string {
  if (!input) return "";
  const angle = input.match(/<([^>]+)>/);
  if (angle) return angle[1].trim().toLowerCase();
  const bare = input.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (bare) return bare[0].trim().toLowerCase();
  return input.trim().toLowerCase();
}

// Strip RFC angle brackets from a Message-ID so dedup lookups are stable.
function normalizeMessageId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().replace(/^<|>$/g, "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

// OpenAI vision: accepted MIME types. HEIC (common from iPhone forwards) is
// rejected by the API, so we skip the round-trip rather than burn tokens.
function isOcrSupportedImage(contentType: string): boolean {
  return /^image\/(jpe?g|png|webp|gif)$/i.test(contentType);
}

// Did OCR return anything substantive? Empty / all-null objects count as a
// miss so we fall through to the inline-body extractor.
function hasUsefulFields(data: Record<string, unknown>): boolean {
  return Object.values(data).some(
    (v) => v !== null && v !== undefined && v !== "",
  );
}

// Strip HTML to readable text for the body fallback. Good enough for GPT.
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

// ─── OCR calls (gpt-4o-mini) ─────────────────────────────────────────────────
async function ocrAttachment(
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
            { type: "text", text: ATTACHMENT_PROMPT },
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

async function ocrBody(
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
      messages: [{ role: "user", content: BODY_PROMPT_PREFIX + text.slice(0, 8000) }],
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

// ─── Main handler ────────────────────────────────────────────────────────────
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

    const senderAddress = extractEmailAddress(from_email);
    const normalizedMessageId = normalizeMessageId(message_id);
    console.log(
      `[inbound-email] from="${from_email}" → ${senderAddress} ` +
        `msgid=${normalizedMessageId} attachments=${attachments.length}`,
    );
    if (!senderAddress) {
      return new Response(JSON.stringify({ ok: true, matched: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Service-role client (bypasses RLS; INSERTs land in email_inbox).
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 3. Resolve sender → user. Silent ignore if no match (don't leak which
    //    addresses are registered).
    const { data: userId, error: resolveErr } = await supabase.rpc(
      "resolve_sender_email",
      { p_email: senderAddress },
    );
    if (resolveErr || !userId) {
      console.log(`[inbound-email] no match for "${senderAddress}" — dropped`);
      return new Response(JSON.stringify({ ok: true, matched: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Dedupe only against still-pending rows so a re-forward after a
    //    discard creates a fresh card.
    if (normalizedMessageId) {
      const { data: existing } = await supabase
        .from("email_inbox")
        .select("id")
        .eq("user_id", userId)
        .eq("message_id", normalizedMessageId)
        .eq("status", "pending")
        .maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 5. Kind heuristic.
    const filenames = attachments.map((a) => a.filename);
    const kind = detectKind(subject, filenames);

    // 6. Upload attachments to Storage.
    const storedPaths: string[] = [];
    for (const att of attachments) {
      const ext = att.filename.split(".").pop() ?? "bin";
      const path = `email-inbox/${userId}/${crypto.randomUUID()}.${ext}`;
      const bytes = Uint8Array.from(atob(att.data), (c) => c.charCodeAt(0));
      const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, bytes, { contentType: att.content_type, upsert: false });
      if (uploadErr) {
        console.log(`[inbound-email] upload failed ${att.filename}: ${uploadErr.message}`);
      } else {
        storedPaths.push(path);
      }
    }

    // 7. OCR cascade.
    const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    let prefilled: Record<string, unknown> = {};

    const ocrTarget = attachments.find(
      (a) => isOcrSupportedImage(a.content_type) || a.content_type === "application/pdf",
    );
    if (ocrTarget && apiKey) {
      prefilled = await ocrAttachment(apiKey, ocrTarget.data, ocrTarget.content_type);
    }

    const inlineText = body_text ?? (body_html ? stripHtml(body_html) : "");
    if (!hasUsefulFields(prefilled) && inlineText.length > 20 && apiKey) {
      prefilled = await ocrBody(apiKey, inlineText);
    }

    // 8. Synthetic HTML attachment — when nothing was attached but we have
    //    body_html, save it so the card has something to click.
    if (storedPaths.length === 0 && body_html && body_html.length > 0) {
      const path = `email-inbox/${userId}/${crypto.randomUUID()}.html`;
      const bytes = new TextEncoder().encode(body_html);
      const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, bytes, { contentType: "text/html", upsert: false });
      if (!uploadErr) storedPaths.push(path);
    }

    // 9. Insert pending row.
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
    if (insertErr) throw insertErr;
    console.log(`[inbound-email] inserted row=${inserted?.id} kind=${kind}`);

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
