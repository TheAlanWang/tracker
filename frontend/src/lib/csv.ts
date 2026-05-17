// Minimal CSV utilities — escape rules per RFC 4180 (any field containing
// a comma, double-quote, or newline gets wrapped in double-quotes, and
// inner double-quotes are doubled). Wide enough compatibility for Excel,
// Google Sheets, Numbers, and the Linux/Mac shell tools.

export type CsvColumn<T> = {
  label: string;
  value: (row: T) => string | number | null | undefined;
};

function escape(cell: string | number | null | undefined): string {
  if (cell === null || cell === undefined) return "";
  const s = String(cell);
  // Quote if any of these characters would otherwise break parsing.
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escape(c.label)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escape(c.value(row))).join(","))
    .join("\r\n");
  return body ? `${header}\r\n${body}` : header;
}

export function downloadCsv(filename: string, csv: string) {
  // BOM so Excel on Windows opens UTF-8 with proper Unicode handling
  // (otherwise non-ASCII titles get mojibake).
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
