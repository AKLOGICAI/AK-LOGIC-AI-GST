import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Store, IndianRupee, FileText, Wallet, TrendingUp, Crown, BarChart3, Coins,
  CheckCircle2, Ban, ShieldQuestion, CalendarClock, LifeBuoy, ShieldAlert,
} from 'lucide-react';
import { useMerchants, useInvoices, useTxns, useTickets, useFraudFlags } from '../../lib/store';
import { inr } from '../../lib/gst';
import { daysRemaining, isExpired } from '../../lib/plans';
import { PageHeader } from '../../components/ui';

export default function AdminOverview() {
  const merchants = useMerchants();
  const invoices = useInvoices();
  const txns = useTxns();
  const tickets = useTickets();
  const fraud = useFraudFlags();

  const active = merchants.filter((m) => m.status === 'active' || !m.status).length;
  const suspended = merchants.filter((m) => m.status === 'suspended' || m.status === 'disabled').length;
  const pendingKyc = merchants.filter((m) => m.kyc === 'pending' || !m.kyc).length;
  const creditsUsed = txns.filter((t) => t.credits < 0).reduce((s, t) => s + Math.abs(t.credits), 0);

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const rechargeTxns = txns.filter((t) => t.amount > 0);
  const todayRevenue = rechargeTxns.filter((t) => t.createdAt >= todayStart.getTime()).reduce((s, t) => s + t.amount, 0);
  const monthRevenue = rechargeTxns.filter((t) => t.createdAt >= monthStart.getTime()).reduce((s, t) => s + t.amount, 0);
  const totalRecharge = rechargeTxns.reduce((s, t) => s + t.amount, 0);

  const activeSubs = merchants.filter((m) => !isExpired(m.planExpiresAt) && m.planId !== 'free').length;
  const expiringSubs = merchants.filter((m) => !isExpired(m.planExpiresAt) && daysRemaining(m.planExpiresAt) <= 3).length;
  const pendingTickets = tickets.filter((t) => t.status !== 'resolved').length;
  const highFraud = fraud.filter((f) => f.severity === 'high').length;

  const stats = [
    { label: 'Total Merchants', value: String(merchants.length), icon: Store, c: 'var(--color-violet)', to: '/admin/merchants' },
    { label: 'Active Merchants', value: String(active), icon: CheckCircle2, c: 'var(--color-emerald)', to: '/admin/merchants' },
    { label: 'Suspended', value: String(suspended), icon: Ban, c: 'var(--color-rose)', to: '/admin/merchants' },
    { label: 'Pending KYC', value: String(pendingKyc), icon: ShieldQuestion, c: 'var(--color-amber)', to: '/admin/merchants' },
    { label: 'Invoices Generated', value: String(invoices.length), icon: FileText, c: 'var(--color-aqua)', to: '/admin/invoice-audit' },
    { label: 'PDF Credits Used', value: creditsUsed.toLocaleString('en-IN'), icon: Coins, c: 'var(--color-gold)', to: '/admin/credits' },
    { label: "Today's Revenue", value: inr(todayRevenue), icon: TrendingUp, c: 'var(--color-emerald)', to: '/admin/revenue' },
    { label: 'Monthly Revenue', value: inr(monthRevenue), icon: IndianRupee, c: 'var(--color-gold)', to: '/admin/revenue' },
    { label: 'Total Recharge', value: inr(totalRecharge), icon: Wallet, c: 'var(--color-aqua)', to: '/admin/recharge' },
    { label: 'Active Subscriptions', value: String(activeSubs), icon: Crown, c: 'var(--color-violet)', to: '/admin/subscriptions' },
    { label: 'Expiring Soon (≤3d)', value: String(expiringSubs), icon: CalendarClock, c: 'var(--color-amber)', to: '/admin/subscriptions' },
    { label: 'Pending Tickets', value: String(pendingTickets), icon: LifeBuoy, c: 'var(--color-rose)', to: '/admin/tickets' },
  ];

  const byMerchant = merchants.map((m) => ({ name: m.shopName, rev: invoices.filter((i) => i.merchantId === m.id).reduce((s, i) => s + i.grandTotal, 0) })).sort((a, b) => b.rev - a.rev).slice(0, 6);
  const maxRev = Math.max(...byMerchant.map((b) => b.rev), 1);

  return (
    <div>
      <PageHeader title="Master Dashboard" subtitle="Live command view of the entire AK-LOGIC AI ecosystem." />

      {highFraud > 0 && (
        <Link to="/admin/fraud" className="flex items-center gap-3 depth-card rounded-2xl p-4 mb-5 border-l-4" style={{ borderLeftColor: 'var(--color-rose)' }}>
          <ShieldAlert size={20} className="text-[var(--color-rose)]" />
          <span className="text-sm"><strong>{highFraud} high-severity fraud {highFraud === 1 ? 'alert' : 'alerts'}</strong> need attention.</span>
          <span className="ml-auto text-xs text-[var(--color-violet)] font-medium">Review →</span>
        </Link>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <Link to={s.to} className="block depth-card rounded-2xl p-5 relative overflow-hidden tilt-hover">
              <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full blur-2xl opacity-20" style={{ background: s.c }} />
              <div className="relative">
                <div className="w-10 h-10 rounded-xl grid place-items-center depth-raised" style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}><s.icon size={18} style={{ color: s.c }} /></div>
                <div className="font-[var(--font-display)] text-2xl font-bold mt-3">{s.value}</div>
                <div className="text-xs text-[var(--color-mist)] mt-0.5">{s.label}</div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="depth-card rounded-2xl p-6">
        <h3 className="font-[var(--font-display)] font-semibold flex items-center gap-2 mb-5"><BarChart3 size={18} className="text-[var(--color-violet)]" /> Top Merchants by Revenue</h3>
        <div className="space-y-4">
          {byMerchant.map((b, i) => (
            <div key={b.name}>
              <div className="flex justify-between text-sm mb-1.5"><span>{b.name}</span><span className="font-semibold">{inr(b.rev)}</span></div>
              <div className="h-2.5 rounded-full bg-[var(--color-line)] overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${(b.rev / maxRev) * 100}%` }} transition={{ delay: 0.2 + i * 0.08 }} className="h-full rounded-full" style={{ background: 'linear-gradient(90deg,#9385ff,#38e0c8)' }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
