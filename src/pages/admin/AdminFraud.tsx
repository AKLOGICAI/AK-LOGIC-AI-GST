import { motion } from 'framer-motion';
import { ShieldAlert, AlertTriangle, ShieldCheck, TrendingUp } from 'lucide-react';
import { useFraudFlags, useMerchants } from '../../lib/store';
import { PageHeader, Badge, EmptyState } from '../../components/ui';
import type { Severity } from '../../lib/store';

export default function AdminFraud() {
  const flags = useFraudFlags();
  const merchants = useMerchants();

  const tone = (s: Severity) => (s === 'high' ? 'rose' : s === 'medium' ? 'amber' : 'violet') as 'rose' | 'amber' | 'violet';
  const riskScore = Math.min(100, flags.reduce((s, f) => s + (f.severity === 'high' ? 25 : f.severity === 'medium' ? 10 : 4), 0));
  const high = flags.filter((f) => f.severity === 'high').length;

  // group by category
  const categories = [...new Set(flags.map((f) => f.category))];

  return (
    <div>
      <PageHeader title="Fraud Detection System" subtitle="Automated risk rules — duplicate GST/PAN/bank/UPI, UTR reuse, spikes, failed logins." />
      <div className="grid sm:grid-cols-4 gap-4 mb-6">
        <div className="depth-card rounded-2xl p-5"><ShieldAlert size={20} className="text-[var(--color-rose)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">{flags.length}</div><div className="text-sm text-[var(--color-mist)]">Active Flags</div></div>
        <div className="depth-card rounded-2xl p-5"><AlertTriangle size={20} className="text-[var(--color-rose)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">{high}</div><div className="text-sm text-[var(--color-mist)]">High Severity</div></div>
        <div className="depth-card rounded-2xl p-5"><TrendingUp size={20} className="text-[var(--color-amber)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">{riskScore}/100</div><div className="text-sm text-[var(--color-mist)]">Risk Score</div></div>
        <div className="depth-card rounded-2xl p-5"><ShieldCheck size={20} className="text-[var(--color-emerald)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">{merchants.filter((m) => m.status === 'active' || !m.status).length}</div><div className="text-sm text-[var(--color-mist)]">Active Merchants</div></div>
      </div>

      {flags.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={28} />} title="No fraud signals" body="No suspicious activity detected. All clear." />
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => (
            <div key={cat}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-mist-2)] mb-2">{cat}</div>
              <div className="space-y-2">
                {flags.filter((f) => f.category === cat).map((f, i) => (
                  <motion.div key={f.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="depth-card rounded-2xl p-5 flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl grid place-items-center depth-raised shrink-0" style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}><AlertTriangle size={20} style={{ color: f.severity === 'high' ? 'var(--color-rose)' : f.severity === 'medium' ? 'var(--color-amber)' : 'var(--color-violet)' }} /></div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold text-sm">{f.title}</span><Badge tone={tone(f.severity)}>{f.severity}</Badge></div>
                      <p className="text-sm text-[var(--color-mist)] mt-1">{f.detail}</p>
                      {f.merchants.length > 0 && <div className="text-[11px] text-[var(--color-mist-2)] mt-1">Involved: {f.merchants.join(', ')}</div>}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
