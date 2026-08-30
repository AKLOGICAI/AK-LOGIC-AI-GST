// AK-LOGIC AI GST — Native Invoice PDF Builder & Generator for Android
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getQrDataUrl } from './qrSvg';

export interface InvoiceItem {
  id?: string;
  description: string;
  hsn?: string;
  qty: number;
  rate: number;
  gstRate: number;
  inventoryItemId?: string;
}

export interface Invoice {
  id: string;
  requestId?: string;
  merchantId?: string;
  invoiceNo: string;
  invoiceNumber?: string;
  invoiceDate?: number | string;
  createdAt?: number | string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerGstin?: string;
  customerPan?: string;
  customerAddress?: string;
  customerState?: string;
  paymentMode?: string;
  paymentRef?: string;
  notes?: string;
  items: InvoiceItem[];
  taxableValue?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  totalTax?: number;
  roundOff?: number;
  grandTotal: number;
  amountInWords?: string;
  placeOfSupply?: string;
  isInterState?: boolean;
  branded?: boolean;
}

export interface MerchantProfile {
  id: string;
  merchantCode: string;
  shopName: string;
  tradeName?: string;
  ownerName: string;
  legalName?: string;
  phone: string;
  email?: string;
  gstin: string;
  pan: string;
  address: string;
  state: string;
  city?: string;
  pincode?: string;
  bankName: string;
  accountType?: string;
  accountNumber: string;
  ifsc: string;
  upiId?: string;
  qrId: string;
  invoicePrefix?: string;
  pdfCredits?: number;
  customBranding?: boolean;
  brandName?: string;
  brandColor?: string;
  logoDataUrl?: string;
  logoUrl?: string;
  signatureDataUrl?: string;
  signatureUrl?: string;
  companySealDataUrl?: string;
  companySealUrl?: string;
}

function esc(s?: string): string {
  return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

function inr(n?: number): string {
  if (n == null || isNaN(n)) return '₹0.00';
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function paymentLabel(mode?: string): string {
  const map: Record<string, string> = {
    cash: 'Cash 💵',
    upi: 'UPI ⚡',
    card: 'Card 💳',
    netbanking: 'Net Banking 🏛️',
    cheque: 'Cheque ✍️',
    credit: 'Pay Later / Credit 🕒',
  };
  return map[mode?.toLowerCase() || 'cash'] || 'Cash 💵';
}

export async function buildInvoiceHtml(inv: Invoice, m: MerchantProfile): Promise<string> {
  const logoSrc = m.logoUrl || m.logoDataUrl;
  const signatureSrc = m.signatureUrl || m.signatureDataUrl;
  const sealSrc = m.companySealUrl || m.companySealDataUrl;

  const useMerchantBrand = !!inv.branded && !!logoSrc;
  const displayName = useMerchantBrand ? (m.brandName || m.shopName) : (m.tradeName || m.shopName);
  const platformName = 'AK-LOGIC AI GST';

  // Dynamic UPI QR Code
  let upiQrDataUrl: string | null = null;
  if (m.upiId) {
    const upiUri = `upi://pay?pa=${encodeURIComponent(m.upiId)}&pn=${encodeURIComponent(displayName)}&am=${inv.grandTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent(inv.invoiceNo || 'Invoice')}`;
    try {
      upiQrDataUrl = await getQrDataUrl(upiUri, 360, '#0a2a6b', '#ffffff');
    } catch (e) {}
  }

  const isPending = inv.paymentMode === 'credit';
  const payBadge = isPending
    ? { label: 'PAYMENT PENDING', bg: '#fdf1dc', fg: '#96650f' }
    : { label: 'PAID', bg: '#e3f6ea', fg: '#0f7a3d' };

  const isInterState = !!inv.isInterState;

  const rows = (inv.items || []).map((it, i) => {
    const qty = it.qty || 1;
    const rate = it.rate || 0;
    const gstRate = it.gstRate || 0;
    const taxable = qty * rate;
    const tax = (taxable * gstRate) / 100;
    const taxCols = isInterState
      ? `<td style="text-align:center;">${gstRate}%</td><td style="text-align:right;">${inr(tax)}</td>`
      : `<td style="text-align:center;">${gstRate / 2}%</td><td style="text-align:right;">${inr(tax / 2)}</td><td style="text-align:center;">${gstRate / 2}%</td><td style="text-align:right;">${inr(tax / 2)}</td>`;

    return `<tr>
      <td style="text-align:center;">${i + 1}</td>
      <td style="font-weight:600;">${esc(it.description)}</td>
      <td style="text-align:center;font-family:monospace;">${esc(it.hsn || '-')}</td>
      <td style="text-align:center;">${qty}</td>
      <td style="text-align:right;">${inr(rate)}</td>
      <td style="text-align:right;">${inr(taxable)}</td>
      ${taxCols}
      <td style="text-align:right;font-weight:700;">${inr(taxable + tax)}</td>
    </tr>`;
  }).join('');

  const taxHead = isInterState
    ? `<th style="text-align:center;">IGST %</th><th style="text-align:right;">IGST</th>`
    : `<th style="text-align:center;">CGST %</th><th style="text-align:right;">CGST</th><th style="text-align:center;">SGST %</th><th style="text-align:right;">SGST</th>`;

  // Grouped HSN Table
  const hsnMap = new Map<string, { hsn: string; taxable: number; rate: number; tax: number }>();
  (inv.items || []).forEach((it) => {
    const qty = it.qty || 1;
    const rate = it.rate || 0;
    const gstRate = it.gstRate || 0;
    const taxable = qty * rate;
    const tax = (taxable * gstRate) / 100;
    const k = `${it.hsn || '-'}_${gstRate}`;
    const cur = hsnMap.get(k) || { hsn: it.hsn || '-', taxable: 0, rate: gstRate, tax: 0 };
    cur.taxable += taxable;
    cur.tax += tax;
    hsnMap.set(k, cur);
  });
  const hsnEntries = Array.from(hsnMap.values());
  const totalHsnTaxable = hsnEntries.reduce((s, h) => s + h.taxable, 0);
  const totalHsnTax = hsnEntries.reduce((s, h) => s + h.tax, 0);

  const hsnTable = hsnEntries.length > 1 ? `
    <div style="margin-top:14px;border:1px solid #cbd5e1;border-radius:8px;padding:10px;background:#fff;page-break-inside:avoid;">
      <h3 style="margin:0 0 6px;font-size:10px;text-transform:uppercase;color:#1e3a5f;font-weight:800;border-bottom:1.5px solid #1e3a5f;padding-bottom:3px;">HSN / SAC Tax Summary</h3>
      <table style="width:100%;border-collapse:collapse;font-size:10px;">
        <thead>
          <tr style="background:#f8fafc;color:#64748b;">
            <th style="text-align:left;padding:4px;">HSN/SAC</th>
            <th style="text-align:right;padding:4px;">Taxable (₹)</th>
            <th style="text-align:center;padding:4px;">Rate</th>
            <th style="text-align:right;padding:4px;">Tax Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${hsnEntries.map(h => `<tr>
            <td style="padding:4px;font-family:monospace;">${esc(h.hsn)}</td>
            <td style="text-align:right;padding:4px;">${inr(h.taxable)}</td>
            <td style="text-align:center;padding:4px;">${h.rate}%</td>
            <td style="text-align:right;padding:4px;">${inr(h.tax)}</td>
          </tr>`).join('')}
          <tr style="font-weight:700;border-top:1px solid #cbd5e1;">
            <td style="padding:4px;">Total</td>
            <td style="text-align:right;padding:4px;">${inr(totalHsnTaxable)}</td>
            <td></td>
            <td style="text-align:right;padding:4px;">${inr(totalHsnTax)}</td>
          </tr>
        </tbody>
      </table>
    </div>` : '';

  const dateStr = inv.createdAt || inv.invoiceDate
    ? new Date(inv.createdAt || inv.invoiceDate!).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Tax Invoice ${esc(inv.invoiceNo)}</title>
  <style>
    @page { margin: 8mm; size: A4 portrait; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 12px;
      background: #ffffff;
      font-size: 11px;
    }
    .sheet { width: 100%; max-width: 800px; margin: 0 auto; }
    .top-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #1e3a5f; padding-bottom: 10px; }
    .brand-box { display: flex; align-items: center; gap: 10px; }
    .brand-logo { height: 48px; max-width: 140px; object-fit: contain; }
    .brand-title { font-size: 18px; font-weight: 800; color: #1e3a5f; margin: 0; }
    .brand-sub { font-size: 9px; font-weight: 700; color: #059669; text-transform: uppercase; letter-spacing: 1px; }
    .inv-title-box { text-align: right; }
    .inv-main-title { font-size: 20px; font-weight: 800; color: #1e3a5f; margin: 0; }
    .status-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 800; background: ${payBadge.bg}; color: ${payBadge.fg}; margin-top: 3px; }
    
    .infobar { margin-top: 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; display: flex; justify-content: space-between; font-size: 10px; }
    .infobar-item span { color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 8px; display: block; }
    .infobar-item strong { color: #0f172a; font-size: 11px; }

    .grid-2 { display: flex; gap: 10px; margin-top: 10px; }
    .card { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; background: #fff; page-break-inside: avoid; }
    .card h3 { margin: 0 0 6px; font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase; color: #1e3a5f; font-weight: 800; border-bottom: 1.5px solid #1e3a5f; padding-bottom: 3px; }
    .kv { display: flex; justify-content: space-between; font-size: 10.5px; padding: 3px 0; border-bottom: 1px dashed #e2e8f0; }
    .kv:last-child { border-bottom: none; }
    .kv span { color: #64748b; }
    .kv strong { color: #0f172a; font-weight: 600; text-align: right; }

    .pos-banner { margin-top: 10px; font-size: 10.5px; background: #1e3a5f; color: #fff; border-radius: 6px; padding: 6px 12px; display: flex; justify-content: space-between; font-weight: 600; }

    table.items-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10.5px; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; page-break-inside: avoid; }
    table.items-table thead th { background: #1e3a5f; color: #fff; padding: 6px 5px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; }
    table.items-table td { padding: 6px 5px; border-bottom: 1px solid #cbd5e1; }
    table.items-table tbody tr:nth-child(even) { background: #f8fafc; }

    .totals-box { display: flex; justify-content: flex-end; margin-top: 10px; page-break-inside: avoid; }
    .totals-table { width: 320px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; background: #f8fafc; font-size: 11px; }
    .tot-row { display: flex; justify-content: space-between; padding: 2px 0; }
    .grand-row { display: flex; justify-content: space-between; padding: 6px 0 2px; border-top: 2px solid #1e3a5f; margin-top: 4px; font-size: 14px; font-weight: 800; color: #1e3a5f; }

    .payment-sig-row { display: flex; gap: 10px; margin-top: 14px; page-break-inside: avoid; }
    .bank-card { flex: 1.2; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #fff; }
    .scan-card { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #fff; display: flex; gap: 8px; align-items: center; }
    .sig-card { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #fff; text-align: center; display: flex; flex-direction: column; justify-content: space-between; align-items: center; }

    .sig-img { height: 46px; object-fit: contain; margin: 4px 0; }
    .seal-img { height: 50px; width: 50px; object-fit: contain; }
    .footer-note { margin-top: 14px; text-align: center; color: #64748b; font-size: 9px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="sheet">
    <!-- Header -->
    <div class="top-header">
      <div class="brand-box">
        ${logoSrc ? `<img src="${logoSrc}" class="brand-logo" alt="Logo"/>` : ''}
        <div>
          <h1 class="brand-title">${esc(displayName)}</h1>
          <div class="brand-sub">${useMerchantBrand ? 'TAX INVOICE' : 'Smart Billing · Easy Invoicing'}</div>
        </div>
      </div>
      <div class="inv-title-box">
        <h2 class="inv-main-title">TAX INVOICE</h2>
        <div class="status-badge">${payBadge.label}</div>
      </div>
    </div>

    <!-- Infobar -->
    <div class="infobar">
      <div class="infobar-item"><span>INVOICE NUMBER</span><strong>${esc(inv.invoiceNo)}</strong></div>
      <div class="infobar-item"><span>INVOICE DATE</span><strong>${dateStr}</strong></div>
      <div class="infobar-item"><span>SUPPLY TYPE</span><strong>${inv.customerGstin ? 'B2B Registered' : 'B2C Retail'}</strong></div>
      <div class="infobar-item"><span>PAYMENT MODE</span><strong>${paymentLabel(inv.paymentMode)}</strong></div>
    </div>

    <!-- Seller & Buyer Grid -->
    <div class="grid-2">
      <div class="card">
        <h3>Seller Details</h3>
        <div class="kv"><span>Shop Name</span><strong>${esc(displayName)}</strong></div>
        <div class="kv"><span>GSTIN</span><strong style="font-family:monospace;">${esc(m.gstin)}</strong></div>
        <div class="kv"><span>PAN</span><strong style="font-family:monospace;">${esc(m.pan)}</strong></div>
        <div class="kv"><span>Address</span><strong>${esc(m.address)}, ${esc(m.state)}</strong></div>
        <div class="kv"><span>Phone</span><strong>${esc(m.phone)}</strong></div>
      </div>

      <div class="card">
        <h3>Bill To (Buyer)</h3>
        <div class="kv"><span>Customer Name</span><strong>${esc(inv.customerName)}</strong></div>
        <div class="kv"><span>Phone</span><strong>${esc(inv.customerPhone || 'Direct Walk-in')}</strong></div>
        ${inv.customerGstin ? `<div class="kv"><span>Buyer GSTIN</span><strong style="font-family:monospace;">${esc(inv.customerGstin)}</strong></div>` : ''}
        <div class="kv"><span>Address</span><strong>${esc(inv.customerAddress || 'Local Walk-in')}, ${esc(inv.customerState || m.state)}</strong></div>
        ${inv.paymentRef ? `<div class="kv"><span>UTR / Ref</span><strong>${esc(inv.paymentRef)}</strong></div>` : ''}
      </div>
    </div>

    <!-- Place of Supply -->
    <div class="pos-banner">
      <span>Place of Supply: ${esc(inv.placeOfSupply || m.state)}</span>
      <span>${isInterState ? 'Inter-State Supply (IGST Applicable)' : 'Intra-State Supply (CGST + SGST Applicable)'}</span>
    </div>

    <!-- Items Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width:24px;text-align:center;">#</th>
          <th>Item Description</th>
          <th style="width:60px;text-align:center;">HSN/SAC</th>
          <th style="width:36px;text-align:center;">Qty</th>
          <th style="width:60px;text-align:right;">Rate</th>
          <th style="width:70px;text-align:right;">Taxable</th>
          ${taxHead}
          <th style="width:75px;text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <!-- HSN Breakdown -->
    ${hsnTable}

    <!-- Totals -->
    <div class="totals-box">
      <div class="totals-table">
        <div class="tot-row"><span>Total Taxable Value</span><strong>${inr(inv.taxableValue || 0)}</strong></div>
        ${isInterState ? `
          <div class="tot-row"><span>IGST</span><strong>${inr(inv.igst || 0)}</strong></div>
        ` : `
          <div class="tot-row"><span>CGST</span><strong>${inr(inv.cgst || 0)}</strong></div>
          <div class="tot-row"><span>SGST</span><strong>${inr(inv.sgst || 0)}</strong></div>
        `}
        <div class="tot-row"><span>Total Tax</span><strong>${inr(inv.totalTax || 0)}</strong></div>
        ${(inv.roundOff || 0) !== 0 ? `<div class="tot-row"><span>Round Off</span><strong>${inv.roundOff}</strong></div>` : ''}
        <div class="grand-row">
          <span>GRAND TOTAL</span>
          <span>${inr(inv.grandTotal)}</span>
        </div>
        ${inv.amountInWords ? `<div style="font-size:9.5px;color:#64748b;font-style:italic;margin-top:4px;">${esc(inv.amountInWords)}</div>` : ''}
      </div>
    </div>

    <!-- Banking, Scan & Pay, and Signature -->
    <div class="payment-sig-row">
      <div class="bank-card">
        <h3 style="margin:0 0 6px;font-size:10px;text-transform:uppercase;color:#1e3a5f;font-weight:800;">Bank Details</h3>
        <div class="kv"><span>Bank</span><strong>${esc(m.bankName || 'HDFC Bank')}</strong></div>
        <div class="kv"><span>A/C No</span><strong style="font-family:monospace;">${esc(m.accountNumber || '50200012345678')}</strong></div>
        <div class="kv"><span>IFSC</span><strong style="font-family:monospace;">${esc(m.ifsc || 'HDFC0001234')}</strong></div>
        ${m.upiId ? `<div class="kv"><span>UPI ID</span><strong style="font-family:monospace;">${esc(m.upiId)}</strong></div>` : ''}
      </div>

      ${upiQrDataUrl ? `
        <div class="scan-card">
          <img src="${upiQrDataUrl}" style="height:72px;width:72px;" alt="UPI QR"/>
          <div style="font-size:9.5px;">
            <strong style="color:#1e3a5f;font-size:11px;display:block;">Scan &amp; Pay via UPI</strong>
            <span style="color:#64748b;">Amount: ${inr(inv.grandTotal)}</span><br/>
            <span style="color:#64748b;">GPay · PhonePe · Paytm · BHIM</span>
          </div>
        </div>
      ` : ''}

      <div class="sig-card">
        <div style="display:flex;gap:6px;align-items:center;justify-content:center;">
          ${sealSrc ? `<img src="${sealSrc}" class="seal-img" alt="Seal"/>` : ''}
          ${signatureSrc ? `<img src="${signatureSrc}" class="sig-img" alt="Signature"/>` : `<div style="height:40px;"></div>`}
        </div>
        <div style="font-size:9px;color:#64748b;font-weight:700;border-top:1px solid #cbd5e1;padding-top:2px;width:100%;">
          Authorised Signatory
        </div>
      </div>
    </div>

    <!-- Footer Note -->
    <div class="footer-note">
      This is a digitally generated Goods and Services Tax (GST) Tax Invoice compliant with Rule 46 of CGST Rules, 2017.
      ${!useMerchantBrand ? `<br/>Generated via <strong>${platformName}</strong> GST Billing Platform.` : ''}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generates an actual .pdf file on the Android filesystem using Expo Print
 */
export async function generateInvoicePdf(inv: Invoice, m: MerchantProfile): Promise<Print.FilePrintResult> {
  const html = await buildInvoiceHtml(inv, m);
  return await Print.printToFileAsync({
    html,
    base64: false,
  });
}

/**
 * Shares the generated .pdf file via native Android sharing (WhatsApp, Email, Drive, etc.)
 */
export async function shareInvoicePdf(inv: Invoice, m: MerchantProfile): Promise<void> {
  const pdf = await generateInvoicePdf(inv, m);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(pdf.uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Tax Invoice ${inv.invoiceNo}`,
      UTI: 'com.adobe.pdf',
    });
  } else {
    throw new Error('Document sharing is not supported on this device.');
  }
}

/**
 * Opens native Android print dialog for the invoice
 */
export async function printInvoicePdf(inv: Invoice, m: MerchantProfile): Promise<void> {
  const html = await buildInvoiceHtml(inv, m);
  await Print.printAsync({ html });
}
