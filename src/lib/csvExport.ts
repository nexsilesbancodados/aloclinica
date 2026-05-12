/**
 * csvExport — utilitário pra exportar listas pra CSV no admin.
 *
 * Uso:
 *   exportCSV("usuarios.csv", users, [
 *     { key: "first_name", header: "Nome" },
 *     { key: "email", header: "Email" },
 *     { key: "created_at", header: "Cadastro", format: (v) => new Date(v).toLocaleDateString("pt-BR") },
 *   ]);
 *
 * - BOM UTF-8 pra Excel reconhecer acentos
 * - Escape de aspas/quebras de linha
 * - Suporta `format` callback por coluna
 */

export type CsvColumn<T> = {
  key: keyof T | string;
  header: string;
  /** Transforma valor antes de escrever. Default: String(value ?? "") */
  format?: (value: any, row: T) => string | number | null | undefined;
};

function escapeCell(raw: any): string {
  if (raw == null) return "";
  const str = String(raw);
  // Se contém aspas, vírgula, ponto-e-vírgula, ou quebra de linha → envolver
  if (/[",;\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCSV<T>(rows: T[], columns: CsvColumn<T>[], delimiter: "," | ";" = ";"): string {
  const headerLine = columns.map(c => escapeCell(c.header)).join(delimiter);
  const dataLines = rows.map(row =>
    columns.map(c => {
      const raw = (row as any)[c.key as string];
      const value = c.format ? c.format(raw, row) : raw;
      return escapeCell(value);
    }).join(delimiter)
  );
  // BOM pra Excel reconhecer UTF-8
  return "﻿" + [headerLine, ...dataLines].join("\r\n");
}

export function exportCSV<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
  delimiter: "," | ";" = ";"
): void {
  const csv = buildCSV(rows, columns, delimiter);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
