import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Credit card statement OCR — extracts every purchase line item across all
// pages of a statement in one request (not one document → one record, like
// extract-receipt/extract-invoice). All pages are sent together so the model
// can correlate line items that straddle a page break instead of risking
// duplicates/gaps at page boundaries.
//
// Statements are dense tabular numbers where misreads are costly, so this
// uses detail:"high" — deliberately more expensive per page than the "low"
// detail used for receipts/invoices.
const MAX_PAGES = 10;

function buildPrompt(periodStart?: string, periodEnd?: string): string {
  const periodHint = periodStart && periodEnd
    ? `\n\nThis statement's billing period is ${periodStart} to ${periodEnd} (confirmed by the uploader, not OCR — trust it). Every line item's date should fall within or very close to this period. If a year digit is unclear or ambiguous, use this period to resolve it rather than guessing.`
    : '';

  return `Analyze these credit card statement page images (in order) and extract every individual purchase/charge line item as json:
{ "line_items": [ { "date": "YYYY-MM-DD", "description": "merchant/description text", "amount": 12.34 }, ... ] }

Rules:
- Only include actual purchase/charge line items. Skip section headers, column headers, subtotals, previous balance, payments received, interest charges, fees summary lines, and running totals.
- amount is always a positive number regardless of how the statement prints it (parentheses, minus sign, or a credit/debit column) — this is what the cardholder was charged for that specific line.
- date must be YYYY-MM-DD. If the statement only prints MM/DD, infer the year from the statement period.
- If a line item spans a page break, do not duplicate it.
- If you cannot confidently read a field, use null for that field rather than guessing.${periodHint}`;
}

async function callOpenAI(
  apiKey: string,
  model: string,
  imageDataUrls: string[],
  periodStart?: string,
  periodEnd?: string
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      // Statements can carry dozens of line items across several pages.
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            ...imageDataUrls.map((url) => ({
              type: "image_url",
              image_url: { url, detail: "high" },
            })),
            {
              type: "text",
              text: buildPrompt(periodStart, periodEnd),
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

interface RawLineItem {
  date?: string | null;
  description?: string | null;
  amount?: number | string | null;
}

function parseExtracted(
  content: string,
  todayIso: string,
  periodStart?: string,
  periodEnd?: string,
): { line_items: { date: string | null; description: string | null; amount: number | null }[] } {
  const parsed = JSON.parse(content);
  const rawItems: RawLineItem[] = Array.isArray(parsed.line_items) ? parsed.line_items : [];

  // The uploader's billing period is trusted, human-entered ground truth (it
  // is why the prompt above hands it to the model at all). If they told us
  // this statement really is from 2023, that beats a blanket digit rule —
  // otherwise every line of a genuinely old statement would be shunted to
  // 2026 and then dragged back by repairLineItemYears on the client, which is
  // a lot of motion to end up where we started.
  const periodTouches2023 =
    (periodStart ?? "").startsWith(`${OCR_MISREAD_YEAR}-`) ||
    (periodEnd ?? "").startsWith(`${OCR_MISREAD_YEAR}-`);

  return {
    line_items: rawItems.map((item) => ({
      date: typeof item.date === "string"
        ? (periodTouches2023 ? item.date : forceMisreadYear(item.date, todayIso) as string)
        : null,
      description: typeof item.description === "string" ? item.description : null,
      amount: item.amount != null ? Math.abs(parseFloat(String(item.amount))) : null,
    })),
  };
}

// ── The 2023 → 2026 override ─────────────────────────────────────────────────
// gpt-4o-mini misreads the year digit "6" as "3" often enough that 2026 dates
// keep landing in the ledger as 2023. Owner's explicit call (2026-08-10):
// treat every OCR'd 2023 as a misread 2026 and accept that genuinely old
// documents get moved.
//
// HARDCODED AND TIME-LIMITED. Both years are literals. In 2027 this rewrites
// genuine 2023 dates and does nothing for misread 2027s — revisit it then.
// Mirrors src/lib/ocrYearFix.ts and the copies in extract-receipt,
// extract-invoice, inbound-email and whatsapp-inbound. Keep them in sync.
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

function mimeFromBase64(sample: string): string {
  if (sample.startsWith("iVBOR")) return "image/png";
  if (sample.startsWith("R0lGO")) return "image/gif";
  if (sample.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
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

    // `today` is the caller's LOCAL date (see extract-receipt); older clients
    // don't send it, so fall back to the server's UTC date.
    const { images, periodStart, periodEnd, today } = await req.json();
    const todayIso = typeof today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(today)
      ? today
      : new Date().toISOString().slice(0, 10);
    if (!Array.isArray(images) || images.length === 0) {
      return new Response(
        JSON.stringify({ error: "images (array of base64 strings) is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (images.length > MAX_PAGES) {
      return new Response(
        JSON.stringify({ error: `Too many pages (${images.length}); max is ${MAX_PAGES}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const imageDataUrls = images.map((img: string) => `data:${mimeFromBase64(img)};base64,${img}`);

    // Try gpt-4o-mini first, fall back to gpt-4o on failure
    const models = ["gpt-4o-mini", "gpt-4o"];
    const errors: Record<string, string> = {};

    for (const model of models) {
      try {
        const content = await callOpenAI(openaiApiKey, model, imageDataUrls, periodStart, periodEnd);
        const extracted = parseExtracted(content, todayIso, periodStart, periodEnd);
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
