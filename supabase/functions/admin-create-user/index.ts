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

    const { data: roleData, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("is_admin")
      .eq("user_id", user.id)
      .maybeSingle();

    console.log("Role check result:", { roleData, roleError, userId: user.id });

    if (roleError) {
      console.error("Role check error:", roleError);
      return new Response(
        JSON.stringify({ error: "Failed to verify admin status: " + roleError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!roleData || !roleData.is_admin) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { userid, password, is_admin } = await req.json();

    if (!userid || !password) {
      return new Response(
        JSON.stringify({ error: "User ID and password are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Convert userid to email format for Supabase auth
    const email = `${userid}@example.com`;

    const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username: userid,
      },
    });

    if (createError) {
      console.error("Failed to create user:", createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!newUser?.user?.id) {
      console.error("No user ID returned from createUser");
      return new Response(
        JSON.stringify({ error: "Failed to create user - no user ID returned" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userId = newUser.user.id;
    console.log("User created in auth:", userId);

    // Wait for trigger to execute
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Check if profile was created by trigger
    const { data: profileData, error: profileCheckError } = await supabaseClient
      .from("user_profiles")
      .select("id, username")
      .eq("id", userId)
      .maybeSingle();

    if (profileCheckError) {
      console.error("Profile check error:", profileCheckError);
    }

    // If profile doesn't exist, create it manually
    if (!profileData) {
      console.log("Profile not created by trigger, creating manually...");
      const { data: insertedProfile, error: manualProfileError } = await supabaseClient
        .from("user_profiles")
        .insert({
          id: userId,
          username: userid,
          email: email,
        })
        .select()
        .single();

      if (manualProfileError) {
        console.error("Failed to create profile manually:", manualProfileError);

        // Try to clean up the auth user since we couldn't create the profile
        await supabaseClient.auth.admin.deleteUser(userId);

        return new Response(
          JSON.stringify({ error: "Failed to create user profile: " + manualProfileError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      console.log("Profile created manually:", insertedProfile);
    } else {
      console.log("Profile exists:", profileData);
    }

    // Create user role
    console.log("Creating user role...");
    const { error: roleError } = await supabaseClient
      .from("user_roles")
      .insert({
        user_id: userId,
        is_admin: is_admin || false,
      });

    if (roleError) {
      console.error("Failed to set user role:", roleError);

      // Try to clean up
      await supabaseClient.from("user_profiles").delete().eq("id", userId);
      await supabaseClient.auth.admin.deleteUser(userId);

      return new Response(
        JSON.stringify({ error: "Failed to set user role: " + roleError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("User creation completed successfully");

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
