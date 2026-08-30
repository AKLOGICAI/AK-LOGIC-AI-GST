import type { Merchant, Invoice } from './types';
import { inr } from './gst';
import { paymentLabel } from './payment';
import { platformService } from './platform';
import { AK_SVG_MARK } from './branding';
import { getInvoiceUpiQrDataUrl } from './upiQr';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

function esc(s?: string): string {
  return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

/**
 * Derived (never persisted) payment-status badge, computed purely from
 * the existing paymentMode field — no new invoice data, no business logic
 * change. 'credit' (Pay Later) reads as pending; every other mode was
 * already collected at billing time.
 */
function paymentStatusBadge(inv: Invoice): { label: string; bg: string; fg: string } {
  if (inv.paymentMode === 'credit') return { label: 'PAYMENT PENDING', bg: '#fdf1dc', fg: '#96650f' };
  return { label: 'PAID', bg: '#e3f6ea', fg: '#0f7a3d' };
}

export async function buildInvoiceHtml(inv: Invoice, m: Merchant): Promise<string> {
  const logoSrc = m.logoUrl || m.logoDataUrl;
  const signatureSrc = m.signatureUrl || m.signatureDataUrl;
  const sealSrc = m.companySealUrl || m.companySealDataUrl;

  // inv.branded is locked at approval time per the validity-based branding policy.
  const useMerchantBrand = inv.branded && !!logoSrc;
  const displayName = useMerchantBrand ? (m.brandName || m.shopName) : m.shopName;
  // Admin-managed default platform logo used for all free / <30-day merchants.
  const platform = platformService.get();
  const platformLogo = platform.defaultLogoDataUrl;
  const platformName = platform.brandName || 'AK-LOGIC AI';

  // ---- Dynamic UPI "Scan & Pay" QR — built ONLY from data already saved
  // on the merchant profile (upiId) and this invoice (grandTotal,
  // invoiceNumber/invoiceNo). Merchant never enters a UPI ID per-invoice.
  // Gracefully null when no UPI ID is on file — bank details still show.
  const upiQrDataUrl = await getInvoiceUpiQrDataUrl(inv, m);
  const payStatus = paymentStatusBadge(inv);

  const rows = inv.items.map((it, i) => {
    const taxable = it.qty * it.rate;
    const tax = (taxable * it.gstRate) / 100;
    const taxCols = inv.isInterState
      ? `<td class="tc">${it.gstRate}%</td><td class="tr">${inr(tax)}</td>`
      : `<td class="tc">${it.gstRate / 2}%</td><td class="tr">${inr(tax / 2)}</td><td class="tc">${it.gstRate / 2}%</td><td class="tr">${inr(tax / 2)}</td>`;
    return `<tr>
      <td class="tc">${i + 1}</td>
      <td>${esc(it.description)}</td>
      <td class="tc mono">${esc(it.hsn)}</td>
      <td class="tc">${it.qty}</td>
      <td class="tr">${inr(it.rate)}</td>
      <td class="tr">${inr(taxable)}</td>
      ${taxCols}
      <td class="tr amt">${inr(taxable + tax)}</td>
    </tr>`;
  }).join('');

  const taxHead = inv.isInterState
    ? `<th class="tc">IGST %</th><th class="tr">IGST</th>`
    : `<th class="tc">CGST %</th><th class="tr">CGST</th><th class="tc">SGST %</th><th class="tr">SGST</th>`;

  const totalsTaxRows = inv.isInterState
    ? `<div class="row"><span>IGST</span><span>${inr(inv.igst)}</span></div>`
    : `<div class="row"><span>CGST</span><span>${inr(inv.cgst)}</span></div><div class="row"><span>SGST</span><span>${inr(inv.sgst)}</span></div>`;

  // Platform / merchant header logo (top-left).
  const platformHeader = platformLogo
    ? `<img src="${platformLogo}" class="brand-logo" alt="${esc(platformName)}"/><div class="brand-text"><div class="brand-name">${esc(platformName)}</div><div class="brand-tag">Smart Billing · Easy Invoicing</div></div>`
    : `${AK_SVG_MARK}<div class="brand-text"><div class="brand-name">${esc(platformName)}</div><div class="brand-tag">Smart Billing · Easy Invoicing</div></div>`;

  const brandingHeader = useMerchantBrand
    ? `<img src="${logoSrc}" class="brand-logo" alt="logo"/><div class="brand-text"><div class="brand-name">${esc(m.brandName || m.shopName)}</div><div class="brand-tag">Tax Invoice</div></div>`
    : platformHeader;

  const poweredBy = !useMerchantBrand
    ? `<div class="powered-by">Invoice generated via <strong>${esc(platformName)}</strong> GST Platform</div>`
    : '';

  const payRow = inv.paymentMode
    ? `<p>Payment Mode: <strong>${paymentLabel(inv.paymentMode)}</strong>${inv.paymentRef ? `<br/>UTR / Ref: ${esc(inv.paymentRef)}` : ''}</p>`
    : '';

  const hsnRows = inv.items.length > 1 ? (() => {
    const map = new Map<string, { hsn: string; taxable: number; rate: number; tax: number }>();
    inv.items.forEach((it) => {
      const taxable = it.qty * it.rate; const tax = (taxable * it.gstRate) / 100;
      const k = `${it.hsn}_${it.gstRate}`;
      const cur = map.get(k) || { hsn: it.hsn, taxable: 0, rate: it.gstRate, tax: 0 };
      cur.taxable += taxable; cur.tax += tax; map.set(k, cur);
    });
    const entries = Array.from(map.values());
    const totalTaxable = entries.reduce((s, h) => s + h.taxable, 0);
    const totalTax = entries.reduce((s, h) => s + h.tax, 0);
    return `<div class="card hsn-card">
      <h3>HSN / SAC Summary</h3>
      <table class="mini">
        <thead><tr><th>HSN/SAC</th><th class="tr">Taxable (₹)</th><th class="tc">Rate</th><th class="tr">Tax (₹)</th></tr></thead>
        <tbody>${entries.map((h) => `<tr><td class="mono">${esc(h.hsn)}</td><td class="tr">${inr(h.taxable)}</td><td class="tc">${h.rate}%</td><td class="tr">${inr(h.tax)}</td></tr>`).join('')}
        <tr class="mini-total"><td>Total</td><td class="tr">${inr(totalTaxable)}</td><td></td><td class="tr">${inr(totalTax)}</td></tr>
        </tbody>
      </table>
    </div>`;
  })() : '';

  // ---- Seller Details card (separate from bank details, per the
  // premium ERP layout) — same data already shown in the old header, just
  // restructured into its own card.
  const sellerCard = `<div class="card">
    <h3><span class="dot dot-gold"></span> Seller (Merchant) Details</h3>
    <div class="kv"><span>Shop Name</span><strong>${esc(displayName)}</strong></div>
    <div class="kv"><span>GSTIN</span><strong class="mono">${esc(m.gstin)}</strong></div>
    <div class="kv"><span>PAN</span><strong class="mono">${esc(m.pan)}</strong></div>
    <div class="kv"><span>Address</span><strong>${esc(m.address)}${m.city ? ', ' + esc(m.city) : ''}, ${esc(m.state)}${m.pincode ? ' - ' + esc(m.pincode) : ''}</strong></div>
    <div class="kv"><span>Contact</span><strong>${esc(m.phone)}${m.email ? ' · ' + esc(m.email) : ''}</strong></div>
  </div>`;

  const buyerCard = `<div class="card">
    <h3><span class="dot dot-blue"></span> Bill To (Buyer)</h3>
    <div class="kv"><span>Name</span><strong>${esc(inv.customerName)}</strong></div>
    <div class="kv"><span>Address</span><strong>${esc(inv.customerAddress)}${inv.customerState ? ', ' + esc(inv.customerState) : ''}</strong></div>
    <div class="kv"><span>Contact</span><strong>${esc(inv.customerPhone)}${inv.customerEmail ? ' · ' + esc(inv.customerEmail) : ''}</strong></div>
    ${inv.customerGstin ? `<div class="kv"><span>GSTIN</span><strong class="mono">${esc(inv.customerGstin)}</strong></div>` : ''}
    ${inv.customerPan ? `<div class="kv"><span>PAN</span><strong class="mono">${esc(inv.customerPan)}</strong></div>` : ''}
    ${payRow ? `<div class="kv-note">${payRow}</div>` : ''}
  </div>`;

  const bankCard = `<div class="card">
    <h3><span class="dot dot-navy"></span> Seller Bank Details</h3>
    <div class="kv"><span>Bank</span><strong>${esc(m.bankName)}${m.accountType ? ` (${m.accountType === 'savings' ? 'Savings' : 'Current'})` : ''}</strong></div>
    <div class="kv"><span>A/C No.</span><strong class="mono">${esc(m.accountNumber)}</strong></div>
    <div class="kv"><span>IFSC</span><strong class="mono">${esc(m.ifsc)}</strong></div>
    ${m.upiId ? `<div class="kv"><span>UPI ID</span><strong class="mono">${esc(m.upiId)}</strong></div>` : ''}
  </div>`;

  // ---- Seal: uploaded/generated company seal (companySealDataUrl covers
  // both — see SettingsPage.tsx). Hidden gracefully if not present.
  // Digital signature is unchanged.
  const sealHtml = sealSrc
    ? `<img src="${sealSrc}" alt="Company Seal" class="seal-img"/>`
    : '';

  // ---- Scan & Pay card — only rendered when the merchant has a UPI ID
  // on file; otherwise this whole block is omitted and the Bank Details
  // card above continues to show as the payment info, exactly as before.
  const scanAndPay = upiQrDataUrl ? `
    <div class="card scan-pay">
      <h3>Scan &amp; Pay</h3>
      <div class="scan-pay-content">
        <img src="${upiQrDataUrl}" alt="UPI QR Code" class="qr-code-img" />
        <div class="scan-pay-details">
          <div class="pay-row"><span>UPI ID</span><strong class="mono">${esc(m.upiId)}</strong></div>
          <div class="pay-row"><span>Payee</span><strong>${esc(m.brandName || m.shopName)}</strong></div>
          <div class="pay-row"><span>Invoice No.</span><strong class="mono">${esc(inv.invoiceNo || inv.invoiceNumber)}</strong></div>
          <div class="pay-row"><span>Amount</span><strong>${inr(inv.grandTotal)}</strong></div>
          <div class="upi-logos">
            <span class="upi-logo">UPI</span>
            <span class="upi-logo">GPay</span>
            <span class="upi-logo">PhonePe</span>
            <span class="upi-logo">Paytm</span>
          </div>
        </div>
      </div>
    </div>` : '';

  const paymentGrid = upiQrDataUrl ? `
    <div class="payment-grid">
      ${bankCard}
      ${scanAndPay}
    </div>` : `
    <div class="payment-grid">
      ${bankCard}
    </div>`;

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=850"/>
  <title>Invoice ${esc(inv.invoiceNo)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet"/>
  <style>
    @page { margin: 10mm; }
    * { box-sizing: border-box; }
    /* ---- pagination safety: never let print/PDF split these blocks
       across a page boundary. This is what was causing the signature,
       seal, and cards to appear "cut in half" on download/print. ---- */
    .card,
    .payment-sig-section,
    .sig-wrap,
    .sign-seal,
    .scan-pay,
    .totals-section,
    .hsn-card,
    table.items thead,
    table.items tr,
    .bottom-footer {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    :root {
      --navy: #1E3A5F;
      --navy-2: #2563EB;
      --gold: #059669;
      --gold-2: #ecfdf5;
      --ink: #0F172A;
      --mist: #64748B;
      --line: #CBD5E1;
      --panel: #F8FAFC;
    }
    body {
      font-family: 'Source Sans 3', 'Segoe UI', sans-serif;
      color: var(--ink);
      margin: 0;
      padding: 10px;
      background: #fff;
      position: relative;
      min-width: 850px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .watermark {
      position: absolute;
      top: 48%;
      left: 50%;
      transform: translate(-50%,-50%) rotate(-28deg);
      font-size: 60px;
      font-weight: 800;
      color: rgba(30,58,138,0.03);
      letter-spacing: 6px;
      white-space: nowrap;
      pointer-events: none;
      z-index: 0;
    }
    .sheet {
      width: 850px;
      margin: 0 auto;
      position: relative;
      z-index: 1;
    }

    /* ---- header ---- */
    .top {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 3px solid var(--navy);
      padding-bottom: 12px;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-logo {
      height: 48px;
      object-fit: contain;
    }
    .brand-name {
      font-weight: 800;
      font-size: 20px;
      color: var(--navy);
      letter-spacing: -0.3px;
      margin: 0;
    }
    .brand-tag {
      font-size: 9px;
      letter-spacing: 1.5px;
      color: var(--gold);
      text-transform: uppercase;
      font-weight: 700;
      margin-top: 1px;
    }
    .title {
      text-align: right;
    }
    .title .big {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: 1px;
      color: var(--navy);
      line-height: 1.1;
    }
    .status-badge {
      display: inline-block;
      margin-top: 4px;
      padding: 3px 10px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.5px;
      background: ${payStatus.bg};
      color: ${payStatus.fg};
    }

    /* ---- horizontal infobar ---- */
    .infobar {
      margin-top: 12px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 14px;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      gap: 12px;
    }
    .infobar-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .infobar-item span {
      color: var(--mist);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 8px;
      letter-spacing: 0.5px;
    }
    .infobar-item strong {
      color: var(--ink);
      font-size: 11px;
    }
    .badge-inline {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 700;
      background: #dbeafe;
      color: #1e40af;
    }

    /* ---- 2-column meta grid ---- */
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-top: 14px;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px 14px;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }
    .card h3 {
      margin: 0 0 8px;
      font-size: 10px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: var(--navy);
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 800;
      border-bottom: 1.5px solid var(--navy);
      padding-bottom: 4px;
    }
    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      display: inline-block;
    }
    .dot-blue { background: #2563eb; }
    .dot-gold { background: #d97706; }
    .dot-navy { background: var(--navy); }
    .kv {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 11px;
      padding: 4px 0;
      border-bottom: 1px dashed #e2e8f0;
    }
    .kv:last-child {
      border-bottom: none;
    }
    .kv span {
      color: var(--mist);
      white-space: nowrap;
    }
    .kv strong {
      text-align: right;
      font-weight: 600;
      color: var(--ink);
      word-break: break-word;
      overflow-wrap: break-word;
    }
    .kv-note {
      margin-top: 6px;
      padding: 6px 8px;
      background: #fef3c7;
      border-radius: 6px;
      font-size: 10.5px;
      color: #92400e;
    }
    .kv-note p {
      margin: 0;
    }
    .mono {
      font-family: 'Consolas', 'Courier New', monospace;
      letter-spacing: 0.2px;
    }

    .pos {
      margin-top: 12px;
      font-size: 11px;
      background: var(--navy);
      color: #fff;
      border-radius: 6px;
      padding: 6px 14px;
      display: flex;
      justify-content: space-between;
    }
    .pos strong {
      font-weight: 700;
    }

    /* ---- items table ---- */
    table.items {
      width: 100%;
      border-collapse: collapse;
      margin-top: 14px;
      font-size: 11px;
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }
    table.items thead th {
      background: var(--navy);
      color: #fff;
      padding: 8px 6px;
      text-align: left;
      font-weight: 600;
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    table.items td {
      padding: 8px 6px;
      border-bottom: 1px solid var(--line);
    }
    table.items tbody tr:nth-child(even) td {
      background: var(--panel);
    }
    .tc { text-align: center; }
    .tr { text-align: right; }
    .amt { font-weight: 700; color: var(--navy); }

    /* ---- HSN card ---- */
    .hsn-card {
      margin-top: 12px;
    }
    table.mini {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    table.mini th {
      background: var(--panel);
      color: var(--navy);
      padding: 5px 8px;
      text-align: left;
      font-weight: 700;
      border-bottom: 1.5px solid var(--line);
    }
    table.mini td {
      padding: 5px 8px;
      border-bottom: 1px solid var(--line);
    }
    table.mini .mini-total td {
      font-weight: 800;
      border-top: 1.5px solid var(--navy);
      border-bottom: none;
    }

    /* ---- totals & declaration side-by-side ---- */
    .totals-section {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      margin-top: 14px;
      align-items: flex-start;
    }
    .totals-left {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .totals-right {
      width: 320px;
      flex-shrink: 0;
    }
    .words {
      font-size: 11px;
      color: var(--ink);
      background: var(--panel);
      padding: 8px 12px;
      border-radius: 8px;
      border-left: 3.5px solid var(--gold);
    }
    .declaration-box {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 10px;
      color: var(--mist);
      line-height: 1.4;
      background: #fff;
    }
    .declaration-box strong {
      color: var(--ink);
    }
    .totals {
      font-size: 12px;
    }
    .totals .row {
      display: flex;
      justify-content: space-between;
      padding: 4px 2px;
      color: var(--ink);
    }
    .totals .row span:first-child {
      color: var(--mist);
    }
    .grand-card {
      margin-top: 6px;
      background: linear-gradient(135deg, var(--navy), var(--navy-2));
      color: #fff;
      border-radius: 8px;
      padding: 10px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 10px rgba(30,58,138,0.15);
    }
    .grand-card .label {
      font-size: 11px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      font-weight: 700;
      opacity: 0.9;
    }
    .grand-card .value {
      font-size: 18px;
      font-weight: 800;
      color: #fcd34d;
    }

    /* ---- bank / QR & signature section ---- */
    .payment-sig-section {
      display: flex;
      justify-content: space-between;
      margin-top: 14px;
      align-items: stretch;
      gap: 20px;
    }
    .payment-grid-wrap {
      flex: 1;
    }
    .payment-grid {
      display: flex;
      gap: 12px;
      height: 100%;
    }
    .payment-grid > .card {
      flex: 1;
      margin: 0;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .sig-wrap {
      width: 320px;
      flex-shrink: 0;
      display: flex;
      align-items: flex-end;
      justify-content: flex-end;
    }
    .sign-seal {
      display: flex;
      align-items: flex-end;
      gap: 14px;
      background: var(--panel);
      border: 1px dashed var(--line);
      border-radius: 10px;
      padding: 10px 14px;
      width: 100%;
      justify-content: space-between;
    }
    .seal-img {
      height: 72px;
      width: 72px;
      object-fit: contain;
    }
    .sign {
      text-align: center;
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .sign img {
      height: 40px;
      object-fit: contain;
    }
    .sign .line {
      border-top: 1px solid var(--line);
      margin-top: 4px;
      padding-top: 4px;
      font-size: 9.5px;
      color: var(--mist);
      line-height: 1.3;
      width: 100%;
    }

    /* ---- scan & pay ---- */
    .scan-pay {
      background: #fafafb;
    }
    .scan-pay h3 {
      border-bottom-color: var(--line) !important;
    }
    .scan-pay-content {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .qr-code-img {
      width: 80px;
      height: 80px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 3px;
      background: #fff;
    }
    .scan-pay-details {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .pay-row {
      display: flex;
      justify-content: space-between;
      font-size: 10.5px;
      border-bottom: 1px dashed #e2e8f0;
      padding-bottom: 2px;
    }
    .pay-row:last-of-type {
      border-bottom: none;
    }
    .pay-row span {
      color: var(--mist);
    }
    .pay-row strong {
      color: var(--ink);
    }
    .upi-logos {
      display: flex;
      gap: 4px;
      margin-top: 4px;
    }
    .upi-logo {
      font-size: 7.5px;
      font-weight: 700;
      background: #e2e8f0;
      color: var(--navy);
      padding: 1.5px 5px;
      border-radius: 3px;
    }

    /* ---- bottom footer ---- */
    .bottom-footer {
      margin-top: 14px;
      background: var(--navy);
      color: #fff;
      border-radius: 8px;
      padding: 8px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      flex-wrap: wrap;
      gap: 6px;
    }
    .bottom-footer .contacts {
      display: flex;
      gap: 12px;
      opacity: 0.9;
    }
    .fine-print {
      text-align: center;
      font-size: 9px;
      color: var(--mist);
      margin-top: 6px;
    }
    .powered-by {
      text-align: center;
      font-size: 9px;
      color: #cbd5e1;
      margin-top: 6px;
    }
    .powered-by strong {
      color: var(--gold);
    }
    
    @media print {
      body { padding: 0; margin: 0; min-width: auto; }
      .sheet { width: 100%; }
      @page { margin: 10mm; }
    }
  </style></head>
  <body>
    <div class="sheet">
      <div class="watermark">ORIGINAL FOR BUYER</div>

      <div class="top">
        <div class="brand">${brandingHeader}</div>
        <div class="title">
          <div class="big">TAX INVOICE</div>
          <div class="status-badge">${payStatus.label}</div>
        </div>
      </div>

      <div class="infobar">
        <div class="infobar-item"><span>GST Invoice No.</span><strong>${esc(inv.invoiceNo)}</strong></div>
        ${inv.invoiceNumber ? `<div class="infobar-item"><span>Internal Invoice No.</span><strong>${esc(inv.invoiceNumber)}</strong></div>` : ''}
        <div class="infobar-item"><span>Invoice Date</span><strong>${new Date(inv.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></div>
        <div class="infobar-item"><span>Payment Terms</span><strong>${inv.paymentMode === 'credit' ? 'Credit (Pay Later)' : 'Due on Receipt'}</strong></div>
        <div class="infobar-item"><span>Place of Supply</span><strong>${esc(inv.placeOfSupply)}</strong></div>
        <div class="infobar-item"><span>Supply Type</span><strong class="badge-inline">${inv.isInterState ? 'INTER-STATE' : 'INTRA-STATE'}</strong></div>
      </div>

      <div class="meta-grid">
        ${buyerCard}
        ${sellerCard}
      </div>

      <div class="pos">
        <span>Reverse Charge Applicable: <strong>No</strong></span>
        <span>Original for Buyer</span>
      </div>

      <table class="items">
        <thead><tr>
          <th class="tc">#</th><th>Description</th><th class="tc">HSN/SAC</th>
          <th class="tc">Qty</th><th class="tr">Rate</th>
          <th class="tr">Taxable</th>
          ${taxHead}
          <th class="tr">Amount</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>

      ${hsnRows}

      <div class="totals-section">
        <div class="totals-left">
          <div class="words"><strong>Amount in Words:</strong> ${esc(inv.amountInWords)}</div>
          <div class="declaration-box">
            ${inv.notes ? `<p style="margin:0 0 6px"><strong>Notes:</strong> ${esc(inv.notes)}</p>` : ''}
            <p style="margin:0"><strong>Declaration:</strong> We declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct.</p>
          </div>
        </div>
        <div class="totals-right">
          <div class="totals">
            <div class="row"><span>Taxable Value</span><span>${inr(inv.taxableValue)}</span></div>
            ${totalsTaxRows}
            ${inv.roundOff !== 0 ? `<div class="row"><span>Round Off</span><span>${inr(inv.roundOff)}</span></div>` : ''}
            <div class="grand-card"><span class="label">Grand Total</span><span class="value">${inr(inv.grandTotal)}</span></div>
          </div>
        </div>
      </div>

      <div class="payment-sig-section">
        <div class="payment-grid-wrap">
          ${paymentGrid}
        </div>
        <div class="sig-wrap">
          <div class="sign-seal">
            ${sealHtml}
            <div class="sign">
              ${signatureSrc ? `<img src="${signatureSrc}" alt="Digital signature"/>` : '<div style="height:48px"></div>'}
              <div class="line">Authorised Signatory<br/><strong>${esc(displayName)}</strong></div>
            </div>
          </div>
        </div>
      </div>

      <div class="bottom-footer">
        <strong>${esc(displayName)}</strong>
        <div class="contacts">
          ${m.email ? `<span>✉ ${esc(m.email)}</span>` : ''}
          ${m.phone ? `<span>☎ ${esc(m.phone)}</span>` : ''}
        </div>
        <span>Thank you for your business!</span>
      </div>
      <div class="fine-print">This is a computer-generated invoice and does not require a physical signature.</div>
      ${poweredBy}
    </div>
    <script>
      (function () {
        // Wait for every image on the invoice (logo, seal, signature, QR)
        // to actually finish loading/decoding before printing. Firing
        // print too early (e.g. a flat 500ms timeout) is what caused the
        // seal/signature to come out cut off or missing on slower phones.
        var imgs = Array.prototype.slice.call(document.images);
        var pending = imgs.filter(function (img) { return !img.complete; });
        var done = false;
        function go() {
          if (done) return;
          done = true;
          setTimeout(function () { window.print(); }, 150);
        }
        if (pending.length === 0) {
          go();
        } else {
          var remaining = pending.length;
          pending.forEach(function (img) {
            img.addEventListener('load', function () { if (--remaining <= 0) go(); });
            img.addEventListener('error', function () { if (--remaining <= 0) go(); });
          });
          // Safety net in case an image event never fires.
          setTimeout(go, 3000);
        }
      })();
    </script>
  </body></html>`;
}

export async function openInvoice(inv: Invoice, m: Merchant) {
  // Open the window synchronously (before any await) so browsers don't
  // treat this as a blocked popup — content is written in once ready.
  const w = window.open('', '_blank');
  const html = await buildInvoiceHtml(inv, m);
  if (w) { w.document.open(); w.document.write(html); w.document.close(); }
}

export async function generateInvoicePdfBlob(inv: Invoice, m: Merchant): Promise<Blob> {
  const RENDER_WIDTH_PX = 1050;
  const html = await buildInvoiceHtml(inv, m);
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const styleContent = doc.querySelector('style')?.innerHTML || '';
  const bodyContent = doc.body.innerHTML;

  const container = document.createElement('div');
  container.id = 'invoice-pdf-render-container';
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = `${RENDER_WIDTH_PX}px`;
  container.style.background = '#ffffff';
  container.style.zIndex = '-9999';
  container.innerHTML = `
    <style>
      ${styleContent}
      body { padding: 0 !important; margin: 0 !important; min-width: auto !important; background: #ffffff !important; }
      .sheet { width: ${RENDER_WIDTH_PX}px !important; margin: 0 !important; padding: 10px !important; box-shadow: none !important; }
    </style>
    ${bodyContent}
  `;

  document.body.appendChild(container);

  try {
    // Wait for all images to load
    const imgs = Array.from(container.querySelectorAll('img'));
    const imagePromises = imgs.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve());
        img.addEventListener('error', () => resolve());
      });
    });

    await Promise.race([
      Promise.all(imagePromises),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);

    if (document.fonts && document.fonts.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    }

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: RENDER_WIDTH_PX,
      height: container.scrollHeight,
      windowWidth: RENDER_WIDTH_PX,
      windowHeight: container.scrollHeight,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
    });

    const pdfWidth = 595.28;
    const pdfHeight = 841.89;
    const pxToPt = pdfWidth / RENDER_WIDTH_PX;
    const containerHeightPx = container.offsetHeight;
    const containerHeightPt = containerHeightPx * pxToPt;

    // ── Short invoice: content fits on a single page ──────────────
    // Use a custom page height matching the actual content so there is
    // no empty white space at the bottom.  Everything else (margins,
    // image quality, layout) stays identical.
    if (containerHeightPt <= pdfHeight) {
      const orientation = containerHeightPt >= pdfWidth ? 'p' : 'l';
      const pdf = new jsPDF(orientation, 'pt', [pdfWidth, containerHeightPt]);
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, containerHeightPt, undefined, 'FAST');
      return pdf.output('blob');
    }

    // ── Multi-page invoice: existing A4 pagination logic ──────────
    const sigElement = container.querySelector('.payment-sig-section') as HTMLElement | null;
    const tableRows = Array.from(container.querySelectorAll('table.items tbody tr')) as HTMLElement[];
    const pageHeightPx = pdfHeight / pxToPt;

    const pageIntervals: [number, number][] = [];
    let currentY = 0;

    while (currentY < containerHeightPx) {
      let targetEndY = currentY + pageHeightPx;

      if (targetEndY >= containerHeightPx) {
        pageIntervals.push([currentY, containerHeightPx]);
        break;
      }

      const containerRect = container.getBoundingClientRect();

      // Check if targetEndY falls inside any item row; if so, move page break to top of row
      for (const row of tableRows) {
        const rowRect = row.getBoundingClientRect();
        const rowTopPx = rowRect.top - containerRect.top;
        const rowBottomPx = rowRect.bottom - containerRect.top;

        if (targetEndY > rowTopPx && targetEndY < rowBottomPx && rowTopPx > currentY) {
          targetEndY = rowTopPx;
          break;
        }
      }

      if (sigElement) {
        const sigRect = sigElement.getBoundingClientRect();
        const sigTopPx = sigRect.top - containerRect.top;
        const sigBottomPx = sigRect.bottom - containerRect.top;

        if (targetEndY > sigTopPx && currentY < sigTopPx && targetEndY < sigBottomPx) {
          targetEndY = sigTopPx;
        }
      }

      if (targetEndY <= currentY) {
        targetEndY = currentY + pageHeightPx;
      }

      pageIntervals.push([currentY, targetEndY]);
      currentY = targetEndY;
    }

    const pdf = new jsPDF('p', 'pt', 'a4');

    for (let i = 0; i < pageIntervals.length; i++) {
      const [startY, endY] = pageIntervals[i];
      const sliceHeightPx = endY - startY;

      if (i > 0) {
        pdf.addPage();
      }

      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeightPx * 2;

      const sliceCtx = sliceCanvas.getContext('2d');
      if (sliceCtx) {
        sliceCtx.drawImage(
          canvas,
          0,
          startY * 2,
          canvas.width,
          sliceHeightPx * 2,
          0,
          0,
          sliceCanvas.width,
          sliceCanvas.height
        );
      }

      const imgData = sliceCanvas.toDataURL('image/jpeg', 0.95);
      const renderHeightPt = sliceHeightPx * pxToPt;

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, renderHeightPt, undefined, 'FAST');
    }

    return pdf.output('blob');
  } finally {
    container.remove();
  }
}

/**
 * Actually downloads the invoice as a file (distinct from openInvoice,
 * which only opens a preview/print tab). Triggers a real browser download
 * — the file lands in the user's Downloads folder — using the same
 * invoice HTML `openInvoice` builds, so the content is identical, just
 * delivered as a saved file instead of a new tab.
 */
export async function downloadInvoice(inv: Invoice, m: Merchant) {
  try {
    const pdfBlob = await generateInvoicePdfBlob(inv, m);
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Invoice-${inv.invoiceNumber || inv.invoiceNo || inv.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('PDF generation failed, falling back to HTML download:', err);
    const html = await buildInvoiceHtml(inv, m);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Invoice-${inv.invoiceNumber || inv.invoiceNo || inv.id}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}