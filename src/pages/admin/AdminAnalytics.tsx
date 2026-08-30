import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Store, Crown, Coins, FileBarChart, IndianRupee } from 'lucide-react';
import { useInvoices, useMerchants, useTxns } from '../../lib/store';
import { inr } from '../../lib/gst';
import { PLANS, FREE_PLAN } from '../../lib/plans';
import { PageHeader } from '../../components/ui';

const DAY = 86400000;

export default function AdminAnalytics() {
  const invoices = useInvoices();
  const merchants = useMerchants();
  const txns = useTxns();

  // daily revenue (7d) from recharge payments
  const { daily, dailyMax } = useMemo(() => {
    const recharge = txns.filter((t) => t.amount > 0);
    const d = Array.from({ length: 7 }, (_, k) => {
      const day = new Date(); day.setDate(day.getDate() - (6 - k)); day.setHours(0, 0, 0, 0);
      const next = day.getTime() + DAY;
      const sum = recharge.filter((t) => t.createdAt >= day.getTime() && t.createdAt < next).reduce((s, t) => s + t.amount, 0);
      return { label: day.toLocaleDateString('en-IN', { weekday: 'short' }), sum };
    });
    return { daily: d, dailyMax: Math.max(...d.map((x) => x.sum), 1) };
  }, [txns]);

  // monthly revenue (6mo) from invoices
  const { monthly, monthMax } = useMemo(() => {
    const m = Array.from({ length: 6 }, (_, k) => {
      const d = new Date(); d.setMonth(d.getMonth() - (5 - k));
      const sum = invoices.filter((i) => { const id = new Date(i.invoiceDate); return id.getMonth() === d.getMonth() && id.getFullYear() === d.getFullYear(); }).reduce((s, i) => s + i.grandTotal, 0);
      return { label: d.toLocaleDateString('en-IN', { month: 'short' }), sum };
    });
    return { monthly: m, monthMax: Math.max(...m.map((x) => x.sum), 1) };
  }, [invoices]);

  // plan popularity
  const { planRows, planMax } = useMemo(() => {
    const planCount: Record<string, number> = {};
    merchants.forEach((m) => { planCount[m.planName] = (planCount[m.planName] || 0) + 1; });
    const rows = [...PLANS, FREE_PLAN].map((p) => ({ name: p.name, count: planCount[p.name] || 0 })).filter((p) => p.count > 0).sort((a, b) => b.count - a.count);
    return { planRows: rows, planMax: Math.max(...rows.map((p) => p.count), 1) };
  }, [merchants]);

  // merchant growth (cumulative, 6mo)
  const { growth, growthMax } = useMemo(() => {
    const g = Array.from({ length: 6 }, (_, k) => {
      const d = new Date(); d.setMonth(d.getMonth() - (5 - k)); d.setDate(28); d.setHours(23, 59, 59);
      const count = merchants.filter((m) => m.createdAt <= d.getTime()).length;
      return { label: d.toLocaleDateString('en-IN', { month: 'short' }), count };
    });
    return { growth: g, growthMax: Math.max(...g.map((x) => x.count), 1) };
  }, [merchants]);

  // invoice volume (6mo)
  const { volume, volMax } = useMemo(() => {
    const v = Array.from({ length: 6 }, (_, k) => {
      const d = new Date(); d.setMonth(d.getMonth() - (5 - k));
      const count = invoices.filter((i) => { const id = new Date(i.invoiceDate); return id.getMonth() === d.getMonth() && id.getFullYear() === d.getFullYear(); }).length;
      return { label: d.toLocaleDateString('en-IN', { month: 'short' }), count };
    });
    return { volume: v, volMax: Math.max(...v.map((x) => x.count), 1) };
  }, [invoices]);

  const creditsUsed = useMemo(() => txns.filter((t) => t.credits < 0).reduce((s, t) => s + Math.abs(t.credits), 0), [txns]);
  const creditsIssued = useMemo(() => txns.filter((t) => t.credits > 0).reduce((s, t) => s + t.credits, 0), [txns]);

  const kpis = useMemo(() => [
    { label: 'Total Revenue', value: inr(invoices.reduce((s, i) => s + i.grandTotal, 0)), icon: IndianRupee, c: 'var(--color-gold)' },
    { label: 'Merchants', value: String(merchants.length), icon: Store, c: 'var(--color-aqua)' },
    { label: 'Invoices', value: String(invoices.length), icon: FileBarChart, c: 'var(--color-violet)' },
    { label: 'Credits Used', value: creditsUsed.toLocaleString('en-IN'), icon: Coins, c: 'var(--color-emerald)' },
  ], [invoices, merchants.length, creditsUsed]);

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Interactive charts — revenue, plans, growth, volume, credits." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((k, i) => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="depth-card rounded-2xl p-5"><k.icon size={20} style={{ color: k.c }} /><div className="font-[var(--font-display)] text-xl font-bold mt-3">{k.value}</div><div className="text-sm text-[var(--color-mist)]">{k.label}</div></motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <Bars title="Daily Recharge Revenue (7d)" data={daily.map((d) => ({ label: d.label, v: d.sum }))} max={dailyMax} fmt={inr} grad="linear-gradient(180deg,#e9c46a,#c9963b)" />
        <Bars title="Monthly Revenue (6mo)" data={monthly.map((m) => ({ label: m.label, v: m.sum }))} max={monthMax} fmt={inr} grad="linear-gradient(180deg,#9385ff,#38e0c8)" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <Bars title="Merchant Growth (cumulative)" data={growth.map((g) => ({ label: g.label, v: g.count }))} max={growthMax} fmt={(n) => String(n)} grad="linear-gradient(180deg,#6ff2dc,#11a892)" />
        <Bars title="Invoice Volume (6mo)" data={volume.map((v) => ({ label: v.label, v: v.count }))} max={volMax} fmt={(n) => String(n)} grad="linear-gradient(180deg,#7c6cf5,#9385ff)" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold mb-4 flex items-center gap-2"><Crown size={18} className="text-[var(--color-aqua)]" /> Plan Popularity</h3>
          <div className="space-y-3">
            {planRows.map((p, i) => (
              <div key={p.name}>
                <div className="flex justify-between text-sm mb-1.5"><span>{p.name}</span><span className="font-semibold">{p.count} merchant{p.count === 1 ? '' : 's'}</span></div>
                <div className="h-2 rounded-full bg-[var(--color-line)] overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${(p.count / planMax) * 100}%` }} transition={{ delay: 0.2 + i * 0.06 }} className="h-full rounded-full" style={{ background: 'linear-gradient(90deg,#9385ff,#7c6cf5)' }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold mb-4 flex items-center gap-2"><Coins size={18} className="text-[var(--color-gold)]" /> Credit Consumption</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between depth-soft rounded-xl px-4 py-3"><span className="text-sm text-[var(--color-mist)]">Credits Issued</span><span className="font-semibold text-[var(--color-emerald)]">+{creditsIssued.toLocaleString('en-IN')}</span></div>
            <div className="flex items-center justify-between depth-soft rounded-xl px-4 py-3"><span className="text-sm text-[var(--color-mist)]">Credits Consumed</span><span className="font-semibold text-[var(--color-rose)]">-{creditsUsed.toLocaleString('en-IN')}</span></div>
            <div className="flex items-center justify-between depth-soft rounded-xl px-4 py-3"><span className="text-sm text-[var(--color-mist)]">In Circulation</span><span className="font-semibold">{merchants.reduce((s, m) => s + m.pdfCredits, 0).toLocaleString('en-IN')}</span></div>
            <div className="h-3 rounded-full bg-[var(--color-line)] overflow-hidden mt-2"><motion.div initial={{ width: 0 }} animate={{ width: `${creditsIssued ? (creditsUsed / creditsIssued) * 100 : 0}%` }} className="h-full rounded-full" style={{ background: 'linear-gradient(90deg,#ff6b88,#ffb454)' }} /></div>
            <p className="text-[11px] text-[var(--color-mist-2)]">{creditsIssued ? Math.round((creditsUsed / creditsIssued) * 100) : 0}% of issued credits consumed.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bars({ title, data, max, fmt, grad }: { title: string; data: { label: string; v: number }[]; max: number; fmt: (n: number) => string; grad: string }) {
  return (
    <div className="depth-card rounded-2xl p-6">
      <h3 className="font-[var(--font-display)] font-semibold mb-1 flex items-center gap-2"><TrendingUp size={18} className="text-[var(--color-violet)]" /> {title}</h3>
      <div className="flex items-end justify-between gap-3 h-44 mt-5">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-2">
            <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max((d.v / max) * 100, 3)}%` }} transition={{ delay: 0.2 + i * 0.05, type: 'spring', stiffness: 120 }} className="w-full rounded-t-lg group relative" style={{ background: grad }}>
              <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono opacity-0 group-hover:opacity-100 transition whitespace-nowrap bg-[#0c1322] px-2 py-0.5 rounded">{fmt(d.v)}</span>
            </motion.div>
            <span className="text-[10px] text-[var(--color-mist-2)]">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
