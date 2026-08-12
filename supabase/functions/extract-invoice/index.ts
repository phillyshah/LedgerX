import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Built per-request so the model is told what year it is. Without that anchor
// a document printing a two-digit year ("08/12/26") gets expanded to whatever
// year the model guesses — the failure that produced 2023 dates on real
// receipts even after the year-repair rule shipped.
const buildPrompt = (todayIso: string) => `Analyze this invoice image or PDF page and extract the following fields as JSON:
- invoice_number: the invoice or reference number printed on the document (e.g. "INV-2026-042", "NF-001")
- vendor_name: the name of the company or person issuing the invoice (the seller/contractor)
- total_amount: the final total amount due as a number (float with decimal precision, e.g. 1250.00). Use the grand total or "Amount Due", NOT subtotals.
- invoice_date: the date the invoice was issued, in YYYY-MM-DD format
- due_date: the payment due date in YYYY-MM-DD format (null if not present)
- service_date_start: the start of the service or billing period in YYYY-MM-DD format (null if not present)
- service_date_end: the end of the service or billing period in YYYY-MM-DD format (null if not present)
- description: a plain-text summary of the services or work described on the invoice. Include key line items or the main scope of work. Keep under 300 characters.
- currency: the currency code — one of "USD", "EUR", "CAD", "BRL" (default to "USD" if not determinable)

Important rules:
- Today is ${todayIso}. All dates must be YYYY-MM-DD. If the document shows a two-digit year (e.g. "08/12/26" means 2026), expand it to the most recent year that does not fall in the future. If a year looks ambiguous or implausible relative to today, prefer the most recent plausible year. (due_date is the exception — it may legitimately be in the future.)
- If a service/billing period is shown as a date range (e.g. "March 1–31, 2026"), extract start and end dates.
- If only one date is shown (not invoice_date), treat it as the invoice_date and leave service dates null.
- If invoice_number is not present, use null.
- Do NOT invent values — use null for any field that cannot be determined from the document.

Return only a valid JSON object with these exact field names.`;

async function callOpenAI(apiKey: string, model: string, imageDataUrl: string, todayIso: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageDataUrl, detail: "low" },
            },
            {
              type: "text",
              text: buildPrompt(todayIso),
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${model}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`No response content from model ${model}`);
  return content;
}

function parseExtracted(content: string, todayIso: string) {
  const extracted = JSON.parse(content);

  // Coerce numeric fields
  if (extracted.total_amount != null) {
    extracted.total_amount = parseFloat(String(extracted.total_amount));
    if (isNaN(extracted.total_amount)) extracted.total_amount = null;
  }

  // Validate currency
  const validCurrencies = ["USD", "EUR", "CAD", "BRL"];
  if (!validCurrencies.includes(extracted.currency)) {
    extracted.currency = "USD";
  }

  // due_date allows a future result — an invoice due next month is normal,
  // unlike an invoice *issued* next month or a service period that hasn't
  // happened yet.
  extracted.invoice_date = forceMisreadYear(extracted.invoice_date, todayIso);
  extracted.due_date = forceMisreadYear(extracted.due_date, todayIso, true);
  extracted.service_date_start = forceMisreadYear(extracted.service_date_start, todayIso);
  extracted.service_date_end = forceMisreadYear(extracted.service_date_end, todayIso);

  return extracted;
}

// ── The 2023 → 2026 override ─────────────────────────────────────────────────
// gpt-4o-mini misreads the year digit "6" as "3" often enough that 2026
// documents keep landing in the ledger dated 2023, and no structural check
// can catch it — a past date is indistinguishable from a genuinely old one.
// Owner's explicit call (2026-08-10): treat every OCR'd 2023 as a misread
// 2026 and accept that real 2023 documents get moved.
//
// HARDCODED AND TIME-LIMITED. Both years are literals. In 2027 this rewrites
// genuine 2023 dates and does nothing for misread 2027s — revisit it then.
// Mirrors src/lib/ocrYearFix.ts and the copies in extract-receipt,
// extract-statement, inbound-email and whatsapp-inbound. Keep them in sync.
const OCR_MISREAD_YEAR = 2023;
const OCR_CORRECTED_YEAR = 2026;

function forceMisreadYear(
  date: unknown,
  todayIso: string,
  allowFuture = false,
): unknown {
  if (typeof date !== "string") return date;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m || parseInt(m[1], 10) !== OCR_MISREAD_YEAR) return date;

  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);

  if (allowFuture) return `${OCR_CORRECTED_YEAR}-${m[2]}-${m[3]}`;

  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayIso);
  if (!t) return `${OCR_CORRECTED_YEAR}-${m[2]}-${m[3]}`;

  const today = new Date(
    parseInt(t[1], 10),
    parseInt(t[2], 10) - 1,
    parseInt(t[3], 10),
  );

  // Walk back to the first year that isn't in the future. v13.20 refused the
  // rewrite outright here and returned the ORIGINAL 2023 date, so every 2023
  // date later in the calendar year than today stayed in 2023 — the guard was
  // preserving the very bug it sat beside.
  for (let year = OCR_CORRECTED_YEAR; year > OCR_MISREAD_YEAR; year--) {
    const candidate = new Date(year, month - 1, day);
    if (candidate.getMonth() !== month - 1) continue; // Feb 29, non-leap year
    if (candidate.getTime() <= today.getTime()) {
      return `${year}-${m[2]}-${m[3]}`;
    }
  }

  return date;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // `today` is the caller's LOCAL date (see extract-receipt) — the future
    // guard in forceMisreadYear is off by a day if we use the server's UTC
    // date instead. Older clients don't send it; falling back to UTC is the
    // safe default there.
    const { image, today } = await req.json();
    const todayIso = typeof today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(today)
      ? today
      : new Date().toISOString().slice(0, 10);
    if (!image) {
      return new Response(
        JSON.stringify({ error: "image (base64) is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Detect MIME type from base64 prefix
    let mimeType: string;
    if (image.startsWith("iVBOR")) mimeType = "image/png";
    else if (image.startsWith("R0lGO")) mimeType = "image/gif";
    else if (image.startsWith("UklGR")) mimeType = "image/webp";
    else if (image.startsWith("JVBER")) mimeType = "application/pdf";
    else mimeType = "image/jpeg";

    // OpenAI vision doesn't support PDF directly — treat PDF base64 as JPEG
    // (the frontend should render the first page as an image before sending)
    const effectiveMime = mimeType === "application/pdf" ? "image/jpeg" : mimeType;
    const imageDataUrl = `data:${effectiveMime};base64,${image}`;

    // Try gpt-4o-mini first, fall back to gpt-4o on failure
    const models = ["gpt-4o-mini", "gpt-4o"];
    const errors: Record<string, string> = {};

    for (const model of models) {
      try {
        const content = await callOpenAI(openaiApiKey, model, imageDataUrl, todayIso);
        const extracted = parseExtracted(content, todayIso);
        return new Response(JSON.stringify(extracted), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        errors[model] = err.message;
      }
    }

    return new Response(
      JSON.stringify({ error: "All models failed", errors }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
