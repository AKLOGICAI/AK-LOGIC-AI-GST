import { motion } from 'framer-motion';
import { IndianRupee, Percent, TrendingUp, Receipt, Download } from 'lucide-react';
import { useInvoices, useMerchants } from '../../lib/store';
import { inr } from '../../lib/gst';
import { PageHeader, GoldButton } from '../../components/ui';

export default function AdminRevenue() {
  const invoices = useInvoices();
  const merchants = useMerchants();
  const revenue = invoices.reduce((s, i) => s + i.grandTotal, 0);
  const cgst = invoices.reduce((s, i) => s + i.cgst, 0);
  const sgst = invoices.reduce((s, i) => s + i.sgst, 0);
  const igst = invoices.reduce((s, i) => s + i.igst, 0);
  const taxable = invoices.reduce((s, i) => s + i.taxableValue, 0);

  // monthly platform revenue (6 mo)
  const months = Array.from({ length: 6 }, (_, k) => {
    const d = new Date(); d.setMonth(d.getMonth() - (5 - k));
    const sum = invoices.filter((i) => { const id = new Date(i.invoiceDate); return id.getMonth() === d.getMonth() && id.getFullYear() === d.getFullYear(); }).reduce((s, i) => s + i.grandTotal, 0);
    return { label: d.toLocaleDateString('en-IN', { month: 'short' }), sum };
  });
  const mMax = Math.max(...months.map((m) => m.sum), 1);

  const exportCsv = () => {
    const rows = invoices.map((i) => {
      const m = merchants.find((x) => x.id === i.merchantId);
      return [i.invoiceNo, new Date(i.invoiceDate).toLocaleDateString('en-IN'), m?.shopName || '', i.customerName, i.taxableValue.toFixed(2), i.cgst.toFixed(2), i.sgst.toFixed(2), i.igst.toFixed(2), i.grandTotal.toFixed(2)].join(',');
    });
    const csv = ['Invoice,Date,Merchant,Customer,Taxable,CGST,SGST,IGST,Total', ...rows].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'platform-revenue.csv'; a.click();
  };

  const cards = [
    { label: 'Gross Revenue', value: inr(revenue), icon: IndianRupee, c: 'var(--color-gold)' },
    { label: 'Taxable Value', value: inr(taxable), icon: Receipt, c: 'var(--color-aqua)' },
    { label: 'Total Tax', value: inr(cgst + sgst + igst), icon: Percent, c: 'var(--color-violet)' },
    { label: 'Avg Invoice', value: inr(invoices.length ? revenue / invoices.length : 0), icon: TrendingUp, c: 'var(--color-emerald)' },
  ];

  return (
    <div>
      <PageHeader title="Revenue Dashboard" subtitle="Platform-wide revenue aur GST breakdown." action={<GoldButton onClick={exportCsv}><Download size={17} /> Export</GoldButton>} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="depth-card rounded-2xl p-5"><c.icon size={20} style={{ color: c.c }} /><div className="font-[var(--font-display)] text-xl font-bold mt-3">{c.value}</div><div className="text-sm text-[var(--color-mist)]">{c.label}</div></motion.div>
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold mb-6">Monthly Revenue</h3>
          <div className="flex items-end justify-between gap-4 h-52">
            {months.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max((m.sum / mMax) * 100, 3)}%` }} transition={{ delay: 0.2 + i * 0.06, type: 'spring', stiffness: 120 }} className="w-full rounded-t-xl group relative" style={{ background: 'linear-gradient(180deg,#9385ff,#38e0c8)' }}><span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono opacity-0 group-hover:opacity-100 transition bg-[#0c1322] px-2 py-0.5 rounded whitespace-nowrap">{inr(m.sum)}</span></motion.div>
                <span className="text-xs text-[var(--color-mist-2)]">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold mb-4">Tax Composition</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between depth-soft rounded-xl px-4 py-3"><span className="text-[var(--color-mist)]">CGST</span><span className="font-semibold">{inr(cgst)}</span></div>
            <div className="flex justify-between depth-soft rounded-xl px-4 py-3"><span className="text-[var(--color-mist)]">SGST</span><span className="font-semibold">{inr(sgst)}</span></div>
            <div className="flex justify-between depth-soft rounded-xl px-4 py-3"><span className="text-[var(--color-mist)]">IGST</span><span className="font-semibold">{inr(igst)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
