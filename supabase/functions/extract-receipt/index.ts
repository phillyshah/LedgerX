import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Lean receipt OCR — extract only what's truly necessary.
// Per product direction: receipts don't need itemized contents, tax/tip
// breakdown, payment method, or category guesses. Those add OpenAI tokens
// and force users to verify fields they don't care about. Vendor + total +
// date pin the receipt to a transaction; handwritten notes capture context
// the user added by hand. The form's vendor catalog (separate feature) now
// owns category auto-fill, so the model doesn't need to guess.
//
// Note: invoice OCR (extract-invoice) intentionally remains full-detail —
// invoices are higher-stakes and benefit from extracting service period,
// invoice number, due date, and a description.
function buildPrompt(today: string): string {
  const safeToday = /^\d{4}-\d{2}-\d{2}$/.test(today)
    ? today
    : new Date().toISOString().slice(0, 10);
  return `Today's date is ${safeToday}. Analyze this receipt image and extract the following fields as json:
- vendor_name: the store or business name
- total_amount: the total amount as a number (float with decimal precision, e.g. 42.50)
- transaction_date: the date in YYYY-MM-DD format. If the year on the receipt looks ambiguous or implausible relative to today (${safeToday}), use the most recent plausible year.
- handwritten_notes: any handwritten text detected on the receipt (null if none)

If a field cannot be determined, use null. Do not extract individual line items, tax, tip, or payment method.`;
}

async function callOpenAI(apiKey: string, model: string, imageDataUrl: string, today: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      // Lean prompt returns only 4 fields (vendor, total, date, handwritten).
      // 200 tokens is comfortably above the largest realistic response.
      max_tokens: 200,
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
              text: buildPrompt(today),
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

  // Coerce total_amount to a number; the lean prompt only emits this one
  // numeric field. Old callers may still receive nulls for missing fields.
  if (extracted.total_amount != null) {
    extracted.total_amount = parseFloat(String(extracted.total_amount));
  }

  // Defensive clamp: gpt-4o-mini reading a low-detail receipt image
  // occasionally misreads a year digit (most commonly 6→3 or 8→3). If
  // the extracted year falls outside a plausible window around today,
  // rebuild it with the current year (or previous, if that would be in
  // the future). Users can always edit the field on the form.
  if (typeof extracted.transaction_date === "string") {
    extracted.transaction_date = repairImplausibleYear(
      extracted.transaction_date,
      todayIso,
    );
  }

  return extracted;
}

function repairImplausibleYear(date: string, todayIso: string): string {
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
  // Accept: within the last 13 months, or up to ~1 day in the future
  // (timezone slack for receipts dated "today" on the other side of UTC).
  if (monthsDiff >= 0 && monthsDiff <= 13) return date;
  if (monthsDiff < 0 && ex.getTime() - today.getTime() <= 86_400_000) return date;
  const candidate = new Date(tYear, parseInt(mon, 10) - 1, parseInt(day, 10));
  const year = candidate.getTime() > today.getTime() ? tYear - 1 : tYear;
  return `${year}-${mon}-${day}`;
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

    const { image, today } = await req.json();
    if (!image) {
      return new Response(
        JSON.stringify({ error: "image (base64) is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // Fallback to server date if client didn't send today (backwards compat)
    const todayStr: string = today ?? new Date().toISOString().slice(0, 10);

    // Build data URL for OpenAI vision
    let mimeType: string;
    if (image.startsWith("iVBOR")) mimeType = "image/png";
    else if (image.startsWith("R0lGO")) mimeType = "image/gif";
    else if (image.startsWith("UklGR")) mimeType = "image/webp";
    else mimeType = "image/jpeg";
    const imageDataUrl = `data:${mimeType};base64,${image}`;

    // Try gpt-4o-mini first, fall back to gpt-4o on failure
    const models = ["gpt-4o-mini", "gpt-4o"];
    const errors: Record<string, string> = {};

    for (const model of models) {
      try {
        const content = await callOpenAI(openaiApiKey, model, imageDataUrl, todayStr);
        const extracted = parseExtracted(content, todayStr);
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
