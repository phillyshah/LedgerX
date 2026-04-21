import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

/*
  lookup-npi
  ----------
  Authenticated proxy to the CMS NPPES registry.

  Input JSON: { query: string }
    - single free-text query, split on whitespace into first/last name tokens.
    - if only one token is provided, it is matched as last_name.

  Output JSON: { results: Array<{
    npi: string,
    name: string,             // "First Last"
    credential?: string,      // e.g. "MD", "DO"
    specialty?: string,       // primary taxonomy desc
    city?: string,
    state?: string,
  }> }

  The upstream NPPES endpoint is public and does not require auth. We gate this
  function on a valid Supabase user token so it can't be abused by anonymous
  traffic. No admin check here — any signed-in user can look up providers
  (visibility of the UI button is gated per-household via features_enabled).
*/

interface NppesAddress {
  city?: string;
  state?: string;
  address_purpose?: string;
}

interface NppesTaxonomy {
  desc?: string;
  primary?: boolean;
}

interface NppesBasic {
  first_name?: string;
  last_name?: string;
  credential?: string;
  organization_name?: string;
}

interface NppesResult {
  number?: string;
  basic?: NppesBasic;
  addresses?: NppesAddress[];
  taxonomies?: NppesTaxonomy[];
}

function normalize(results: NppesResult[]) {
  return results.map((r) => {
    const basic = r.basic ?? {};
    const taxonomy = (r.taxonomies ?? []).find((t) => t.primary) ?? r.taxonomies?.[0];
    const loc = (r.addresses ?? []).find((a) => a.address_purpose === "LOCATION")
      ?? r.addresses?.[0];
    const name = basic.organization_name
      ?? [basic.first_name, basic.last_name].filter(Boolean).join(" ").trim();
    return {
      npi: r.number ?? "",
      name,
      credential: basic.credential ?? undefined,
      specialty: taxonomy?.desc ?? undefined,
      city: loc?.city ?? undefined,
      state: loc?.state ?? undefined,
    };
  }).filter((p) => p.npi && p.name);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth gate: require a real Supabase user.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { query } = await req.json() as { query?: string };
    const q = (query ?? "").trim();
    if (q.length < 2) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Split free-text query into first/last name tokens.
    // "Smith" → last_name=Smith
    // "John Smith" → first_name=John, last_name=Smith
    // "John Paul Smith" → first_name=John Paul, last_name=Smith
    const tokens = q.split(/\s+/);
    const params = new URLSearchParams({
      version: "2.1",
      limit: "20",
    });
    if (tokens.length === 1) {
      params.set("last_name", tokens[0] + "*");
    } else {
      params.set("first_name", tokens.slice(0, -1).join(" ") + "*");
      params.set("last_name", tokens[tokens.length - 1] + "*");
    }

    const url = "https://npiregistry.cms.hhs.gov/api/?" + params.toString();
    const resp = await fetch(url);
    if (!resp.ok) {
      const body = await resp.text();
      return new Response(
        JSON.stringify({ error: "NPPES upstream error", detail: body.slice(0, 500) }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await resp.json() as { results?: NppesResult[] };
    const results = normalize(data.results ?? []);

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
