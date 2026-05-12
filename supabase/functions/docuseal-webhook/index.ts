import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
      // DocuSeal submissions include submitter metadata with external_id or email.
      // The external_id field contains the laudo ID set during submission creation.
      const submitterEmail = submitters?.[0]?.email || submissionData?.email || null;
      const externalId = submitters?.[0]?.external_id || submissionData?.external_id || null;

      let matchedLaudoId: string | null = null;

      // 1. Try matching via external_id (laudo ID passed during submission creation)
      if (externalId) {
        const { data: laudo } = await supabase
          .from("aloc_laudos")
          .select("id")
          .eq("id", externalId)
          .eq("status", "pending_signature")
          .maybeSingle();
        if (laudo) matchedLaudoId = laudo.id;
      }

      // 2. Fallback: match by submission_id stored in activity_logs
      if (!matchedLaudoId && submissionId) {
        const { data: logEntry } = await supabase
          .from("activity_logs")
          .select("entity_id")
          .eq("action", "docuseal_submission_created")
          .eq("entity_id", String(submissionId))
          .maybeSingle();
        if (logEntry?.entity_id) {
          // entity_id é o submission_id; ainda precisaríamos buscar o laudo nas details
          // Não logamos o submission_id aqui pra não vazar info no stdout
        }
      }

      // Update matched laudo
      if (matchedLaudoId && pdfUrl) {
        const { error: laudoError } = await supabase
          .from("aloc_laudos")
          .update({
            status: "assinado",
            pdf_url: pdfUrl,
            assinado_em: new Date().toISOString(),
          })
          .eq("id", matchedLaudoId)
          .eq("status", "pending_signature");

        if (laudoError) {
          console.error("Error updating laudo:", laudoError.message);
        } else {
          console.log(`Updated laudo: ${String(matchedLaudoId).slice(0, 8)}*** with signed PDF`);

          // Also update related exame status
          const { data: laudo } = await supabase
            .from("aloc_laudos")
            .select("exame_id")
            .eq("id", matchedLaudoId)
            .single();

          if (laudo?.exame_id) {
            await supabase
              .from("aloc_exames")
              .update({ status: "concluido" })
              .eq("id", laudo.exame_id);
          }
        }
      }

      // Update exam_reports if signed_at is null (for exam report signing flow)
      if (pdfUrl) {
        const { error: reportError } = await supabase
          .from("exam_reports")
          .update({
            signed_at: new Date().toISOString(),
            pdf_url: pdfUrl,
          })
          .is("signed_at", null)
          .not("id", "is", null);

        if (reportError) {
          console.log("No exam_reports to update or error:", reportError.message);
        }
      }

      // Log the webhook event
      await supabase.from("activity_logs").insert({
        action: "docuseal_webhook_completed",
        entity_type: "document_signature",
        entity_id: String(submissionId),
        details: {
          event_type: eventType,
          matched_laudo_id: matchedLaudoId,
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
