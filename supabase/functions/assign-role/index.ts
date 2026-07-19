import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCaller } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Authorization ──
    // The caller must be authenticated. Privilege escalation is prevented by:
    //  - admin role can NEVER be granted via this endpoint
    //  - non-admins may only assign a role to THEMSELVES
    //  - self-assigning a doctor-type role requires a valid, unused invite code
    const caller = await getCaller(req);
    if (!caller.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, role, profile_data } = await req.json();

    if (!user_id || !role) {
      return new Response(JSON.stringify({ error: "user_id and role are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validRoles = ["patient", "doctor", "clinic", "receptionist", "support", "partner", "affiliate"];
    if (!validRoles.includes(role)) {
      // "admin" is intentionally excluded — it can never be granted here.
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Non-admins may only assign a role to themselves.
    if (!caller.isAdmin && user_id !== caller.user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Doctor-type roles grant access to patient medical data — a non-admin must
    // present a valid, unused invite code (validated here, not trusted from client).
    const doctorTypeRoles = ["doctor"];
    if (!caller.isAdmin && doctorTypeRoles.includes(role)) {
      const inviteId = profile_data?.invite_code_id;
      let validInvite = false;
      if (inviteId) {
        const { data: code } = await supabase
          .from("doctor_invite_codes")
          .select("id, is_used")
          .eq("id", inviteId)
          .maybeSingle();
        validInvite = !!code && code.is_used !== true;
      }
      if (!validInvite) {
        return new Response(JSON.stringify({ error: "Valid invite code required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Insert role (ignore conflict if already exists)
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({ user_id, role })
      .select()
      .single();

    // If duplicate, that's fine
    if (roleError && !roleError.message.includes("duplicate")) {
      console.error("Role insert error:", roleError);
    }

    // Create profile-specific records if needed
    // The doctor role gets a doctor_profiles row tagged with doctor_type
    if (role === "doctor" && profile_data) {
      await supabase.from("doctor_profiles").insert({
        user_id,
        crm: profile_data.crm,
        crm_state: profile_data.crm_state || "SP",
        doctor_type: "telemedicina",
      });
    }

    if (role === "partner" && profile_data) {
      await supabase.from("partner_profiles").insert({
        user_id,
        business_name: profile_data.business_name,
        cnpj: profile_data.cnpj || null,
        partner_type: profile_data.partner_type || "pharmacy",
      });
    }

    if (role === "clinic" && profile_data) {
      await supabase.from("clinic_profiles").insert({
        user_id,
        name: profile_data.name,
        cnpj: profile_data.cnpj || null,
      });
    }

    if (role === "affiliate") {
      await supabase.from("affiliate_profiles").insert({
        user_id,
        pix_key: profile_data?.pix_key || null,
        is_approved: false,
        commission_percent: 2,
      });
    }

    // Mark invite code as used if provided
    if (profile_data?.invite_code_id) {
      await supabase.from("doctor_invite_codes").update({
        is_used: true,
        used_by: user_id,
        used_at: new Date().toISOString(),
      }).eq("id", profile_data.invite_code_id);
    }

    // Fire welcome email based on role (non-blocking)
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(user_id);
      const email = authUser?.user?.email;
      if (email) {
        const { data: profile } = await supabase.from("profiles")
          .select("first_name, last_name").eq("user_id", user_id).maybeSingle();
        const fullName = profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() : (profile_data?.name || "");
        const typeMap: Record<string, string> = {
          patient: "welcome",
          doctor: "welcome_doctor",
          clinic: "welcome_clinic",
        };
        const emailType = typeMap[role];
        if (emailType) {
          const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
          const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
            body: JSON.stringify({
              type: emailType,
              to: email,
              data: {
                name: fullName || email,
                clinic_name: profile_data?.name || "",
                crm: profile_data?.crm || "",
              },
            }),
          }).catch((e) => console.warn("Welcome email failed:", e));
        }
      }
    } catch (e: any) {
      console.warn("assign-role welcome email dispatch failed:", e);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("assign-role error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
