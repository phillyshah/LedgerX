import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PROMPT = `Analyze this receipt image and extract the following fields as json:
- vendor_name: the store or business name
- total_amount: the total amount as a number (float with decimal precision, e.g. 42.50)
- transaction_date: the date in YYYY-MM-DD format
- category: one of "airfare", "car_rental", "parking_tolls_taxi", "lodging", "personal_meals", "business_meals", "other"
- handwritten_notes: any handwritten text detected on the receipt (null if none)
- tax_amount: the tax amount as a number (null if not visible)
- tip_amount: the tip/gratuity amount as a number (null if not visible)
- payment_method: one of "cash", "credit", "debit" (null if not determinable)
- items_summary: a brief plain-text summary of items purchased, e.g. "2 coffees, 1 sandwich". Do NOT list individual prices. For meals, just summarize the food/drink items. (null if not determinable)

Category rules for meals:
- Meals under $20 default to "personal_meals"
- Meals $20 or more, or with business context (e.g. mentions of clients, meetings, business), default to "business_meals"
- Non-meal items should use the appropriate category or "other"

If a field cannot be determined, use null.`;

async function callOpenAI(apiKey: string, model: string, imageDataUrl: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
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

  for (const field of ["total_amount", "tax_amount", "tip_amount"]) {
    if (extracted[field] != null) {
      extracted[field] = parseFloat(String(extracted[field]));
    }
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
