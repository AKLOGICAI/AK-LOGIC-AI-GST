import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  FileText, Download, Eye, Search, XCircle, Loader2, Truck, Sparkles, Scale, Trash2
} from 'lucide-react';
import type { Merchant, Invoice } from '../../lib/types';
import { useRequests, useInvoices, useInvoicesReady } from '../../lib/store';
import { inr } from '../../lib/gst';
import { openInvoice, downloadInvoice, generateInvoicePdfBlob } from '../../lib/invoicePdf';
import { deliveryService } from '../../lib/deliveryService';
import { akaiAuditStorage, type AkaiAuditReport } from '../../lib/akaiAuditStorage';
import AkaiAuditReportModal from '../../components/akai/AkaiAuditReportModal';

type FilterT = 'all' | 'approved' | 'rejected';
type MainTabT = 'invoices' | 'akai_audits';

export default function InvoicesPage({ merchant, onStartAkaiAudit }: { merchant: Merchant; onStartAkaiAudit?: () => void }) {
  const requests = useRequests().filter((r) => r.merchantId === merchant.id && r.status !== 'pending');
  const invoices = useInvoices().filter((iv) => iv.merchantId === merchant.id);
  const isReady = useInvoicesReady();
  const invByRequest = new Map<string, Invoice>(invoices.map((iv) => [iv.requestId, iv]));

  const [mainTab, setMainTab] = useState<MainTabT>('invoices');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<FilterT>('all');
  const [sharing, setSharing] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState<string | null>(null);

  // AKAI Historical Audits
  const [auditReports, setAuditReports] = useState<AkaiAuditReport[]>(() => akaiAuditStorage.getAudits(merchant.id));
  const [selectedAuditReport, setSelectedAuditReport] = useState<AkaiAuditReport | null>(null);

  useEffect(() => {
    const handleSaved = () => {
      setAuditReports(akaiAuditStorage.getAudits(merchant.id));
    };
    window.addEventListener('akai-audit-saved', handleSaved);
    return () => window.removeEventListener('akai-audit-saved', handleSaved);
  }, [merchant.id]);

  const handleDispatch = async (inv: Invoice) => {
    setDispatching(inv.id);
    try {
      const del = await deliveryService.createFromInvoice(inv.id, 'Standard Courier', `TRK-${inv.invoiceNo}`);
      toast.success(`🚚 Parcel delivery booked for Invoice #${inv.invoiceNo}! Tracking: ${del.tracking_ref || del.id}`);
    } catch (e: any) {
      toast.error(e.message || 'Could not create delivery record.');
    } finally {
      setDispatching(null);
    }
  };

  const rows = requests
    .filter((r) => (filter === 'all' ? true : r.status === filter))
    .filter((r) => {
      const t = q.toLowerCase();
      return r.customerName.toLowerCase().includes(t)
        || (r.invoiceNo || '').toLowerCase().includes(t)
        || (r.invoiceNumber || '').toLowerCase().includes(t);
    })
    .sort((a, b) => (b.resolvedAt || b.createdAt) - (a.resolvedAt || a.createdAt))
    .map((r) => ({ req: r, inv: invByRequest.get(r.id) }));

  const handleWhatsAppShare = async (inv: Invoice, merchant: Merchant) => {
    setSharing(inv.id);
    try {
      const blob = await generateInvoicePdfBlob(inv, merchant);
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
      {/* Top Header & Main Tab Switcher */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-[var(--font-display)] text-3xl font-bold">Invoice History</h1>
          <p className="text-[var(--color-mist)] mt-1">Download and share generated invoices and inspect verified AKAI business audits.</p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#091224] border border-slate-800">
          <button
            onClick={() => setMainTab('invoices')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
              mainTab === 'invoices'
                ? 'bg-gradient-to-r from-[#f6dd9b] to-[#e9c46a] text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText size={15} /> Invoices ({rows.length})
          </button>
          <button
            onClick={() => setMainTab('akai_audits')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
              mainTab === 'akai_audits'
                ? 'bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-emerald-400 hover:text-emerald-300'
            }`}
          >
            <span>🤖</span> AKAI Audit Reports ({auditReports.length})
          </button>
        </div>
      </div>

      {mainTab === 'akai_audits' ? (
        /* AKAI AUDIT REPORTS TAB */
        <div className="space-y-4">
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#0a1b2a] to-[#071720] border border-emerald-500/30 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 grid place-items-center text-xl shadow-lg shadow-emerald-500/20">
                🤖
              </div>
              <div>
                <h3 className="font-bold text-white text-sm sm:text-base">
                  AKAI Verified Business Audit Logs
                </h3>
                <p className="text-xs text-slate-400">
                  Every live walkthrough audit is deterministically calculated and permanently preserved here.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {auditReports.length > 0 && (
                <button
                  onClick={() => {
                    if (window.confirm('Are you sure you want to clear all historical audit reports?')) {
                      akaiAuditStorage.clearAllAudits(merchant.id);
                      toast.success('All audit reports cleared');
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition"
                  title="Clear all audit logs"
                >
                  <Trash2 size={13} /> Clear All
                </button>
              )}
              {onStartAkaiAudit && (
                <button
                  onClick={onStartAkaiAudit}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 transition shadow-lg shadow-emerald-500/20 active:scale-95"
                >
                  <Sparkles size={15} /> Run New Audit
                </button>
              )}
            </div>
          </div>

          {auditReports.length === 0 ? (
            <div className="depth-card rounded-2xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 grid place-items-center text-2xl mx-auto">
                🤖
              </div>
              <h4 className="font-bold text-white text-base">No Audit Reports Yet</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Run your first AKAI Live Audit to inspect all invoices, customer requests, warehouse stocks, and double-entry accounting books.
              </p>
              {onStartAkaiAudit && (
                <button
                  onClick={onStartAkaiAudit}
                  className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition"
                >
                  <Sparkles size={14} /> Start First Live Audit
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {auditReports.map((report) => (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 sm:p-5 rounded-2xl bg-[#0c1629] border border-slate-800 hover:border-emerald-500/40 transition flex items-center justify-between gap-4 flex-wrap cursor-pointer"
                  onClick={() => setSelectedAuditReport(report)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 grid place-items-center shrink-0">
                      <span className="text-base font-extrabold text-emerald-400 font-[var(--font-display)]">
                        {report.healthScore}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-sm sm:text-base">
                          Audit {report.dateFormatted}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {report.healthGrade} 🟢
                        </span>
                        {report.accounting.isBalanced && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/30 flex items-center gap-1">
                            <Scale size={11} /> Balanced
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-1">
                        ID: {report.id} · Today's Sales: <span className="text-emerald-400 font-semibold">{inr(report.metrics.todaySales)}</span> · Outstanding: <span className="text-amber-400 font-semibold">{inr(report.metrics.outstandingReceivables)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAuditReport(report);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition flex items-center gap-1.5"
                    >
                      <Eye size={14} /> View Report
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        akaiAuditStorage.deleteAudit(merchant.id, report.id);
                        toast.success('Audit report deleted');
                      }}
                      className="w-8 h-8 rounded-xl grid place-items-center bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/10 transition"
                      title="Delete this audit record"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* INVOICES LIST TAB */
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-mist-2)]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, invoice no, or Invoice Number (e.g. AKM-000125-000001)..." className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-aqua)]" />
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl depth-soft">
              {(['all', 'approved', 'rejected'] as FilterT[]).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${filter === f ? 'text-[var(--color-ink)]' : 'text-[var(--color-mist)]'}`} style={filter === f ? { background: 'linear-gradient(135deg,#f6dd9b,#e9c46a)' } : {}}>{f}</button>
              ))}
            </div>
          </div>

          <div className="depth-card rounded-2xl overflow-hidden">
            <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3.5 text-[11px] uppercase tracking-wider text-[var(--color-mist-2)] border-b border-[var(--color-line)]">
              <div className="col-span-2">Invoice No</div><div className="col-span-2">Invoice Number</div><div className="col-span-2">Customer</div><div className="col-span-2">Date</div><div className="col-span-1 text-right">GST</div><div className="col-span-2 text-right">Total</div><div className="col-span-1"></div>
            </div>
            {!isReady ? (
              <div className="p-16 text-center">
                <Loader2 size={28} className="text-[var(--color-aqua)] animate-spin mx-auto mb-3" />
                <p className="text-sm text-[var(--color-mist)]">Loading invoices...</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="p-16 text-center">
                <FileText size={28} className="text-[var(--color-mist-2)] mx-auto mb-3" />
                <p className="text-sm text-[var(--color-mist)]">No invoices found.</p>
              </div>
            ) : null}
            {isReady && rows.map(({ req: r, inv }, i) => (
              <motion.div key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="p-4 md:px-6 md:py-4 border-b border-[var(--color-line)] last:border-0 hover:bg-[rgba(255,255,255,0.02)] transition">
                {/* Desktop Table View (md and above) */}
                <div className="hidden md:grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-2 font-mono text-sm text-[var(--color-gold)] truncate">{r.invoiceNo || '—'}</div>
                  <div className="col-span-2 font-mono text-xs text-[var(--color-aqua)] truncate">{r.invoiceNumber || '—'}</div>
                  <div className="col-span-2 font-medium text-sm truncate">{r.customerName}</div>
                  <div className="col-span-2 text-sm text-[var(--color-mist)]">{new Date(r.resolvedAt || r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</div>
                  <div className="col-span-1 text-right text-sm text-[var(--color-mist)]">{inv ? inr(inv.totalTax) : '—'}</div>
                  <div className="col-span-1 text-right font-semibold text-sm text-[var(--color-ivory)]">{inv ? inr(inv.grandTotal) : '—'}</div>
                  <div className="col-span-2 flex justify-end items-center gap-1.5">
                    {r.status === 'approved' && inv ? (
                      <>
                        {inv.paymentMode === 'credit' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-amber)]/15 text-[var(--color-amber)] shrink-0">PENDING</span>
                        )}
                        {inv.customerAddress && inv.customerAddress !== 'Address Pending' && (
                          <button
                            onClick={() => handleDispatch(inv)}
                            disabled={dispatching === inv.id}
                            title="Dispatch Delivery Parcel"
                            className="w-8 h-8 rounded-lg grid place-items-center depth-soft hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 transition shrink-0"
                          >
                            {dispatching === inv.id ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
                          </button>
                        )}
                        <button onClick={() => openInvoice(inv, merchant)} title="View Invoice" className="w-8 h-8 rounded-lg grid place-items-center depth-soft hover:glow-aqua transition shrink-0"><Eye size={15} className="text-[var(--color-aqua)]" /></button>
                        <button onClick={() => handleWhatsAppShare(inv, merchant)} disabled={sharing === inv.id} title="Share on WhatsApp" className="w-8 h-8 rounded-lg grid place-items-center depth-soft hover:bg-[#25D366]/10 transition shrink-0">
                          {sharing === inv.id ? (
                            <Loader2 size={15} className="text-[#25D366] animate-spin" />
                          ) : (
                            <svg viewBox="0 0 24 24" width={15} height={15} fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                          )}
                        </button>
                        <button onClick={() => downloadInvoice(inv, merchant)} title="Download Invoice" className="w-8 h-8 rounded-lg grid place-items-center depth-soft hover:glow-aqua transition shrink-0"><Download size={15} className="text-[var(--color-aqua)]" /></button>
                      </>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-[var(--color-rose)]"><XCircle size={14} /> Rejected</span>
                    )}
                  </div>
                </div>

                {/* Mobile Card View (< md) */}
                <div className="md:hidden space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-[var(--color-gold)]">{r.invoiceNo || '—'}</span>
                    <span className="font-mono text-xs text-[var(--color-aqua)]">{r.invoiceNumber || '—'}</span>
                  </div>
                  
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-sm text-[var(--color-ivory)]">{r.customerName}</div>
                      <div className="text-xs text-[var(--color-mist-2)] mt-0.5">{new Date(r.resolvedAt || r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-base text-[var(--color-ivory)]">{inv ? inr(inv.grandTotal) : '—'}</div>
                      {inv && inv.totalTax > 0 && (
                        <div className="text-[11px] text-[var(--color-mist-2)]">GST: {inr(inv.totalTax)}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--color-line)]/50">
                    <div className="flex items-center gap-1.5">
                      {inv?.paymentMode === 'credit' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-amber)]/15 text-[var(--color-amber)]">PENDING</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {r.status === 'approved' && inv ? (
                        <>
                          {inv.customerAddress && inv.customerAddress !== 'Address Pending' && (
                            <button
                              onClick={() => handleDispatch(inv)}
                              disabled={dispatching === inv.id}
                              title="Dispatch Delivery Parcel"
                              className="w-8 h-8 rounded-lg grid place-items-center bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 transition shrink-0"
                            >
                              {dispatching === inv.id ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
                            </button>
                          )}
                          <button onClick={() => openInvoice(inv, merchant)} title="View Invoice" className="w-8 h-8 rounded-lg grid place-items-center bg-[rgba(255,255,255,0.05)] hover:glow-aqua transition shrink-0"><Eye size={15} className="text-[var(--color-aqua)]" /></button>
                          <button onClick={() => handleWhatsAppShare(inv, merchant)} disabled={sharing === inv.id} title="Share on WhatsApp" className="w-8 h-8 rounded-lg grid place-items-center bg-[rgba(255,255,255,0.05)] hover:bg-[#25D366]/10 transition shrink-0">
                            {sharing === inv.id ? (
                              <Loader2 size={15} className="text-[#25D366] animate-spin" />
                            ) : (
                              <svg viewBox="0 0 24 24" width={15} height={15} fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                          )}
                        </button>
                          <button onClick={() => downloadInvoice(inv, merchant)} title="Download Invoice" className="w-8 h-8 rounded-lg grid place-items-center depth-soft hover:glow-aqua transition shrink-0"><Download size={15} className="text-[var(--color-aqua)]" /></button>
                        </>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-[var(--color-rose)]"><XCircle size={14} /> Rejected</span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* AKAI Audit Report Modal */}
      {selectedAuditReport && (
        <AkaiAuditReportModal
          report={selectedAuditReport}
          onClose={() => setSelectedAuditReport(null)}
        />
      )}
    </div>
  );
}
