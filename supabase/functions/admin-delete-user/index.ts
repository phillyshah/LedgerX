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

    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "User ID is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (user_id === user.id) {
      return new Response(
        JSON.stringify({ error: "Cannot delete your own account" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Clean up related data first
    console.log("Updating expenses...");
    const expensesResult = await supabaseClient.from("expenses").update({ household_id: null }).eq("created_by", user_id);
    if (expensesResult.error) console.error("Expenses update error:", expensesResult.error);

    console.log("Deleting household members...");
    const householdMembersResult = await supabaseClient.from("household_members").delete().eq("user_id", user_id);
    if (householdMembersResult.error) console.error("Household members delete error:", householdMembersResult.error);

    console.log("Deleting user roles...");
    const rolesResult = await supabaseClient.from("user_roles").delete().eq("user_id", user_id);
    if (rolesResult.error) console.error("User roles delete error:", rolesResult.error);

    console.log("Deleting exports...");
    const exportsResult = await supabaseClient.from("exports").delete().eq("requested_by", user_id);
    if (exportsResult.error) console.error("Exports delete error:", exportsResult.error);

    console.log("Deleting user profile...");
    const profileResult = await supabaseClient.from("user_profiles").delete().eq("id", user_id);
    if (profileResult.error) console.error("User profile delete error:", profileResult.error);

    // Delete the user from auth
    console.log("Deleting user from auth...");
    const { error: deleteError } = await supabaseClient.auth.admin.deleteUser(user_id);

    if (deleteError) {
      console.error("Auth delete error:", deleteError);
      return new Response(
        JSON.stringify({ error: deleteError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("User deleted successfully");

    return new Response(
      JSON.stringify({ success: true }),
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
