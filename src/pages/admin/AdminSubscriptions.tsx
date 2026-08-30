import { useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, Crown, Settings2, AlertTriangle } from 'lucide-react';
import { useMerchants } from '../../lib/store';
import { daysRemaining, isExpired } from '../../lib/plans';
import { PageHeader, Badge } from '../../components/ui';
import { MerchantActionModal } from './AdminKit';
import type { Merchant } from '../../lib/types';

type Filter = 'all' | 'active' | 'expiring' | 'expired';

export default function AdminSubscriptions() {
  const merchants = useMerchants();
  const [filter, setFilter] = useState<Filter>('all');
  const [active, setActive] = useState<Merchant | null>(null);
  const live = active ? merchants.find((m) => m.id === active.id) || null : null;

  const rows = merchants.filter((m) => {
    const exp = isExpired(m.planExpiresAt);
    const dr = daysRemaining(m.planExpiresAt);
    if (filter === 'active') return !exp;
    if (filter === 'expiring') return !exp && dr <= 3;
    if (filter === 'expired') return exp;
    return true;
  }).sort((a, b) => a.planExpiresAt - b.planExpiresAt);

  const activeCount = merchants.filter((m) => !isExpired(m.planExpiresAt) && m.planId !== 'free').length;
  const expiringCount = merchants.filter((m) => !isExpired(m.planExpiresAt) && daysRemaining(m.planExpiresAt) <= 3).length;
  const brandedCount = merchants.filter((m) => m.customBranding).length;

  return (
    <div>
      <PageHeader title="Subscription Management" subtitle="Grant validity, change plans, and control branding." />
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="depth-card rounded-2xl p-5"><Crown size={20} className="text-[var(--color-violet)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">{activeCount}</div><div className="text-sm text-[var(--color-mist)]">Active Subscriptions</div></div>
        <div className="depth-card rounded-2xl p-5"><AlertTriangle size={20} className="text-[var(--color-amber)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">{expiringCount}</div><div className="text-sm text-[var(--color-mist)]">Expiring (≤3 days)</div></div>
        <div className="depth-card rounded-2xl p-5"><CalendarClock size={20} className="text-[var(--color-aqua)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">{brandedCount}</div><div className="text-sm text-[var(--color-mist)]">Custom Branding On</div></div>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-xl depth-soft w-fit mb-5">
        {(['all', 'active', 'expiring', 'expired'] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${filter === f ? 'text-white' : 'text-[var(--color-mist)]'}`} style={filter === f ? { background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' } : {}}>{f}</button>
        ))}
      </div>

      <div className="depth-card rounded-2xl overflow-hidden">
        <div className="hidden lg:grid grid-cols-12 gap-3 px-6 py-3.5 text-[11px] uppercase tracking-wider text-[var(--color-mist-2)] border-b border-[var(--color-line)]">
          <div className="col-span-3">Merchant</div><div className="col-span-2">Plan</div><div className="col-span-2">Expiry</div><div className="col-span-2">Days Left</div><div className="col-span-1">Branding</div><div className="col-span-2 text-right">Action</div>
        </div>
        {rows.map((m, i) => {
          const exp = isExpired(m.planExpiresAt);
          const dr = daysRemaining(m.planExpiresAt);
          return (
            <motion.div key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="grid grid-cols-12 gap-3 px-6 py-4 items-center border-b border-[var(--color-line)] last:border-0">
              <div className="col-span-6 lg:col-span-3"><div className="font-medium text-sm">{m.shopName}</div><div className="text-[11px] text-[var(--color-mist-2)] lg:hidden">{m.planName}</div></div>
              <div className="hidden lg:block col-span-2 text-sm text-[var(--color-mist)]">{m.planName}</div>
              <div className="hidden lg:block col-span-2 text-sm text-[var(--color-mist)]">{m.planExpiresAt ? new Date(m.planExpiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}</div>
              <div className="col-span-3 lg:col-span-2">{exp ? <Badge tone="rose">Expired</Badge> : dr <= 3 ? <Badge tone="amber">{dr}d left</Badge> : <Badge tone="emerald">{dr}d left</Badge>}</div>
              <div className="hidden lg:block col-span-1">{m.customBranding ? <span className="text-[var(--color-aqua)] text-xs">Custom</span> : <span className="text-[var(--color-mist-2)] text-xs">AK</span>}</div>
              <div className="col-span-3 lg:col-span-2 flex justify-end"><button onClick={() => setActive(m)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}><Settings2 size={13} /> Manage</button></div>
            </motion.div>
          );
        })}
      </div>
      {live && <MerchantActionModal merchant={live} onClose={() => setActive(null)} />}
    </div>
  );
}
