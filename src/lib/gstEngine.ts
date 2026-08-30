import type { InvoiceItem } from './types';
import { numberToWords } from './gst';
import { stateNameFromGstin, codeForStateName, STATE_CODES } from './states';

export interface LineComputation {
  item: InvoiceItem;
  taxable: number;
  taxAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface InvoiceComputation {
  lines: LineComputation[];
  taxableValue: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  isInterState: boolean;
  placeOfSupply: string; // "09 - Uttar Pradesh"
  amountInWords: string;
  // grouped by HSN for compliant table footer
  hsnSummary: { hsn: string; taxable: number; gstRate: number; cgst: number; sgst: number; igst: number }[];
}

export interface SupplyContext {
  sellerStateCode: string; // 2-digit
  sellerStateName: string;
  buyerStateCode?: string | null;
  buyerStateName?: string | null;
}

/**
 * Resolve place of supply + inter/intra-state.
 * Rule: If buyer GSTIN present -> use its state code. Else use buyer address state.
 * If buyer state == seller state -> intra-state (CGST+SGST), else inter-state (IGST).
 * Default (unknown buyer state) -> treat as intra-state (most common B2C local sale).
 */
export function resolveSupply(opts: {
  sellerState: string;
  sellerGstin: string;
  buyerGstin?: string;
  buyerState?: string;
}): SupplyContext & { isInterState: boolean; placeOfSupply: string } {
  const sellerStateCode = (opts.sellerGstin?.slice(0, 2)) || codeForStateName(opts.sellerState) || '09';
  const sellerStateName = STATE_CODES[sellerStateCode] || opts.sellerState || 'Uttar Pradesh';

  let buyerStateName: string | null = stateNameFromGstin(opts.buyerGstin);
  if (!buyerStateName && opts.buyerState) buyerStateName = opts.buyerState;
  const buyerStateCode = buyerStateName ? (codeForStateName(buyerStateName) || (opts.buyerGstin?.slice(0, 2) ?? null)) : null;

  // If we cannot determine the buyer state, default to intra-state.
  const isInterState = !!buyerStateCode && buyerStateCode !== sellerStateCode;
  const posCode = buyerStateCode || sellerStateCode;
  const posName = STATE_CODES[posCode] || sellerStateName;

  return {
    sellerStateCode, sellerStateName,
    buyerStateCode, buyerStateName,
    isInterState,
    placeOfSupply: `${posCode} - ${posName}`,
  };
}

function round2(n: number) { return Math.round(n * 100) / 100; }

export function computeInvoice(items: InvoiceItem[], ctx: { isInterState: boolean; placeOfSupply: string }): InvoiceComputation {
  const lines: LineComputation[] = items.map((item) => {
    const taxable = round2(item.qty * item.rate);
    const taxAmount = round2((taxable * item.gstRate) / 100);
    const cgst = ctx.isInterState ? 0 : round2(taxAmount / 2);
    const sgst = ctx.isInterState ? 0 : round2(taxAmount - cgst);
    const igst = ctx.isInterState ? taxAmount : 0;
    return { item, taxable, taxAmount, cgst, sgst, igst, total: round2(taxable + taxAmount) };
  });

  const taxableValue = round2(lines.reduce((s, l) => s + l.taxable, 0));
  const totalCgst = round2(lines.reduce((s, l) => s + l.cgst, 0));
  const totalSgst = round2(lines.reduce((s, l) => s + l.sgst, 0));
  const totalIgst = round2(lines.reduce((s, l) => s + l.igst, 0));
  const totalTax = round2(totalCgst + totalSgst + totalIgst);

  const rawTotal = taxableValue + totalTax;
  const grandTotal = Math.round(rawTotal);
  const roundOff = round2(grandTotal - rawTotal);

  // HSN summary grouped by hsn + rate
  const hsnMap = new Map<string, { hsn: string; taxable: number; gstRate: number; cgst: number; sgst: number; igst: number }>();
  for (const l of lines) {
    const key = `${l.item.hsn || '-'}_${l.item.gstRate}`;
    const cur = hsnMap.get(key) || { hsn: l.item.hsn || '-', taxable: 0, gstRate: l.item.gstRate, cgst: 0, sgst: 0, igst: 0 };
    cur.taxable = round2(cur.taxable + l.taxable);
    cur.cgst = round2(cur.cgst + l.cgst);
    cur.sgst = round2(cur.sgst + l.sgst);
    cur.igst = round2(cur.igst + l.igst);
    hsnMap.set(key, cur);
  }

  return {
    lines, taxableValue, totalCgst, totalSgst, totalIgst, totalTax, roundOff, grandTotal,
    isInterState: ctx.isInterState,
    placeOfSupply: ctx.placeOfSupply,
    amountInWords: numberToWords(grandTotal),
    hsnSummary: Array.from(hsnMap.values()),
  };
}

/**
 * Generate next invoice number in FY format: PREFIX/YYYY-YY/NNNN
 */
export function nextInvoiceNumber(prefix: string, existingNumbers: string[]): string {
  const now = new Date();
  const month = now.getMonth(); // FY starts April
  const startYear = month >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fy = `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
  const base = prefix.replace(/\/+$/, '');
  // find max sequence used this FY
  let max = 0;
  for (const n of existingNumbers) {
    const m = n.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const seq = String(max + 1).padStart(4, '0');
  return `${base}/${fy}/${seq}`;
}
