import { Component, ErrorInfo, ReactNode } from "react";
import mascotWave from "@/assets/mascot-wave.png";
import { Button } from "@/components/ui/button";
import { RefreshCw, Home } from "lucide-react";
import { logError } from "@/lib/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

const CHUNK_ERROR_RE = /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i;
const CHUNK_RECOVERY_KEY = "aloclinica:chunk-recovery-at";

function recoverFromStaleChunk(error: Error): boolean {
  if (!CHUNK_ERROR_RE.test(error.message)) return false;
  let lastRecovery = 0;
  try { lastRecovery = Number(sessionStorage.getItem(CHUNK_RECOVERY_KEY) ?? 0); } catch { /* storage blocked */ }
  if (lastRecovery && Date.now() - lastRecovery <= 60_000) return false;
  try { sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(Date.now())); } catch { /* reload still helps */ }
  window.setTimeout(() => window.location.reload(), 0);
  return true;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logError("ErrorBoundary — unhandled render error", error, {
      componentStack: errorInfo.componentStack,
    });
    recoverFromStaleChunk(error);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          className="min-h-screen flex items-center justify-center bg-[#F0F4FB] px-4"
          role="alert"
          aria-live="assertive"
        >
          <div className="text-center max-w-sm">
            {/* Pingo com expressão preocupada */}
            <img
              src={mascotWave}
              alt="Pingo preocupada"
              className="w-32 h-32 object-contain mx-auto drop-shadow-xl mb-4 select-none"
              style={{ filter: "hue-rotate(0deg) saturate(0.8)", opacity: 0.9 }} loading="lazy" decoding="async" width={128} height={128} />
            <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,.1)] border border-black/5 p-7">
              <h2 className="text-[20px] font-extrabold text-foreground mb-2 tracking-tight">Oops! Algo deu errado</h2>
              <p className="text-[13px] text-muted-foreground mb-4 leading-relaxed">
                A Pingo encontrou um erro inesperado. Tente recarregar a página ou voltar ao início.
              </p>
              {this.state.error && import.meta.env.DEV && (
                <pre className="text-left text-[10px] bg-red-50 rounded-xl p-3 mb-4 overflow-auto max-h-28 text-red-600 border border-red-100">
                  {this.state.error.message}
                  {"\n"}
                  {this.state.error.stack?.split("\n").slice(0, 5).join("\n")}
                </pre>
              )}
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={() => window.location.reload()}
                  className="rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-[0_3px_12px_rgba(37,99,235,.3)]"
                  aria-label="Recarregar a página"
                >
                  <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
                  Recarregar
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => { window.location.href = "/"; }}
                  aria-label="Voltar para a página inicial"
                >
                  <Home className="w-4 h-4 mr-2" aria-hidden="true" />
                  Início
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
