import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Shield } from "lucide-react";
import { warn } from "@/lib/logger";

const CURRENT_TERMS_VERSION_KEY = "terms_version";

const TermsReconsentDialog = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requiredVersion, setRequiredVersion] = useState<string | null>(null);

  const checkConsent = useCallback(async () => {
    if (!user) return;

    try {
      const { data: setting, error: settingError } = await db
        .from("app_settings" as unknown as never)
        .select("value")
        .eq("key", CURRENT_TERMS_VERSION_KEY)
        .maybeSingle();

      if (settingError) {
        warn("[terms] Falha ao carregar versão dos termos", settingError);
      }

      // Suporta ambos formatos: { version: "1.0", ... } JSONB OR string puro (legado)
      const raw = (setting as { value?: any } | null)?.value;
      const version = typeof raw === "object" && raw?.version
        ? String(raw.version)
        : (typeof raw === "string" ? raw : "1.0.0");
      setRequiredVersion(version);

      // Checa nova tabela user_consent_log primeiro (preferencial)
      const { data: newConsent } = await (db as any)
        .from("user_consent_log")
        .select("id")
        .eq("user_id", user.id)
        .eq("document_type", "terms")
        .eq("version", version)
        .maybeSingle();

      if (newConsent) {
        setOpen(false);
        return;
      }

      // Fallback: checa a tabela antiga user_consents
      const { data: oldConsent } = await db
        .from("user_consents")
        .select("id")
        .eq("user_id", user.id)
        .eq("version", version)
        .eq("consent_type", "terms_of_use")
        .maybeSingle();

      setOpen(!oldConsent);
    } catch (error) {
      warn("[terms] Erro inesperado ao verificar termos", error);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setOpen(false);
      setAccepted(false);
      setRequiredVersion(null);
      return;
    }

    void checkConsent();
  }, [user, checkConsent]);

  const handleAccept = async () => {
    if (!accepted || !user || !requiredVersion) return;

    setSaving(true);

    try {
      // Insere em ambas as tabelas (nova é a preferencial; antiga é compat)
      const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;

      await (db as any).from("user_consent_log").insert({
        user_id: user.id,
        document_type: "terms",
        version: requiredVersion,
        ip_address: null,
        user_agent: userAgent,
      });

      const { error } = await db.from("user_consents").insert({
        user_id: user.id,
        consent_type: "terms_of_use",
        version: requiredVersion,
        ip_address: null,
        user_agent: userAgent,
      });

      if (error) warn("[terms] insert legacy table falhou (não-bloqueante)", error);

      toast.success("Termos aceitos com sucesso!");
      setOpen(false);
    } catch (error) {
      warn("[terms] Falha ao salvar aceite", error);
      toast.error("Não foi possível salvar a aceitação dos termos.");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => setOpen(nextOpen ? true : open)}>
      <DialogContent className="max-w-md [&>button]:hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Atualização dos Termos de Uso
          </DialogTitle>
          <DialogDescription>
            Nossos Termos de Uso foram atualizados (versão {requiredVersion}). Para continuar usando a plataforma, você precisa aceitar os novos termos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            <p>Principais alterações:</p>
            <ul className="list-disc list-inside mt-1 space-y-1 text-xs">
              <li>Atualização da política de privacidade conforme LGPD</li>
              <li>Novos termos para teleconsulta e prescrição digital</li>
              <li>Política de reembolso e cancelamento revisada</li>
            </ul>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox id="accept-terms" checked={accepted} onCheckedChange={(value) => setAccepted(!!value)} />
            <label htmlFor="accept-terms" className="text-sm cursor-pointer">
              Li e aceito os{" "}
              <a href="/terms" target="_blank" rel="noreferrer" className="text-primary underline">Termos de Uso</a>{" "}
              e a{" "}
              <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary underline">Política de Privacidade</a>{" "}
              atualizados.
            </label>
          </div>

          <Button onClick={handleAccept} disabled={!accepted || saving} className="w-full">
            {saving ? "Salvando..." : "Aceitar e Continuar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TermsReconsentDialog;
