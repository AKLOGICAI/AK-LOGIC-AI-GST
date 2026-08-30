/**
 * Export helpers — CSV (.csv) and Excel (.xlsx via SheetJS).
 * Used by the GST Return Center invoice register.
 */
import * as XLSX from 'xlsx';

export type Cell = string | number;
export interface SheetData {
  name: string;
  header: string[];
  rows: Cell[][];
}

function csvEscape(v: Cell): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCsv(sheet: SheetData, filename: string) {
  const lines = [sheet.header, ...sheet.rows].map((r) => r.map(csvEscape).join(','));
  downloadBlob(new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), filename);
}

/** Real .xlsx workbook (multiple sheets supported). */
export function exportXlsx(sheets: SheetData[], filename: string) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([sheet.header, ...sheet.rows]);
    // auto column widths
    const colWidths = sheet.header.map((h, i) => {
      const maxLen = Math.max(h.length, ...sheet.rows.map((r) => String(r[i] ?? '').length));
      return { wch: Math.min(40, Math.max(10, maxLen + 2)) };
    });
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}
