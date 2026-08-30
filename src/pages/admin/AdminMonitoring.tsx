import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, MonitorSmartphone, Globe, Clock, FileText, Coins, LifeBuoy, Wallet } from 'lucide-react';
import { useMerchants, useInvoices, useTickets, useTxns, useLoginActivity } from '../../lib/store';
import { daysRemaining, isExpired } from '../../lib/plans';
import { PageHeader, timeAgo } from '../../components/ui';
import { StatusBadge, KycBadge } from './AdminKit';

export default function AdminMonitoring() {
  const merchants = useMerchants();
  const invoices = useInvoices();
  const tickets = useTickets();
  const txns = useTxns();
  const activity = useLoginActivity();
  const [sel, setSel] = useState<string>(merchants[0]?.id || '');
  const [q, setQ] = useState('');

  const rows = merchants.filter((m) => {
    const t = q.toLowerCase();
    const shopName = m.shopName || '';
    const phone = m.phone || '';
    return shopName.toLowerCase().includes(t) || phone.includes(q);
  });
  const m = merchants.find((x) => x.id === sel) || merchants[0];
  if (!m) return null;

  const inv = invoices.filter((iv) => iv.merchantId === m.id);
  const tk = tickets.filter((t) => t.merchantId === m.id);
  const tx = txns.filter((t) => t.merchantId === m.id).sort((a, b) => b.createdAt - a.createdAt);
  const logs = activity.filter((l) => l.merchantId === m.id).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div>
      <PageHeader title="Merchant Monitoring" subtitle="Login history, device info, IP trail aur activity — har merchant ke liye." />
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="depth-card rounded-2xl p-4 lg:max-h-[42rem] overflow-y-auto no-scrollbar">
          <div className="relative mb-3"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-mist-2)]" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-violet)]" /></div>
          <div className="space-y-1.5">
            {rows.map((x) => (
              <button key={x.id} onClick={() => setSel(x.id)} className={`w-full text-left px-3 py-2.5 rounded-xl transition ${sel === x.id ? 'text-white' : 'text-[var(--color-mist)] hover:bg-[rgba(255,255,255,0.03)]'}`} style={sel === x.id ? { background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' } : {}}>
                <div className="text-sm font-medium truncate">{x.shopName}</div>
                <div className="text-[11px] opacity-70">{x.phone}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-5">
          <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="depth-card rounded-2xl p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-xl grid place-items-center text-[var(--color-ink)] font-bold depth-raised" style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}>{(m.shopName || 'M').charAt(0)}</div><div><div className="font-semibold">{m.shopName}</div><div className="text-xs text-[var(--color-mist-2)]">{m.ownerName} · {m.id}</div></div></div>
              <div className="flex flex-col items-end gap-1.5"><StatusBadge status={m.status} /><KycBadge kyc={m.kyc} /></div>
            </div>
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="depth-soft rounded-xl p-3"><FileText size={15} className="text-[var(--color-aqua)]" /><div className="font-bold mt-1">{inv.length}</div><div className="text-[10px] text-[var(--color-mist-2)] uppercase">Invoices</div></div>
              <div className="depth-soft rounded-xl p-3"><Coins size={15} className="text-[var(--color-gold)]" /><div className="font-bold mt-1">{m.pdfCredits}</div><div className="text-[10px] text-[var(--color-mist-2)] uppercase">Credits</div></div>
              <div className="depth-soft rounded-xl p-3"><LifeBuoy size={15} className="text-[var(--color-rose)]" /><div className="font-bold mt-1">{tk.length}</div><div className="text-[10px] text-[var(--color-mist-2)] uppercase">Tickets</div></div>
              <div className="depth-soft rounded-xl p-3"><Clock size={15} className="text-[var(--color-violet)]" /><div className="font-bold mt-1">{isExpired(m.planExpiresAt) ? 'Exp' : daysRemaining(m.planExpiresAt) + 'd'}</div><div className="text-[10px] text-[var(--color-mist-2)] uppercase">Validity</div></div>
            </div>
            <div className="mt-4 grid sm:grid-cols-2 gap-2 text-xs text-[var(--color-mist)]">
              <div className="flex items-center gap-2"><Clock size={13} className="text-[var(--color-aqua)]" /> Last login: {m.lastLoginAt ? timeAgo(m.lastLoginAt) : 'never'}</div>
              <div className="flex items-center gap-2"><Globe size={13} className="text-[var(--color-aqua)]" /> IP: {m.lastIp || '—'}</div>
              <div className="flex items-center gap-2"><MonitorSmartphone size={13} className="text-[var(--color-aqua)]" /> {m.lastDevice || '—'}</div>
              <div className="flex items-center gap-2"><Wallet size={13} className="text-[var(--color-aqua)]" /> Plan: {m.planName}</div>
            </div>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-5">
            <div className="depth-card rounded-2xl p-5">
              <h3 className="font-[var(--font-display)] font-semibold text-sm mb-3 flex items-center gap-2"><Globe size={15} className="text-[var(--color-violet)]" /> Login & IP History</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
                {logs.map((l) => (
                  <div key={l.id} className="flex items-center justify-between depth-soft rounded-lg px-3 py-2 text-xs"><div><div className="font-mono">{l.ip}</div><div className="text-[var(--color-mist-2)]">{l.device} · {timeAgo(l.createdAt)}</div></div><span className={l.success ? 'text-[var(--color-emerald)]' : 'text-[var(--color-rose)]'}>{l.success ? 'OK' : 'Failed'}</span></div>
                ))}
                {logs.length === 0 && <p className="text-xs text-[var(--color-mist-2)]">No login records.</p>}
              </div>
            </div>
            <div className="depth-card rounded-2xl p-5">
              <h3 className="font-[var(--font-display)] font-semibold text-sm mb-3 flex items-center gap-2"><Wallet size={15} className="text-[var(--color-gold)]" /> Recharge History</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
                {tx.map((t) => (
                  <div key={t.id} className="flex items-center justify-between depth-soft rounded-lg px-3 py-2 text-xs"><div className="truncate pr-2"><div className="truncate">{t.reason}</div><div className="text-[var(--color-mist-2)]">{timeAgo(t.createdAt)}</div></div><span className="whitespace-nowrap">{t.amount > 0 ? `₹${t.amount}` : ''}{t.credits !== 0 ? ` ${t.credits > 0 ? '+' : ''}${t.credits}c` : ''}</span></div>
                ))}
                {tx.length === 0 && <p className="text-xs text-[var(--color-mist-2)]">No recharge records.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
