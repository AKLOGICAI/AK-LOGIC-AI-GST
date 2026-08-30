import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  TrendingUp, Receipt, Clock, IndianRupee, ArrowUpRight, Inbox, CheckCircle2, XCircle, Wallet,
  QrCode, BookUser, BarChart3, Zap, ArrowRight, CalendarRange, X
} from 'lucide-react';
import type { Merchant } from '../../lib/types';
import { useRequests, useInvoices, credits } from '../../lib/store';
import { useI18n } from '../../lib/i18n';
import { inr } from '../../lib/gst';
import { invoiceItemsTotal } from '../../lib/calc';
import QRCode from '../../components/QRCode';
import { timeAgo } from '../../components/ui';
import AkaiTriggerButton from '../../components/akai/AkaiTriggerButton';

interface DayDetail {
  label: string;
  fullDate: string;
  sum: number;
  dayInvoices: { customerName: string; grandTotal: number; invoiceNo: string }[];
}

export default function Overview({ merchant, onStartAkaiAudit }: { merchant: Merchant; onStartAkaiAudit?: () => void }) {
  const nav = useNavigate();
  const { t } = useI18n();
  const requests = useRequests();
  const invoicesAll = useInvoices();

  const [chartDays, setChartDays] = useState<7 | 30>(7);
  const [selectedDay, setSelectedDay] = useState<DayDetail | null>(null);

  const all = useMemo(() => requests.filter((r) => r.merchantId === merchant.id), [requests, merchant.id]);
  const invoices = useMemo(() => invoicesAll.filter((iv) => iv.merchantId === merchant.id), [invoicesAll, merchant.id]);
  const approved = useMemo(() => all.filter((r) => r.status === 'approved'), [all]);
  const pending = useMemo(() => all.filter((r) => r.status === 'pending'), [all]);
  const revenue = useMemo(() => invoices.reduce((s, iv) => s + iv.grandTotal, 0), [invoices]);
  const tax = useMemo(() => invoices.reduce((s, iv) => s + iv.totalTax, 0), [invoices]);

  const thisMonth = new Date().getMonth();
  const monthlyCollection = useMemo(() => invoices
    .filter((iv) => new Date(iv.invoiceDate).getMonth() === thisMonth)
    .reduce((s, iv) => s + iv.grandTotal, 0), [invoices, thisMonth]);

  // Chart logic
  const chart = useMemo(() => Array.from({ length: chartDays }, (_, i) => {
    const day = new Date(); day.setDate(day.getDate() - ((chartDays - 1) - i));
    const dayInvoices = invoices.filter((iv) => new Date(iv.invoiceDate).toDateString() === day.toDateString());
    const sum = dayInvoices.reduce((s, iv) => s + iv.grandTotal, 0);
    return {
      label: day.toLocaleDateString('en-IN', { weekday: 'short' }),
      fullDate: day.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' }),
      sum,
      dayInvoices: dayInvoices.map(iv => ({ customerName: iv.customerName, grandTotal: iv.grandTotal, invoiceNo: iv.invoiceNo }))
    };
  }), [invoices, chartDays]);
  
  const chartMax = useMemo(() => Math.max(...chart.map((c) => c.sum), 1), [chart]);
  const chartAllZero = chartMax === 1 && chart.every(c => c.sum === 0);

  const stats = useMemo(() => [
    { label: t('overview.totalRevenue'), value: inr(revenue), icon: IndianRupee, accent: 'var(--color-gold)', sub: '+12.4% vs last month' },
    { label: t('overview.pendingRequests'), value: String(pending.length), icon: Clock, accent: 'var(--color-amber)', sub: t('overview.awaiting'), to: '/dashboard/requests' },
    { label: t('overview.totalInvoices'), value: String(approved.length), icon: Receipt, accent: 'var(--color-aqua)', sub: `${all.length} requests` },
    { label: t('recharge.balance'), value: String(credits.available(merchant)), icon: Wallet, accent: 'var(--color-emerald)', sub: credits.isActive(merchant) ? `${credits.daysRemaining(merchant)}d · ${merchant.planName}` : 'Expired · recharge', to: '/dashboard/recharge' },
    { label: t('overview.monthlyCollection'), value: inr(monthlyCollection), icon: CalendarRange, accent: 'var(--color-violet)', sub: 'this month' },
    { label: t('overview.gstCollected'), value: inr(tax), icon: TrendingUp, accent: 'var(--color-rose)', sub: 'CGST + SGST' },
  ], [t, revenue, pending.length, approved.length, all.length, merchant, monthlyCollection, tax]);

  const quickActions = useMemo(() => [
    { icon: Inbox, label: t('overview.qa.review'), to: '/dashboard/requests', tone: 'var(--color-gold)' },
    { icon: QrCode, label: t('overview.qa.qr'), to: '/dashboard/qr', tone: 'var(--color-aqua)' },
    { icon: BookUser, label: t('overview.qa.contacts'), to: '/dashboard/contacts', tone: 'var(--color-violet)' },
    { icon: BarChart3, label: t('overview.qa.reports'), to: '/dashboard/reports', tone: 'var(--color-emerald)' },
  ], [t]);

  return (
    <div className="space-y-7">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-[var(--font-display)] text-2xl sm:text-3xl font-bold">{t('overview.greeting', { name: merchant.ownerName.split(' ')[0] })}</h1>
          <p className="text-[var(--color-mist)] mt-1 text-sm">
            {merchant.phone === '+919380617973'
              ? 'Welcome! This is a demo merchant account for product review.'
              : t('overview.subtitle')}
          </p>
        </div>
        <Link to="/dashboard/requests" className="flex items-center gap-2 px-5 py-3 rounded-2xl font-semibold text-[var(--color-ink)] depth-raised active:scale-95 transition" style={{ background: 'linear-gradient(135deg,#f6dd9b,#e9c46a)' }}>
          {t('overview.reviewRequests', { count: pending.length })} <ArrowUpRight size={18} />
        </Link>
      </div>

      {/* AKAI Live Controller Audit Banner */}
      {onStartAkaiAudit && (
        <AkaiTriggerButton onClick={onStartAkaiAudit} variant="banner" />
      )}

      {/* stats grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => s.to && nav(s.to)}
            className={`depth-card rounded-2xl p-5 relative overflow-hidden tilt-hover ${s.to ? 'cursor-pointer' : ''}`}
          >
            <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full blur-2xl opacity-25" style={{ background: s.accent }} />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-xl grid place-items-center depth-raised" style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}>
                  <s.icon size={20} style={{ color: s.accent }} />
                </div>
                {s.to && <ArrowUpRight size={16} className="text-[var(--color-mist-2)]" />}
              </div>
              <div className="font-[var(--font-display)] text-2xl font-bold mt-4">{s.value}</div>
              <div className="text-sm text-[var(--color-mist)] mt-0.5">{s.label}</div>
              <div className="text-[11px] text-[var(--color-mist-2)] mt-2">{s.sub}</div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* chart */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-2 depth-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-[var(--font-display)] font-semibold text-lg">{t('overview.revenueTrend')}</h3>
              <p className="text-xs text-[var(--color-mist-2)]">{chartDays === 7 ? t('overview.last7days') : 'Last 30 days'}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 bg-[#0c1322] p-1 rounded-lg depth-soft">
                <button 
                  onClick={() => setChartDays(7)} 
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${chartDays === 7 ? 'bg-[var(--color-gold)] text-[var(--color-ink)]' : 'text-[var(--color-mist)] hover:text-white'}`}
                >
                  7D
                </button>
                <button 
                  onClick={() => setChartDays(30)} 
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${chartDays === 30 ? 'bg-[var(--color-gold)] text-[var(--color-ink)]' : 'text-[var(--color-mist)] hover:text-white'}`}
                >
                  30D
                </button>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-[var(--color-emerald)]"><TrendingUp size={14} /> {t('overview.healthy')}</span>
            </div>
          </div>
          
          {chartAllZero ? (
            <div className="flex flex-col items-center justify-center h-44 gap-3 rounded-xl border border-dashed border-[var(--color-line)]" style={{ background: 'rgba(12,19,34,0.5)' }}>
              <Inbox size={36} className="text-[var(--color-gold)] opacity-70" />
              <p className="text-sm font-medium text-[var(--color-ivory)]">No invoices generated in this period</p>
              <p className="text-xs text-[var(--color-mist)]">{chartDays === 7 ? 'Past 7 days' : 'Past 30 days'} — generate an invoice to see your revenue trend here</p>
            </div>
          ) : (
            <div className="flex items-end justify-between gap-1.5 sm:gap-3 h-44">
              {chart.map((c, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end gap-2 min-w-0 h-full">
                  <motion.div
                    initial={{ height: 0 }} animate={{ height: `${Math.max((c.sum / chartMax) * 100, 4)}%` }}
                    transition={{ delay: 0.3 + i * 0.02, type: 'spring', stiffness: 120 }}
                    onClick={() => setSelectedDay(c)}
                    className="w-full rounded-t-lg relative group cursor-pointer transition hover:-translate-y-0.5 border-t border-transparent hover:border-[var(--color-gold)]/30"
                    style={{ background: 'linear-gradient(180deg,#e9c46a,#c9963b)', boxShadow: '0 -4px 14px -4px rgba(233,196,106,0.5)' }}
                  >
                    <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono opacity-0 group-hover:opacity-100 transition whitespace-nowrap bg-[#0c1322] px-2 py-0.5 rounded z-10 pointer-events-none">{inr(c.sum)}</span>
                  </motion.div>
                  {chartDays === 7 || i % 5 === 0 || i === chartDays - 1 ? (
                    <span className="text-[10px] text-[var(--color-mist-2)] whitespace-nowrap">{c.label}</span>
                  ) : (
                    <span className="text-[10px] text-transparent select-none whitespace-nowrap">-</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* live QR card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="depth-card rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute inset-0 -m-2 opacity-30 blur-2xl pointer-events-none" style={{ background: 'conic-gradient(from 120deg, transparent, rgba(56,224,200,0.4), transparent)' }} />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-[var(--font-display)] font-semibold">{t('overview.liveQr')}</h3>
              <span className="flex items-center gap-1.5 text-xs text-[var(--color-aqua)]"><span className="w-1.5 h-1.5 rounded-full bg-[var(--color-aqua)] animate-pulse" /> {t('overview.active')}</span>
            </div>
            <div className="grid place-items-center">
              <div className="p-3 rounded-2xl bg-white depth-raised"><QRCode value={`${window.location.origin}/pay/${merchant.qrId}`} size={140} /></div>
            </div>
            <div className="text-center mt-3">
              <div className="font-mono text-xs text-[var(--color-gold)] tracking-wider">{merchant.qrId}</div>
            </div>
            <Link to="/dashboard/qr" className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium depth-raised text-[var(--color-ink)]" style={{ background: 'linear-gradient(135deg,#6ff2dc,#38e0c8)' }}>
              {t('overview.shareQr')} <ArrowRight size={15} />
            </Link>
          </div>
        </motion.div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* recent requests */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="lg:col-span-2 depth-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-[var(--font-display)] font-semibold text-lg">{t('overview.recentRequests')}</h3>
            <Link to="/dashboard/invoices" className="text-sm text-[var(--color-aqua)] font-medium">{t('common.viewAll')} →</Link>
          </div>
          <div className="space-y-2">
            {all.slice(0, 6).map((r) => {
              const Icon = r.status === 'approved' ? CheckCircle2 : r.status === 'rejected' ? XCircle : Clock;
              const color = r.status === 'approved' ? 'var(--color-emerald)' : r.status === 'rejected' ? 'var(--color-rose)' : 'var(--color-amber)';
              return (
                <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[rgba(255,255,255,0.03)] transition">
                  <div className="w-10 h-10 rounded-xl grid place-items-center text-[var(--color-ink)] font-bold depth-raised shrink-0" style={{ background: 'linear-gradient(135deg,#6ff2dc,#38e0c8)' }}>{r.customerName.charAt(0)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{r.customerName}</div>
                    <div className="text-[11px] text-[var(--color-mist-2)]">{r.items.length} item{r.items.length > 1 ? 's' : ''} · {timeAgo(r.createdAt)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{inr(invoiceItemsTotal(r.items))}</div>
                    <div className="flex items-center gap-1 justify-end text-[11px] capitalize" style={{ color }}><Icon size={12} /> {r.status}</div>
                  </div>
                </div>
              );
            })}
            {all.length === 0 && <p className="text-sm text-[var(--color-mist-2)] text-center py-6">{t('common.noData')}</p>}
          </div>
        </motion.div>

        {/* quick actions */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold text-lg mb-4 flex items-center gap-2"><Zap size={18} className="text-[var(--color-gold)]" /> {t('overview.quickActions')}</h3>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((a) => (
              <Link key={a.label} to={a.to} className="depth-soft rounded-2xl p-4 flex flex-col gap-3 hover:scale-[1.03] transition active:scale-95">
                <div className="w-10 h-10 rounded-xl grid place-items-center depth-raised" style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}>
                  <a.icon size={18} style={{ color: a.tone }} />
                </div>
                <span className="text-sm font-medium leading-tight">{a.label}</span>
              </Link>
            ))}
          </div>
        </motion.div>
      </div>

      {pending.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="depth-card rounded-2xl p-6 border-l-4 flex items-center justify-between flex-wrap gap-3" style={{ borderLeftColor: 'var(--color-amber)' }}>
          <div className="flex items-center gap-3">
            <Clock size={22} className="text-[var(--color-amber)]" />
            <div>
              <h3 className="font-[var(--font-display)] font-semibold">{t('overview.needReview', { count: pending.length })}</h3>
              <p className="text-sm text-[var(--color-mist)]">{t('overview.needReviewBody')}</p>
            </div>
          </div>
          <Link to="/dashboard/requests" className="text-sm text-[var(--color-gold)] font-medium">{t('overview.reviewNow')} →</Link>
        </motion.div>
      )}

      {/* Day Detail Modal */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0c1322]/80 backdrop-blur-sm" onClick={() => setSelectedDay(null)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-sm depth-card rounded-2xl p-6 border border-[var(--color-gold)]/20 shadow-2xl"
            style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}
          >
            <button
              onClick={() => setSelectedDay(null)}
              className="absolute top-4 right-4 text-[var(--color-mist-2)] hover:text-white transition"
            >
              <X size={20} />
            </button>
            <h3 className="font-[var(--font-display)] font-semibold text-lg text-white mb-1">
              {selectedDay.fullDate}
            </h3>
            <div className="flex items-center justify-between text-sm text-[var(--color-mist)] mb-5">
              <span>{selectedDay.dayInvoices.length} invoice{selectedDay.dayInvoices.length !== 1 ? 's' : ''}</span>
              <span className="font-semibold text-[var(--color-emerald)]">{inr(selectedDay.sum)}</span>
            </div>

            {selectedDay.dayInvoices.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {selectedDay.dayInvoices.sort((a, b) => b.grandTotal - a.grandTotal).slice(0, 5).map((iv, i) => (
                  <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white truncate">{iv.customerName}</div>
                      <div className="text-[10px] text-[var(--color-mist-2)] mt-0.5">#{iv.invoiceNo}</div>
                    </div>
                    <div className="text-sm font-semibold text-white ml-3">
                      {inr(iv.grandTotal)}
                    </div>
                  </div>
                ))}
                {selectedDay.dayInvoices.length > 5 && (
                  <div className="text-center text-xs text-[var(--color-mist-2)] pt-2">
                    + {selectedDay.dayInvoices.length - 5} more
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-[var(--color-mist-2)] text-sm">
                No invoices on this day
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
