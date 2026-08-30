import { useState } from 'react';
import { motion } from 'framer-motion';
import { Coins, Gift, Search, ArrowDownLeft, ArrowUpRight, Settings2 } from 'lucide-react';
import { useMerchants, useTxns } from '../../lib/store';
import { PageHeader, timeAgo } from '../../components/ui';
import { MerchantActionModal } from './AdminKit';
import type { Merchant } from '../../lib/types';

export default function AdminCredits() {
  const merchants = useMerchants();
  const txns = useTxns().filter((t) => t.credits !== 0).sort((a, b) => b.createdAt - a.createdAt);
  const [q, setQ] = useState('');
  const [active, setActive] = useState<Merchant | null>(null);
  const nameOf = (id: string) => merchants.find((m) => m.id === id)?.shopName || id;
  const live = active ? merchants.find((m) => m.id === active.id) || null : null;

  const gifted = txns.filter((t) => t.credits > 0 && t.reason.toLowerCase().includes('admin')).reduce((s, t) => s + t.credits, 0);
  const consumed = txns.filter((t) => t.credits < 0).reduce((s, t) => s + Math.abs(t.credits), 0);
  const totalCredits = merchants.reduce((s, m) => s + m.pdfCredits, 0);

  const rows = merchants.filter((m) => {
    const t = q.toLowerCase();
    const shopName = m.shopName || '';
    const phone = m.phone || '';
    return shopName.toLowerCase().includes(t) || phone.includes(q);
  });

  return (
    <div>
      <PageHeader title="PDF Credit Control" subtitle="Gift, deduct, and track every merchant's PDF credits." />
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="depth-card rounded-2xl p-5"><Coins size={20} className="text-[var(--color-gold)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">{totalCredits.toLocaleString('en-IN')}</div><div className="text-sm text-[var(--color-mist)]">Credits in Circulation</div></div>
        <div className="depth-card rounded-2xl p-5"><Gift size={20} className="text-[var(--color-emerald)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">{gifted.toLocaleString('en-IN')}</div><div className="text-sm text-[var(--color-mist)]">Admin Gifted</div></div>
        <div className="depth-card rounded-2xl p-5"><ArrowUpRight size={20} className="text-[var(--color-rose)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">{consumed.toLocaleString('en-IN')}</div><div className="text-sm text-[var(--color-mist)]">Credits Consumed</div></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold mb-4">Adjust Merchant Credits</h3>
          <div className="relative mb-3"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-mist-2)]" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchant..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-violet)]" /></div>
          <div className="space-y-2 max-h-96 overflow-y-auto no-scrollbar">
            {rows.map((m) => (
              <div key={m.id} className="flex items-center justify-between depth-soft rounded-xl px-4 py-2.5">
                <div><div className="text-sm font-medium">{m.shopName}</div><div className="text-[11px] text-[var(--color-mist-2)]">{m.pdfCredits} credits · {m.planName}</div></div>
                <button onClick={() => setActive(m)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}><Settings2 size={13} /> Adjust</button>
              </div>
            ))}
          </div>
        </div>
        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold mb-4">Credit Transaction History</h3>
          <div className="space-y-2 max-h-[28rem] overflow-y-auto no-scrollbar">
            {txns.map((t) => (
              <motion.div key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between depth-soft rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-3 min-w-0"><div className="w-8 h-8 rounded-lg grid place-items-center depth-raised shrink-0" style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}>{t.credits > 0 ? <ArrowDownLeft size={15} className="text-[var(--color-emerald)]" /> : <ArrowUpRight size={15} className="text-[var(--color-rose)]" />}</div><div className="min-w-0"><div className="text-sm truncate">{nameOf(t.merchantId)}</div><div className="text-[11px] text-[var(--color-mist-2)] truncate">{t.reason} · {timeAgo(t.createdAt)}</div></div></div>
                <span className="text-sm font-semibold shrink-0" style={{ color: t.credits > 0 ? 'var(--color-emerald)' : 'var(--color-rose)' }}>{t.credits > 0 ? '+' : ''}{t.credits}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
      {live && <MerchantActionModal merchant={live} onClose={() => setActive(null)} />}
    </div>
  );
}
