import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PROMPT = `Analyze this invoice image or PDF page and extract the following fields as JSON:
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
- If a service/billing period is shown as a date range (e.g. "March 1–31, 2026"), extract start and end dates.
- If only one date is shown (not invoice_date), treat it as the invoice_date and leave service dates null.
- If invoice_number is not present, use null.
- Do NOT invent values — use null for any field that cannot be determined from the document.

Return only a valid JSON object with these exact field names.`;

async function callOpenAI(apiKey: string, model: string, imageDataUrl: string): Promise<string> {
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
              text: PROMPT,
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

function parseExtracted(content: string) {
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

  return extracted;
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

    const { image } = await req.json();
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
        const content = await callOpenAI(openaiApiKey, model, imageDataUrl);
        const extracted = parseExtracted(content);
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
