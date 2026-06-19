/**
 * inbound-email edge function (minimal version, no OCR).
 *
 * Called by the VPS IMAP polling script for every unseen message.
 *
 *   1. Verify the shared bearer secret (INBOUND_EMAIL_SECRET)
 *   2. Resolve the sender address → user_id via the SECURITY DEFINER RPC
 *   3. Dedupe against (user_id, message_id, status='pending')
 *   4. Upload each attachment to Storage
 *   5. Insert a pending email_inbox row with the raw from / subject /
 *      body_text / body_html and a list of stored attachment paths
 *
 * Payload (from the polling script):
 * {
 *   "from_email":   "alice@gmail.com",
 *   "subject":      "Fwd: Hi",
 *   "message_id":   "<unique-id@mail.gmail.com>",
 *   "attachments":  [{ "filename": "...", "content_type": "...", "data": "<base64>" }],
 *   "body_text":    "...",
 *   "body_html":    "<html>..."
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ─── CONFIGURE ───────────────────────────────────────────────────────────────
// Must match the bucket name in 0002_storage_policy.sql.
const STORAGE_BUCKET = "attachments";

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

// Strip RFC angle brackets so dedup lookups match regardless of mail client.
function normalizeMessageId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().replace(/^<|>$/g, "").trim();
  return trimmed.length > 0 ? trimmed : null;
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

    // 2. Service-role client (bypasses RLS for the inbox insert).
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
    //    discard creates a new card.
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

    // 5. Upload attachments.
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

    // 6. Insert pending row.
    const { data: inserted, error: insertErr } = await supabase
      .from("email_inbox")
      .insert({
        user_id: userId,
        from_email: senderAddress,
        subject: String(subject ?? ""),
        body_text: body_text ?? null,
        body_html: body_html ?? null,
        message_id: normalizedMessageId,
        attachment_paths: storedPaths,
        status: "pending",
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;
    console.log(`[inbound-email] inserted row=${inserted?.id} attachments=${storedPaths.length}`);

    return new Response(JSON.stringify({ ok: true, matched: true, id: inserted?.id }), {
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
