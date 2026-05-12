import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { Button } from "@/components/ui/button";
import { DeviceMobile, X, DownloadSimple, Share, Plus } from "@phosphor-icons/react";

const DISMISSED_KEY = "pwa-install-dismissed";
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export default function PWAInstallPrompt() {
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!isInstallable || isInstalled) return;

    // Check if user dismissed recently
    const dismissedAt = localStorage.getItem(DISMISSED_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      if (elapsed < DISMISS_COOLDOWN_MS) return;
    }

    // Show after a short delay to not disrupt initial page load
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, [isInstallable, isInstalled]);

  const handleInstall = async () => {
    setInstalling(true);
    const accepted = await promptInstall();
    if (accepted) setVisible(false);
    setInstalling(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 80, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 80, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:w-96 z-50"
        >
          <div className="rounded-2xl border border-border bg-card shadow-2xl shadow-black/10 dark:shadow-black/40 overflow-hidden">
            {/* Gradient top bar */}
            <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500" />

            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-200 dark:shadow-blue-900/30">
                  <DeviceMobile size={24} weight="fill" className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground text-sm">Instalar AloClínica</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Adicione à tela inicial para acesso rápido, notificações e uso offline.
                  </p>
                </div>
                <button
                  onClick={handleDismiss}
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Benefits */}
              <div className="grid grid-cols-3 gap-2 mt-3 mb-4">
                {[
                  { icon: "⚡", label: "Mais rápido" },
                  { icon: "📴", label: "Funciona offline" },
                  { icon: "🔔", label: "Notificações" },
                ].map(({ icon, label }) => (
                  <div key={label} className="flex flex-col items-center gap-1 p-2 rounded-xl bg-muted/50 text-center">
                    <span className="text-lg">{icon}</span>
                    <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>

              {/* iOS Safari: instruções manuais (não tem beforeinstallprompt) */}
              {isIOS ? (
                <>
                  <div className="rounded-xl border border-border/40 bg-muted/30 p-3 mb-3 space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">No iPhone:</span>
                    </div>
                    <ol className="space-y-1.5 text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="font-bold text-blue-600 dark:text-blue-400">1.</span>
                        <span>Toque no ícone <Share weight="fill" className="inline w-3.5 h-3.5 mx-0.5 text-blue-500" /> <strong>Compartilhar</strong> (na barra inferior do Safari)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-bold text-blue-600 dark:text-blue-400">2.</span>
                        <span>Role e toque em <strong>"Adicionar à Tela de Início"</strong> <Plus weight="bold" className="inline w-3.5 h-3.5 mx-0.5" /></span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-bold text-blue-600 dark:text-blue-400">3.</span>
                        <span>Toque em <strong>Adicionar</strong> no canto superior direito</span>
                      </li>
                    </ol>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleDismiss} className="w-full text-xs">
                    Entendi, fazer depois
                  </Button>
                </>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleDismiss} className="flex-1 text-xs">
                    Agora não
                  </Button>
                  <Button size="sm" onClick={handleInstall} disabled={installing}
                    className="flex-1 text-xs gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                    <DownloadSimple size={14} />
                    {installing ? "Instalando..." : "Instalar"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
