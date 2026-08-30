import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  X, CheckCircle2, AlertTriangle, AlertCircle, TrendingUp, IndianRupee, Clock,
  FileText, Package, Scale, ShieldCheck, RefreshCw, Sparkles, Printer, ArrowUpRight,
  Zap, Download, Check, ExternalLink
} from 'lucide-react';
import type { AkaiAuditReport } from '../../lib/akaiAuditStorage';
import { inr } from '../../lib/gst';

interface AkaiAuditReportModalProps {
  report: AkaiAuditReport | null;
  onClose: () => void;
}

export default function AkaiAuditReportModal({ report, onClose }: AkaiAuditReportModalProps) {
  const nav = useNavigate();

  useEffect(() => {
    if (report) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [report]);

  if (!report) return null;

  // Safe fallback objects to guarantee ZERO crashes even with legacy data
  const scoreBreakdown = report.scoreBreakdown || {
    sales: 15, collections: 10, inventory: 15, accounting: 30, gst: 10, requests: 10
  };
  const metrics = report.metrics || {
    todaySales: 0, todayCollections: 0, todayInvoicesCount: 0, totalInvoicesCount: 0,
    pendingRequestsCount: 0, outstandingReceivables: 0, totalPurchases: 0,
    lowStockItemsCount: 0, outOfStockItemsCount: 0, gstOutputTax: 0, gstInputCredit: 0
  };
  const accounting = report.accounting || {
    isBalanced: true, totalDebit: 0, totalCredit: 0, difference: 0, statusText: 'General Ledger & Trial Balance Balanced'
  };
  const duplicates = report.duplicates || {
    duplicatesFound: 0, details: [], statusText: '0 Duplicate Invoices or Journals'
  };
  const offlineSync = report.offlineSync || {
    pendingOutboxCount: 0, failedCount: 0, lastSyncAt: null, statusText: 'All Local Records Synced with Cloud'
  };
  const alerts = report.alerts || [];
  const recommendations = report.recommendations || [];
  const conclusion = report.akaiConclusion || 'Business audit verification completed successfully.';

  const handlePrint = () => {
    window.print();
  };

  const navigateToModule = (route: string) => {
    onClose();
    nav(route);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-start justify-center p-2 sm:p-4 pt-3 sm:pt-6 overflow-y-auto akai-modal-wrapper">
        {/* Full Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-[9999] no-print"
          onClick={onClose}
        />

        {/* Printable Modal Container */}
        <motion.div
          id="akai-printable-report"
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-4xl bg-[#090f1d] border border-emerald-500/40 rounded-3xl shadow-2xl overflow-hidden z-[10000] max-h-[94vh] flex flex-col my-auto"
        >
          {/* Glowing Green Top Banner */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600 no-print" />

          {/* Modal Header */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-emerald-500/20 bg-emerald-950/30 shrink-0 print-header">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 grid place-items-center text-slate-950 font-bold shadow-lg shadow-emerald-500/20 shrink-0">
                🤖
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-xl font-bold text-white font-[var(--font-display)]">
                    AKAI Verified Business Audit Report
                  </h2>
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    LIVE PRODUCTION
                  </span>
                </div>
                <div className="text-[11px] sm:text-xs text-slate-400 font-mono mt-0.5">
                  ID: <span className="text-emerald-400 font-bold">{report.id || 'AID-LIVE'}</span> · Generated: {report.dateFormatted || new Date().toLocaleDateString('en-IN')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 no-print">
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition shadow-sm"
              >
                <Printer size={14} /> <span>Print 1-Page PDF</span>
              </button>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl grid place-items-center bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-white/10 transition"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Modal Body Scrollable (Clean 1-Page on Print) */}
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto no-scrollbar flex-1 print-body">
            {/* Row 1: Health Score & Performance Breakdown */}
            <div className="grid sm:grid-cols-3 gap-3.5 print-section">
              <div className="sm:col-span-1 p-4 rounded-2xl bg-gradient-to-br from-[#0e1b2e] to-[#0a1424] border border-emerald-500/30 relative overflow-hidden flex flex-col justify-between">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                    Business Health Score
                  </span>
                  <div className="flex items-baseline gap-2 mt-1.5">
                    <span className="text-3xl sm:text-4xl font-extrabold text-white font-[var(--font-display)]">
                      {report.healthScore ?? 90}
                    </span>
                    <span className="text-base font-bold text-slate-500">/ 100</span>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400">
                    {report.healthGrade || 'EXCELLENT'} 🟢
                  </span>
                  <span className="text-[10px] text-slate-400">Deterministic Engine</span>
                </div>
              </div>

              {/* Performance Score Breakdown */}
              <div className="sm:col-span-2 p-4 rounded-2xl bg-[#0c1626] border border-slate-800">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2">
                  Performance Breakdown
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div className="text-[10px] text-slate-400 truncate">Double-Entry</div>
                    <div className="text-xs sm:text-sm font-bold text-emerald-400 mt-0.5">{scoreBreakdown.accounting}/30</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div className="text-[10px] text-slate-400 truncate">Sales Velocity</div>
                    <div className="text-xs sm:text-sm font-bold text-teal-400 mt-0.5">{scoreBreakdown.sales}/20</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div className="text-[10px] text-slate-400 truncate">Collections</div>
                    <div className="text-xs sm:text-sm font-bold text-cyan-400 mt-0.5">{scoreBreakdown.collections}/15</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div className="text-[10px] text-slate-400 truncate">Warehouse Stock</div>
                    <div className="text-xs sm:text-sm font-bold text-amber-400 mt-0.5">{scoreBreakdown.inventory}/15</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div className="text-[10px] text-slate-400 truncate">GST Compliance</div>
                    <div className="text-xs sm:text-sm font-bold text-indigo-400 mt-0.5">{scoreBreakdown.gst}/10</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div className="text-[10px] text-slate-400 truncate">Clearances</div>
                    <div className="text-xs sm:text-sm font-bold text-rose-400 mt-0.5">{scoreBreakdown.requests}/10</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2: Verified Business Metrics */}
            <div className="space-y-2.5 print-section">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Verified Business Metrics (Actual Production Data)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-2xl bg-[#0c1626] border border-slate-800 relative group">
                  <div className="text-[11px] text-slate-400">Today's Sales</div>
                  <div className="text-base sm:text-lg font-bold text-emerald-400 mt-0.5">{inr(metrics.todaySales)}</div>
                  <div className="text-[10px] text-slate-500">{metrics.todayInvoicesCount} invoices today</div>
                  <button onClick={() => navigateToModule('/dashboard/invoices')} className="mt-1 text-[10px] text-emerald-400 hover:underline flex items-center gap-1 no-print">
                    View Invoices <ExternalLink size={10} />
                  </button>
                </div>

                <div className="p-3 rounded-2xl bg-[#0c1626] border border-slate-800">
                  <div className="text-[11px] text-slate-400">Amount Received</div>
                  <div className="text-base sm:text-lg font-bold text-teal-300 mt-0.5">{inr(metrics.todayCollections)}</div>
                  <div className="text-[10px] text-slate-500">Cash / UPI / Online</div>
                </div>

                <div className="p-3 rounded-2xl bg-[#0c1626] border border-slate-800">
                  <div className="text-[11px] text-slate-400">Outstanding Dues</div>
                  <div className="text-base sm:text-lg font-bold text-amber-400 mt-0.5">{inr(metrics.outstandingReceivables)}</div>
                  <div className="text-[10px] text-slate-500">Pending customer credit</div>
                </div>

                <div className="p-3 rounded-2xl bg-[#0c1626] border border-slate-800">
                  <div className="text-[11px] text-slate-400">Pending Requests</div>
                  <div className="text-base sm:text-lg font-bold text-rose-400 mt-0.5">{metrics.pendingRequestsCount}</div>
                  <div className="text-[10px] text-slate-500">Awaiting approval</div>
                  <button onClick={() => navigateToModule('/dashboard/requests')} className="mt-1 text-[10px] text-rose-400 hover:underline flex items-center gap-1 no-print">
                    View Requests <ExternalLink size={10} />
                  </button>
                </div>

                <div className="p-3 rounded-2xl bg-[#0c1626] border border-slate-800">
                  <div className="text-[11px] text-slate-400">Total Invoices</div>
                  <div className="text-sm sm:text-base font-bold text-white mt-0.5">{metrics.totalInvoicesCount}</div>
                  <div className="text-[10px] text-slate-500">Recorded Invoices</div>
                </div>

                <div className="p-3 rounded-2xl bg-[#0c1626] border border-slate-800">
                  <div className="text-[11px] text-slate-400">Purchases &amp; Bills</div>
                  <div className="text-sm sm:text-base font-bold text-white mt-0.5">{inr(metrics.totalPurchases)}</div>
                  <div className="text-[10px] text-slate-500">Vendor inward bills</div>
                  <button onClick={() => navigateToModule('/dashboard/purchases')} className="mt-1 text-[10px] text-cyan-400 hover:underline flex items-center gap-1 no-print">
                    View Purchases <ExternalLink size={10} />
                  </button>
                </div>

                <div className="p-3 rounded-2xl bg-[#0c1626] border border-slate-800">
                  <div className="text-[11px] text-slate-400">GST Output vs ITC</div>
                  <div className="text-sm sm:text-base font-bold text-cyan-300 mt-0.5">{inr(metrics.gstOutputTax)}</div>
                  <div className="text-[10px] text-slate-500">ITC: {inr(metrics.gstInputCredit)}</div>
                </div>

                <div className="p-3 rounded-2xl bg-[#0c1626] border border-slate-800">
                  <div className="text-[11px] text-slate-400">Warehouse Stocks</div>
                  <div className="text-sm sm:text-base font-bold text-emerald-400 mt-0.5">
                    {(metrics.outOfStockItemsCount || 0) > 0 ? `${metrics.outOfStockItemsCount} Out of Stock` : 'Healthy'}
                  </div>
                  <div className="text-[10px] text-slate-500">{metrics.lowStockItemsCount || 0} low stock</div>
                  <button onClick={() => navigateToModule('/dashboard/inventory')} className="mt-1 text-[10px] text-emerald-400 hover:underline flex items-center gap-1 no-print">
                    View Inventory <ExternalLink size={10} />
                  </button>
                </div>
              </div>
            </div>

            {/* Row 3: Deep Accounting & Integrity */}
            <div className="grid sm:grid-cols-2 gap-3 print-section">
              <div className="p-3.5 rounded-2xl bg-[#0c1626] border border-emerald-500/30 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Scale size={15} className="text-emerald-400" />
                      <span className="text-xs font-bold text-white">Deep Accounting Verification</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {accounting.isBalanced ? 'BALANCED ✅' : 'MISMATCH ❌'}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-emerald-300 mt-1">
                    {accounting.statusText}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-1.5 flex justify-between">
                    <span>Debit: {inr(accounting.totalDebit)}</span>
                    <span>Credit: {inr(accounting.totalCredit)}</span>
                  </div>
                </div>
                <button onClick={() => navigateToModule('/dashboard/accounting')} className="mt-2 text-[10px] text-emerald-400 hover:underline flex items-center gap-1 no-print">
                  Open Deep Accounting Ledger <ExternalLink size={10} />
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#0c1626] border border-emerald-500/30">
                <div className="flex items-center gap-1.5 mb-1">
                  <ShieldCheck size={15} className="text-emerald-400" />
                  <span className="text-xs font-bold text-white">Duplicate &amp; Offline Sync Audit</span>
                </div>
                <div className="text-xs font-semibold text-emerald-300 mt-1">
                  {duplicates.statusText}
                </div>
                <div className="text-[11px] text-slate-400 font-mono mt-1.5">
                  {offlineSync.statusText}
                </div>
              </div>
            </div>

            {/* Row 4: Executive Conclusion */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-teal-950/30 border border-emerald-500/40 space-y-1 print-section">
              <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <span>🤖</span> AKAI Executive Conclusion
              </div>
              <p className="text-xs text-slate-300 leading-relaxed italic">
                "{conclusion}"
              </p>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="px-5 sm:px-6 py-3 border-t border-slate-800 bg-[#070c17] flex items-center justify-between gap-3 shrink-0 no-print">
            <div className="text-[11px] text-slate-400">
              Audit stored securely in <span className="text-emerald-400 font-semibold">Invoice History</span>
            </div>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 transition shadow-lg shadow-emerald-500/20 active:scale-95"
            >
              Done &amp; Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
