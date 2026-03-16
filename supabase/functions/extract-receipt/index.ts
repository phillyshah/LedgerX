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
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY is not configured" }),
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

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 500,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analyze this receipt image and extract the following fields as JSON:
- vendor_name: the store or business name
- total_amount: the total amount as a number (float with decimal precision, e.g. 42.50)
- transaction_date: the date in YYYY-MM-DD format
- category: one of "airfare", "car_rental", "parking_tolls_taxi", "lodging", "personal_meals", "business_meals", "other"
- handwritten_notes: any handwritten text detected on the receipt (null if none)

Category rules for meals:
- Meals under $20 default to "personal_meals"
- Meals $20 or more, or with business context (e.g. mentions of clients, meetings, business), default to "business_meals"
- Non-meal items should use the appropriate category or "other"

Return ONLY valid JSON with these exact field names. If a field cannot be determined, use null.`,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${image}`,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      return new Response(
        JSON.stringify({
          error: "OpenAI API error",
          details: errorText,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No response from OpenAI" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse the JSON from OpenAI's response (strip markdown fences if present)
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

    // Ensure total_amount is a float
    if (extracted.total_amount !== null && extracted.total_amount !== undefined) {
      extracted.total_amount = parseFloat(String(extracted.total_amount));
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
