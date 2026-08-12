import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCaller } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const caller = await getCaller(req);
  if (!caller.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { appointmentId } = await req.json();

    // Input validation
    if (!appointmentId || typeof appointmentId !== "string" || appointmentId.length > 50) {
      return new Response(JSON.stringify({ error: "Invalid appointmentId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(appointmentId)) {
      return new Response(JSON.stringify({ error: "Invalid appointment ID format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify appointment exists and is active
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: appt } = await supabase
      .from("appointments")
      .select("id, status, patient_id, doctor_id")
      .eq("id", appointmentId)
      .in("status", ["confirmed", "in_progress", "scheduled"])
      .maybeSingle();

    if (!appt) {
      return new Response(JSON.stringify({ error: "Appointment not found or not active" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!caller.isAdmin && caller.user.id !== appt.patient_id) {
      const { data: doctorProfile } = await supabase
        .from("doctor_profiles")
        .select("user_id")
        .eq("id", appt.doctor_id)
        .maybeSingle();
      if (doctorProfile?.user_id !== caller.user.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const appName = Deno.env.get("METERED_APP_NAME");
    const secretKey = Deno.env.get("METERED_SECRET_KEY");

    if (!appName || !secretKey) {
      return new Response(JSON.stringify({ error: "Metered credentials not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanAppName = appName.replace(/\.metered\.live$/i, "");
    const meteredDomain = `${cleanAppName}.metered.live`;
    const roomName = `consulta-${appointmentId.replace(/-/g, "").slice(0, 16)}`;

    // Try to get existing room first
    const getRes = await fetch(
      `https://${meteredDomain}/api/v1/room/${roomName}?secretKey=${secretKey}`
    );

    if (!getRes.ok && getRes.status !== 404) {
      console.error("Metered room lookup failed:", getRes.status, await getRes.text());
      return new Response(JSON.stringify({ error: "Video service unavailable" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let room: { roomName?: string; privacy?: string };

    if (getRes.ok) {
      room = await getRes.json();

      // Rooms created by older versions were public. Upgrade them before
      // issuing a token so a leaked room URL cannot bypass authorization.
      if (room.privacy !== "private") {
        const updateRes = await fetch(
          `https://${meteredDomain}/api/v1/room/${roomName}?secretKey=${secretKey}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              privacy: "private",
              enableRequestToJoin: false,
              autoJoin: true,
              maxParticipants: 4,
              ejectAtRoomExp: true,
              expireUnixSec: Math.floor(Date.now() / 1000) + 4 * 3600,
            }),
          },
        );
        if (!updateRes.ok) {
          console.error("Metered private-room upgrade failed:", await updateRes.text());
          return new Response(JSON.stringify({ error: "Failed to secure video room" }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        room = await updateRes.json();
      }
    } else {
      // New rooms are private from the moment they are created.
      const createRes = await fetch(
        `https://${meteredDomain}/api/v1/room?secretKey=${secretKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomName,
            privacy: "private",
            enableRequestToJoin: false,
            autoJoin: true,
            maxParticipants: 4,
            ejectAtRoomExp: true,
            expireUnixSec: Math.floor(Date.now() / 1000) + 4 * 3600,
          }),
        },
      );

      if (!createRes.ok) {
        const err = await createRes.text();
        console.error("Metered create room error:", err);
        return new Response(JSON.stringify({ error: "Failed to create room" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      room = await createRes.json();
    }

    // Metered private rooms require a room-scoped access token. The token is
    // short-lived and tied to the already-authorized platform user.
    const tokenRes = await fetch(
      `https://${meteredDomain}/api/v1/token?secretKey=${secretKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName,
          externalUserId: caller.user.id,
          email: caller.user.email,
          name: caller.user.email ?? "Participante",
          isAdmin: caller.isAdmin,
          expireUnixSec: Math.floor(Date.now() / 1000) + 4 * 3600,
        }),
      },
    );

    if (!tokenRes.ok) {
      console.error("Metered token generation failed:", await tokenRes.text());
      return new Response(JSON.stringify({ error: "Failed to authorize video room" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokenPayload = await tokenRes.json();
    if (!tokenPayload?.token) {
      return new Response(JSON.stringify({ error: "Metered returned no access token" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      roomURL: `${meteredDomain}/${room.roomName ?? roomName}`,
      roomName: room.roomName ?? roomName,
      accessToken: tokenPayload.token,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
