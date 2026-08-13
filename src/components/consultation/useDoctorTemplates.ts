import { useCallback, useEffect, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { logError } from "@/lib/logger";

export type TemplateType =
  | "soap_subjective"
  | "soap_objective"
  | "soap_assessment"
  | "soap_plan"
  | "prescription"
  | "generic";

interface Template {
  id: string;
  type: TemplateType;
  title: string;
  body: string;
}

export function useDoctorTemplates(type?: TemplateType) {
  const { user } = useAuth();
  const userId = user?.id;
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      let q = db
        .from("doctor_text_templates")
        .select("id, type, title, body")
        .eq("doctor_user_id", userId);
      if (type) q = q.eq("type", type);
      const { data } = await q
        .order("created_at", { ascending: false })
        .limit(40);
      setTemplates((data ?? []) as Template[]);
    } catch (e) {
      logError("useDoctorTemplates load", e);
    } finally {
      setLoading(false);
    }
  }, [userId, type]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (title: string, body: string, t: TemplateType) => {
      if (!userId) return;
      try {
        const { data, error } = await db
          .from("doctor_text_templates")
          .insert({ doctor_user_id: userId, title, body, type: t } as any)
          .select("id, type, title, body")
          .single();
        if (error) throw error;
        setTemplates((prev) => [data as Template, ...prev]);
        toast.success("Template salvo");
      } catch (e: any) {
        toast.error("Não foi possível salvar", { description: e?.message });
      }
    },
    [userId],
  );

  const remove = useCallback(async (id: string) => {
    try {
      const { error } = await db
        .from("doctor_text_templates")
        .delete()
        .eq("id", id);
      if (error) throw error;
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e: any) {
      toast.error("Erro ao remover", { description: e?.message });
    }
  }, []);

  return { templates, loading, save, remove, reload: load };
}
