// test deploy trigger
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, Check, Zap, Crown, Clock, CalendarClock, ArrowRightLeft, ShieldCheck, AlertTriangle, Sparkles, ImageIcon, Gift } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Merchant } from '../../lib/types';
import { store, credits, useTxns } from '../../lib/store';
import { PLANS, VALIDITY_ADDON, CUSTOM_BRANDING_MIN_DAYS } from '../../lib/plans';
import { PageHeader, timeAgo, Badge } from '../../components/ui';

export default function RechargePage({ merchant }: { merchant: Merchant }) {
  const [done, setDone] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const active = credits.isActive(merchant);
  const available = credits.available(merchant);
  const daysLeft = credits.daysRemaining(merchant);
  const branding = credits.brandingEnabled(merchant);
  const inWindow = credits.inRenewalWindow(merchant);
  const expiry = merchant.planExpiresAt ? new Date(merchant.planExpiresAt) : null;

  // Payment is handled by the provider-agnostic layer; fulfilment (credits)
  // happens only after a verified capture. (Razorpay drops in here later.)
  const buy = async (planId: string, name: string) => {
    setProcessing(planId);
    const res = await store.checkoutPlan(merchant.id, planId);
    setProcessing(null);
    if (res.ok) setDone(res.carried > 0 ? `${name} active · ${res.carried} credits carried forward` : `${name} activated`);
    else setDone(res.error || 'Payment could not be completed. Please try again.');
    setTimeout(() => setDone(null), 3200);
  };

  const extend = async () => {
    setProcessing('addon');
    const res = await store.checkoutAddon(merchant.id);
    setProcessing(null);
    if (res.ok) setDone('Validity extended +30 days (credits unchanged)');
    else setDone(res.error || 'Payment could not be completed. Please try again.');
    setTimeout(() => setDone(null), 3200);
  };

  return (
    <div className="space-y-7">
      <PageHeader title="Recharge & Plans" subtitle="Buy a plan, extend validity, and manage your PDF credits." />

      {done && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="depth-card rounded-2xl p-4 flex items-center gap-3 border-l-4" style={{ borderLeftColor: 'var(--color-emerald)' }}>
          <Check size={20} className="text-[var(--color-emerald)]" /> <span className="text-sm">{done}</span>
        </motion.div>
      )}

      {/* ===== CURRENT PLAN STATUS ===== */}
      <div className="depth-card rounded-2xl p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <h2 className="font-[var(--font-display)] font-semibold text-lg flex items-center gap-2"><CalendarClock size={18} className="text-[var(--color-aqua)]" /> Current Plan</h2>
          {active ? (
            branding
              ? <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[rgba(56,224,200,0.14)] text-[var(--color-aqua)] uppercase tracking-wider flex items-center gap-1"><Crown size={11} /> Custom Branding</span>
              : <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[rgba(233,196,106,0.14)] text-[var(--color-gold)] uppercase tracking-wider">AK-LOGIC AI Branding</span>
          ) : <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[rgba(255,107,136,0.14)] text-[var(--color-rose)] uppercase tracking-wider">Expired</span>}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Current Plan" value={merchant.planName} icon={<Sparkles size={16} className="text-[var(--color-gold)]" />} />
          <StatTile label="PDF Credits" value={String(available)} icon={<Zap size={16} className="text-[var(--color-aqua)]" />} highlight />
          <StatTile label="Days Remaining" value={active ? `${daysLeft}` : '0'} icon={<Clock size={16} className="text-[var(--color-violet)]" />} />
          <StatTile label="Expiry Date" value={expiry && active ? expiry.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'} icon={<CalendarClock size={16} className="text-[var(--color-emerald)]" />} />
        </div>

        {/* branding policy banner */}
        {!branding && (
          <div className="mt-5 rounded-xl px-4 py-3.5 border border-[rgba(233,196,106,0.25)] bg-[rgba(233,196,106,0.06)] flex items-start gap-3">
            <ShieldCheck size={18} className="text-[var(--color-gold)] shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--color-mist)]">
              <strong className="text-[var(--color-ivory)]">AK-LOGIC AI branding will appear on generated invoices.</strong> Upgrade to a monthly plan (30+ days) to unlock your own business logo and branding.
            </p>
          </div>
        )}
        {branding && (
          <div className="mt-5 rounded-xl px-4 py-3.5 border border-[rgba(56,224,200,0.22)] bg-[rgba(56,224,200,0.06)] flex items-start gap-3">
            <Crown size={18} className="text-[var(--color-aqua)] shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--color-mist)]">
              <strong className="text-[var(--color-ivory)]">Custom branding unlocked.</strong> Your business logo & brand name appear on invoices. {!(merchant.logoUrl || merchant.logoDataUrl) && <Link to="/dashboard/settings" className="text-[var(--color-aqua)] underline">Upload your logo →</Link>}
            </p>
          </div>
        )}

        {/* carry forward status */}
        <div className="mt-4 flex items-center gap-2 text-xs text-[var(--color-mist-2)]">
          <ArrowRightLeft size={14} className={inWindow ? 'text-[var(--color-emerald)]' : 'text-[var(--color-mist-2)]'} />
          {inWindow
            ? <span className="text-[var(--color-emerald)]">Carry-forward active: renew now to carry your {available} unused credits into the new plan.</span>
            : active
              ? `Carry-forward: renew within last ${3} days of expiry to carry unused credits.`
              : 'Plan expired — purchasing a new plan starts fresh (no carry-forward).'}
        </div>
      </div>

      {/* ===== FREE DAILY INVOICE ===== */}
      <FreeDailyInvoice merchant={merchant} />

      {/* ===== RECHARGE PLANS ===== */}
      <div>
        <h2 className="font-[var(--font-display)] font-semibold text-lg mb-1 flex items-center gap-2"><Zap size={18} className="text-[var(--color-gold)]" /> Recharge Plans</h2>
        <p className="text-xs text-[var(--color-mist-2)] mb-4">Plans under {CUSTOM_BRANDING_MIN_DAYS} days carry AK-LOGIC AI branding. 30+ day plans unlock custom branding.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PLANS.map((p, i) => {
            const unlocks = p.validityDays >= CUSTOM_BRANDING_MIN_DAYS;
            return (
              <motion.div key={p.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="depth-card rounded-2xl p-6 tilt-hover relative">
                {p.popular && <span className="absolute top-4 right-4 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[rgba(233,196,106,0.15)] text-[var(--color-gold)] uppercase">Popular</span>}
                <div className="font-[var(--font-display)] text-3xl font-bold gold-text">₹{p.price}</div>
                <div className="text-sm font-medium mt-1">{p.name}</div>
                <div className="mt-4 space-y-1.5 text-sm text-[var(--color-mist)]">
                  <div className="flex items-center gap-2"><Zap size={14} className="text-[var(--color-aqua)]" /> {p.credits} PDF credits</div>
                  <div className="flex items-center gap-2"><Clock size={14} className="text-[var(--color-violet)]" /> {p.validityDays} day{p.validityDays > 1 ? 's' : ''} validity</div>
                  <div className="flex items-center gap-2">
                    {unlocks
                      ? <><Crown size={14} className="text-[var(--color-aqua)]" /> <span className="text-[var(--color-aqua)]">Custom branding</span></>
                      : <><ShieldCheck size={14} className="text-[var(--color-gold)]" /> <span>AK-LOGIC AI branding</span></>}
                  </div>
                </div>
                <button disabled={!!processing} onClick={() => buy(p.id, p.name)} className="mt-5 w-full py-2.5 rounded-xl font-semibold text-white depth-raised disabled:opacity-60 transition-all duration-150 hover:-translate-y-0.5 shadow-md active:translate-y-0" style={{ background: unlocks ? 'linear-gradient(135deg,#059669,#10b981)' : 'linear-gradient(135deg,#1E3A5F,#2563EB)' }}>
                  {processing === p.id ? 'Processing…' : (inWindow && active ? 'Renew & Carry Forward' : 'Activate Plan')}
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ===== VALIDITY ADD-ON ===== */}
      <div>
        <h2 className="font-[var(--font-display)] font-semibold text-lg mb-3 flex items-center gap-2"><CalendarClock size={18} className="text-[var(--color-violet)]" /> Validity Extension Add-on</h2>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="depth-card rounded-[24px] p-7 relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full blur-3xl opacity-20" style={{ background: 'var(--color-violet)' }} />
          <div className="relative grid md:grid-cols-2 gap-6 items-center">
            <div>
              <div className="font-[var(--font-display)] text-4xl font-bold">₹{VALIDITY_ADDON.price}</div>
              <p className="text-sm text-[var(--color-mist)] mt-2">+{VALIDITY_ADDON.extendDays} days validity. <strong className="text-[var(--color-ivory)]">No new PDF credits</strong> — your existing {available} credits stay intact.</p>
              <div className="mt-4 flex items-start gap-2 text-xs text-[var(--color-mist-2)]">
                <AlertTriangle size={14} className="text-[var(--color-amber)] shrink-0 mt-0.5" />
                Time-only add-on. Branding eligibility follows your current plan's validity length, not this extension.
              </div>
            </div>
            <div className="depth-soft rounded-2xl p-6 text-center">
              <p className="text-sm text-[var(--color-mist)] mb-1">Current credits</p>
              <div className="font-[var(--font-display)] text-2xl font-bold aqua-text mb-4">{available} PDF</div>
              <button disabled={!!processing} onClick={extend} className="w-full py-3.5 rounded-xl font-semibold text-white depth-raised disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}>{processing === 'addon' ? 'Processing…' : 'Extend Validity (+30 days)'}</button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* secure payment note */}
      <div className="depth-soft rounded-2xl px-5 py-4 flex items-center gap-3 border border-emerald-500/20 bg-emerald-500/5">
        <ShieldCheck size={18} className="text-[var(--color-emerald)] shrink-0" />
        <p className="text-xs text-[var(--color-mist)]">
          Payments are processed through a <strong className="text-emerald-400">100% Secure Instant Razorpay & UPI Payment Gateway</strong>. Credit allocation and plan validity extensions are verified and applied automatically upon payment.
        </p>
      </div>

      {/* ===== RECHARGE HISTORY ===== */}
      <RechargeHistory merchantId={merchant.id} />
    </div>
  );
}

function StatTile({ label, value, icon, highlight }: { label: string; value: string; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="depth-soft rounded-xl px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-mist-2)] uppercase tracking-wider">{icon} {label}</div>
      <div className={`font-[var(--font-display)] font-bold mt-1 ${highlight ? 'text-2xl gold-text' : 'text-lg'}`}>{value}</div>
    </div>
  );
}

function RechargeHistory({ merchantId }: { merchantId: string }) {
  const txns = useTxns().filter((t) => t.merchantId === merchantId).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div>
      <h2 className="font-[var(--font-display)] font-semibold text-lg mb-3 flex items-center gap-2"><Wallet size={18} className="text-[var(--color-gold)]" /> Recharge History</h2>
      <div className="depth-card rounded-2xl overflow-hidden">
        {txns.length === 0 && <p className="text-sm text-[var(--color-mist-2)] p-6 text-center">No transactions yet.</p>}
        {txns.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-line)] last:border-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg grid place-items-center depth-soft shrink-0">
                {t.type === 'plan' ? <Zap size={15} className="text-[var(--color-aqua)]" /> : t.type === 'addon' ? <CalendarClock size={15} className="text-[var(--color-violet)]" /> : <ImageIcon size={15} className="text-[var(--color-mist-2)]" />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{t.reason}</div>
                <div className="text-[11px] text-[var(--color-mist-2)]">{timeAgo(t.createdAt)}{t.validityDays ? ` · +${t.validityDays}d` : ''}</div>
              </div>
            </div>
            <div className="text-right shrink-0 ml-3">
              {t.amount > 0 && <div className="text-sm font-semibold">₹{t.amount}</div>}
              {t.credits !== 0 && <Badge tone={t.credits > 0 ? 'emerald' : 'rose'}>{t.credits > 0 ? `+${t.credits}` : t.credits} cr</Badge>}
              {t.carriedForward ? <div className="text-[10px] text-[var(--color-emerald)] mt-0.5">+{t.carriedForward} carried</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FreeDailyInvoice({ merchant }: { merchant: Merchant }) {
  const free = credits.freeInvoiceAvailable(merchant);
  const nextAt = credits.freeInvoiceNextAt(merchant);
  const [, setTick] = useState(0);

  // Live countdown tick every 30s when on cooldown
  useState(() => {
    if (free) return;
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  });

  const countdown = (() => {
    if (free || !nextAt) return null;
    const diff = Math.max(0, nextAt - Date.now());
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    return `${h}h ${m}m`;
  })();

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="depth-card rounded-2xl p-5 relative overflow-hidden">
      <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full blur-3xl opacity-15" style={{ background: 'var(--color-emerald)' }} />
      <div className="relative flex items-center gap-4 flex-wrap">
        <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0" style={{ background: free ? 'rgba(16,185,129,0.14)' : 'rgba(233,196,106,0.14)' }}>
          <Gift size={20} className={free ? 'text-[var(--color-emerald)]' : 'text-[var(--color-gold)]'} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-[var(--font-display)] font-semibold text-sm flex items-center gap-2">
            Free Daily Invoice
            {free
              ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[rgba(16,185,129,0.14)] text-[var(--color-emerald)] uppercase tracking-wider">Available now</span>
              : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[rgba(233,196,106,0.14)] text-[var(--color-gold)] uppercase tracking-wider">Cooldown</span>}
          </div>
          <p className="text-xs text-[var(--color-mist)] mt-0.5">
            {free
              ? '1 free invoice available — no credits needed.'
              : `Next free invoice in ${countdown || 'less than a minute'}.`}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
