import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "No authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { real_email } = await req.json();

    if (!real_email || typeof real_email !== "string") {
      return jsonResponse({ error: "Email is required" }, 400);
    }

    const trimmed = real_email.trim().toLowerCase();

    if (!EMAIL_RE.test(trimmed)) {
      return jsonResponse({ error: "Invalid email format" }, 400);
    }

    // Update auth.users.email so Supabase password reset works
    const { error: authUpdateError } =
      await supabase.auth.admin.updateUserById(user.id, { email: trimmed });

    if (authUpdateError) {
      return jsonResponse(
        { error: "Failed to update auth email: " + authUpdateError.message },
        500
      );
    }

    // Update user_profiles with both email and real_email
    const { error: profileError } = await supabase
      .from("user_profiles")
      .update({ email: trimmed, real_email: trimmed })
      .eq("id", user.id);

    if (profileError) {
      return jsonResponse(
        { error: "Failed to update profile: " + profileError.message },
        500
      );
    }

    return jsonResponse({ success: true });
  } catch (error) {
    return jsonResponse(
      { error: error.message || "Internal server error" },
      500
    );
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
