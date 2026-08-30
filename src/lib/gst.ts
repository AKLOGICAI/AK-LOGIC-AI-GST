import type { InvoiceItem } from './types';

export function itemTaxable(item: InvoiceItem): number {
  return item.qty * item.rate;
}

export function itemTax(item: InvoiceItem): number {
  return (itemTaxable(item) * item.gstRate) / 100;
}

export function itemTotal(item: InvoiceItem): number {
  return itemTaxable(item) + itemTax(item);
}

export function invoiceTaxable(items: InvoiceItem[]): number {
  return items.reduce((s, i) => s + itemTaxable(i), 0);
}

export function invoiceTax(items: InvoiceItem[]): number {
  return items.reduce((s, i) => s + itemTax(i), 0);
}

export function invoiceTotal(items: InvoiceItem[]): number {
  return items.reduce((s, i) => s + itemTotal(i), 0);
}

export function inr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n || 0);
}

export function inrPlain(n: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0);
}

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigit(n: number): string {
  if (n < 20) return ones[n];
  return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
}

export function numberToWords(num: number): string {
  num = Math.round(num);
  if (num === 0) return 'Zero Rupees Only';
  let words = '';
  const crore = Math.floor(num / 10000000); num %= 10000000;
  const lakh = Math.floor(num / 100000); num %= 100000;
  const thousand = Math.floor(num / 1000); num %= 1000;
  const hundred = Math.floor(num / 100); num %= 100;
  if (crore) words += twoDigit(crore) + ' Crore ';
  if (lakh) words += twoDigit(lakh) + ' Lakh ';
  if (thousand) words += twoDigit(thousand) + ' Thousand ';
  if (hundred) words += ones[hundred] + ' Hundred ';
  if (num) words += (words ? 'and ' : '') + twoDigit(num) + ' ';
  return words.trim() + ' Rupees Only';
}
