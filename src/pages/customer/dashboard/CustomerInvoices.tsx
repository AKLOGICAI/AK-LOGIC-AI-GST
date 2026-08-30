import { useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { FileText, Download, Eye, Search, Loader2, MessageSquare } from 'lucide-react';
import { inr } from '../../../lib/gst';
import { openInvoice, downloadInvoice, generateInvoicePdfBlob } from '../../../lib/invoicePdf';
import CustomerChatWidget from '../../../components/chat/CustomerChatWidget';

export default function CustomerInvoices({ invoices }: { invoices: any[] }) {
  const [q, setQ] = useState('');
  const [sharing, setSharing] = useState<string | null>(null);
  const [activeChatMerchant, setActiveChatMerchant] = useState<{ id: string; name: string } | null>(null);

  const rows = invoices.filter((inv) => {
    const t = q.toLowerCase();
    return (
      (inv.customerName || '').toLowerCase().includes(t) ||
      (inv.invoiceNo || '').toLowerCase().includes(t) ||
      (inv.invoiceNumber || '').toLowerCase().includes(t) ||
      (inv.merchantShopName || '').toLowerCase().includes(t)
    );
  });

  const handleWhatsAppShare = async (inv: any) => {
    setSharing(inv.id);
    try {
      const blob = await generateInvoicePdfBlob(inv, { shopName: inv.merchantShopName || 'Merchant' } as any);
      const file = new File([blob], `Invoice_${inv.invoiceNo}.pdf`, { type: 'application/pdf' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Invoice ${inv.invoiceNo}`,
          text: `Here is your invoice ${inv.invoiceNo}`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Invoice_${inv.invoiceNo}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success('PDF downloaded — attach it in WhatsApp');
        window.open(`https://wa.me/?text=Invoice%20${encodeURIComponent(inv.invoiceNo || '')}%20attached`, '_blank');
      }
    } catch (error) {
      console.error('Error sharing to WhatsApp:', error);
    } finally {
      setSharing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[var(--font-display)] text-3xl font-bold">My Invoices</h1>
        <p className="text-[var(--color-mist)] mt-1">
          All your GST tax invoices across merchants in one place.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-mist-2)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by invoice no, merchant, or date..."
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-aqua)] transition text-[var(--color-ivory)]"
        />
      </div>

      <div className="depth-card rounded-2xl overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3.5 text-[11px] uppercase tracking-wider text-[var(--color-mist-2)] border-b border-[var(--color-line)]">
          <div className="col-span-3">Merchant</div>
          <div className="col-span-3">Invoice No</div>
          <div className="col-span-2">Date</div>
          <div className="col-span-2 text-right">Total Amount</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {rows.length === 0 ? (
          <div className="p-16 text-center">
            <FileText size={32} className="text-[var(--color-mist-2)] mx-auto mb-3 opacity-50" />
            <p className="text-sm text-[var(--color-mist)]">
              {q ? 'No matching invoices found.' : 'No invoices recorded yet.'}
            </p>
          </div>
        ) : (
          rows.map((inv, i) => (
            <motion.div
              key={inv.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              className="grid grid-cols-12 gap-4 px-6 py-4 items-center border-b border-[var(--color-line)] last:border-0 hover:bg-[rgba(255,255,255,0.02)] transition"
            >
              <div className="col-span-6 md:col-span-3">
                <div className="font-semibold text-sm text-white">{inv.merchantShopName || 'Merchant'}</div>
                <div className="text-xs text-[var(--color-mist-2)] font-mono">{inv.invoiceNumber || ''}</div>
              </div>

              <div className="col-span-6 md:col-span-3 font-mono text-sm text-[var(--color-gold)]">
                {inv.invoiceNo || '—'}
              </div>

              <div className="hidden md:block col-span-2 text-sm text-[var(--color-mist)]">
                {new Date(inv.invoiceDate || inv.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: '2-digit',
                })}
              </div>

              <div className="col-span-6 md:col-span-2 text-right font-black text-cyan-300 text-base">
                {inr(inv.grandTotal || 0)}
              </div>

              <div className="col-span-6 md:col-span-2 flex justify-end items-center gap-1.5">
                {inv.merchantId && (
                  <button
                    onClick={() => setActiveChatMerchant({ id: inv.merchantId, name: inv.merchantShopName || 'Merchant' })}
                    title="Chat with Merchant"
                    className="w-8 h-8 rounded-lg grid place-items-center depth-soft hover:bg-cyan-500/20 text-cyan-300 transition"
                  >
                    <MessageSquare size={15} />
                  </button>
                )}

                <button
                  onClick={() => openInvoice(inv, { shopName: inv.merchantShopName || 'Merchant' } as any)}
                  title="View Invoice"
                  className="w-8 h-8 rounded-lg grid place-items-center depth-soft hover:glow-aqua transition"
                >
                  <Eye size={15} className="text-[var(--color-aqua)]" />
                </button>

                <button
                  onClick={() => handleWhatsAppShare(inv)}
                  disabled={sharing === inv.id}
                  title="Share on WhatsApp"
                  className="w-8 h-8 rounded-lg grid place-items-center depth-soft hover:bg-[#25D366]/10 transition"
                >
                  {sharing === inv.id ? (
                    <Loader2 size={15} className="text-[#25D366] animate-spin" />
                  ) : (
                    <svg viewBox="0 0 24 24" width={15} height={15} fill="#25D366">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  )}
                </button>

                <button
                  onClick={() => downloadInvoice(inv, { shopName: inv.merchantShopName || 'Merchant' } as any)}
                  title="Download Invoice"
                  className="w-8 h-8 rounded-lg grid place-items-center depth-soft hover:glow-aqua transition"
                >
                  <Download size={15} className="text-[var(--color-aqua)]" />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Customer Chat Widget Modal */}
      {activeChatMerchant && (
        <CustomerChatWidget
          merchantId={activeChatMerchant.id}
          merchantName={activeChatMerchant.name}
          customerId={invoices[0]?.customerId || ''}
          customerCode={invoices[0]?.customerCode || ''}
          customerName={invoices[0]?.customerName || ''}
          open={!!activeChatMerchant}
          onClose={() => setActiveChatMerchant(null)}
        />
      )}
    </div>
  );
}
