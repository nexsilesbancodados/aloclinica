/**
 * BulkActionBar — barra fixa que aparece quando há itens selecionados.
 *
 * Mostra contagem + botão limpar + ações custom (children).
 */
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";

type Props = {
  count: number;
  onClear: () => void;
  noun?: string;
  children?: ReactNode;
};

export function BulkActionBar({ count, onClear, noun = "itens", children }: Props) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -8, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-primary/5 border border-primary/20"
          role="region"
          aria-label="Ações em lote"
        >
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg"
              onClick={onClear}
              aria-label="Limpar seleção"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
            <p className="text-sm font-semibold text-foreground">
              <span className="text-primary">{count}</span> {noun} selecionado{count !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
