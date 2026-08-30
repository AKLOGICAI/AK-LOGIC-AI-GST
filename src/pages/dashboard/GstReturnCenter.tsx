import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FileSpreadsheet, FileText, Search, IndianRupee, Percent, Receipt,
  Calendar, CalendarDays, ListChecks, Building2, BadgeCheck,
} from 'lucide-react';
import type { Merchant } from '../../lib/types';
import { useInvoices } from '../../lib/store';
import { inr } from '../../lib/gst';
import { summarise, monthlySummary, dateWiseSummary, toRegisterRow } from '../../lib/gstReport';
import { exportCsv, exportXlsx, type SheetData } from '../../lib/exporters';
import { PageHeader, Badge } from '../../components/ui';

type Tab = 'register' | 'monthly' | 'datewise';

export default function GstReturnCenter({ merchant }: { merchant: Merchant }) {
  const allInvoices = useInvoices().filter((iv) => iv.merchantId === merchant.id);

  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [supply, setSupply] = useState<'all' | 'B2B' | 'B2C'>('all');
  const [tab, setTab] = useState<Tab>('register');

  const filtered = useMemo(() => {
    const fromTs = from ? new Date(from + 'T00:00:00').getTime() : -Infinity;
    const toTs = to ? new Date(to + 'T23:59:59').getTime() : Infinity;
    const q = search.trim().toLowerCase();
    return allInvoices
      .filter((iv) => iv.invoiceDate >= fromTs && iv.invoiceDate <= toTs)
      .filter((iv) => (supply === 'all' ? true : supply === 'B2B' ? !!iv.customerGstin : !iv.customerGstin))
      .filter((iv) => !q || iv.invoiceNo.toLowerCase().includes(q) || iv.customerName.toLowerCase().includes(q) || (iv.customerGstin || '').toLowerCase().includes(q))
      .sort((a, b) => b.invoiceDate - a.invoiceDate);
  }, [allInvoices, from, to, supply, search]);

  const sum = useMemo(() => summarise(filtered), [filtered]);
  const months = useMemo(() => monthlySummary(filtered), [filtered]);
  const dates = useMemo(() => dateWiseSummary(filtered), [filtered]);

  const registerSheet = (): SheetData => ({
    name: 'GST Invoice Register',
    header: ['Invoice No', 'Invoice Date', 'Customer Name', 'Customer GSTIN', 'Place of Supply', 'Supply', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total GST', 'Invoice Total', 'Status'],
    rows: filtered.map((iv) => {
      const r = toRegisterRow(iv);
      return [r.invoiceNo, new Date(r.invoiceDate).toLocaleDateString('en-IN'), r.customerName, r.customerGstin, r.placeOfSupply, r.supplyType, +r.taxableValue.toFixed(2), +r.cgst.toFixed(2), +r.sgst.toFixed(2), +r.igst.toFixed(2), +r.totalTax.toFixed(2), +r.grandTotal.toFixed(2), r.status];
    }),
  });

  const summarySheet = (): SheetData => ({
    name: 'GST Summary',
    header: ['Metric', 'Value'],
    rows: [
      ['Total Invoices', sum.invoiceCount],
      ['B2B Invoices', sum.b2b],
      ['B2C Invoices', sum.b2c],
      ['Total Taxable Value', +sum.taxableValue.toFixed(2)],
      ['Total CGST', +sum.cgst.toFixed(2)],
      ['Total SGST', +sum.sgst.toFixed(2)],
      ['Total IGST', +sum.igst.toFixed(2)],
      ['Total GST Collected', +sum.totalTax.toFixed(2)],
      ['Gross Invoice Total', +sum.grandTotal.toFixed(2)],
    ],
  });

  const periodSheet = (): SheetData => ({
    name: 'Monthly Summary',
    header: ['Month', 'Invoices', 'Taxable Value', 'GST', 'Total'],
    rows: months.map((m) => [m.label, m.count, +m.taxable.toFixed(2), +m.tax.toFixed(2), +m.total.toFixed(2)]),
  });

  const fileTag = `${merchant.invoicePrefix || 'GST'}_${new Date().toISOString().slice(0, 10)}`;
  const doExportXlsx = () => exportXlsx([summarySheet(), registerSheet(), periodSheet()], `GST_Return_${fileTag}.xlsx`);
  const doExportCsv = () => exportCsv(registerSheet(), `GST_Invoice_Register_${fileTag}.csv`);

  const cards = [
    { label: 'Total Invoices', value: String(sum.invoiceCount), icon: Receipt, c: 'var(--color-violet)' },
    { label: 'Taxable Value', value: inr(sum.taxableValue), icon: IndianRupee, c: 'var(--color-gold)' },
    { label: 'CGST', value: inr(sum.cgst), icon: Percent, c: 'var(--color-aqua)' },
    { label: 'SGST', value: inr(sum.sgst), icon: Percent, c: 'var(--color-emerald)' },
    { label: 'IGST', value: inr(sum.igst), icon: Percent, c: 'var(--color-rose)' },
    { label: 'Total GST Collected', value: inr(sum.totalTax), icon: BadgeCheck, c: 'var(--color-gold)' },
  ];

  return (
    <div>
      <PageHeader
        title="GST Return Center"
        subtitle="Auto-tracked invoice register, GST summaries & filing-ready exports."
        action={
          <div className="flex gap-2">
            <button onClick={doExportCsv} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-[var(--color-line)] hover:border-[var(--color-aqua)] transition"><FileText size={16} /> CSV</button>
            <button onClick={doExportXlsx} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-[var(--color-ink)]" style={{ background: 'linear-gradient(135deg,#2fd07a,#11a892)' }}><FileSpreadsheet size={16} /> Excel (.xlsx)</button>
          </div>
        }
      />

      {/* GST summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="depth-card rounded-2xl p-4">
            <c.icon size={18} style={{ color: c.c }} />
            <div className="font-[var(--font-display)] text-lg font-bold mt-2.5 truncate">{c.value}</div>
            <div className="text-[11px] text-[var(--color-mist)]">{c.label}</div>
          </motion.div>
        ))}
      </div>

      {/* filters */}
      <div className="depth-card rounded-2xl p-4 mb-5">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-mist-2)]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Invoice no / customer / GSTIN" className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-aqua)]" />
          </div>
          <label className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider text-[var(--color-mist-2)] pointer-events-none">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full pl-14 pr-3 py-2.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-aqua)] [color-scheme:dark]" />
          </label>
          <label className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider text-[var(--color-mist-2)] pointer-events-none">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-aqua)] [color-scheme:dark]" />
          </label>
          <div className="flex items-center gap-1 p-1 rounded-xl depth-soft">
            {(['all', 'B2B', 'B2C'] as const).map((s) => (
              <button key={s} onClick={() => setSupply(s)} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition ${supply === s ? 'text-[var(--color-ink)]' : 'text-[var(--color-mist)]'}`} style={supply === s ? { background: 'linear-gradient(135deg,#f6dd9b,#e9c46a)' } : {}}>{s === 'all' ? 'All' : s}</button>
            ))}
          </div>
        </div>
        {(from || to || search || supply !== 'all') && (
          <button onClick={() => { setFrom(''); setTo(''); setSearch(''); setSupply('all'); }} className="mt-3 text-xs text-[var(--color-aqua)]">Clear filters</button>
        )}
      </div>

      {/* tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl depth-soft w-fit mb-5">
        {([['register', ListChecks, 'Invoice Register'], ['monthly', Calendar, 'Monthly Summary'], ['datewise', CalendarDays, 'Date-wise']] as const).map(([id, Icon, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${tab === id ? 'text-[var(--color-ink)]' : 'text-[var(--color-mist)]'}`} style={tab === id ? { background: 'linear-gradient(135deg,#6ff2dc,#38e0c8)' } : {}}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'register' && (
        <div className="depth-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-sm min-w-[920px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-[var(--color-mist-2)] border-b border-[var(--color-line)] bg-[rgba(255,255,255,0.02)]">
                  <th className="text-left px-4 py-3 font-medium">Invoice No</th>
                  <th className="text-left px-3 py-3 font-medium">Date</th>
                  <th className="text-left px-3 py-3 font-medium">Customer</th>
                  <th className="text-left px-3 py-3 font-medium">GSTIN</th>
                  <th className="text-right px-3 py-3 font-medium">Taxable</th>
                  <th className="text-right px-3 py-3 font-medium">GST</th>
                  <th className="text-right px-3 py-3 font-medium">Total</th>
                  <th className="text-right px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((iv) => (
                  <tr key={iv.id} className="border-b border-[var(--color-line)] last:border-0 hover:bg-[rgba(255,255,255,0.02)]">
                    <td className="px-4 py-3 font-mono text-[var(--color-gold)] whitespace-nowrap">{iv.invoiceNo}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-[var(--color-mist)]">{new Date(iv.invoiceDate).toLocaleDateString('en-IN')}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{iv.customerName}</div>
                      <div className="text-[11px]">{iv.customerGstin ? <Badge tone="violet">B2B</Badge> : <Badge tone="mist">B2C</Badge>}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-[var(--color-mist)] whitespace-nowrap">{iv.customerGstin || '—'}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{inr(iv.taxableValue)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap text-[var(--color-mist)]">{inr(iv.totalTax)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap font-semibold">{inr(iv.grandTotal)}</td>
                    <td className="px-4 py-3 text-right"><Badge tone="emerald">Generated</Badge></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-[var(--color-mist-2)]">No invoices match the current filters.</td></tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-[var(--color-line)] font-semibold bg-[rgba(255,255,255,0.02)]">
                    <td className="px-4 py-3" colSpan={4}>Total · {sum.invoiceCount} invoices</td>
                    <td className="px-3 py-3 text-right">{inr(sum.taxableValue)}</td>
                    <td className="px-3 py-3 text-right">{inr(sum.totalTax)}</td>
                    <td className="px-3 py-3 text-right gold-text">{inr(sum.grandTotal)}</td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {(tab === 'monthly' || tab === 'datewise') && (
        <div className="depth-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-[var(--color-mist-2)] border-b border-[var(--color-line)] bg-[rgba(255,255,255,0.02)]">
                  <th className="text-left px-4 py-3 font-medium">{tab === 'monthly' ? 'Month' : 'Date'}</th>
                  <th className="text-right px-3 py-3 font-medium">Invoices</th>
                  <th className="text-right px-3 py-3 font-medium">Taxable</th>
                  <th className="text-right px-3 py-3 font-medium">GST</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {(tab === 'monthly' ? months : dates).map((p) => (
                  <tr key={p.key} className="border-b border-[var(--color-line)] last:border-0 hover:bg-[rgba(255,255,255,0.02)]">
                    <td className="px-4 py-3 font-medium flex items-center gap-2"><Calendar size={14} className="text-[var(--color-aqua)]" /> {p.label}</td>
                    <td className="px-3 py-3 text-right">{p.count}</td>
                    <td className="px-3 py-3 text-right">{inr(p.taxable)}</td>
                    <td className="px-3 py-3 text-right text-[var(--color-mist)]">{inr(p.tax)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{inr(p.total)}</td>
                  </tr>
                ))}
                {(tab === 'monthly' ? months : dates).length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-[var(--color-mist-2)]">No data for this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-[var(--color-mist-2)] mt-4 flex items-center gap-2">
        <Building2 size={13} /> Every approved invoice is auto-tracked here with invoice no, date, customer, GSTIN, taxable value, GST and status — ready for future GSTR-1 / GSTR-3B filing.
      </p>
    </div>
  );
}
