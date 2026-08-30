import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { LifeBuoy, Send, CheckCircle2, Clock } from 'lucide-react';
import { store, useTickets, useMerchants } from '../../lib/store';
import { PageHeader, Badge, timeAgo } from '../../components/ui';

export default function AdminTickets() {
  const ticketsRaw = useTickets();
  // `.sort()` mutates in place — copy first so we don't mutate the shared
  // store cache that other components/hooks also read from.
  const tickets = useMemo(() => [...ticketsRaw].sort((a, b) => b.createdAt - a.createdAt), [ticketsRaw]);
  const merchants = useMerchants();
  const nameOf = (id: string) => merchants.find((m) => m.id === id)?.shopName || id;
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');

  const rows = useMemo(() => tickets.filter((t) => filter === 'all' ? true : filter === 'resolved' ? t.status === 'resolved' : t.status !== 'resolved'), [tickets, filter]);
  const open = useMemo(() => tickets.filter((t) => t.status !== 'resolved').length, [tickets]);

  return (
    <div>
      <PageHeader title="Support Tickets" subtitle={`${open} open · ${tickets.length} total tickets across all merchants.`} />
      <div className="flex items-center gap-1 p-1 rounded-xl depth-soft w-fit mb-6">
        {(['all', 'open', 'resolved'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${filter === f ? 'text-white' : 'text-[var(--color-mist)]'}`} style={filter === f ? { background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' } : {}}>{f}</button>
        ))}
      </div>
      <div className="space-y-3">
        {rows.map((t, i) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="depth-card rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div><div className="font-semibold">{t.subject}</div><div className="text-[11px] text-[var(--color-mist-2)] mt-0.5">{nameOf(t.merchantId)} · {t.category} · {timeAgo(t.createdAt)}</div></div>
              {t.status === 'resolved' ? <Badge tone="emerald"><CheckCircle2 size={11} className="inline mr-1" />Resolved</Badge> : <Badge tone="amber"><Clock size={11} className="inline mr-1" />Open</Badge>}
            </div>
            <p className="text-sm text-[var(--color-mist)] mt-2">{t.message}</p>
            {t.reply && <div className="mt-3 p-3 rounded-xl bg-[rgba(124,108,245,0.08)] text-sm"><span className="text-[var(--color-violet)] font-medium">Admin: </span>{t.reply}</div>}
            {t.status !== 'resolved' && (
              <div className="mt-3 flex gap-2">
                <input value={replies[t.id] || ''} onChange={(e) => setReplies((r) => ({ ...r, [t.id]: e.target.value }))} placeholder="Type a reply & resolve..." className="flex-1 rounded-xl bg-[#0c1322] border border-[var(--color-line)] px-4 py-2.5 text-sm outline-none focus:border-[var(--color-violet)]" />
                <button onClick={() => { if (replies[t.id]?.trim()) store.admin.replyTicket(t.id, replies[t.id], 'resolved'); }} className="px-4 py-2.5 rounded-xl font-medium text-white flex items-center gap-1.5" style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}><Send size={15} /> Reply & Resolve</button>
              </div>
            )}
          </motion.div>
        ))}
        {rows.length === 0 && <div className="depth-card rounded-2xl p-12 text-center"><LifeBuoy size={32} className="text-[var(--color-mist-2)] mx-auto mb-3" /><p className="text-sm text-[var(--color-mist)]">No tickets in this filter.</p></div>}
      </div>
    </div>
  );
}
