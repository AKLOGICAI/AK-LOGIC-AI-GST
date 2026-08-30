/**
 * Native File Export Helpers for Mobile — CSV and JSON exports with Sharing
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

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

export function buildCsvString(sheet: SheetData): string {
  const lines = [sheet.header, ...sheet.rows].map((r) => r.map(csvEscape).join(','));
  return '\uFEFF' + lines.join('\n');
}

/**
 * Exports CSV data as a physical file and opens the native Android Share sheet
 */
export async function exportCsvFile(sheet: SheetData, filename: string): Promise<string> {
  const csvContent = buildCsvString(sheet);
  const fileUri = `${FileSystem.cacheDirectory}${filename}`;

  await FileSystem.writeAsStringAsync(fileUri, csvContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'text/csv',
      dialogTitle: `Export ${filename}`,
      UTI: 'public.comma-separated-values-text',
    });
  }

  return fileUri;
}

/**
 * Exports JSON data (e.g. GSTR-1 offline utility JSON) and opens the native Share sheet
 */
export async function exportJsonFile(data: any, filename: string): Promise<string> {
  const jsonContent = JSON.stringify(data, null, 2);
  const fileUri = `${FileSystem.cacheDirectory}${filename}`;

  await FileSystem.writeAsStringAsync(fileUri, jsonContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/json',
      dialogTitle: `Export ${filename}`,
      UTI: 'public.json',
    });
  }

  return fileUri;
}
