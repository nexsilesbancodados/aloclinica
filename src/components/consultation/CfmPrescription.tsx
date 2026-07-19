import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, FileText, ExternalLink, X, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const CFM_PRESCRICAO_URL = "https://prescricao.cfm.org.br";

type DocumentType =
  | "receita_simples"
  | "receita_antimicrobianos"
  | "receita_controle_especial"
  | "atestado"
  | "relatorio"
  | "solicitacao_exames"
  | "parecer";

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  receita_simples: "Receita Simples",
  receita_antimicrobianos: "Receita de Antimicrobianos",
  receita_controle_especial: "Receita de Controle Especial",
  atestado: "Atestado Médico",
  relatorio: "Relatório Médico",
  solicitacao_exames: "Solicitação de Exames",
  parecer: "Parecer Técnico",
};

const DOC_TYPE_ICONS: Record<DocumentType, string> = {
  receita_simples: "💊",
  receita_antimicrobianos: "💉",
  receita_controle_especial: "🔒",
  atestado: "📋",
  relatorio: "📄",
  solicitacao_exames: "🔬",
  parecer: "📑",
};

interface CfmPrescriptionProps {
  doctorCrm?: string;
  doctorCrmState?: string;
  doctorName?: string;
  patientName?: string;
  patientCpf?: string;
  onDocumentCreated?: (docType: DocumentType) => void;
}

const CfmPrescription = ({
  doctorCrm,
  doctorCrmState,
  doctorName,
  patientName,
  patientCpf,
  onDocumentCreated,
}: CfmPrescriptionProps) => {
  const [showDialog, setShowDialog] = useState(false);
  const [showIframe, setShowIframe] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<DocumentType>("receita_simples");
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleOpenCfm = useCallback(() => {
    setShowDialog(true);
  }, []);

  const handleStartPrescription = useCallback(() => {
    setShowDialog(false);
    setShowIframe(true);
    setIframeLoading(true);
    setIframeError(false);
  }, []);

  const handleOpenExternal = useCallback(() => {
    window.open(CFM_PRESCRICAO_URL + "/login", "_blank", "noopener,noreferrer");
    toast.success("Plataforma CFM aberta em nova aba");
    setShowDialog(false);
    onDocumentCreated?.(selectedDocType);
  }, [selectedDocType, onDocumentCreated]);

  const handleIframeLoad = useCallback(() => {
    setIframeLoading(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setIframeLoading(false);
    setIframeError(true);
  }, []);

  const handleCloseIframe = useCallback(() => {
    setShowIframe(false);
    setIframeLoading(true);
    setIframeError(false);
  }, []);

  return (
    <>
      {/* Trigger Card */}
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">Prescrição Eletrônica CFM</p>
                  <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                    Oficial
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Receita digital com certificado ICP-Brasil • Validade nacional
                </p>
              </div>
            </div>
            <Button
              onClick={handleOpenCfm}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white"
            >
              <FileText className="w-4 h-4 mr-2" />
              Prescrever via CFM
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Document Type Selection Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-600" />
              Prescrição Eletrônica do CFM
            </DialogTitle>
            <DialogDescription>
              Selecione o tipo de documento que deseja emitir pela plataforma oficial do Conselho Federal de Medicina.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Doctor & Patient Info */}
            {(doctorName || patientName) && (
              <div className="grid grid-cols-2 gap-3">
                {doctorName && (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground mb-1">Médico</p>
                    <p className="text-sm font-medium text-foreground">
                      Dr(a). {doctorName}
                    </p>
                    {doctorCrm && (
                      <p className="text-xs text-muted-foreground">
                        CRM {doctorCrm}/{doctorCrmState}
                      </p>
                    )}
                  </div>
                )}
                {patientName && (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground mb-1">Paciente</p>
                    <p className="text-sm font-medium text-foreground">{patientName}</p>
                    {patientCpf && (
                      <p className="text-xs text-muted-foreground">
                        CPF: {patientCpf}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Document Type Selector */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Tipo de Documento
              </label>
              <Select
                value={selectedDocType}
                onValueChange={(v) => setSelectedDocType(v as DocumentType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DOC_TYPE_LABELS) as DocumentType[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <span>{DOC_TYPE_ICONS[key]}</span>
                        <span>{DOC_TYPE_LABELS[key]}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Requirements Notice */}
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">
                ⚠️ Requisitos
              </p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Certificado digital ICP-Brasil (gratuito pelo CRM)</li>
                <li>• CRM ativo e regular</li>
                <li>• Navegador com suporte a certificado digital</li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowDialog(false)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white"
                onClick={handleOpenExternal}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Abrir Plataforma CFM
              </Button>
            </div>

            <p className="text-[11px] text-center text-muted-foreground">
              Você será redirecionado para{" "}
              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                prescricao.cfm.org.br
              </span>{" "}
              — a plataforma oficial do Conselho Federal de Medicina
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen Iframe Modal */}
      {showIframe && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Prescrição Eletrônica CFM
                </p>
                <p className="text-xs text-muted-foreground">
                  {DOC_TYPE_ICONS[selectedDocType]} {DOC_TYPE_LABELS[selectedDocType]}
                  {patientName && ` • ${patientName}`}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                <Shield className="w-3 h-3 mr-1" />
                Conexão Segura
              </Badge>
            </div>
            <Button variant="ghost"
              size="icon" aria-label="Fechar"
              onClick={handleCloseIframe}
              className="h-8 w-8"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Iframe Content */}
          <div className="flex-1 relative">
            {iframeLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                  <p className="text-sm text-muted-foreground">
                    Carregando plataforma do CFM...
                  </p>
                </div>
              </div>
            )}

            {iframeError ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
                <div className="flex flex-col items-center gap-4 text-center max-w-md">
                  <AlertCircle className="w-12 h-12 text-amber-500" />
                  <div>
                    <p className="font-semibold text-foreground mb-1">
                      Não foi possível carregar no iframe
                    </p>
                    <p className="text-sm text-muted-foreground mb-4">
                      A plataforma do CFM pode bloquear a exibição em iframe por segurança.
                      Abra diretamente em uma nova aba.
                    </p>
                  </div>
                  <Button
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white"
                    onClick={handleOpenExternal}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Abrir em Nova Aba
                  </Button>
                </div>
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                src={CFM_PRESCRICAO_URL + "/login"}
                className="w-full h-full border-0"
                title="Prescrição Eletrônica CFM"
                allow="camera; microphone; clipboard-write"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
                onLoad={handleIframeLoad}
                onError={handleIframeError}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default CfmPrescription;
