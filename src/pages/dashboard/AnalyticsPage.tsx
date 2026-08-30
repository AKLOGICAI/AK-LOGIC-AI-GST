import { motion } from 'framer-motion';
import { TrendingUp, Users, Package, IndianRupee } from 'lucide-react';
import type { Merchant } from '../../lib/types';
import { useInvoices } from '../../lib/store';
import { inr } from '../../lib/gst';
import { PageHeader } from '../../components/ui';

export default function AnalyticsPage({ merchant }: { merchant: Merchant }) {
  const approved = useInvoices().filter((iv) => iv.merchantId === merchant.id);

  // monthly revenue (last 6 months)
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (5 - i));
    const sum = approved.filter((iv) => { const rd = new Date(iv.invoiceDate); return rd.getMonth() === d.getMonth() && rd.getFullYear() === d.getFullYear(); }).reduce((s, iv) => s + iv.grandTotal, 0);
    return { label: d.toLocaleDateString('en-IN', { month: 'short' }), sum };
  });
  const mMax = Math.max(...months.map((m) => m.sum), 1);

  // top products
  const prodMap: Record<string, { qty: number; rev: number }> = {};
  approved.forEach((iv) => iv.items.forEach((it) => {
    prodMap[it.description] = prodMap[it.description] || { qty: 0, rev: 0 };
    prodMap[it.description].qty += it.qty;
    prodMap[it.description].rev += it.qty * it.rate;
  }));
  const topProducts = Object.entries(prodMap).sort((a, b) => b[1].rev - a[1].rev).slice(0, 5);
  const prodMax = Math.max(...topProducts.map((p) => p[1].rev), 1);

  // top customers
  const custMap: Record<string, number> = {};
  approved.forEach((iv) => { custMap[iv.customerName] = (custMap[iv.customerName] || 0) + iv.grandTotal; });
  const topCustomers = Object.entries(custMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const avgInvoice = approved.length ? approved.reduce((s, iv) => s + iv.grandTotal, 0) / approved.length : 0;
  const repeatRate = Object.values(custMap).length ? Math.round((Object.keys(custMap).filter((c) => approved.filter((iv) => iv.customerName === c).length > 1).length / Object.keys(custMap).length) * 100) : 0;

  const kpis = [
    { label: 'Avg. Invoice Value', value: inr(avgInvoice), icon: IndianRupee, c: 'var(--color-gold)' },
    { label: 'Unique Customers', value: String(Object.keys(custMap).length), icon: Users, c: 'var(--color-aqua)' },
    { label: 'Repeat Rate', value: `${repeatRate}%`, icon: TrendingUp, c: 'var(--color-emerald)' },
    { label: 'Products Sold', value: String(Object.keys(prodMap).length), icon: Package, c: 'var(--color-violet)' },
  ];

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Business performance, top products aur customer insights." />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((k, i) => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="depth-card rounded-2xl p-5">
            <k.icon size={20} style={{ color: k.c }} />
            <div className="font-[var(--font-display)] text-xl font-bold mt-3">{k.value}</div>
            <div className="text-sm text-[var(--color-mist)]">{k.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="depth-card rounded-2xl p-6 mb-5">
        <h3 className="font-[var(--font-display)] font-semibold mb-6">Monthly Revenue (6 months)</h3>
        <div className="flex items-end justify-between gap-4 h-52">
          {months.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max((m.sum / mMax) * 100, 3)}%` }} transition={{ delay: 0.2 + i * 0.06, type: 'spring', stiffness: 120 }} className="w-full rounded-t-xl relative group" style={{ background: 'linear-gradient(180deg,#7c6cf5,#38e0c8)' }}>
                <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono opacity-0 group-hover:opacity-100 transition whitespace-nowrap bg-[#0c1322] px-2 py-0.5 rounded">{inr(m.sum)}</span>
              </motion.div>
              <span className="text-xs text-[var(--color-mist-2)]">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold mb-4 flex items-center gap-2"><Package size={18} className="text-[var(--color-gold)]" /> Top Products</h3>
          <div className="space-y-3">
            {topProducts.map(([name, v], i) => (
              <div key={name}>
                <div className="flex justify-between text-sm mb-1.5"><span className="truncate pr-2">{name}</span><span className="font-semibold whitespace-nowrap">{inr(v.rev)}</span></div>
                <div className="h-2 rounded-full bg-[var(--color-line)] overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(v.rev / prodMax) * 100}%` }} transition={{ delay: 0.2 + i * 0.06 }} className="h-full rounded-full" style={{ background: 'linear-gradient(90deg,#f6dd9b,#e9c46a)' }} />
                </div>
              </div>
            ))}
            {topProducts.length === 0 && <p className="text-sm text-[var(--color-mist-2)]">No data yet.</p>}
          </div>
        </div>

        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold mb-4 flex items-center gap-2"><Users size={18} className="text-[var(--color-aqua)]" /> Top Customers</h3>
          <div className="space-y-2">
            {topCustomers.map(([name, rev], i) => (
              <div key={name} className="flex items-center gap-3 depth-soft rounded-xl px-4 py-2.5">
                <div className="w-8 h-8 rounded-lg grid place-items-center text-[var(--color-ink)] font-bold text-sm depth-raised" style={{ background: 'linear-gradient(135deg,#6ff2dc,#38e0c8)' }}>{i + 1}</div>
                <span className="flex-1 text-sm truncate">{name}</span>
                <span className="text-sm font-semibold">{inr(rev)}</span>
              </div>
            ))}
            {topCustomers.length === 0 && <p className="text-sm text-[var(--color-mist-2)]">No data yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
