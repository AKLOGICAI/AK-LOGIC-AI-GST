import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, FileText, UserCheck, CreditCard, ArrowUpRight, Award, Sparkles, Store, MessageSquare } from 'lucide-react';
import CustomerChatWidget from '../../../components/chat/CustomerChatWidget';

interface CustomerProfileData {
  id: string;
  customerCode: string;
  name: string;
  phone: string;
  status: string;
  createdAt: number;
}

export default function CustomerOverview({ customer, invoices }: { customer: CustomerProfileData | null; invoices: any[] }) {
  const [activeChatMerchant, setActiveChatMerchant] = useState<{ id: string; name: string } | null>(null);

  // Derive unique saved merchants from customer's invoice history
  const savedMerchants = useMemo(() => {
    const map = new Map<string, { id: string; name: string; invoiceCount: number; lastDate: number }>();
    (invoices || []).forEach((iv) => {
      if (!iv.merchantId) return;
      const existing = map.get(iv.merchantId);
      const date = iv.invoiceDate || iv.createdAt || 0;
      const name = iv.merchantShopName || iv.shopName || 'AK LOGIC AI Merchant';
      if (existing) {
        existing.invoiceCount += 1;
        if (date > existing.lastDate) existing.lastDate = date;
      } else {
        map.set(iv.merchantId, {
          id: iv.merchantId,
          name,
          invoiceCount: 1,
          lastDate: date,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.lastDate - a.lastDate);
  }, [invoices]);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[24px] p-6 sm:p-8 bg-gradient-to-r from-blue-900/80 via-sky-900/60 to-slate-900 border border-cyan-400/30 relative overflow-hidden shadow-xl"
      >
        <div className="flex items-start justify-between flex-wrap gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-semibold mb-3 border border-cyan-500/30">
              <ShieldCheck size={14} /> Customer Vault Realm
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Welcome back, {customer?.name || 'Valued Customer'}!
            </h1>
            <p className="text-sm text-cyan-100/80 mt-1">
              Your permanent GST invoices and purchase receipts are safely stored here.
            </p>
          </div>

          <div className="text-right">
            <div className="text-[10px] text-cyan-200 uppercase tracking-widest font-bold">AKC Customer ID</div>
            <div className="text-2xl font-black font-mono text-cyan-300 drop-shadow">
              {customer?.customerCode || 'AKC-00000000'}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Customer Welcome Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="depth-card rounded-[24px] p-6 sm:p-7 border border-amber-400/30 bg-gradient-to-br from-amber-950/20 via-slate-900 to-blue-950/40 relative overflow-hidden"
      >
        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm mb-2">
          <Sparkles size={18} /> 🎉 Welcome to AK-LOGIC AI
        </div>
        <div className="text-xs text-[var(--color-mist-2)] uppercase tracking-wider font-semibold">
          Your Unique Customer ID
        </div>
        <div className="text-3xl font-black font-mono text-cyan-300 my-1 drop-shadow-md">
          {customer?.customerCode || 'AKC-00000000'}
        </div>
        <p className="text-xs text-[var(--color-mist)] leading-relaxed mt-2">
          From now on, you only need your <strong className="text-white">Customer ID + PIN</strong>. Your profile information will be filled automatically whenever you visit any AK-LOGIC AI merchant.
        </p>
        <p className="text-xs text-cyan-100/90 leading-relaxed mt-1.5">
          Your invoices, purchases, rewards, cashback, subscriptions, warranties, and all future AK-LOGIC AI services will be securely linked to this single Customer ID.
        </p>
        <p className="text-[11px] text-amber-300/80 italic mt-3 pt-2 border-t border-white/5">
          💡 You can change your default PIN anytime from your Customer Dashboard.
        </p>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="depth-card rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-300 grid place-items-center shrink-0 border border-cyan-500/20">
            <FileText size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold font-[var(--font-display)] text-white">{invoices.length}</div>
            <div className="text-xs text-[var(--color-mist)]">Total Invoices</div>
          </div>
        </div>

        <div className="depth-card rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 grid place-items-center shrink-0 border border-emerald-500/20">
            <UserCheck size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold font-[var(--font-display)] text-emerald-400 capitalize">
              {customer?.status || 'Active'}
            </div>
            <div className="text-xs text-[var(--color-mist)]">Account Status</div>
          </div>
        </div>

        <div className="depth-card rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-300 grid place-items-center shrink-0 border border-amber-500/20">
            <Award size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold font-[var(--font-display)] text-amber-300">Verified</div>
            <div className="text-xs text-[var(--color-mist)]">Mobile Verification</div>
          </div>
        </div>
      </div>

      {/* Saved Merchant Repository Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold font-[var(--font-display)] flex items-center gap-2">
            <Store className="text-cyan-400" size={22} /> Saved Merchant Network
          </h2>
          <span className="text-xs text-[var(--color-mist)]">{savedMerchants.length} Merchant(s)</span>
        </div>

        {savedMerchants.length === 0 ? (
          <div className="depth-card rounded-2xl p-8 text-center">
            <Store size={32} className="text-[var(--color-mist-2)] mx-auto mb-2" />
            <p className="text-sm text-[var(--color-mist)]">No merchant relationships saved yet.</p>
            <p className="text-xs text-[var(--color-mist-2)] mt-1">Your merchants will appear here automatically when you make your first purchase using your AKC ID.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {savedMerchants.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="depth-card rounded-2xl p-5 flex items-center justify-between border border-[var(--color-line)] hover:border-cyan-500/40 transition group"
              >
                <div>
                  <div className="font-bold text-base text-white group-hover:text-cyan-300 transition flex items-center gap-2">
                    <Store size={16} className="text-cyan-400" /> {m.name}
                  </div>
                  <div className="text-xs text-[var(--color-mist)] mt-1 flex items-center gap-3">
                    <span>{m.invoiceCount} Invoice(s)</span>
                    <span>·</span>
                    <span>Last visit: {new Date(m.lastDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>

                <button
                  onClick={() => setActiveChatMerchant({ id: m.id, name: m.name })}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2.5 rounded-xl bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition shrink-0 ml-3"
                >
                  <MessageSquare size={14} /> Chat & Inquire
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/customer/dashboard/invoices"
          className="depth-card rounded-2xl p-6 hover:border-[var(--color-aqua)] transition group flex items-center justify-between"
        >
          <div>
            <h3 className="font-bold text-lg text-white group-hover:text-[var(--color-aqua)] transition">
              View Invoice History
            </h3>
            <p className="text-xs text-[var(--color-mist)] mt-1">
              Browse and download GST tax invoices across all merchants.
            </p>
          </div>
          <ArrowUpRight size={24} className="text-[var(--color-aqua)] group-hover:translate-x-1 group-hover:-translate-y-1 transition shrink-0 ml-4" />
        </Link>

        <Link
          to="/customer/dashboard/profile"
          className="depth-card rounded-2xl p-6 hover:border-[var(--color-aqua)] transition group flex items-center justify-between"
        >
          <div>
            <h3 className="font-bold text-lg text-white group-hover:text-[var(--color-aqua)] transition">
              My Profile Details
            </h3>
            <p className="text-xs text-[var(--color-mist)] mt-1">
              View your registered phone, AKC ID, and security details.
            </p>
          </div>
          <ArrowUpRight size={24} className="text-[var(--color-aqua)] group-hover:translate-x-1 group-hover:-translate-y-1 transition shrink-0 ml-4" />
        </Link>
      </div>

      {/* Customer Chat Widget Modal */}
      {activeChatMerchant && customer && (
        <CustomerChatWidget
          merchantId={activeChatMerchant.id}
          merchantName={activeChatMerchant.name}
          customerId={customer.id}
          customerCode={customer.customerCode}
          customerName={customer.name}
          open={!!activeChatMerchant}
          onClose={() => setActiveChatMerchant(null)}
        />
      )}
    </div>
  );
}
