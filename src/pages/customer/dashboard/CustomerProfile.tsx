import { User, Smartphone, KeyRound, ShieldCheck, Calendar } from 'lucide-react';

interface CustomerProfileData {
  id: string;
  customerCode: string;
  name: string;
  phone: string;
  status: string;
  createdAt: number;
}

export default function CustomerProfile({ customer }: { customer: CustomerProfileData | null }) {
  if (!customer) return null;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-[var(--font-display)] text-3xl font-bold">My Profile</h1>
        <p className="text-[var(--color-mist)] mt-1">Your registered Customer Vault account information.</p>
      </div>

      <div className="depth-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-4 pb-4 border-b border-[var(--color-line)]">
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 text-cyan-300 grid place-items-center shrink-0 border border-cyan-500/20 font-bold text-xl">
            {customer.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-xl font-bold text-white">{customer.name}</div>
            <div className="font-mono text-xs text-cyan-300 font-semibold">{customer.customerCode}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="p-3.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)]">
            <div className="text-[10px] text-[var(--color-mist-2)] uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Smartphone size={12} /> Mobile Number
            </div>
            <div className="font-mono font-semibold text-white">{customer.phone}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)]">
            <div className="text-[10px] text-[var(--color-mist-2)] uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <ShieldCheck size={12} /> Account Status
            </div>
            <div className="font-semibold text-emerald-400 capitalize">{customer.status}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)] sm:col-span-2">
            <div className="text-[10px] text-[var(--color-mist-2)] uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Calendar size={12} /> Member Since
            </div>
            <div className="text-sm font-medium text-white">
              {new Date(customer.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
