/**
 * Dynamic invoice payment QR — UI-only helper.
 *
 * Builds a standard `upi://pay` deep link (the same format Google Pay,
 * PhonePe, Paytm and BHIM all understand) using ONLY data that already
 * exists on the merchant profile and the invoice itself:
 *   - merchant.upiId   (already saved in Merchant Profile / Settings)
 *   - merchant's display name
 *   - invoice.grandTotal
 *   - invoice.invoiceNumber / invoiceNo (sent as the payment note)
 *
 * The merchant NEVER enters a UPI ID while creating an invoice — this is
 * purely a read + render step at PDF/print time. No payment workflow,
 * verification, or business logic is changed; this does not talk to any
 * payment gateway, it only encodes a standard UPI intent string that the
 * customer's own UPI app resolves when they scan it.
 *
 * Reuses the same 'qrcode' library already used elsewhere in the app
 * (see src/components/QRCode.tsx) — no new dependency.
 */
import QR from 'qrcode';
import type { Invoice, Merchant } from './types';

export function buildUpiUri(opts: {
  upiId: string;
  payeeName: string;
  amount: number;
  note: string;
}): string {
  const params = new URLSearchParams({
    pa: opts.upiId, // payee address (UPI ID)
    pn: opts.payeeName, // payee name
    am: opts.amount.toFixed(2), // amount
    cu: 'INR',
    tn: opts.note, // transaction note (invoice number)
  });
  return `upi://pay?${params.toString()}`;
}

/**
 * Returns a QR PNG data URL encoding the invoice's UPI payment intent, or
 * null if the merchant has no UPI ID saved (caller should hide the "Scan
 * & Pay" section gracefully in that case, and continue showing bank
 * details as before).
 */
export async function getInvoiceUpiQrDataUrl(inv: Invoice, m: Merchant): Promise<string | null> {
  if (!m.upiId) return null;
  const uri = buildUpiUri({
    upiId: m.upiId,
    payeeName: m.brandName || m.shopName,
    amount: inv.grandTotal,
    note: inv.invoiceNumber || inv.invoiceNo,
  });
  try {
    return await QR.toDataURL(uri, {
      width: 480,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a2a6b', light: '#ffffff' },
    });
  } catch (e) {
    console.error('UPI QR generation failed:', e);
    return null;
  }
}
