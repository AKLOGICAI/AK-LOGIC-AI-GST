import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import type { Merchant } from '../../lib/types';
import { store } from '../../lib/store';
import { PLANS, FREE_PLAN, daysRemaining, isExpired } from '../../lib/plans';

export function adminAccent(active: boolean) {
  return active ? { background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' } : {};
}

export function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    active: 'bg-[rgba(47,208,122,0.14)] text-[var(--color-emerald)]',
    suspended: 'bg-[rgba(255,180,84,0.14)] text-[var(--color-amber)]',
    disabled: 'bg-[rgba(255,107,136,0.14)] text-[var(--color-rose)]',
  };
  return <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${map[status || 'active']}`}>{status || 'active'}</span>;
}

export function KycBadge({ kyc }: { kyc?: string }) {
  const map: Record<string, string> = {
    verified: 'bg-[rgba(56,224,200,0.14)] text-[var(--color-aqua)]',
    pending: 'bg-[rgba(255,180,84,0.14)] text-[var(--color-amber)]',
    rejected: 'bg-[rgba(255,107,136,0.14)] text-[var(--color-rose)]',
  };
  return <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${map[kyc || 'pending']}`}>KYC {kyc || 'pending'}</span>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/65 backdrop-blur-sm" onClick={onClose}>
        <motion.div initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 16 }} onClick={(e) => e.stopPropagation()} className="depth-card rounded-[24px] w-full max-w-lg max-h-[90vh] overflow-y-auto no-scrollbar" style={{ borderColor: 'rgba(124,108,245,0.2)' }}>
          <div className="sticky top-0 glass border-b border-[var(--color-line)] px-6 py-4 flex items-center justify-between z-10">
            <h3 className="font-[var(--font-display)] font-bold text-lg">{title}</h3>
            <button onClick={onClose} className="w-9 h-9 rounded-lg grid place-items-center depth-soft"><X size={18} /></button>
          </div>
          <div className="p-6">{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export function AdminInput({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl bg-[#0c1322] border border-[var(--color-line)] px-4 py-2.5 text-sm outline-none focus:border-[var(--color-violet)]" />
    </label>
  );
}

export function VioletBtn({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white disabled:opacity-40 transition active:scale-[0.98]" style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}>
      {children}
    </button>
  );
}

/** The full management modal for one merchant: credits, validity, plan, status, KYC, branding. */
export function MerchantActionModal({ merchant, onClose }: { merchant: Merchant; onClose: () => void }) {
  const [tab, setTab] = useState<'credits' | 'validity' | 'plan' | 'status'>('credits');
  const [creditDelta, setCreditDelta] = useState('');
  const [reason, setReason] = useState('');
  const [planId, setPlanId] = useState(merchant.planId);

  const act = (fn: () => void) => { if (!reason.trim()) { toast.error('Reason required for audit log'); return; } fn(); setReason(''); setCreditDelta(''); };

  const tabs = [['credits', 'PDF Credits'], ['validity', 'Validity'], ['plan', 'Plan'], ['status', 'Status & KYC']] as const;

  return (
    <Modal title={`Manage · ${merchant.shopName}`} onClose={onClose}>
      {/* snapshot */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="depth-soft rounded-xl py-2.5 text-center"><div className="font-bold">{merchant.pdfCredits}</div><div className="text-[10px] text-[var(--color-mist-2)] uppercase">Credits</div></div>
        <div className="depth-soft rounded-xl py-2.5 text-center"><div className="font-bold">{isExpired(merchant.planExpiresAt) ? '0' : daysRemaining(merchant.planExpiresAt)}</div><div className="text-[10px] text-[var(--color-mist-2)] uppercase">Days Left</div></div>
        <div className="depth-soft rounded-xl py-2.5 text-center"><div className="font-bold text-xs mt-1">{merchant.planName}</div><div className="text-[10px] text-[var(--color-mist-2)] uppercase">Plan</div></div>
      </div>

      <div className="flex gap-1 p-1 rounded-xl depth-soft mb-5">
        {tabs.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium transition ${tab === t ? 'text-white' : 'text-[var(--color-mist)]'}`} style={adminAccent(tab === t)}>{label}</button>
        ))}
      </div>

      <div className="space-y-4">
        <AdminInput label="Reason (required · audit logged)" value={reason} onChange={setReason} placeholder="e.g. Promotional bonus" />

        {tab === 'credits' && (
          <>
            <AdminInput label="Credit Amount (+ gift / − deduct)" type="number" value={creditDelta} onChange={setCreditDelta} placeholder="e.g. 100 or -50" />
            <div className="flex gap-2">
              {[50, 100, 500].map((n) => <button key={n} onClick={() => setCreditDelta(String(n))} className="flex-1 py-2 rounded-lg text-xs depth-soft">+{n}</button>)}
            </div>
            <VioletBtn disabled={!creditDelta} onClick={() => act(() => store.admin.adjustCredits(merchant.id, parseInt(creditDelta, 10) || 0, reason))}>
              {parseInt(creditDelta, 10) >= 0 ? 'Gift Credits' : 'Deduct Credits'}
            </VioletBtn>
          </>
        )}

        {tab === 'validity' && (
          <>
            <p className="text-xs text-[var(--color-mist)]">Grant free validity. Branding unlocks if total validity reaches 30 days.</p>
            <div className="grid grid-cols-3 gap-2">
              {[7, 15, 30].map((d) => (
                <button key={d} onClick={() => act(() => store.admin.grantValidity(merchant.id, d, reason))} className="py-3 rounded-xl text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}>+{d} Days</button>
              ))}
            </div>
            <button onClick={() => act(() => store.admin.resetExpiry(merchant.id, reason))} className="w-full py-2.5 rounded-xl text-sm border border-[var(--color-line)] hover:border-[var(--color-violet)] transition">Reset Expiry (from today)</button>
          </>
        )}

        {tab === 'plan' && (
          <>
            <label className="block">
              <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase">Set Plan (free upgrade/downgrade)</span>
              <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="mt-1.5 w-full rounded-xl bg-[#0c1322] border border-[var(--color-line)] px-4 py-2.5 text-sm outline-none focus:border-[var(--color-violet)]">
                <option value={FREE_PLAN.id}>{FREE_PLAN.name}</option>
                {PLANS.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.credits} credits · {p.validityDays}d</option>)}
              </select>
            </label>
            <VioletBtn onClick={() => act(() => store.admin.setPlan(merchant.id, planId, reason))}>Apply Plan (No Payment)</VioletBtn>
            <div className="pt-2 border-t border-[var(--color-line)]">
              <div className="flex items-center justify-between">
                <span className="text-sm">Custom Branding</span>
                <div className="flex gap-2">
                  <button onClick={() => act(() => store.admin.setBranding(merchant.id, true, reason))} className="px-3 py-1.5 rounded-lg text-xs bg-[rgba(56,224,200,0.12)] text-[var(--color-aqua)]">Enable</button>
                  <button onClick={() => act(() => store.admin.setBranding(merchant.id, false, reason))} className="px-3 py-1.5 rounded-lg text-xs bg-[rgba(255,107,136,0.12)] text-[var(--color-rose)]">Disable</button>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'status' && (
          <>
            <div>
              <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase">Account Status</span>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                <button onClick={() => act(() => store.admin.setStatus(merchant.id, 'active', reason))} className="py-2.5 rounded-xl text-xs font-semibold bg-[rgba(47,208,122,0.12)] text-[var(--color-emerald)]">Activate</button>
                <button onClick={() => act(() => store.admin.setStatus(merchant.id, 'suspended', reason))} className="py-2.5 rounded-xl text-xs font-semibold bg-[rgba(255,180,84,0.12)] text-[var(--color-amber)]">Suspend</button>
                <button onClick={() => act(() => store.admin.setStatus(merchant.id, 'disabled', reason))} className="py-2.5 rounded-xl text-xs font-semibold bg-[rgba(255,107,136,0.12)] text-[var(--color-rose)]">Disable</button>
              </div>
            </div>
            <div>
              <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase">KYC Status</span>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                <button onClick={() => act(() => store.admin.setKyc(merchant.id, 'verified', reason))} className="py-2.5 rounded-xl text-xs font-semibold bg-[rgba(56,224,200,0.12)] text-[var(--color-aqua)]">Verify</button>
                <button onClick={() => act(() => store.admin.setKyc(merchant.id, 'pending', reason))} className="py-2.5 rounded-xl text-xs font-semibold bg-[rgba(255,180,84,0.12)] text-[var(--color-amber)]">Pending</button>
                <button onClick={() => act(() => store.admin.setKyc(merchant.id, 'rejected', reason))} className="py-2.5 rounded-xl text-xs font-semibold bg-[rgba(255,107,136,0.12)] text-[var(--color-rose)]">Reject</button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
