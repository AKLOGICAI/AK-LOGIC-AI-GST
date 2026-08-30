import { useMemo, useState } from 'react';
import { Wallet, ArrowDownLeft, ArrowUpRight, Crown, Calendar, Plus, Undo2 } from 'lucide-react';
import { store, useTxns, useMerchants, useSubscriptions } from '../../lib/store';
import { inr } from '../../lib/gst';
import { PageHeader, Badge, timeAgo } from '../../components/ui';
import { Modal, AdminInput, VioletBtn } from './AdminKit';

export default function AdminRecharge() {
  const txnsRaw = useTxns();
  const txns = useMemo(() => [...txnsRaw].sort((a, b) => b.createdAt - a.createdAt), [txnsRaw]);
  const merchants = useMerchants();
  const subs = useSubscriptions();
  const nameOf = (id: string) => merchants.find((m) => m.id === id)?.shopName || id;
  const [showManual, setShowManual] = useState(false);
  const [mid, setMid] = useState(merchants[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [creditsAdded, setCreditsAdded] = useState('');
  const [reason, setReason] = useState('');

  // Ids of recharges that already have a refund entry pointing back at them
  // — used to hide the Refund button so the same recharge can't be
  // refunded twice from the UI (adminService.refund also guards this
  // server-side-cache-wise, but hiding the button avoids the confusing
  // no-op click in the first place).
  const refundedIds = useMemo(() => new Set(txns.map((t) => t.refundedFrom).filter(Boolean)), [txns]);
  const credited = useMemo(() => txns.filter((t) => t.type === 'plan' || t.type === 'addon').reduce((s, t) => s + t.amount, 0), [txns]);
  const debited = useMemo(() => txns.filter((t) => t.type === 'debit').reduce((s, t) => s + t.amount, 0), [txns]);
  const activeSubs = useMemo(() => subs.filter((s) => s.validityDays >= 30 && s.active && s.expiresAt > Date.now()), [subs]);

  const doManual = () => {
    if (!mid || !reason.trim()) return;
    store.admin.manualRecharge(mid, parseInt(amount, 10) || 0, parseInt(creditsAdded, 10) || 0, reason);
    setShowManual(false); setAmount(''); setCreditsAdded(''); setReason('');
  };

  return (
    <div>
      <PageHeader title="Recharge Control" subtitle="Payment logs, manual recharge entries aur refunds." action={<button onClick={() => setShowManual(true)} className="flex items-center gap-2 px-5 py-3 rounded-2xl font-semibold text-white" style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}><Plus size={17} /> Manual Recharge</button>} />
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="depth-card rounded-2xl p-5"><ArrowDownLeft size={20} className="text-[var(--color-emerald)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">{inr(credited)}</div><div className="text-sm text-[var(--color-mist)]">Total Credited</div></div>
        <div className="depth-card rounded-2xl p-5"><ArrowUpRight size={20} className="text-[var(--color-rose)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">{inr(debited)}</div><div className="text-sm text-[var(--color-mist)]">Total Debited</div></div>
        <div className="depth-card rounded-2xl p-5"><Crown size={20} className="text-[var(--color-aqua)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">{activeSubs.length}</div><div className="text-sm text-[var(--color-mist)]">Active Subscriptions</div></div>
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold mb-4 flex items-center gap-2"><Wallet size={18} className="text-[var(--color-gold)]" /> Recharge History</h3>
          <div className="space-y-2">
            {txns.map((t) => (
              <div key={t.id} className="flex items-center justify-between depth-soft rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-3 min-w-0"><div className="w-8 h-8 rounded-lg grid place-items-center depth-raised shrink-0" style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}>{t.type !== 'debit' ? <ArrowDownLeft size={15} className="text-[var(--color-emerald)]" /> : <ArrowUpRight size={15} className="text-[var(--color-rose)]" />}</div><div className="min-w-0"><div className="text-sm truncate">{nameOf(t.merchantId)}</div><div className="text-[11px] text-[var(--color-mist-2)] truncate">{t.reason} · {timeAgo(t.createdAt)}</div></div></div>
                <div className="flex items-center gap-2 shrink-0"><span className="text-sm font-semibold" style={{ color: t.type !== 'debit' ? 'var(--color-emerald)' : 'var(--color-rose)' }}>{t.amount !== 0 ? `₹${t.amount}` : `${t.credits} cr`}</span>{t.amount > 0 && !refundedIds.has(t.id) && <button onClick={() => store.admin.refund(t.id, 'Admin refund')} title="Refund" className="w-7 h-7 rounded-lg grid place-items-center text-[var(--color-rose)] hover:bg-[rgba(255,107,136,0.1)]"><Undo2 size={14} /></button>}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold mb-4 flex items-center gap-2"><Crown size={18} className="text-[var(--color-aqua)]" /> Subscriptions</h3>
          <div className="space-y-2">
            {subs.map((s) => (
              <div key={s.id} className="flex items-center justify-between depth-soft rounded-xl px-4 py-3">
                <div><div className="text-sm font-medium">{nameOf(s.merchantId)}</div><div className="text-[11px] text-[var(--color-mist-2)] flex items-center gap-1"><Calendar size={11} /> Since {new Date(s.startedAt).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}{s.expiresAt ? ` · Renews ${new Date(s.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</div></div>
                {s.validityDays >= 30 ? <Badge tone="aqua">{s.planName}</Badge> : <Badge tone="gold">{s.planName}</Badge>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {showManual && (
        <Modal title="Manual Recharge Entry" onClose={() => setShowManual(false)}>
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase">Merchant</span>
              <select value={mid} onChange={(e) => setMid(e.target.value)} className="mt-1.5 w-full rounded-xl bg-[#0c1322] border border-[var(--color-line)] px-4 py-2.5 text-sm outline-none focus:border-[var(--color-violet)]">
                {merchants.map((m) => <option key={m.id} value={m.id}>{m.shopName}</option>)}
              </select>
            </label>
            <AdminInput label="Amount (₹)" type="number" value={amount} onChange={setAmount} placeholder="e.g. 199" />
            <AdminInput label="PDF Credits to add" type="number" value={creditsAdded} onChange={setCreditsAdded} placeholder="e.g. 300" />
            <AdminInput label="Reason (audit logged)" value={reason} onChange={setReason} placeholder="e.g. Offline UPI payment" />
            <VioletBtn disabled={!reason.trim()} onClick={doManual}>Create Recharge Entry</VioletBtn>
          </div>
        </Modal>
      )}
    </div>
  );
}
