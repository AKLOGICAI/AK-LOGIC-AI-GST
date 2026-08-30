import { motion } from 'framer-motion';
import { Bell, CheckCircle2, XCircle, Inbox, Wallet, Info, AlertTriangle, CheckCheck } from 'lucide-react';
import type { Merchant } from '../../lib/types';
import { store, useNotifications } from '../../lib/store';
import { PageHeader, GhostButton, EmptyState, timeAgo } from '../../components/ui';

const ICONS: Record<string, { icon: typeof Bell; color: string }> = {
  request: { icon: Inbox, color: 'var(--color-amber)' },
  approved: { icon: CheckCircle2, color: 'var(--color-emerald)' },
  rejected: { icon: XCircle, color: 'var(--color-rose)' },
  recharge: { icon: Wallet, color: 'var(--color-aqua)' },
  system: { icon: Info, color: 'var(--color-violet)' },
  alert: { icon: AlertTriangle, color: 'var(--color-rose)' },
};

export default function NotificationsPage({ merchant }: { merchant: Merchant }) {
  const notifs = useNotifications().filter((n) => n.merchantId === merchant.id).sort((a, b) => b.createdAt - a.createdAt);
  const unread = notifs.filter((n) => !n.read).length;

  return (
    <div>
      <PageHeader title="Notifications" subtitle={`${unread} unread of ${notifs.length} total`} action={unread > 0 ? <GhostButton onClick={() => store.markAllNotifRead(merchant.id)}><CheckCheck size={16} /> Mark all read</GhostButton> : undefined} />
      {notifs.length === 0 ? (
        <EmptyState icon={<Bell size={28} />} title="No notifications" body="New requests and updates will appear here." />
      ) : (
        <div className="space-y-2">
          {notifs.map((n, i) => {
            const conf = ICONS[n.type] || ICONS.system;
            const Icon = conf.icon;
            return (
              <motion.button key={n.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} onClick={() => store.markNotifRead(n.id)} className={`w-full text-left flex gap-4 p-4 rounded-2xl transition ${n.read ? 'depth-soft' : 'depth-card'} hover:scale-[1.005]`}>
                <div className="w-11 h-11 rounded-xl grid place-items-center depth-raised shrink-0" style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}><Icon size={20} style={{ color: conf.color }} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="font-semibold text-sm">{n.title}</span>{!n.read && <span className="w-2 h-2 rounded-full bg-[var(--color-rose)]" />}</div>
                  <p className="text-sm text-[var(--color-mist)] mt-0.5">{n.body}</p>
                  <div className="text-[11px] text-[var(--color-mist-2)] mt-1">{timeAgo(n.createdAt)}</div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
