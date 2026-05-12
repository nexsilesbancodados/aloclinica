/**
 * PaginationBar — UI compartilhada pra paginação server-side em listas admin.
 *
 * Usa o estado retornado por usePagination(). Mostra:
 *   - Total de itens + range exibido
 *   - Botões prev/next + indicador de página
 *   - Select de page size (10/25/50/100)
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PaginationState } from "@/hooks/usePagination";

type Props = {
  pg: PaginationState;
  /** Substring no plural ("usuários", "consultas"). Default: "registros". */
  noun?: string;
  className?: string;
};

export function PaginationBar({ pg, noun = "registros", className }: Props) {
  if (pg.total === 0) return null;

  const start = pg.from + 1;
  const end = Math.min(pg.from + pg.pageSize, pg.total);

  return (
    <div className={`flex items-center justify-between gap-2 flex-wrap text-xs ${className ?? ""}`}>
      <p className="text-muted-foreground">
        Mostrando <strong className="text-foreground">{start}–{end}</strong> de{" "}
        <strong className="text-foreground">{pg.total.toLocaleString("pt-BR")}</strong> {noun}
      </p>

      <div className="flex items-center gap-2">
        <Select
          value={String(pg.pageSize)}
          onValueChange={(v) => { pg.setPageSize(Number(v)); pg.setPage(0); }}
        >
          <SelectTrigger className="h-8 w-[80px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={pg.prev}
            disabled={!pg.hasPrev}
            aria-label="Página anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-muted-foreground tabular-nums px-1">
            {pg.page + 1} / {pg.totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={pg.next}
            disabled={!pg.hasNext}
            aria-label="Próxima página"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
