import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ScrollText, Search, Gift, CalendarClock, Ban, CheckCircle2, RefreshCw, ShieldCheck, Coins, Settings2 } from 'lucide-react';
import { useAuditLogs } from '../../lib/store';
import { PageHeader, timeAgo, EmptyState } from '../../components/ui';

const ICON: Record<string, typeof Gift> = {
  'Gift PDF Credits': Gift, 'Deduct PDF Credits': Coins, 'Grant Validity': CalendarClock,
  'Suspend Merchant': Ban, 'Reactivate Merchant': CheckCircle2, 'Disable Merchant': Ban,
  'Change Plan': RefreshCw, 'Reset Expiry': RefreshCw, 'Enable Custom Branding': ShieldCheck,
  'Disable Custom Branding': ShieldCheck,
};

export default function AdminAuditLogs() {
  const logsRaw = useAuditLogs();
  // `.sort()` mutates in place — copy first so we don't mutate the shared
  // store cache that other components/hooks also read from.
  const logs = useMemo(() => [...logsRaw].sort((a, b) => b.createdAt - a.createdAt), [logsRaw]);
  const [q, setQ] = useState('');
  const rows = useMemo(() => logs.filter((l) => l.action.toLowerCase().includes(q.toLowerCase()) || (l.targetMerchantName || '').toLowerCase().includes(q.toLowerCase()) || l.reason.toLowerCase().includes(q.toLowerCase())), [logs, q]);

  return (
    <div>
      <PageHeader title="Security & Audit Logs" subtitle="Har sensitive admin action ka tamper-proof record." />
      <div className="relative max-w-md mb-6">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-mist-2)]" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search action, merchant, reason..." className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-violet)]" />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<ScrollText size={28} />} title="No audit logs" body="Admin actions will be recorded here." />
      ) : (
        <div className="space-y-2">
          {rows.map((l, i) => {
            const Icon = ICON[l.action] || Settings2;
            return (
              <motion.div key={l.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }} className="depth-card rounded-2xl p-4 flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl grid place-items-center depth-raised shrink-0" style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}><Icon size={19} className="text-[var(--color-violet)]" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{l.action}</span>
                    {l.meta && <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[rgba(124,108,245,0.12)] text-[var(--color-violet)]">{l.meta}</span>}
                  </div>
                  <p className="text-sm text-[var(--color-mist)] mt-0.5">{l.reason}</p>
                  <div className="text-[11px] text-[var(--color-mist-2)] mt-1">
                    {l.adminName}{l.targetMerchantName ? ` → ${l.targetMerchantName}` : ''} · {new Date(l.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {timeAgo(l.createdAt)}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
