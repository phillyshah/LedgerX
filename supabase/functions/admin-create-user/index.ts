import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: callerRole, error: callerRoleError } = await supabaseClient
      .from("user_roles")
      .select("is_admin")
      .eq("user_id", user.id)
      .maybeSingle();

    if (callerRoleError) {
      return new Response(
        JSON.stringify({ error: "Failed to verify admin status: " + callerRoleError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!callerRole || !callerRole.is_admin) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { userid, password, is_admin, is_contractor, is_household_admin, preferred_language, email: realEmail } = await req.json();
    const language = (preferred_language === 'pt-BR' || preferred_language === 'en') ? preferred_language : 'en';

    if (!userid || !password) {
      return new Response(
        JSON.stringify({ error: "User ID and password are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const email = realEmail || `${userid}@example.com`;

    const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username: userid,
        preferred_language: language,
      },
    });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!newUser?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Failed to create user - no user ID returned" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userId = newUser.user.id;

    await new Promise(resolve => setTimeout(resolve, 1500));

    const { data: profileData } = await supabaseClient
      .from("user_profiles")
      .select("id, username")
      .eq("id", userId)
      .maybeSingle();

    if (!profileData) {
      const { error: profileInsertError } = await supabaseClient
        .from("user_profiles")
        .insert({
          id: userId,
          username: userid,
          email: email,
          preferred_language: language,
          ...(realEmail ? { real_email: realEmail } : {}),
        });

      if (profileInsertError) {
        await supabaseClient.auth.admin.deleteUser(userId);
        return new Response(
          JSON.stringify({ error: "Failed to create user profile: " + profileInsertError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    const { error: newRoleError } = await supabaseClient
      .from("user_roles")
      .insert({
        user_id: userId,
        is_admin: is_admin || false,
        is_contractor: is_contractor || false,
        is_household_admin: is_household_admin || false,
      });

    if (newRoleError) {
      await supabaseClient.from("user_profiles").delete().eq("id", userId);
      await supabaseClient.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: "Failed to set user role: " + newRoleError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, user: newUser.user }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
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
