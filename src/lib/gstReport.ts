/**
 * GST Return / reporting aggregation layer.
 *
 * Pure functions over the immutable `invoices` table. Designed so a future
 * GST filing engine (GSTR-1 / GSTR-3B) can be added without schema changes —
 * every approved invoice already stores invoiceNo, date, customer, GSTIN,
 * taxable value, CGST/SGST/IGST and status.
 */
import type { Invoice } from './types';

export interface GstRegisterRow {
  invoiceNo: string;
  invoiceDate: number;
  customerName: string;
  customerGstin: string;
  placeOfSupply: string;
  supplyType: 'B2B' | 'B2C';
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  grandTotal: number;
  status: 'Generated';
}

export interface GstSummary {
  invoiceCount: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  grandTotal: number;
  b2b: number;
  b2c: number;
}

export interface PeriodSummary {
  key: string;       // e.g. '2024-06' or '2024-06-14'
  label: string;     // human label
  count: number;
  taxable: number;
  tax: number;
  total: number;
}

export function toRegisterRow(iv: Invoice): GstRegisterRow {
  return {
    invoiceNo: iv.invoiceNo,
    invoiceDate: iv.invoiceDate,
    customerName: iv.customerName,
    customerGstin: iv.customerGstin || '',
    placeOfSupply: iv.placeOfSupply,
    supplyType: iv.customerGstin ? 'B2B' : 'B2C',
    taxableValue: iv.taxableValue,
    cgst: iv.cgst,
    sgst: iv.sgst,
    igst: iv.igst,
    totalTax: iv.totalTax,
    grandTotal: iv.grandTotal,
    status: 'Generated',
  };
}

export function summarise(invoices: Invoice[]): GstSummary {
  return invoices.reduce<GstSummary>(
    (s, iv) => ({
      invoiceCount: s.invoiceCount + 1,
      taxableValue: s.taxableValue + iv.taxableValue,
      cgst: s.cgst + iv.cgst,
      sgst: s.sgst + iv.sgst,
      igst: s.igst + iv.igst,
      totalTax: s.totalTax + iv.totalTax,
      grandTotal: s.grandTotal + iv.grandTotal,
      b2b: s.b2b + (iv.customerGstin ? 1 : 0),
      b2c: s.b2c + (iv.customerGstin ? 0 : 1),
    }),
    { invoiceCount: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, grandTotal: 0, b2b: 0, b2c: 0 },
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthlySummary(invoices: Invoice[]): PeriodSummary[] {
  const map = new Map<string, PeriodSummary>();
  for (const iv of invoices) {
    const d = new Date(iv.invoiceDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const cur = map.get(key) || { key, label, count: 0, taxable: 0, tax: 0, total: 0 };
    cur.count++; cur.taxable += iv.taxableValue; cur.tax += iv.totalTax; cur.total += iv.grandTotal;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

export function dateWiseSummary(invoices: Invoice[]): PeriodSummary[] {
  const map = new Map<string, PeriodSummary>();
  for (const iv of invoices) {
    const d = new Date(iv.invoiceDate);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const cur = map.get(key) || { key, label, count: 0, taxable: 0, tax: 0, total: 0 };
    cur.count++; cur.taxable += iv.taxableValue; cur.tax += iv.totalTax; cur.total += iv.grandTotal;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}
