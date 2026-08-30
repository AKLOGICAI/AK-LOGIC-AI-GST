import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Building2, CreditCard, Calendar, ShieldCheck, Crown, Settings as SettingsIcon, Wallet, Monitor, Smartphone } from 'lucide-react';
import type { Merchant } from '../../lib/types';
import { useInvoices, useTxns, credits } from '../../lib/store';
import { merchantService } from '../../lib/services';
import { inr } from '../../lib/gst';
import { PageHeader, Badge, StatPill, timeAgo } from '../../components/ui';
import { useDesktopView } from '../../lib/viewportMode';

export default function ProfilePage({ merchant }: { merchant: Merchant }) {
  const [isDesktopView, setDesktopView] = useDesktopView();
  const approved = useInvoices().filter((iv) => iv.merchantId === merchant.id);
  const revenue = approved.reduce((s, iv) => s + iv.grandTotal, 0);
  const txns = useTxns().filter((t) => t.merchantId === merchant.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);

  const member = new Date(merchant.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div>
      <PageHeader title="Profile" subtitle="Your business profile and account summary." />

      <div className="grid lg:grid-cols-3 gap-5">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="depth-card rounded-2xl p-6 lg:col-span-1">
          <div className="flex flex-col items-center text-center">
          {(() => {
            const merchantLogo = merchant.logoUrl || merchant.logoDataUrl;
            return (
              <div className="w-20 h-20 rounded-2xl grid place-items-center text-[var(--color-ink)] text-3xl font-bold depth-raised" style={{ background: merchantLogo ? 'transparent' : 'linear-gradient(135deg,#f6dd9b,#e9c46a)' }}>
                {merchantLogo ? <img src={merchantLogo} alt="logo" className="w-full h-full object-contain rounded-2xl" /> : merchant.shopName.charAt(0)}
              </div>
            );
          })()}
            <h3 className="font-[var(--font-display)] text-lg font-bold mt-4">{merchant.tradeName || merchant.shopName}</h3>
            <p className="text-sm text-[var(--color-mist)]">{merchant.legalName || merchant.ownerName}{merchant.businessType ? ` · ${merchant.businessType}` : ''}</p>
            <div className="mt-3">{merchant.customBranding ? <Badge tone="aqua"><Crown size={11} className="inline mr-1" /> {merchant.planName}</Badge> : <Badge tone="gold">{merchant.planName}</Badge>}</div>
            {merchant.merchantCode && (
              <div className="mt-3 depth-soft rounded-xl px-4 py-2 w-full text-center">
                <div className="text-[10px] text-[var(--color-mist-2)] uppercase tracking-wider">Merchant ID</div>
                <div className="font-mono text-sm text-[var(--color-aqua)] tracking-wider">{merchant.merchantCode}</div>
              </div>
            )}
          </div>
          <div className="mt-6 space-y-2.5 text-sm">
            <div className="flex items-center gap-3 text-[var(--color-mist)]"><Phone size={15} className="text-[var(--color-aqua)]" /> {merchant.phone}</div>
            <div className="flex items-center gap-3 text-[var(--color-mist)]"><Mail size={15} className="text-[var(--color-aqua)]" /> <span className="truncate">{merchant.email}</span></div>
            <div className="flex items-start gap-3 text-[var(--color-mist)]"><MapPin size={15} className="text-[var(--color-aqua)] mt-0.5" /> <span>{merchant.address}{merchant.city ? `, ${merchant.city}` : ''}, {merchant.state}{merchant.pincode ? ` - ${merchant.pincode}` : ''}</span></div>
            <div className="flex items-center gap-3 text-[var(--color-mist)]"><Calendar size={15} className="text-[var(--color-aqua)]" /> Member since {member}</div>
          </div>
          <Link to="/dashboard/settings" className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border border-[var(--color-line)] hover:border-[var(--color-aqua)] transition"><SettingsIcon size={15} /> Edit Details</Link>
        </motion.div>

        <div className="lg:col-span-2 space-y-5">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="depth-card rounded-2xl p-6">
            <h3 className="font-[var(--font-display)] font-semibold mb-4">Account Summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatPill label="Revenue" value={inr(revenue)} color="var(--color-gold)" />
              <StatPill label="Invoices" value={String(approved.length)} color="var(--color-aqua)" />
              <StatPill label="PDF Credits" value={String(credits.available(merchant))} color="var(--color-emerald)" />
              <StatPill label="QR Scans" value={String(approved.length + 5)} color="var(--color-violet)" />
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="depth-card rounded-2xl p-6">
            <h3 className="font-[var(--font-display)] font-semibold mb-4 flex items-center gap-2"><Building2 size={18} className="text-[var(--color-gold)]" /> GST & Bank</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="depth-soft rounded-xl px-4 py-3"><div className="text-[11px] text-[var(--color-mist-2)] uppercase tracking-wider">Legal Name</div><div className="mt-0.5">{merchant.legalName || merchant.ownerName}</div></div>
              <div className="depth-soft rounded-xl px-4 py-3"><div className="text-[11px] text-[var(--color-mist-2)] uppercase tracking-wider">Trade Name</div><div className="mt-0.5">{merchant.tradeName || merchant.shopName}</div></div>
              <div className="depth-soft rounded-xl px-4 py-3"><div className="text-[11px] text-[var(--color-mist-2)] uppercase tracking-wider">GSTIN</div><div className="font-mono mt-0.5">{merchant.gstin}</div></div>
              <div className="depth-soft rounded-xl px-4 py-3"><div className="text-[11px] text-[var(--color-mist-2)] uppercase tracking-wider">PAN</div><div className="font-mono mt-0.5">{merchant.pan}</div></div>
              <div className="depth-soft rounded-xl px-4 py-3"><div className="text-[11px] text-[var(--color-mist-2)] uppercase tracking-wider">Business Type</div><div className="mt-0.5">{merchant.businessType || '—'}</div></div>
              <div className="depth-soft rounded-xl px-4 py-3"><div className="text-[11px] text-[var(--color-mist-2)] uppercase tracking-wider">Bank</div><div className="mt-0.5">{merchant.bankName}{merchant.accountType ? ` · ${merchant.accountType === 'savings' ? 'Savings' : 'Current'}` : ''}</div></div>
              <div className="depth-soft rounded-xl px-4 py-3"><div className="text-[11px] text-[var(--color-mist-2)] uppercase tracking-wider">A/C · IFSC</div><div className="font-mono mt-0.5 text-xs">{merchant.accountNumber} · {merchant.ifsc}</div></div>
              {merchant.upiId && <div className="depth-soft rounded-xl px-4 py-3 sm:col-span-2"><div className="text-[11px] text-[var(--color-mist-2)] uppercase tracking-wider">UPI ID</div><div className="font-mono mt-0.5 text-xs">{merchant.upiId}</div></div>}
            </div>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-[var(--color-mist-2)]"><ShieldCheck size={14} className="text-[var(--color-emerald)]" /> Details encrypted & GST verified.</div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="depth-card rounded-2xl p-6">
            <h3 className="font-[var(--font-display)] font-semibold mb-4 flex items-center gap-2"><Wallet size={18} className="text-[var(--color-aqua)]" /> Recent Transactions</h3>
            <div className="space-y-2">
              {txns.map((t) => (
                <div key={t.id} className="flex items-center justify-between depth-soft rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg grid place-items-center depth-raised" style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}><CreditCard size={15} style={{ color: t.credits >= 0 ? 'var(--color-emerald)' : 'var(--color-rose)' }} /></div>
                    <div><div className="text-sm">{t.reason}</div><div className="text-[11px] text-[var(--color-mist-2)]">{timeAgo(t.createdAt)}</div></div>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: t.credits >= 0 ? 'var(--color-emerald)' : 'var(--color-rose)' }}>{t.amount > 0 ? `₹${t.amount}` : `${t.credits} cr`}</span>
                </div>
              ))}
              {txns.length === 0 && <p className="text-sm text-[var(--color-mist-2)]">No transactions yet.</p>}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="depth-card rounded-2xl p-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl grid place-items-center depth-soft text-[var(--color-aqua)]">
                  {isDesktopView ? <Monitor size={20} /> : <Smartphone size={20} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-[var(--font-display)] font-semibold">Desktop View</h3>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isDesktopView ? 'bg-[var(--color-aqua)]/20 text-[var(--color-aqua)]' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      {isDesktopView ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-mist-2)] mt-0.5">
                    {isDesktopView
                      ? 'Widescreen multi-column layout enabled.'
                      : 'Forced mobile-compact layout enabled (Recommended for mobile browsers).'}
                  </p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isDesktopView}
                  onChange={(e) => setDesktopView(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-12 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-aqua)] border border-slate-700"></div>
              </label>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
