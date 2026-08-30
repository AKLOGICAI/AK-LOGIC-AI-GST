import { motion } from 'framer-motion';
import { Activity, Database, Server, Cpu, CheckCircle2, Cloud, Lock } from 'lucide-react';
import { useMerchants, useRequests, useInvoices, useNotifications } from '../../lib/store';
import { PageHeader, Badge } from '../../components/ui';

export default function AdminHealth() {
  const merchants = useMerchants();
  const requests = useRequests();
  const invoices = useInvoices();
  const notifs = useNotifications();

  const services = [
    { name: 'API Gateway (FastAPI)', status: 'operational', latency: '42ms', icon: Server },
    { name: 'PostgreSQL Primary', status: 'operational', latency: '8ms', icon: Database },
    { name: 'PDF Render Worker', status: 'operational', latency: '120ms', icon: Cpu },
    { name: 'QR Service', status: 'operational', latency: '11ms', icon: Cloud },
    { name: 'Auth / OTP Service', status: 'operational', latency: '64ms', icon: Lock },
  ];

  const tables = [
    { name: 'merchants', rows: merchants.length },
    { name: 'billing_requests', rows: requests.length },
    { name: 'invoices', rows: invoices.length },
    { name: 'notifications', rows: notifs.length },
  ];

  return (
    <div>
      <PageHeader title="System Health" subtitle="Real-time service status aur data layer metrics." />
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="depth-card rounded-2xl p-5"><Activity size={20} className="text-[var(--color-emerald)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">99.98%</div><div className="text-sm text-[var(--color-mist)]">Uptime (30d)</div></div>
        <div className="depth-card rounded-2xl p-5"><Server size={20} className="text-[var(--color-aqua)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">5/5</div><div className="text-sm text-[var(--color-mist)]">Services Online</div></div>
        <div className="depth-card rounded-2xl p-5"><Database size={20} className="text-[var(--color-violet)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">{tables.reduce((s, t) => s + t.rows, 0)}</div><div className="text-sm text-[var(--color-mist)]">Total Records</div></div>
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold mb-4">Service Status</h3>
          <div className="space-y-2">
            {services.map((s, i) => (
              <motion.div key={s.name} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center justify-between depth-soft rounded-xl px-4 py-3">
                <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg grid place-items-center depth-raised" style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}><s.icon size={15} className="text-[var(--color-aqua)]" /></div><span className="text-sm">{s.name}</span></div>
                <div className="flex items-center gap-3"><span className="text-[11px] text-[var(--color-mist-2)] font-mono">{s.latency}</span><Badge tone="emerald"><CheckCircle2 size={11} className="inline mr-1" />OK</Badge></div>
              </motion.div>
            ))}
          </div>
        </div>
        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold mb-4">Data Layer (PostgreSQL)</h3>
          <div className="space-y-2">
            {tables.map((t) => (
              <div key={t.name} className="flex items-center justify-between depth-soft rounded-xl px-4 py-3"><span className="text-sm font-mono text-[var(--color-aqua)]">{t.name}</span><span className="text-sm font-semibold">{t.rows} rows</span></div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--color-mist-2)] mt-4">Service layer abstracted via repository pattern — ready for FastAPI + PostgreSQL swap-in.</p>
        </div>
      </div>
    </div>
  );
}
