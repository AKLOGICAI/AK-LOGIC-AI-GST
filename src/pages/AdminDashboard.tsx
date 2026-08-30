import { useState, useEffect } from 'react';
import { useNavigate, NavLink, Routes, Route, Navigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Store, IndianRupee, FileText, LogOut, Wallet, ShieldAlert, PieChart,
  Megaphone, LifeBuoy, Activity, Menu, X, Coins, CalendarClock, MonitorSmartphone,
  Copy, ScrollText, SlidersHorizontal, ImagePlus, QrCode, Download, Lock,
} from 'lucide-react';
import Logo from '../components/Logo';
import InstallAppModal from '../components/InstallAppModal';
import { store, useFraudFlags, adminService } from '../lib/store';
import AdminOverview from './admin/AdminOverview';
import AdminMerchants from './admin/AdminMerchants';
import AdminCredits from './admin/AdminCredits';
import AdminSubscriptions from './admin/AdminSubscriptions';
import AdminRevenue from './admin/AdminRevenue';
import AdminRecharge from './admin/AdminRecharge';
import AdminInvoiceAudit from './admin/AdminInvoiceAudit';
import AdminFraud from './admin/AdminFraud';
import AdminDuplicateGst from './admin/AdminDuplicateGst';
import AdminMonitoring from './admin/AdminMonitoring';
import AdminAnalytics from './admin/AdminAnalytics';
import AdminBroadcast from './admin/AdminBroadcast';
import AdminTickets from './admin/AdminTickets';
import AdminAuditLogs from './admin/AdminAuditLogs';
import AdminSystem from './admin/AdminSystem';
import AdminLogo from './admin/AdminLogo';
import AdminQrInventory from './admin/AdminQrInventory';
import AdminSecurityAudit from './admin/AdminSecurityAudit';

const GROUPS = [
  {
    label: 'Command',
    items: [
      { to: '/admin', icon: LayoutDashboard, label: 'Master Dashboard', end: true },
      { to: '/admin/merchants', icon: Store, label: 'Merchant Management' },
      { to: '/admin/monitoring', icon: MonitorSmartphone, label: 'Merchant Monitoring' },
      { to: '/admin/qr-inventory', icon: QrCode, label: 'QR Inventory' },
    ],
  },
  {
    label: 'Billing',
    items: [
      { to: '/admin/credits', icon: Coins, label: 'PDF Credit Control' },
      { to: '/admin/subscriptions', icon: CalendarClock, label: 'Subscriptions' },
      { to: '/admin/recharge', icon: Wallet, label: 'Recharge Control' },
      { to: '/admin/revenue', icon: IndianRupee, label: 'Revenue' },
    ],
  },
  {
    label: 'Risk & Audit',
    items: [
      { to: '/admin/fraud', icon: ShieldAlert, label: 'Fraud Detection', badge: 'fraud' },
      { to: '/admin/duplicate-gst', icon: Copy, label: 'Duplicate GST' },
      { to: '/admin/invoice-audit', icon: FileText, label: 'Invoice Audit' },
      { to: '/admin/security', icon: Lock, label: 'Security Audit' },
      { to: '/admin/logs', icon: ScrollText, label: 'Security Logs' },
    ],
  },
  {
    label: 'Engage',
    items: [
      { to: '/admin/analytics', icon: PieChart, label: 'Analytics' },
      { to: '/admin/broadcast', icon: Megaphone, label: 'Notifications' },
      { to: '/admin/tickets', icon: LifeBuoy, label: 'Support Tickets' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { to: '/admin/logo', icon: ImagePlus, label: 'Logo Management' },
      { to: '/admin/system', icon: SlidersHorizontal, label: 'System Settings' },
    ],
  },
];

export default function AdminDashboard() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [installable, setInstallable] = useState(!!(window as any).deferredPrompt);
  // Manual "how to install" modal — the native beforeinstallprompt event is
  // shared/global across the whole site (see main.tsx) and can only ever
  // fire/be consumed once, so it's very often unavailable here even though
  // the app is installable. This gives the admin an always-available way
  // to install regardless of that shared event's state.
  const [showManualInstall, setShowManualInstall] = useState(false);
  const fraud = useFraudFlags();
  const highFraud = fraud.filter((f) => f.severity === 'high').length;

  useEffect(() => {
    const checkPrompt = () => {
      if ((window as any).deferredPrompt) {
        setInstallable(true);
      }
    };

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      (window as any).deferredPrompt = e;
      setInstallable(true);
    };

    const handleAppInstallable = () => {
      setInstallable(true);
    };

    const handleAppInstalled = () => {
      (window as any).deferredPrompt = null;
      setInstallable(false);
    };

    checkPrompt();

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('app-installable', handleAppInstallable);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('app-installable', handleAppInstallable);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    const promptEvent = (window as any).deferredPrompt;
    if (!promptEvent) return;
    try {
      await promptEvent.prompt();
      const choiceResult = await promptEvent.userChoice;
      console.log('Admin PWA install choice outcome:', choiceResult?.outcome);
    } catch (err) {
      console.error('Admin PWA install error:', err);
    } finally {
      (window as any).deferredPrompt = null;
      setInstallable(false);
    }
  };

  // Sidebar entry point: use the native one-tap prompt when the browser
  // has actually handed us a deferred install event, otherwise fall back
  // to the manual step-by-step modal so there's always a way to install.
  const handleSidebarInstallClick = () => {
    if ((window as any).deferredPrompt) {
      handleInstall();
    } else {
      setShowManualInstall(true);
    }
  };

  // RLS hardening Phase 2: the local merchant cache starts empty (or
  // stale) on every fresh admin session — it's only ever populated by
  // merchants registering/logging in on THIS browser, plus whatever the
  // admin console fetches for itself. Without this, every admin page
  // (merchants list, fraud scan, revenue, duplicate-GST, credits) was
  // silently operating on incomplete data. See adminService.loadAll() in
  // services.ts.
  useEffect(() => {
    adminService.loadAll();
    adminService.loadQrInventory();
    store.loadAdminBilling();
    const interval = setInterval(() => {
      adminService.loadAll();
      adminService.loadQrInventory();
      store.loadAdminBilling();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen text-[var(--color-ivory)] flex" style={{ background: 'radial-gradient(circle at 50% -10%, #16122a, #0a0a12)' }}>
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-25" />
      <div className="pointer-events-none fixed -top-48 right-0 w-[500px] h-[500px] rounded-full blur-[140px]" style={{ background: 'radial-gradient(circle, rgba(124,108,245,0.12), transparent 70%)' }} />

      <aside className={`fixed lg:sticky top-0 z-40 h-screen w-[272px] shrink-0 transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="h-full m-3 rounded-[24px] depth-card flex flex-col" style={{ borderColor: 'rgba(124,108,245,0.18)' }}>
          <div className="flex items-center justify-between px-5 py-5">
            <Link to="/admin"><Logo size={30} /></Link>
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="lg:hidden w-11 h-11 -mr-2.5 grid place-items-center text-[var(--color-mist)]"><X size={20} /></button>
          </div>
          <div className="mx-4 mb-3 px-3 py-2.5 rounded-2xl depth-soft flex items-center gap-2">
            <ShieldAlert size={16} className="text-[var(--color-violet)]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-violet)]">Super Admin · Command Center</span>
          </div>
          <nav className="flex-1 overflow-y-auto no-scrollbar px-3 pb-2 space-y-4">
            {GROUPS.map((g) => (
              <div key={g.label}>
                <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-mist-2)]">{g.label}</div>
                <div className="space-y-0.5">
                  {g.items.map((n) => (
                    <NavLink key={n.to} to={n.to} end={(n as { end?: boolean }).end} onClick={() => setOpen(false)}
                      className={({ isActive }) => `relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${isActive ? 'text-white' : 'text-[var(--color-mist)] hover:text-[var(--color-ivory)] hover:bg-[rgba(255,255,255,0.03)]'}`}
                      style={({ isActive }) => (isActive ? { background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' } : {})}>
                      <n.icon size={17} /> {n.label}
                      {(n as { badge?: string }).badge === 'fraud' && highFraud > 0 && <span className="ml-auto text-[10px] font-bold px-1.5 min-w-[18px] text-center py-0.5 rounded-full bg-[var(--color-rose)] text-white">{highFraud}</span>}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          {/* Always visible — doesn't depend on the browser's shared
              beforeinstallprompt event, which is frequently unavailable
              here (see handleSidebarInstallClick). Falls back to manual
              install instructions when the native prompt can't be used. */}
          <button
            onClick={handleSidebarInstallClick}
            className="mx-4 mt-2 flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-violet-300 bg-violet-500/15 hover:bg-violet-500/25 transition border border-violet-500/30 cursor-pointer"
          >
            <Download size={17} /> Install Admin App
          </button>
          <button onClick={() => { store.logoutAdmin(); nav('/admin/login'); }} className="m-4 mt-2 flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-[var(--color-mist)] hover:text-[var(--color-rose)] transition">
            <LogOut size={17} /> Logout
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      <main className="flex-1 min-w-0 relative z-10">
        <header className="sticky top-0 z-20 glass border-b" style={{ borderColor: 'rgba(124,108,245,0.18)' }}>
          <div className="px-5 sm:px-8 py-4 flex items-center gap-4">
            <button onClick={() => setOpen(true)} aria-label="Open menu" className="lg:hidden w-11 h-11 -ml-2.5 grid place-items-center text-[var(--color-mist)]"><Menu size={22} /></button>
            <span className="font-[var(--font-display)] font-semibold">Platform Command Center</span>
            <div className="ml-auto flex items-center gap-3">
              {installable && (
                <button
                  onClick={handleInstall}
                  className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-violet-300 bg-violet-500/20 hover:bg-violet-500/30 transition border border-violet-500/40 cursor-pointer"
                >
                  <Download size={14} /> Install PWA
                </button>
              )}
              <span className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium depth-soft"><Activity size={14} className="text-[var(--color-emerald)]" /> All systems operational</span>
              <div className="w-10 h-10 rounded-xl grid place-items-center text-white font-bold depth-raised" style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}>A</div>
            </div>
          </div>
        </header>

        <div className="p-5 sm:p-8 max-w-7xl mx-auto">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Routes>
              <Route index element={<AdminOverview />} />
              <Route path="merchants" element={<AdminMerchants />} />
              <Route path="monitoring" element={<AdminMonitoring />} />
              <Route path="qr-inventory" element={<AdminQrInventory />} />
              <Route path="credits" element={<AdminCredits />} />
              <Route path="subscriptions" element={<AdminSubscriptions />} />
              <Route path="recharge" element={<AdminRecharge />} />
              <Route path="revenue" element={<AdminRevenue />} />
              <Route path="fraud" element={<AdminFraud />} />
              <Route path="duplicate-gst" element={<AdminDuplicateGst />} />
              <Route path="invoice-audit" element={<AdminInvoiceAudit />} />
              <Route path="security" element={<AdminSecurityAudit />} />
              <Route path="logs" element={<AdminAuditLogs />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="broadcast" element={<AdminBroadcast />} />
              <Route path="tickets" element={<AdminTickets />} />
              <Route path="logo" element={<AdminLogo />} />
              <Route path="system" element={<AdminSystem />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </motion.div>
        </div>
      </main>

      <InstallAppModal open={showManualInstall} onClose={() => setShowManualInstall(false)} appName="AK-LOGIC AI Admin" />
    </div>
  );
}
