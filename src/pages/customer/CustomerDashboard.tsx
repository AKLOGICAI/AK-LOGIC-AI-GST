import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, UserCircle, FileText, LogOut, ShieldCheck, Loader2 } from 'lucide-react';
import Logo from '../../components/Logo';
import { customerService } from '../../lib/services';
import { store } from '../../lib/store';

const CustomerOverview = lazy(() => import('./dashboard/CustomerOverview'));
const CustomerProfile = lazy(() => import('./dashboard/CustomerProfile'));
const CustomerInvoices = lazy(() => import('./dashboard/CustomerInvoices'));

const NAV_ITEMS = [
  { to: '/customer/dashboard', icon: LayoutDashboard, label: 'Overview', end: true },
  { to: '/customer/dashboard/invoices', icon: FileText, label: 'Invoice History' },
  { to: '/customer/dashboard/profile', icon: UserCircle, label: 'My Profile' },
];

export default function CustomerDashboard() {
  const nav = useNavigate();
  const [customer, setCustomer] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      try {
        const [me, invs] = await Promise.all([
          customerService.fetchMe(),
          customerService.fetchInvoices(),
        ]);
        if (mounted) {
          setCustomer(me);
          setInvoices(invs || []);
        }
      } catch (e) {
        console.error('Customer dashboard load error:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = () => {
    store.logoutCustomer();
    nav('/customer/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-ink)] text-[var(--color-ivory)] grid place-items-center">
        <div className="text-center">
          <Loader2 size={36} className="text-cyan-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-[var(--color-mist)]">Opening Customer Vault…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-ink)] text-[var(--color-ivory)] flex flex-col md:flex-row">
      {/* Sidebar for Desktop & Header for Mobile */}
      <aside className="w-full md:w-64 depth-card border-b md:border-b-0 md:border-r border-[var(--color-line)] p-4 flex flex-col shrink-0">
        <div className="flex items-center justify-between md:block mb-4 md:mb-8">
          <Logo />
          <div className="inline-flex md:hidden items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-300 text-[11px] font-semibold border border-cyan-500/20">
            <ShieldCheck size={12} /> {customer?.customerCode || 'Vault'}
          </div>
        </div>

        <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0 flex-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition whitespace-nowrap ${
                  isActive
                    ? 'text-white depth-raised bg-gradient-to-r from-sky-600 to-blue-600'
                    : 'text-[var(--color-mist)] hover:text-white hover:bg-[rgba(255,255,255,0.03)]'
                }`
              }
            >
              <item.icon size={18} className="shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="pt-4 border-t border-[var(--color-line)] mt-auto hidden md:block">
          <div className="p-3 rounded-xl bg-[#0c1322] border border-[var(--color-line)] mb-3">
            <div className="text-xs font-bold text-white truncate">{customer?.name}</div>
            <div className="text-[11px] font-mono text-cyan-300 font-semibold">{customer?.customerCode}</div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-[var(--color-rose)] hover:bg-rose-500/10 transition"
          >
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <Suspense
            fallback={
              <div className="p-12 text-center">
                <Loader2 size={28} className="text-cyan-400 animate-spin mx-auto mb-2" />
                <p className="text-xs text-[var(--color-mist)]">Loading view…</p>
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<CustomerOverview customer={customer} invoices={invoices} />} />
              <Route path="/profile" element={<CustomerProfile customer={customer} />} />
              <Route path="/invoices" element={<CustomerInvoices invoices={invoices} />} />
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  );
}
