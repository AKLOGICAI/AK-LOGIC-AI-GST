import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, FileText, Share2, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { akaiService, type AkaiActionCardData } from '../../lib/akaiService';
import { Badge } from '../ui';

interface AkaiActionCardProps {
  cardData: AkaiActionCardData;
  confirmationToken?: string;
  onActionSuccess?: (result: any) => void;
}

export default function AkaiActionCard({
  cardData,
  confirmationToken,
  onActionSuccess,
}: AkaiActionCardProps) {
  const [loading, setLoading] = useState(false);
  const [successResult, setSuccessResult] = useState<any>(null);
  const [cancelled, setCancelled] = useState(false);

  const handleConfirm = async () => {
    if (!confirmationToken) {
      toast.error('Confirmation token missing or expired.');
      return;
    }

    try {
      setLoading(true);
      const idempKey = `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const res = await akaiService.executeAction('create_invoice', confirmationToken, idempKey);

      if (res.ok) {
        toast.success(`Tax Invoice #${res.invoice_no} successfully created!`);
        setSuccessResult(res);
        if (onActionSuccess) onActionSuccess(res);
      } else {
        toast.error(res.message || 'Action execution failed.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Action execution failed.');
    } finally {
      setLoading(false);
    }
  };

  if (cancelled) {
    return (
      <div className="mt-2.5 p-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-slate-400 italic flex items-center gap-2">
        <XCircle size={15} className="text-rose-400 shrink-0" />
        <span>Action cancelled by merchant.</span>
      </div>
    );
  }

  // 1. Render Success State Card
  if (successResult || cardData.card_type === 'invoice_success') {
    const invNo = successResult?.invoice_no || cardData.invoice_no || 'INV';
    const total = successResult?.grand_total || cardData.grand_total || 0;
    const custName = successResult?.customer_name || cardData.customer_name || 'Customer';
    const pdfUrl = successResult?.pdf_url || cardData.pdf_url || '#';

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mt-3 p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-emerald-950/80 to-teal-950/60 border border-emerald-500/40 space-y-3.5 shadow-xl text-slate-100"
      >
        <div className="flex items-center justify-between gap-2 border-b border-emerald-500/20 pb-2.5">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <span>Official Tax Invoice Created</span>
          </div>
          <Badge tone="emerald">#{invNo}</Badge>
        </div>

        <div className="text-sm space-y-1.5">
          <div className="text-slate-300">
            Customer: <strong className="text-white">{custName}</strong>
          </div>
          <div className="text-lg sm:text-xl font-[var(--font-display)] font-extrabold text-emerald-300">
            Grand Total: ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm hover:bg-emerald-300 active:scale-95 transition flex items-center justify-center gap-2 shadow-md cursor-pointer"
          >
            <FileText size={16} /> View Invoice PDF
          </a>

          <button
            type="button"
            onClick={() => {
              const origin = window.location.origin;
              const shareText = `Namaste! Aapka Tax Invoice #${invNo} for ₹${total} ready hai. Link: ${origin}${pdfUrl}`;
              navigator.clipboard.writeText(shareText);
              toast.success('Invoice link copied to clipboard!');
            }}
            className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs sm:text-sm font-semibold text-white active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Share2 size={16} /> Copy Share Link
          </button>
        </div>
      </motion.div>
    );
  }

  // 2. Render Draft Invoice Preview & Confirmation Card
  if (cardData.card_type === 'invoice_preview') {
    return (
      <div className="mt-3 p-4 sm:p-5 rounded-2xl bg-[#0a1122] border border-cyan-500/40 space-y-3.5 shadow-2xl text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm">
            <Sparkles size={16} className="text-amber-400 shrink-0" />
            <span>{cardData.title || 'Invoice Draft Preview'}</span>
          </div>
          <Badge tone="amber">Confirmation Required</Badge>
        </div>

        {/* Customer & Tax Details */}
        <div className="text-xs sm:text-sm text-slate-300 space-y-1 bg-[#060a14] p-3 rounded-xl border border-white/5">
          <div>
            Customer: <strong className="text-white">{cardData.customer_name}</strong>{' '}
            {cardData.customer_phone ? <span className="text-slate-400 font-mono">({cardData.customer_phone})</span> : ''}
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-1.5 flex-wrap">
            <span>Place of Supply:</span>
            <span className="font-mono text-cyan-300 font-semibold">{cardData.place_of_supply}</span>
            <span>({cardData.is_inter_state ? 'Inter-state IGST' : 'Intra-state CGST+SGST'})</span>
          </div>
        </div>

        {/* Items Table */}
        {cardData.items && cardData.items.length > 0 && (
          <div className="overflow-x-auto no-scrollbar rounded-xl border border-white/10 bg-[#060a14]">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="text-[11px] uppercase text-slate-400 bg-white/5 border-b border-white/10">
                  <th className="py-2 px-3">Item</th>
                  <th className="py-2 px-2 text-center">Qty</th>
                  <th className="py-2 px-2 text-right">Rate</th>
                  <th className="py-2 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {cardData.items.map((it, idx) => (
                  <tr key={idx} className="text-slate-200">
                    <td className="py-2 px-3">
                      <div className="font-semibold text-white">{it.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        HSN: {it.hsn || '9983'} · GST: {it.gstRate || 18}%
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-medium">{it.qty}</td>
                    <td className="py-2 px-2 text-right font-mono">₹{it.rate}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-white">
                      ₹{(it.qty * it.rate).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals Summary */}
        <div className="p-3 rounded-xl bg-[#060a14] border border-white/5 space-y-1.5 text-xs sm:text-sm">
          <div className="flex justify-between text-slate-400">
            <span>Taxable Value:</span>
            <span className="font-mono text-white font-medium">₹{(cardData.taxable_value || 0).toFixed(2)}</span>
          </div>
          {!cardData.is_inter_state ? (
            <>
              <div className="flex justify-between text-slate-400 text-xs">
                <span>CGST:</span>
                <span className="font-mono text-white">₹{(cardData.cgst || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400 text-xs">
                <span>SGST:</span>
                <span className="font-mono text-white">₹{(cardData.sgst || 0).toFixed(2)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-slate-400 text-xs">
              <span>IGST:</span>
              <span className="font-mono text-white">₹{(cardData.igst || 0).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-extrabold text-base text-cyan-300 pt-2 border-t border-white/10">
            <span>Grand Total:</span>
            <span className="font-mono">₹{(cardData.grand_total || 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Interactive Action Confirmation Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
          <button
            type="button"
            disabled={loading}
            onClick={handleConfirm}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-extrabold text-xs sm:text-sm hover:brightness-110 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer shadow-lg disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin text-slate-950" /> : <ShieldCheck size={16} className="text-slate-950" />}
            <span>Confirm & Create Invoice</span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => setCancelled(true)}
            className="py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs sm:text-sm font-semibold text-slate-300 hover:text-white active:scale-98 transition cursor-pointer text-center"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return null;
}
