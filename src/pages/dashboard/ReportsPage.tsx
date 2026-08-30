import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, FileSpreadsheet, IndianRupee, Receipt, Percent, TrendingUp } from 'lucide-react';
import type { Merchant } from '../../lib/types';
import { useInvoices } from '../../lib/store';
import { inr } from '../../lib/gst';
import { PageHeader, GoldButton, Badge } from '../../components/ui';

type Range = '7d' | '30d' | '90d' | 'all';

export default function ReportsPage({ merchant }: { merchant: Merchant }) {
  const [range, setRange] = useState<Range>('30d');
  const invoicesAll = useInvoices();
  const all = useMemo(() => invoicesAll.filter((iv) => iv.merchantId === merchant.id), [invoicesAll, merchant.id]);

  // Recomputed only when `range` or the invoice list actually changes,
  // rather than reading Date.now() fresh on every unrelated re-render.
  const rows = useMemo(() => {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 99999;
    const cutoff = Date.now() - days * 86400000;
    return all.filter((iv) => iv.invoiceDate >= cutoff).sort((a, b) => b.invoiceDate - a.invoiceDate);
  }, [all, range]);

  const totalTaxable = useMemo(() => rows.reduce((s, iv) => s + iv.taxableValue, 0), [rows]);
  const totalTax = useMemo(() => rows.reduce((s, iv) => s + iv.totalTax, 0), [rows]);
  const totalRevenue = useMemo(() => rows.reduce((s, iv) => s + iv.grandTotal, 0), [rows]);

  // GST rate breakdown
  const rateMap = useMemo(() => {
    const map: Record<number, { taxable: number; tax: number }> = {};
    rows.forEach((iv) => iv.items.forEach((it) => {
      const base = it.qty * it.rate;
      map[it.gstRate] = map[it.gstRate] || { taxable: 0, tax: 0 };
      map[it.gstRate].taxable += base;
      map[it.gstRate].tax += (base * it.gstRate) / 100;
    }));
    return map;
  }, [rows]);

  const exportCsv = () => {
    const header = ['Invoice No', 'Date', 'Customer', 'GSTIN', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total'];
    const lines = rows.map((iv) => [
      iv.invoiceNo, new Date(iv.invoiceDate).toLocaleDateString('en-IN'), iv.customerName,
      iv.customerGstin || '', iv.taxableValue.toFixed(2), iv.cgst.toFixed(2), iv.sgst.toFixed(2), iv.igst.toFixed(2), iv.grandTotal.toFixed(2),
    ].join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `GST-Report-${range}.csv`; a.click();
  };

  const summary = useMemo(() => [
    { label: 'Taxable Value', value: inr(totalTaxable), icon: IndianRupee, c: 'var(--color-gold)' },
    { label: 'Total GST', value: inr(totalTax), icon: Percent, c: 'var(--color-aqua)' },
    { label: 'Gross Revenue', value: inr(totalRevenue), icon: TrendingUp, c: 'var(--color-emerald)' },
    { label: 'Invoices', value: String(rows.length), icon: Receipt, c: 'var(--color-violet)' },
  ], [totalTaxable, totalTax, totalRevenue, rows.length]);

  return (
    <div>
      <PageHeader title="Reports" subtitle="GST summary, tax breakdown aur exportable reports." action={<GoldButton onClick={exportCsv}><Download size={17} /> Export CSV</GoldButton>} />

      <div className="flex items-center gap-1 p-1 rounded-xl depth-soft w-fit mb-6">
        {(['7d', '30d', '90d', 'all'] as Range[]).map((r) => (
          <button key={r} onClick={() => setRange(r)} className={`px-4 py-2 rounded-lg text-sm font-medium uppercase transition ${range === r ? 'text-[var(--color-ink)]' : 'text-[var(--color-mist)]'}`} style={range === r ? { background: 'linear-gradient(135deg,#f6dd9b,#e9c46a)' } : {}}>{r === 'all' ? 'All' : r}</button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {summary.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="depth-card rounded-2xl p-5">
            <s.icon size={20} style={{ color: s.c }} />
            <div className="font-[var(--font-display)] text-xl font-bold mt-3">{s.value}</div>
            <div className="text-sm text-[var(--color-mist)]">{s.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold mb-4 flex items-center gap-2"><Percent size={18} className="text-[var(--color-aqua)]" /> GST Rate Breakdown</h3>
          <div className="space-y-3">
            {Object.entries(rateMap).sort((a, b) => +a[0] - +b[0]).map(([rate, v]) => (
              <div key={rate} className="flex items-center justify-between depth-soft rounded-xl px-4 py-3">
                <Badge tone="gold">{rate}% GST</Badge>
                <div className="text-right">
                  <div className="text-sm font-semibold">{inr(v.tax)}</div>
                  <div className="text-[11px] text-[var(--color-mist-2)]">on {inr(v.taxable)} taxable</div>
                </div>
              </div>
            ))}
            {Object.keys(rateMap).length === 0 && <p className="text-sm text-[var(--color-mist-2)]">No data in this range.</p>}
          </div>
        </div>

        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold mb-4 flex items-center gap-2"><FileSpreadsheet size={18} className="text-[var(--color-gold)]" /> GSTR-1 Summary</h3>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between"><span className="text-[var(--color-mist)]">B2C Invoices</span><span>{rows.filter((iv) => !iv.customerGstin).length}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-mist)]">B2B Invoices</span><span>{rows.filter((iv) => iv.customerGstin).length}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-mist)]">Total Taxable</span><span>{inr(totalTaxable)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-mist)]">Output CGST</span><span>{inr(totalTax / 2)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-mist)]">Output SGST</span><span>{inr(totalTax / 2)}</span></div>
            <div className="flex justify-between font-bold pt-2 border-t border-[var(--color-line)]"><span>Total Tax Liability</span><span className="gold-text">{inr(totalTax)}</span></div>
          </div>
          <p className="text-[11px] text-[var(--color-mist-2)] mt-4">This summary is a reference for your GSTR-1 filing. Export it to share with your accountant.</p>
        </div>
      </div>
    </div>
  );
}
