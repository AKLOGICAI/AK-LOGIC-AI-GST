import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, CheckCircle2, XCircle, Download, Share2, Receipt, Store, RefreshCw, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import Logo from '../components/Logo';
import { store, useRequests, useInvoices } from '../lib/store';
import { inr } from '../lib/gst';
import { invoiceItemsTotal } from '../lib/calc';
import { paymentLabel } from '../lib/payment';
import { buildInvoiceHtml, openInvoice, downloadInvoice, generateInvoicePdfBlob } from '../lib/invoicePdf';
import type { Merchant } from '../lib/types';

export default function InvoiceStatus() {
  const { requestId } = useParams();
  // subscribe so the page updates live when the merchant approves
  const requests = useRequests();
  const invoices = useInvoices();
  const [shared, setShared] = useState(false);

  const req = requests.find((r) => r.id === requestId);

  // Public tracking link (no login): pull the request + invoice from the
  // backend on load, then keep polling while the request is still pending
  // so the customer sees the merchant's approval/rejection without a
  // manual refresh. Stop polling once the request is resolved.
  useEffect(() => {
    if (!requestId) return;
    store.fetchPublicRequest(requestId);
    store.fetchPublicInvoiceByRequest(requestId);
  }, [requestId]);

  useEffect(() => {
    if (!req) return;
    const hasInvoice = invoices.some((iv) => iv.requestId === req.id);
    if ((hasInvoice || req.status === 'approved') && requestId) {
      store.fetchPublicMerchantByRequest(requestId);
    } else if (req.merchantId) {
      store.fetchPublicMerchant(req.merchantId);
    }
  }, [req?.merchantId, req?.status, req?.id, invoices, requestId]);

  useEffect(() => {
    if (!requestId || (req && req.status !== 'pending')) return;
    const interval = setInterval(() => {
      store.fetchPublicRequest(requestId);
      store.fetchPublicInvoiceByRequest(requestId);
    }, 5000);
    return () => clearInterval(interval);
  }, [requestId, req?.status]);

  if (!req) {
    return (
      <Shell>
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl grid place-items-center mx-auto depth-soft mb-4"><FileText size={28} className="text-[var(--color-mist-2)]" /></div>
          <h2 className="font-[var(--font-display)] text-xl font-bold">Request not found</h2>
          <p className="text-sm text-[var(--color-mist)] mt-1">Ye link invalid ya expire ho chuka hai.</p>
          <Link to="/scan" className="mt-6 inline-block px-5 py-3 rounded-xl font-semibold text-[var(--color-ink)] depth-raised" style={{ background: 'linear-gradient(135deg,#f6dd9b,#e9c46a)' }}>Scan a QR</Link>
        </div>
      </Shell>
    );
  }

  const merchant = store.getMerchant(req.merchantId);
  const invoice = invoices.find((iv) => iv.requestId === req.id);

  const ensureFullMerchant = async (): Promise<Merchant | undefined> => {
    if (!invoice || !merchant) return merchant;
    const isMissing = !(merchant.companySealUrl || merchant.companySealDataUrl) || !(merchant.signatureUrl || merchant.signatureDataUrl) || !merchant.bankName;
    if (isMissing && requestId) {
      console.log('Defensive check: Merchant details incomplete. Retrying fetchPublicMerchantByRequest...');
      await store.fetchPublicMerchantByRequest(requestId);
      // Wait briefly for state update to propagate
      await new Promise((resolve) => setTimeout(resolve, 800));
      return store.getMerchant(merchant.id);
    }
    return merchant;
  };

  const handleShare = async () => {
    if (!invoice || !merchant) return;
    const fullMerchant = await ensureFullMerchant() || merchant;
    const shareUrl = `${window.location.origin}/track/${req.id}`;
    const text = `GST Invoice ${invoice.invoiceNo} from ${fullMerchant.shopName} — ${inr(invoice.grandTotal)}`;

    try {
      const blob = await generateInvoicePdfBlob(invoice, fullMerchant);
      const file = new File([blob], `Invoice-${invoice.invoiceNo}.pdf`, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Invoice ${invoice.invoiceNo}`,
          text: text,
        });
        return;
      }
    } catch (err) {
      console.error('File sharing failed, falling back to link sharing:', err);
    }

    // Try the native share sheet first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({ title: `Invoice ${invoice.invoiceNo}`, text, url: shareUrl });
        return;
      } catch { /* user cancelled — fall through */ }
    }
    // Fallback: copy a shareable link
    try {
      await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch { /* ignore */ }
  };

  const handleDownload = async () => {
    if (!invoice || !merchant) return;
    const fullMerchant = await ensureFullMerchant() || merchant;
    await downloadInvoice(invoice, fullMerchant);
  };

  const downloadHtml = async () => {
    if (!invoice || !merchant) return;
    const fullMerchant = await ensureFullMerchant() || merchant;
    const html = await buildInvoiceHtml(invoice, fullMerchant);
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${invoice.invoiceNo.replace(/\//g, '-')}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const total = invoice ? invoice.grandTotal : invoiceItemsTotal(req.items);

  return (
    <Shell>
      {/* merchant chip */}
      <div className="depth-soft rounded-2xl p-4 flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-xl grid place-items-center depth-raised shrink-0" style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}>
          <Store size={20} className="text-[var(--color-gold)]" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold truncate">{merchant?.shopName}</div>
          <div className="text-xs text-[var(--color-mist-2)]">GSTIN: {merchant?.gstin}</div>
        </div>
      </div>

      {/* status hero */}
      {req.status === 'pending' && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center py-6">
          <div className="w-20 h-20 rounded-full grid place-items-center mx-auto relative mb-4" style={{ background: 'rgba(255,180,84,0.12)' }}>
            <Clock size={34} className="text-[var(--color-amber)]" />
            <div className="absolute inset-0 rounded-full pulse-ring border border-[var(--color-amber)]" />
          </div>
          <h2 className="font-[var(--font-display)] text-2xl font-bold">Awaiting Approval</h2>
          <p className="text-sm text-[var(--color-mist)] mt-2 max-w-sm mx-auto">Your request has been sent to <strong className="text-[var(--color-ivory)]">{merchant?.shopName}</strong>. As soon as the merchant approves it, your invoice will be ready here.</p>
          <p className="text-xs text-[var(--color-mist-2)] mt-3 flex items-center justify-center gap-1.5"><RefreshCw size={12} /> Bookmark this page — the status updates live.</p>
        </motion.div>
      )}

      {req.status === 'rejected' && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center py-6">
          <div className="w-20 h-20 rounded-full grid place-items-center mx-auto mb-4" style={{ background: 'rgba(255,107,136,0.12)' }}>
            <XCircle size={34} className="text-[var(--color-rose)]" />
          </div>
          <h2 className="font-[var(--font-display)] text-2xl font-bold">Request Declined</h2>
          <p className="text-sm text-[var(--color-mist)] mt-2 max-w-sm mx-auto">The merchant did not approve this request.{req.notes ? ` Reason: ${req.notes}` : ''}</p>
          <Link to={`/pay/${merchant?.qrId}`} className="mt-6 inline-block px-5 py-3 rounded-xl font-semibold text-[var(--color-ink)] depth-raised" style={{ background: 'linear-gradient(135deg,#f6dd9b,#e9c46a)' }}>Submit New Request</Link>
        </motion.div>
      )}

      {req.status === 'approved' && invoice && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center py-4">
            <div className="w-20 h-20 rounded-full grid place-items-center mx-auto mb-4 glow-aqua" style={{ background: 'linear-gradient(135deg,#6ff2dc,#11a892)' }}>
              <CheckCircle2 size={36} className="text-[var(--color-ink)]" strokeWidth={2.5} />
            </div>
            <h2 className="font-[var(--font-display)] text-2xl font-bold">✅ Your GST Invoice is Ready</h2>
            <p className="text-sm text-[var(--color-mist)] mt-2">Invoice <span className="font-mono text-[var(--color-gold)]">{invoice.invoiceNo}</span> has been generated.</p>
            {invoice.invoiceNumber && (
              <p className="text-xs text-[var(--color-mist-2)] mt-1">Invoice Number: <span className="font-mono text-[var(--color-aqua)]">{invoice.invoiceNumber}</span></p>
            )}
          </div>

          {/* invoice summary card */}
          <div className="depth-soft rounded-2xl p-5 mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--color-mist)]">Taxable Value</span><span>{inr(invoice.taxableValue)}</span></div>
            {invoice.isInterState ? (
              <div className="flex justify-between"><span className="text-[var(--color-mist)]">IGST</span><span>{inr(invoice.igst)}</span></div>
            ) : (
              <>
                <div className="flex justify-between"><span className="text-[var(--color-mist)]">CGST</span><span>{inr(invoice.cgst)}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-mist)]">SGST</span><span>{inr(invoice.sgst)}</span></div>
              </>
            )}
            {invoice.roundOff !== 0 && <div className="flex justify-between"><span className="text-[var(--color-mist)]">Round Off</span><span>{inr(invoice.roundOff)}</span></div>}
            <div className="flex justify-between font-[var(--font-display)] text-lg font-bold pt-2 border-t border-[var(--color-line)]"><span>Total Paid</span><span className="gold-text">{inr(invoice.grandTotal)}</span></div>
          </div>

          {/* action buttons */}
          <div className="grid grid-cols-2 gap-3 mt-5">
            <button onClick={handleDownload} className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-[var(--color-ink)] depth-raised" style={{ background: 'linear-gradient(135deg,#6ff2dc,#38e0c8)' }}>
              <Download size={18} /> Download PDF
            </button>
            <button onClick={handleShare} className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold border border-[var(--color-line)] hover:border-[var(--color-aqua)] transition">
              <Share2 size={18} /> {shared ? 'Link Copied!' : 'Share PDF'}
            </button>
          </div>
          <button onClick={downloadHtml} className="mt-3 w-full text-xs text-[var(--color-mist-2)] underline">Save invoice file (.html)</button>
          <p className="text-center text-[11px] text-[var(--color-mist-2)] mt-4">No login required · Save this link to access your invoice anytime.</p>
        </motion.div>
      )}

      {/* order details */}
      <div className="mt-6 pt-5 border-t border-[var(--color-line)]">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--color-mist-2)] mb-3"><Receipt size={13} /> Order Details</div>
        <div className="space-y-2">
          {req.items.map((it, i) => (
            <div key={it.id} className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-mist)] truncate pr-2">
                <span className="text-[var(--color-mist-2)] font-mono mr-1.5">{i + 1}.</span>
                {it.description} × {it.qty} <span className="text-[var(--color-mist-2)]">· {it.gstRate}% GST</span>
              </span>
              <span className="font-medium whitespace-nowrap">{inr(it.qty * it.rate)}</span>
            </div>
          ))}
        </div>
        {req.paymentMode && <div className="text-xs text-[var(--color-mist-2)] mt-3">Payment: {paymentLabel(req.paymentMode)}{req.paymentRef ? ` · Ref ${req.paymentRef}` : ''}</div>}
        {req.status === 'pending' && <div className="text-sm font-semibold mt-3 flex justify-between"><span>Estimated Total</span><span className="gold-text">{inr(total)}</span></div>}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-ink)] text-[var(--color-ivory)] grid-bg">
      <header className="max-w-md mx-auto px-6 py-6 flex items-center justify-between">
        <Link to="/"><Logo /></Link>
        <span className="text-xs px-3 py-1.5 rounded-full glass text-[var(--color-mist)]">Customer Portal</span>
      </header>
      <div className="max-w-md mx-auto px-6 pb-16">
        <div className="depth-card rounded-[28px] p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
