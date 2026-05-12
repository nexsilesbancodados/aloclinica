/**
 * useBulkSelection — gerencia seleção múltipla em listas.
 *
 * Uso:
 *   const sel = useBulkSelection();
 *   <Checkbox checked={sel.has(id)} onCheckedChange={() => sel.toggle(id)} />
 *   <BulkActionBar count={sel.size} onClear={sel.clear}>
 *     <Button onClick={() => bulkDelete(sel.toArray())}>Excluir {sel.size}</Button>
 *   </BulkActionBar>
 */
import { useState, useCallback } from "react";

export type BulkSelection = {
  size: number;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clear: () => void;
  toArray: () => string[];
  isAllSelected: (ids: string[]) => boolean;
};

export function useBulkSelection(): BulkSelection {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const has = useCallback((id: string) => selected.has(id), [selected]);

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelected(prev => {
      const allSelected = ids.length > 0 && ids.every(id => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const toArray = useCallback(() => Array.from(selected), [selected]);

  const isAllSelected = useCallback(
    (ids: string[]) => ids.length > 0 && ids.every(id => selected.has(id)),
    [selected]
  );

  return {
    size: selected.size,
    has,
    toggle,
    selectAll,
    clear,
    toArray,
    isAllSelected,
  };
}
