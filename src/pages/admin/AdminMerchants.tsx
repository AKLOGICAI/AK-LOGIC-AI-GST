import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Settings2, Crown, Hash, UserPlus, Loader2, Check } from 'lucide-react';
import { store, useMerchants, useInvoices } from '../../lib/store';
import { ApiError } from '../../lib/apiClient';
import { inr } from '../../lib/gst';
import { daysRemaining, isExpired } from '../../lib/plans';
import { PageHeader } from '../../components/ui';
import { StatusBadge, KycBadge, MerchantActionModal, Modal, AdminInput, VioletBtn } from './AdminKit';
import { INDIAN_STATES } from '../../lib/states';
import type { Merchant } from '../../lib/types';

export default function AdminMerchants() {
  const merchants = useMerchants();
  const invoices = useInvoices();
  const [q, setQ] = useState('');
  const [active, setActive] = useState<Merchant | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const rows = merchants.filter((m) => {
    const t = q.toLowerCase();
    const shopName = m.shopName || '';
    const ownerName = m.ownerName || '';
    const phone = m.phone || '';
    const gstin = m.gstin || '';
    const id = m.id || '';
    const qrId = m.qrId || '';
    const merchantCode = m.merchantCode || '';
    return shopName.toLowerCase().includes(t) ||
           ownerName.toLowerCase().includes(t) ||
           phone.includes(q) ||
           gstin.toLowerCase().includes(t) ||
           id.toLowerCase().includes(t) ||
           qrId.toLowerCase().includes(t) ||
           merchantCode.toLowerCase().includes(t);
  });

  // keep the open modal in sync with live store updates
  const live = active ? merchants.find((m) => m.id === active.id) || null : null;

  return (
    <div>
      <PageHeader
        title="Merchant Management"
        subtitle="Search, inspect, and instantly control every merchant."
        action={
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}>
            <UserPlus size={16} /> Add Merchant Manually
          </button>
        }
      />
      <div className="relative max-w-md mb-6">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-mist-2)]" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, mobile, GSTIN, merchant ID..." className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-violet)]" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {rows.map((m, i) => {
          const inv = invoices.filter((iv) => iv.merchantId === m.id);
          const rev = inv.reduce((s, iv) => s + iv.grandTotal, 0);
          const expired = isExpired(m.planExpiresAt);
          return (
            <motion.div key={m.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="depth-card rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl grid place-items-center text-[var(--color-ink)] font-bold depth-raised shrink-0" style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}>{(m.shopName || 'M').charAt(0)}</div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{m.shopName}</div>
                    <div className="text-xs text-[var(--color-mist-2)] truncate">{m.ownerName} · {m.phone}</div>
                    {m.merchantCode && <div className="text-[11px] font-mono text-[var(--color-aqua)] truncate">{m.merchantCode}</div>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <StatusBadge status={m.status} />
                  <KycBadge kyc={m.kyc} />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                <div className="depth-soft rounded-xl py-2.5"><div className="font-semibold text-sm">{inr(rev)}</div><div className="text-[10px] text-[var(--color-mist-2)] uppercase">Revenue</div></div>
                <div className="depth-soft rounded-xl py-2.5"><div className="font-semibold text-sm">{inv.length}</div><div className="text-[10px] text-[var(--color-mist-2)] uppercase">Invoices</div></div>
                <div className="depth-soft rounded-xl py-2.5"><div className="font-semibold text-sm">{m.pdfCredits}</div><div className="text-[10px] text-[var(--color-mist-2)] uppercase">Credits</div></div>
                <div className="depth-soft rounded-xl py-2.5"><div className={`font-semibold text-sm ${expired ? 'text-[var(--color-rose)]' : ''}`}>{expired ? 'Exp' : daysRemaining(m.planExpiresAt) + 'd'}</div><div className="text-[10px] text-[var(--color-mist-2)] uppercase">Validity</div></div>
              </div>

              <div className="mt-3 flex items-center gap-2 text-[11px] text-[var(--color-mist-2)] flex-wrap">
                <span className="flex items-center gap-1"><Crown size={11} /> {m.planName}</span>
                <span className="flex items-center gap-1"><Hash size={11} /> {m.gstin}</span>
                {m.customBranding && <span className="text-[var(--color-aqua)]">★ Custom branding</span>}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="text-[11px] text-[var(--color-mist-2)] font-mono">{m.qrId}</div>
                <button onClick={() => setActive(m)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}><Settings2 size={14} /> Manage</button>
              </div>
            </motion.div>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-[var(--color-mist-2)] col-span-2 text-center py-10">No merchants match your search.</p>}
      </div>

      {live && <MerchantActionModal merchant={live} onClose={() => setActive(null)} />}
      {addOpen && <AddMerchantModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}

/**
 * Manual onboarding path for when the OTP provider is unavailable and a
 * merchant can't get through the self-service /register flow. Admin fills
 * in the merchant's details and picks the MPIN themselves; the merchant
 * then logs in normally afterwards with their phone + this MPIN. See
 * store.adminCreateMerchant / adminService.createMerchant.
 */
function AddMerchantModal({ onClose }: { onClose: () => void }) {
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [mpin, setMpin] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [address, setAddress] = useState('');
  const [state, setState] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [upiId, setUpiId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<Merchant | null>(null);

  const valid =
    shopName.trim() && ownerName.trim() && email.trim() &&
    /^\d{10}$/.test(phone) && /^\d{4}$/.test(mpin) &&
    gstin.trim().length === 15 && pan.trim().length === 10 &&
    address.trim() && state && bankName.trim() &&
    accountNumber.trim() && ifsc.trim();

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr('');
    try {
      const m = await store.adminCreateMerchant({
        shopName: shopName.trim(), ownerName: ownerName.trim(), email: email.trim(),
        phone, mpin, gstin: gstin.trim().toUpperCase(), pan: pan.trim().toUpperCase(),
        address: address.trim(), state, bankName: bankName.trim(), accountType: 'current',
        accountNumber: accountNumber.trim(), ifsc: ifsc.trim().toUpperCase(),
        upiId: upiId.trim() || undefined,
      });
      setDone(m);
    } catch (e) {
      console.error('[admin] manual merchant creation failed:', e);
      if (e instanceof ApiError) setErr(e.status === 409 ? 'An account already exists for this mobile number.' : e.message);
      else setErr(e instanceof Error ? e.message : 'Could not create the merchant. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Modal title="Merchant Created" onClose={onClose}>
        <div className="space-y-4 text-center py-2">
          <div className="w-14 h-14 mx-auto rounded-full grid place-items-center" style={{ background: 'linear-gradient(135deg,#6ff2dc,#38e0c8)' }}>
            <Check size={26} className="text-[var(--color-ink)]" strokeWidth={3} />
          </div>
          <p className="text-sm text-[var(--color-mist)]">
            <span className="font-semibold text-[var(--color-ivory)]">{done.shopName}</span> is registered ({done.merchantCode}).
          </p>
          <div className="depth-soft rounded-xl p-4 text-left text-sm space-y-1">
            <div><span className="text-[var(--color-mist-2)]">Mobile:</span> <span className="font-mono">{done.phone}</span></div>
            <div><span className="text-[var(--color-mist-2)]">MPIN:</span> <span className="font-mono">{mpin}</span></div>
          </div>
          <p className="text-xs text-[var(--color-mist-2)]">Share these with the merchant — next time they can log in directly with their mobile number and MPIN, no OTP needed.</p>
          <VioletBtn onClick={onClose}>Done</VioletBtn>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add Merchant Manually" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-[var(--color-mist-2)] bg-[rgba(147,133,255,0.08)] rounded-lg px-3 py-2.5">
          Use this when the OTP provider is down and a merchant can't self-register. This creates their account directly — no OTP is sent. Set an MPIN and share it with the merchant; they'll use it to log in going forward.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <AdminInput label="Business / Trade Name" value={shopName} onChange={setShopName} placeholder="Enter business name" />
          <AdminInput label="Owner Name" value={ownerName} onChange={setOwnerName} placeholder="Enter owner's name" />
          <AdminInput label="Email" type="email" value={email} onChange={setEmail} placeholder="Enter email address" />
          <AdminInput label="Mobile Number" value={phone} onChange={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile number" />
          <AdminInput label="MPIN (4-digit login PIN)" value={mpin} onChange={(v) => setMpin(v.replace(/\D/g, '').slice(0, 4))} placeholder="e.g. 4821" />
          <label className="block">
            <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase">State</span>
            <select value={state} onChange={(e) => setState(e.target.value)} className="mt-1.5 w-full rounded-xl bg-[#0c1322] border border-[var(--color-line)] px-4 py-2.5 text-sm outline-none focus:border-[var(--color-violet)]">
              <option value="" disabled>Select state</option>
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <AdminInput label="GSTIN" value={gstin} onChange={(v) => setGstin(v.toUpperCase().slice(0, 15))} placeholder="15-digit GSTIN" />
          <AdminInput label="PAN" value={pan} onChange={(v) => setPan(v.toUpperCase().slice(0, 10))} placeholder="10-character PAN" />
          <div className="sm:col-span-2"><AdminInput label="Business Address" value={address} onChange={setAddress} placeholder="Enter full business address" /></div>
          <AdminInput label="Bank Name" value={bankName} onChange={setBankName} placeholder="Enter bank name" />
          <AdminInput label="Account Number" value={accountNumber} onChange={(v) => setAccountNumber(v.replace(/\D/g, ''))} placeholder="Enter account number" />
          <AdminInput label="IFSC Code" value={ifsc} onChange={(v) => setIfsc(v.toUpperCase().slice(0, 11))} placeholder="Enter IFSC code" />
          <AdminInput label="UPI ID (optional)" value={upiId} onChange={setUpiId} placeholder="yourname@upi" />
        </div>
        {err && <p className="text-xs text-[var(--color-rose)]">{err}</p>}
        <VioletBtn disabled={!valid || busy} onClick={submit}>
          {busy ? <><Loader2 size={16} className="animate-spin" /> Creating account…</> : 'Create Merchant Account'}
        </VioletBtn>
      </div>
    </Modal>
  );
}
