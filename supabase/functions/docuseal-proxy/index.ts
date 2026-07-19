import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCaller, isInternalOrService } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DOCUSEAL_BASE = "http://72.62.138.208:3200";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Internal proxy: only trusted server-to-server callers (x-internal-secret /
  // service role) or an admin user. Blocks anonymous anon-key callers.
  if (!isInternalOrService(req) && !(await getCaller(req)).isAdmin) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("DOCUSEAL_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "DOCUSEAL_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create_template") {
      const { pdf_base64, nome_doc } = body;
      if (!pdf_base64 || !nome_doc) {
        return new Response(JSON.stringify({ error: "pdf_base64 and nome_doc required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await fetch(`${DOCUSEAL_BASE}/api/templates/pdf`, {
        method: "POST",
        headers: {
          "X-Auth-Token": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: nome_doc,
          documents: [
            {
              name: `${nome_doc}.pdf`,
              file: pdf_base64,
            },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify({ error: "DocuSeal template error", details: data }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ template_id: data.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_submission") {
      const { template_id, email, nome } = body;
      if (!template_id || !email || !nome) {
        return new Response(JSON.stringify({ error: "template_id, email, nome required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await fetch(`${DOCUSEAL_BASE}/api/submissions`, {
        method: "POST",
        headers: {
          "X-Auth-Token": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template_id: Number(template_id),
          send_email: false,
          submitters: [
            {
              role: "Médico",
              email,
              name: nome,
            },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify({ error: "DocuSeal submission error", details: data }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // data is an array of submitters
      const submitter = Array.isArray(data) ? data[0] : data;
      return new Response(
        JSON.stringify({
          submission_id: submitter.submission_id || submitter.id,
          signing_url: submitter.embed_src || submitter.signing_url,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "check_submission") {
      const { submission_id } = body;
      if (!submission_id) {
        return new Response(JSON.stringify({ error: "submission_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await fetch(`${DOCUSEAL_BASE}/api/submissions/${submission_id}`, {
        headers: { "X-Auth-Token": apiKey },
      });

      const data = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify({ error: "DocuSeal check error", details: data }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const completed = data.status === "completed" ||
        (data.submitters && data.submitters.every((s: any) => s.completed_at));

      const documents = data.documents || data.submitters?.flatMap((s: any) => s.documents || []) || [];

      return new Response(
        JSON.stringify({
          status: data.status,
          completed,
          documents,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use: create_template, create_submission, check_submission" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
