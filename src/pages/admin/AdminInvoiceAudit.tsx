import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, CheckCircle2, Clock, XCircle, MapPin, FileText, Coins, Download, Eye } from 'lucide-react';
import { useRequests, useInvoices, useMerchants } from '../../lib/store';
import { inr } from '../../lib/gst';
import { PageHeader, Badge } from '../../components/ui';
import { Modal } from './AdminKit';
import type { Invoice, Merchant } from '../../lib/types';

export default function AdminInvoiceAudit() {
  const requests = useRequests();
  const invoices = useInvoices();
  const merchants = useMerchants();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Invoice | null>(null);
  const invByReq = new Map(invoices.map((i) => [i.requestId, i]));
  const merchantOf = (id: string): Merchant | undefined => merchants.find((m) => m.id === id);
  const nameOf = (id: string) => merchantOf(id)?.shopName || id;

  const rows = requests
    .filter((r) => r.customerName.toLowerCase().includes(q.toLowerCase()) || (r.invoiceNo || '').toLowerCase().includes(q.toLowerCase()) || nameOf(r.merchantId).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt);

  // deterministic pseudo download-count per invoice id
  const downloadCount = (id: string) => (id.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 9);

  return (
    <div>
      <PageHeader title="Invoice Audit" subtitle="Har request aur generated invoice ka complete audit trail." />
      <div className="relative max-w-md mb-6">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-mist-2)]" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice, merchant, customer..." className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-violet)]" />
      </div>
      <div className="depth-card rounded-2xl overflow-hidden">
        <div className="hidden lg:grid grid-cols-12 gap-3 px-6 py-3.5 text-[11px] uppercase tracking-wider text-[var(--color-mist-2)] border-b border-[var(--color-line)]">
          <div className="col-span-2">Invoice</div><div className="col-span-2">Merchant</div><div className="col-span-2">Customer</div><div className="col-span-2">Supply</div><div className="col-span-2 text-right">Total</div><div className="col-span-2 text-right">Status</div>
        </div>
        {rows.map((r, i) => {
          const inv = invByReq.get(r.id);
          return (
            <motion.div key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} onClick={() => inv && setSel(inv)} className={`grid grid-cols-12 gap-3 px-6 py-4 items-center border-b border-[var(--color-line)] last:border-0 ${inv ? 'cursor-pointer hover:bg-[rgba(255,255,255,0.02)]' : ''} transition`}>
              <div className="col-span-6 lg:col-span-2 font-mono text-sm text-[var(--color-gold)] flex items-center gap-2">{inv && <Eye size={13} className="text-[var(--color-mist-2)]" />}{r.invoiceNo || '—'}</div>
              <div className="col-span-6 lg:col-span-2 text-sm truncate">{nameOf(r.merchantId)}</div>
              <div className="col-span-6 lg:col-span-2 text-sm text-[var(--color-mist)] truncate">{r.customerName}</div>
              <div className="col-span-6 lg:col-span-2 text-xs text-[var(--color-mist-2)] flex items-center gap-1">{inv ? <><MapPin size={11} /> {inv.isInterState ? 'Inter' : 'Intra'}-state</> : '—'}</div>
              <div className="col-span-6 lg:col-span-2 text-right font-semibold text-sm">{inv ? inr(inv.grandTotal) : '—'}</div>
              <div className="col-span-6 lg:col-span-2 flex lg:justify-end">
                {r.status === 'approved' && <Badge tone="emerald"><CheckCircle2 size={11} className="inline mr-1" />Approved</Badge>}
                {r.status === 'pending' && <Badge tone="amber"><Clock size={11} className="inline mr-1" />Pending</Badge>}
                {r.status === 'rejected' && <Badge tone="rose"><XCircle size={11} className="inline mr-1" />Rejected</Badge>}
              </div>
            </motion.div>
          );
        })}
      </div>

      {sel && (() => {
        const m = merchantOf(sel.merchantId);
        return (
          <Modal title={`Invoice ${sel.invoiceNo}`} onClose={() => setSel(null)}>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <div className="depth-soft rounded-xl p-3 text-center"><Coins size={15} className="text-[var(--color-gold)] mx-auto" /><div className="font-bold mt-1">1</div><div className="text-[10px] text-[var(--color-mist-2)] uppercase">Credit Used</div></div>
                <div className="depth-soft rounded-xl p-3 text-center"><Download size={15} className="text-[var(--color-aqua)] mx-auto" /><div className="font-bold mt-1">{downloadCount(sel.id)}</div><div className="text-[10px] text-[var(--color-mist-2)] uppercase">Downloads</div></div>
                <div className="depth-soft rounded-xl p-3 text-center"><FileText size={15} className="text-[var(--color-violet)] mx-auto" /><div className="font-bold mt-1 text-xs">{new Date(sel.invoiceDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div><div className="text-[10px] text-[var(--color-mist-2)] uppercase">PDF Time</div></div>
              </div>

              <div className="depth-soft rounded-xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-mist-2)] mb-1">Seller</div>
                <div className="font-medium">{m?.shopName}</div>
                <div className="text-xs text-[var(--color-mist)]">GSTIN {m?.gstin} · {m?.state}</div>
              </div>
              <div className="depth-soft rounded-xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-mist-2)] mb-1">Buyer</div>
                <div className="font-medium">{sel.customerName}</div>
                <div className="text-xs text-[var(--color-mist)]">{sel.customerAddress}{sel.customerGstin ? ` · GSTIN ${sel.customerGstin}` : ''}</div>
              </div>

              <div className="depth-soft rounded-xl p-4 space-y-1.5">
                <div className="flex justify-between text-[var(--color-mist)]"><span>Taxable</span><span>{inr(sel.taxableValue)}</span></div>
                {sel.isInterState ? (
                  <div className="flex justify-between text-[var(--color-mist)]"><span>IGST</span><span>{inr(sel.igst)}</span></div>
                ) : (
                  <>
                    <div className="flex justify-between text-[var(--color-mist)]"><span>CGST</span><span>{inr(sel.cgst)}</span></div>
                    <div className="flex justify-between text-[var(--color-mist)]"><span>SGST</span><span>{inr(sel.sgst)}</span></div>
                  </>
                )}
                <div className="flex justify-between font-bold pt-2 border-t border-[var(--color-line)]"><span>Grand Total</span><span className="gold-text">{inr(sel.grandTotal)}</span></div>
              </div>
              <div className="text-[11px] text-[var(--color-mist-2)]">Place of Supply: {sel.placeOfSupply} · Branding: {sel.branded ? 'Merchant' : 'AK-LOGIC AI'}</div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
