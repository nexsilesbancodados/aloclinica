/**
 * usePagination — paginação simples client-side com page size + offset.
 *
 * Uso:
 *   const pg = usePagination({ pageSize: 25 });
 *   const { data } = await db.from("x").select("*", { count: "exact" })
 *     .range(pg.from, pg.to);
 *   pg.setTotal(count);
 *
 *   <PaginationBar pg={pg} />
 */
import { useState, useMemo } from "react";

export type PaginationState = {
  page: number;
  pageSize: number;
  total: number;
  from: number;          // offset início (inclusivo, base 0)
  to: number;            // offset fim (inclusivo, base 0)
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
  setTotal: (n: number) => void;
  next: () => void;
  prev: () => void;
  reset: () => void;
};

export function usePagination(opts: { pageSize?: number; initialPage?: number } = {}): PaginationState {
  const [page, setPage] = useState(opts.initialPage ?? 0);
  const [pageSize, setPageSize] = useState(opts.pageSize ?? 25);
  const [total, setTotal] = useState(0);

  const derived = useMemo(() => {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      from,
      to,
      totalPages,
      hasPrev: page > 0,
      hasNext: page < totalPages - 1,
    };
  }, [page, pageSize, total]);

  return {
    page,
    pageSize,
    total,
    ...derived,
    setPage,
    setPageSize,
    setTotal,
    next: () => setPage((p) => p + 1),
    prev: () => setPage((p) => Math.max(0, p - 1)),
    reset: () => setPage(0),
  };
}
