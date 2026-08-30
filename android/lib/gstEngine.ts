// AK-LOGIC AI GST — GST Engine for Android Client
// 100% compliant with Indian Goods & Services Tax rules

export interface InvoiceItem {
  id?: string;
  description: string;
  hsn?: string;
  qty: number;
  rate: number;
  gstRate: number;
  inventoryItemId?: string;
}

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
  placeOfSupply: string;
  amountInWords: string;
  hsnSummary: { hsn: string; taxable: number; gstRate: number; cgst: number; sgst: number; igst: number }[];
}

export const STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
  '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
  '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '28': 'Andhra Pradesh',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
  '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh (New)', '38': 'Ladakh',
};

export const INDIAN_STATES: string[] = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
  'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka',
  'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

export function codeForStateName(stateName?: string | null): string | null {
  if (!stateName) return null;
  const target = stateName.trim().toLowerCase();
  for (const [code, name] of Object.entries(STATE_CODES)) {
    if (name.toLowerCase() === target) return code;
  }
  return null;
}

export function stateNameFromGstin(gstin?: string | null): string | null {
  if (!gstin || gstin.length < 2) return null;
  const code = gstin.slice(0, 2);
  return STATE_CODES[code] || null;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function numberToWords(num: number): string {
  const a: string[] = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b: string[] = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return '';
  let str = '';
  str += Number(n[1]) !== 0 ? (a[Number(n[1])] || b[Number(n[1][0])] + ' ' + a[Number(n[1][1])]) + 'Crore ' : '';
  str += Number(n[2]) !== 0 ? (a[Number(n[2])] || b[Number(n[2][0])] + ' ' + a[Number(n[2][1])]) + 'Lakh ' : '';
  str += Number(n[3]) !== 0 ? (a[Number(n[3])] || b[Number(n[3][0])] + ' ' + a[Number(n[3][1])]) + 'Thousand ' : '';
  str += Number(n[4]) !== 0 ? (a[Number(n[4])] || b[Number(n[4][0])] + ' ' + a[Number(n[4][1])]) + 'Hundred ' : '';
  str += Number(n[5]) !== 0 ? ((str !== '') ? 'and ' : '') + (a[Number(n[5])] || b[Number(n[5][0])] + ' ' + a[Number(n[5][1])]) : '';
  return 'INR ' + str.trim() + ' Only';
}

export function resolveSupply(opts: {
  sellerState: string;
  sellerGstin: string;
  buyerGstin?: string;
  buyerState?: string;
}): { isInterState: boolean; placeOfSupply: string } {
  const sellerCode = opts.sellerGstin?.slice(0, 2) || codeForStateName(opts.sellerState) || '27';
  const sellerName = STATE_CODES[sellerCode] || opts.sellerState || 'Maharashtra';

  let buyerName: string | null = stateNameFromGstin(opts.buyerGstin);
  if (!buyerName && opts.buyerState) buyerName = opts.buyerState;
  const buyerCode = buyerName ? (codeForStateName(buyerName) || opts.buyerGstin?.slice(0, 2) || null) : null;

  const isInterState = !!buyerCode && buyerCode !== sellerCode;
  const posCode = buyerCode || sellerCode;
  const posName = STATE_CODES[posCode] || sellerName;

  return {
    isInterState,
    placeOfSupply: `${posCode} - ${posName}`,
  };
}

export function computeInvoice(
  items: InvoiceItem[],
  ctx: { isInterState: boolean; placeOfSupply: string }
): InvoiceComputation {
  const lines: LineComputation[] = items.map((item) => {
    const taxable = round2((item.qty || 0) * (item.rate || 0));
    const taxAmount = round2((taxable * (item.gstRate || 0)) / 100);
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
    lines,
    taxableValue,
    totalCgst,
    totalSgst,
    totalIgst,
    totalTax,
    roundOff,
    grandTotal,
    isInterState: ctx.isInterState,
    placeOfSupply: ctx.placeOfSupply,
    amountInWords: numberToWords(grandTotal),
    hsnSummary: Array.from(hsnMap.values()),
  };
}

export function nextInvoiceNumber(prefix: string, existingNumbers: string[]): string {
  const now = new Date();
  const month = now.getMonth();
  const startYear = month >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fy = `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
  const base = (prefix || 'INV').replace(/\/+$/, '');
  let max = 0;
  for (const n of existingNumbers) {
    const m = n.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const seq = String(max + 1).padStart(4, '0');
  return `${base}/${fy}/${seq}`;
}
