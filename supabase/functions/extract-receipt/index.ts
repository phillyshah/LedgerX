import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicApiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { image } = await req.json();

    if (!image) {
      return new Response(
        JSON.stringify({ error: "image (base64) is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Detect media type from base64 header or default to jpeg
    let mediaType = "image/jpeg";
    if (image.startsWith("/9j/")) mediaType = "image/jpeg";
    else if (image.startsWith("iVBOR")) mediaType = "image/png";
    else if (image.startsWith("R0lGO")) mediaType = "image/gif";
    else if (image.startsWith("UklGR")) mediaType = "image/webp";

    const anthropicResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": anthropicApiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 700,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType,
                    data: image,
                  },
                },
                {
                  type: "text",
                  text: `Analyze this receipt image and extract the following fields as JSON:
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

Return ONLY valid JSON with these exact field names. No markdown fences, no explanation. If a field cannot be determined, use null.`,
                },
              ],
            },
          ],
        }),
      }
    );

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      return new Response(
        JSON.stringify({
          error: "Anthropic API error",
          details: errorText,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const anthropicData = await anthropicResponse.json();
    const content = anthropicData.content?.[0]?.text;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No response from Anthropic API" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse the JSON from Claude's response (strip markdown fences if present)
    let extracted;
    try {
      const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      extracted = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({
          error: "Failed to parse extracted data",
          raw: content,
        }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Ensure numeric fields are floats
    if (extracted.total_amount !== null && extracted.total_amount !== undefined) {
      extracted.total_amount = parseFloat(String(extracted.total_amount));
    }
    if (extracted.tax_amount !== null && extracted.tax_amount !== undefined) {
      extracted.tax_amount = parseFloat(String(extracted.tax_amount));
    }
    if (extracted.tip_amount !== null && extracted.tip_amount !== undefined) {
      extracted.tip_amount = parseFloat(String(extracted.tip_amount));
    }

    return new Response(JSON.stringify(extracted), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
