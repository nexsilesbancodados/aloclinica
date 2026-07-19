import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { safeEqual } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-docuseal-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Webhook authentication ──
    // DocuSeal is configured to send a shared secret header. Reject anything
    // that does not match. Fail closed if the secret is not configured.
    const WEBHOOK_SECRET = Deno.env.get("DOCUSEAL_WEBHOOK_SECRET");
    const provided = req.headers.get("x-docuseal-secret");
    if (!WEBHOOK_SECRET || !safeEqual(provided, WEBHOOK_SECRET)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json();
    // Não loga payload inteiro (contém URLs assinadas + emails de submitters).
    console.log(`DocuSeal webhook: event=${payload.event_type || payload.event}`);

    const eventType = payload.event_type || payload.event;
    const submissionData = payload.data || payload;

    // Only process completion events
    if (eventType !== "form.completed" && eventType !== "submission.completed") {
      console.log("Ignoring event:", eventType);
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const submissionId = submissionData.submission_id || submissionData.id;
    const documents = submissionData.documents || [];
    const submitters = submissionData.submitters || [];

    // Extract signed document URLs
    const signedDocs = documents.length > 0
      ? documents.map((d: any) => ({ url: d.url, filename: d.name || d.filename }))
      : submitters.flatMap((s: any) =>
          (s.documents || []).map((d: any) => ({ url: d.url, filename: d.name || d.filename }))
        );

    console.log(`Submission completed: id=${submissionId} docs=${signedDocs.length}`);

    // Initialize Supabase admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (submissionId && signedDocs.length > 0) {
      const pdfUrl = signedDocs[0]?.url || null;

      // ── Match by submission metadata ──
      // DocuSeal submissions include submitter metadata with an external_id that
      // points at the specific document record set during submission creation.
      const externalId = submitters?.[0]?.external_id || submissionData?.external_id || null;

      // Update the specific exam_report identified by external_id (NEVER blanket-update).
      // Without an external_id we cannot safely target a single report, so we skip.
      if (pdfUrl && externalId) {
        const { error: reportError } = await supabase
          .from("exam_reports")
          .update({
            signed_at: new Date().toISOString(),
            pdf_url: pdfUrl,
          })
          .eq("id", externalId)
          .is("signed_at", null);

        if (reportError) {
          console.log("No matching exam_report to update or error:", reportError.message);
        }
      }

      // Log the webhook event
      await supabase.from("activity_logs").insert({
        action: "docuseal_webhook_completed",
        entity_type: "document_signature",
        entity_id: String(submissionId),
        details: {
          event_type: eventType,
          documents_count: signedDocs.length,
          documents: signedDocs,
        },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        submission_id: submissionId,
        documents_count: signedDocs.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Webhook error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
