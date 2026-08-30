import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, NavLink, useNavigate, Navigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Inbox, FileText, QrCode, Wallet, Settings, LogOut, Menu, X, Bell, Search, Download,
  BarChart3, PieChart, BookUser, UserCircle, LifeBuoy, Zap, CheckCircle2, XCircle, AlertTriangle, ChevronRight,
  FileSpreadsheet, Share2, Package, MessageSquare, Globe, FileUp, Scale, Monitor, Smartphone
} from 'lucide-react';
import Logo from '../components/Logo';
import BrandMark from '../components/BrandMark';
import LanguageSelector from '../components/LanguageSelector';
import { store, useCurrentMerchant, useRequests, useNotifications, credits } from '../lib/store';
import { useI18n } from '../lib/i18n';
import { useDesktopView } from '../lib/viewportMode';
import { timeAgo } from '../components/ui';
import { PageSkeleton } from '../components/Skeleton';
import { subscribeToPushNotifications } from '../lib/push';
import { merchantNetworkService, akaiAuditService } from '../lib/services';
import { websiteService } from '../lib/websiteService';
import CustomerSearchBar from '../components/CustomerSearchBar';
import MerchantChatDrawer from '../components/chat/MerchantChatDrawer';
import AkaiAuditOverlay from '../components/akai/AkaiAuditOverlay';
import AkaiAuditReportModal from '../components/akai/AkaiAuditReportModal';
import AkaiTriggerButton from '../components/akai/AkaiTriggerButton';
import type { AkaiAuditReport } from '../lib/akaiAuditStorage';

// Lazy-loaded dashboard pages → smaller initial bundle, faster first paint.
const Overview = lazy(() => import('./dashboard/Overview'));
const RequestsPage = lazy(() => import('./dashboard/RequestsPage'));
const InvoicesPage = lazy(() => import('./dashboard/InvoicesPage'));
const PurchasesPage = lazy(() => import('./dashboard/PurchasesPage'));
const AccountingPage = lazy(() => import('./dashboard/AccountingPage'));
const QRPage = lazy(() => import('./dashboard/QRPage'));
const RechargePage = lazy(() => import('./dashboard/RechargePage'));
const SettingsPage = lazy(() => import('./dashboard/SettingsPage'));
const ReportsPage = lazy(() => import('./dashboard/ReportsPage'));
const GstReturnCenter = lazy(() => import('./dashboard/GstReturnCenter'));
const AnalyticsPage = lazy(() => import('./dashboard/AnalyticsPage'));
const NotificationsPage = lazy(() => import('./dashboard/NotificationsPage'));
const AddressBookPage = lazy(() => import('./dashboard/AddressBookPage'));
const ProfilePage = lazy(() => import('./dashboard/ProfilePage'));
const SupportPage = lazy(() => import('./dashboard/SupportPage'));
const MerchantNetworkPage = lazy(() => import('./dashboard/MerchantNetworkPage'));
const InventoryPage = lazy(() => import('./dashboard/InventoryPage'));
const WebsitePage = lazy(() => import('./dashboard/WebsitePage'));

const NAV_GROUPS = [
  {
    label: 'nav.workspace',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'nav.overview', end: true },
      { to: '/dashboard/requests', icon: Inbox, label: 'nav.requests', badge: 'pending' },
      { to: '/dashboard/invoices', icon: FileText, label: 'nav.invoices' },
      { to: '/dashboard/purchases', icon: FileUp, label: 'nav.purchases' },
      { to: '/dashboard/accounting', icon: Scale, label: 'nav.accounting' },
      { to: '/dashboard/qr', icon: QrCode, label: 'nav.qr' },
      { to: '/dashboard/merchant-network', icon: Share2, label: 'nav.merchantNetwork' },
      { to: '/dashboard/inventory', icon: Package, label: 'nav.inventory' },
      { to: '/dashboard/website', icon: Globe, label: 'nav.website' },
    ],
  },
  {
    label: 'nav.insights',
    items: [
      { to: '/dashboard/reports', icon: BarChart3, label: 'nav.reports' },
      { to: '/dashboard/gst-returns', icon: FileSpreadsheet, label: 'nav.gst' },
      { to: '/dashboard/analytics', icon: PieChart, label: 'nav.analytics' },
    ],
  },
  {
    label: 'nav.manage',
    items: [
      { to: '/dashboard/contacts', icon: BookUser, label: 'nav.contacts' },
      { to: '/dashboard/notifications', icon: Bell, label: 'nav.notifications', badge: 'notif' },
      { to: '/dashboard/recharge', icon: Wallet, label: 'nav.recharge' },
    ],
  },
  {
    label: 'nav.account',
    items: [
      { to: '/dashboard/profile', icon: UserCircle, label: 'nav.profile' },
      { to: '/dashboard/settings', icon: Settings, label: 'nav.settings' },
      { to: '/dashboard/support', icon: LifeBuoy, label: 'nav.support' },
    ],
  },
];

export default function Dashboard() {
  const nav = useNavigate();
  const { t } = useI18n();
  const [isDesktopView, setDesktopView] = useDesktopView();
  const merchant = useCurrentMerchant();
  const requests = useRequests();
  const notifs = useNotifications();
  const [open, setOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [akaiAuditActive, setAkaiAuditActive] = useState(false);
  const [completedReport, setCompletedReport] = useState<AkaiAuditReport | null>(null);

  const startAkaiAudit = () => {
    setOpen(false); // Instantly close mobile sidebar so real page is visible
    setBellOpen(false);
    setChatOpen(false);
    setAkaiAuditActive(true);
  };

  const [installable, setInstallable] = useState(!!(window as any).deferredPrompt);
  const [networkEnabled, setNetworkEnabled] = useState<boolean | 'loading'>(() => {
    if (!merchant?.id) return 'loading';
    try {
      const cached = localStorage.getItem(`network_enabled_${merchant.id}`);
      return cached !== null ? cached === 'true' : 'loading';
    } catch {
      return 'loading';
    }
  });
  // Merchant Website Builder — same "cache last known value, then
  // reconcile with the server" pattern as networkEnabled above, gated by
  // the merchant_website_enabled feature flag (see feature_flags_repo.py /
  // supabase network_feature_flags). Defaults to disabled until an admin
  // turns it on, so this nav item stays hidden platform-wide until then.
  const [websiteEnabled, setWebsiteEnabled] = useState<boolean | 'loading'>(() => {
    if (!merchant?.id) return 'loading';
    try {
      const cached = localStorage.getItem(`website_enabled_${merchant.id}`);
      return cached !== null ? cached === 'true' : 'loading';
    } catch {
      return 'loading';
    }
  });

  // AKAI Business Controller Live Audit — gated by akai_audit_enabled feature flag
  const [akaiAuditEnabled, setAkaiAuditEnabled] = useState<boolean | 'loading'>(() => {
    if (!merchant?.id) return 'loading';
    try {
      const cached = localStorage.getItem(`akai_audit_enabled_${merchant.id}`);
      return cached !== null ? cached === 'true' : 'loading';
    } catch {
      return 'loading';
    }
  });

  useEffect(() => {
    let mounted = true;
    merchantNetworkService.getFeatureFlag().then((enabled) => {
      if (mounted) {
        setNetworkEnabled(enabled);
        if (merchant?.id) {
          try {
            localStorage.setItem(`network_enabled_${merchant.id}`, String(enabled));
          } catch {
            // ignore
          }
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, [merchant?.id]);

  useEffect(() => {
    let mounted = true;
    websiteService.getFeatureFlag().then((enabled) => {
      if (mounted) {
        setWebsiteEnabled(enabled);
        if (merchant?.id) {
          try {
            localStorage.setItem(`website_enabled_${merchant.id}`, String(enabled));
          } catch {
            // ignore
          }
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, [merchant?.id]);

  useEffect(() => {
    let mounted = true;
    akaiAuditService.getFeatureFlag().then((enabled) => {
      if (mounted) {
        setAkaiAuditEnabled(enabled);
        if (merchant?.id) {
          try {
            localStorage.setItem(`akai_audit_enabled_${merchant.id}`, String(enabled));
          } catch {
            // ignore
          }
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, [merchant?.id]);

  useEffect(() => {
    const handler = () => setInstallable(true);
    window.addEventListener('app-installable', handler);
    subscribeToPushNotifications();
    return () => window.removeEventListener('app-installable', handler);
  }, []);

  const filteredNavGroups = useMemo(() => {
    if (!merchant) return [];
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.to === '/dashboard/merchant-network') {
          if (merchant.kyc !== 'verified') return false;
          return networkEnabled === true || networkEnabled === 'loading';
        }
        return true;
      }),
    }));
  }, [merchant, networkEnabled]);

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
      console.log('Merchant PWA install choice outcome:', choiceResult?.outcome);
    } catch (err) {
      console.error('Merchant PWA install error:', err);
    } finally {
      (window as any).deferredPrompt = null;
      setInstallable(false);
    }
  };

  // Memoize derived data so unrelated store updates don't recompute filters.
  const pending = useMemo(
    () => (merchant ? requests.filter((r) => r.merchantId === merchant.id && r.status === 'pending').length : 0),
    [requests, merchant]
  );
  const myNotifs = useMemo(
    () => (merchant ? notifs.filter((n) => n.merchantId === merchant.id) : []),
    [notifs, merchant]
  );
  const unread = useMemo(() => myNotifs.filter((n) => !n.read).length, [myNotifs]);

  // Keep billing requests/invoices fresh from the backend: once on mount,
  // then poll periodically (45s) when the tab is visible.
  useEffect(() => {
    if (!merchant) return;
    store.refreshMyBilling();

    const interval = setInterval(() => {
      if (!document.hidden) {
        store.refreshMyBilling();
      }
    }, 45000);

    const onVisibilityChange = () => {
      if (!document.hidden) {
        store.refreshMyBilling();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [merchant?.id]);

  if (!merchant) return <Navigate to="/login" replace />;

  const badgeVal = (key?: string) => (key === 'pending' ? pending : key === 'notif' ? unread : 0);

  return (
    <div className="min-h-screen bg-[var(--color-ink)] text-[var(--color-ivory)] flex overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-40" />
      <div className="pointer-events-none fixed -top-48 -left-48 w-[500px] h-[500px] rounded-full blur-[130px]" style={{ background: 'radial-gradient(circle, rgba(233,196,106,0.09), transparent 70%)' }} />
      <div className="pointer-events-none fixed bottom-0 right-0 w-[520px] h-[520px] rounded-full blur-[140px]" style={{ background: 'radial-gradient(circle, rgba(56,224,200,0.07), transparent 70%)' }} />

      {/* sidebar */}
      <aside className={`fixed lg:sticky top-0 z-40 h-screen w-[270px] shrink-0 transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="h-full m-3 rounded-[24px] depth-card flex flex-col">
          <div className="flex items-center justify-between px-5 py-5">
            <Link to="/dashboard"><Logo size={30} /></Link>
            <button onClick={() => setOpen(false)} className="lg:hidden text-[var(--color-mist)]"><X size={20} /></button>
          </div>

          <div className="mx-4 mb-3 px-3 py-3 rounded-2xl depth-soft">
            <div className="flex items-center gap-3">
              <BrandMark merchant={merchant} size={40} showName={false} />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{merchant.tradeName || merchant.shopName}</div>
                <div className="text-[11px] text-[var(--color-mist-2)]">{merchant.customBranding ? `★ ${merchant.planName}` : merchant.planName}</div>
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto no-scrollbar px-3 pb-2 space-y-4">
            {filteredNavGroups.map((group) => (
              <div key={group.label}>
                <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-mist-2)]">{t(group.label)}</div>
                <div className="space-y-0.5">
                  {group.items.map((n) => {
                    if (n.to === '/dashboard/merchant-network' && networkEnabled === 'loading') {
                      return (
                        <div key={n.to} className="h-10 w-full rounded-xl bg-white/5 animate-pulse my-0.5 px-3.5 flex items-center gap-3">
                          <div className="w-4 h-4 rounded bg-white/10 shrink-0" />
                          <div className="h-3 w-28 rounded bg-white/10" />
                        </div>
                      );
                    }
                    if (n.to === '/dashboard/website' && websiteEnabled === 'loading') {
                      return (
                        <div key={n.to} className="h-10 w-full rounded-xl bg-white/5 animate-pulse my-0.5 px-3.5 flex items-center gap-3">
                          <div className="w-4 h-4 rounded bg-white/10 shrink-0" />
                          <div className="h-3 w-28 rounded bg-white/10" />
                        </div>
                      );
                    }
                    const bv = badgeVal((n as { badge?: string }).badge);
                    return (
                      <NavLink
                        key={n.to}
                        to={n.to}
                        end={(n as { end?: boolean }).end}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          `relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                            isActive ? 'text-[var(--color-ink)] depth-raised' : 'text-[var(--color-mist)] hover:text-[var(--color-ivory)] hover:bg-[rgba(255,255,255,0.03)]'
                          }`
                        }
                        style={({ isActive }) => (isActive ? { background: 'linear-gradient(135deg,#f6dd9b,#e9c46a)' } : {})}
                      >
                        <n.icon size={17} className="shrink-0" />
                        <span className="truncate">{t(n.label)}</span>
                        {bv > 0 && <span className="ml-auto text-[10px] font-bold px-1.5 min-w-[18px] text-center py-0.5 rounded-full bg-[var(--color-rose)] text-white shrink-0">{bv}</span>}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="m-4 mt-2 space-y-2">
            {akaiAuditEnabled === true && (
              <AkaiTriggerButton onClick={startAkaiAudit} variant="sidebar" />
            )}

            <Link to="/dashboard/recharge" className="block px-4 py-3 rounded-2xl depth-soft relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-16 h-16 rounded-full blur-2xl opacity-40" style={{ background: 'var(--color-aqua)' }} />
              <div className="relative flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-[var(--color-mist-2)] uppercase tracking-wider">PDF Credits</div>
                  <div className="font-[var(--font-display)] text-lg font-bold aqua-text">{credits.available(merchant)}</div>
                </div>
                <Zap size={18} className="text-[var(--color-aqua)] group-hover:scale-110 transition" />
              </div>
            </Link>
            {installable && (
              <button
                onClick={handleInstall}
                className="mt-2 w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-[var(--color-aqua)] bg-[var(--color-aqua)]/10 hover:bg-[var(--color-aqua)]/20 transition border border-[var(--color-aqua)]/20"
              >
                <Download size={17} /> Install App
              </button>
            )}
            <button
              onClick={() => setDesktopView(!isDesktopView)}
              className="mt-2 w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm text-[var(--color-mist)] hover:text-[var(--color-ivory)] hover:bg-[rgba(255,255,255,0.03)] transition"
              title={isDesktopView ? 'Switch to forced Mobile View' : 'Switch to Desktop Widescreen View'}
            >
              <div className="flex items-center gap-3">
                {isDesktopView ? <Monitor size={17} className="text-[var(--color-aqua)]" /> : <Smartphone size={17} />}
                <span>Desktop View</span>
              </div>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isDesktopView ? 'bg-[var(--color-aqua)]/20 text-[var(--color-aqua)]' : 'bg-white/10 text-[var(--color-mist)]'}`}>
                {isDesktopView ? 'ON' : 'OFF'}
              </span>
            </button>
            <button onClick={() => { store.logoutMerchant(); nav('/'); }} className="mt-2 w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-[var(--color-mist)] hover:text-[var(--color-rose)] transition">
              <LogOut size={17} /> {t('common.logout')}
            </button>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      {/* main */}
      <main className="flex-1 min-w-0 relative z-10">
        <header className="sticky top-0 z-30 glass border-b border-[var(--color-line)] w-full">
          <div className="px-3.5 sm:px-8 py-3.5 flex items-center justify-between gap-2 sm:gap-4 w-full max-w-full">
            <button onClick={() => setOpen(true)} className="lg:hidden text-[var(--color-mist)] p-1 shrink-0"><Menu size={22} /></button>
            {merchant?.kyc === 'verified' ? (
              <div className="flex-1 max-w-md hidden sm:block">
                <CustomerSearchBar
                  onSelectCustomer={(c) => {
                    nav('/dashboard/requests', { state: { selectedCustomer: c } });
                  }}
                />
              </div>
            ) : (
              <div className="relative flex-1 max-w-md hidden md:block">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-mist-2)]" />
                <input placeholder={t('header.searchPlaceholder')} className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-aqua)]" />
              </div>
            )}
            <div className="ml-auto flex items-center gap-1.5 sm:gap-3 shrink-0">
              {akaiAuditEnabled === true && (
                <AkaiTriggerButton onClick={startAkaiAudit} variant="header" />
              )}
              <button
                onClick={() => setDesktopView(!isDesktopView)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl grid place-items-center depth-soft hover:text-[var(--color-aqua)] transition shrink-0"
                title={isDesktopView ? 'Desktop View: ON (Click to force mobile-compact view)' : 'Desktop View: OFF (Click for responsive widescreen desktop view)'}
              >
                {isDesktopView ? <Monitor size={17} className="text-[var(--color-aqua)]" /> : <Smartphone size={17} className="text-[var(--color-mist)]" />}
              </button>
              <LanguageSelector />
              <Link to="/dashboard/requests" className="hidden lg:flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium depth-soft hover:text-[var(--color-gold)] transition">
                <Inbox size={16} /> {t('header.pending', { count: pending })}
              </Link>
              <button
                onClick={() => setChatOpen(true)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl grid place-items-center depth-soft hover:text-cyan-400 transition shrink-0"
                title="Customer Chats & Inquiries"
              >
                <MessageSquare size={17} className="text-[var(--color-mist)]" />
              </button>
              <div className="relative">
                <button onClick={() => setBellOpen((v) => !v)} className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl grid place-items-center depth-soft shrink-0">
                  <Bell size={17} className="text-[var(--color-mist)]" />
                  {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--color-rose)] ring-2 ring-[var(--color-ink)]" />}
                </button>
                <AnimatePresence>
                  {bellOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setBellOpen(false)} />
                      <motion.div initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96 }} className="absolute right-0 mt-2 w-72 sm:w-80 z-40 depth-card rounded-2xl overflow-hidden max-w-[90vw]">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-line)]">
                          <span className="font-semibold text-sm">{t('nav.notifications')}</span>
                          {unread > 0 && <button onClick={() => store.markAllNotifRead(merchant.id)} className="text-xs text-[var(--color-aqua)]">{t('header.markAllRead')}</button>}
                        </div>
                        <div className="max-h-80 overflow-y-auto no-scrollbar">
                          {myNotifs.slice(0, 6).map((n) => {
                            const Icon = n.type === 'approved' ? CheckCircle2 : n.type === 'rejected' ? XCircle : n.type === 'alert' ? AlertTriangle : n.type === 'recharge' ? Wallet : Inbox;
                            return (
                              <button key={n.id} onClick={() => { store.markNotifRead(n.id); setBellOpen(false); nav('/dashboard/notifications'); }} className={`w-full text-left flex gap-3 px-4 py-3 border-b border-[var(--color-line)] last:border-0 hover:bg-[rgba(255,255,255,0.03)] transition ${!n.read ? 'bg-[rgba(56,224,200,0.04)]' : ''}`}>
                                <div className="w-8 h-8 rounded-lg grid place-items-center depth-soft shrink-0"><Icon size={15} className="text-[var(--color-aqua)]" /></div>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium truncate">{n.title}</div>
                                  <div className="text-xs text-[var(--color-mist-2)] line-clamp-1">{n.body}</div>
                                  <div className="text-[10px] text-[var(--color-mist-2)] mt-0.5">{timeAgo(n.createdAt)}</div>
                                </div>
                                {!n.read && <span className="w-2 h-2 rounded-full bg-[var(--color-rose)] mt-1.5 shrink-0" />}
                              </button>
                            );
                          })}
                          {myNotifs.length === 0 && <p className="text-sm text-[var(--color-mist-2)] p-6 text-center">{t('header.noNotifications')}</p>}
                        </div>
                        <Link to="/dashboard/notifications" onClick={() => setBellOpen(false)} className="flex items-center justify-center gap-1 px-4 py-3 text-sm text-[var(--color-aqua)] font-medium hover:bg-[rgba(255,255,255,0.03)]">{t('common.viewAll')} <ChevronRight size={14} /></Link>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
              <Link to="/dashboard/profile" className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl grid place-items-center text-[var(--color-ink)] font-bold depth-raised shrink-0" style={{ background: 'linear-gradient(135deg,#6ff2dc,#38e0c8)' }}>
                {merchant.ownerName.charAt(0)}
              </Link>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full min-w-0">
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route index element={<Overview merchant={merchant} onStartAkaiAudit={akaiAuditEnabled === true ? startAkaiAudit : undefined} />} />
              <Route path="requests" element={<RequestsPage merchant={merchant} />} />
              <Route path="invoices" element={<InvoicesPage merchant={merchant} onStartAkaiAudit={akaiAuditEnabled === true ? startAkaiAudit : undefined} />} />
              <Route path="purchases" element={<PurchasesPage merchant={merchant} />} />
              <Route path="accounting" element={<AccountingPage merchant={merchant} />} />
              <Route path="qr" element={<QRPage merchant={merchant} />} />
              <Route path="reports" element={<ReportsPage merchant={merchant} />} />
              <Route path="gst-returns" element={<GstReturnCenter merchant={merchant} />} />
              <Route path="analytics" element={<AnalyticsPage merchant={merchant} />} />
              <Route path="contacts" element={<AddressBookPage merchant={merchant} />} />
              <Route path="notifications" element={<NotificationsPage merchant={merchant} />} />
              <Route path="recharge" element={<RechargePage merchant={merchant} />} />
              <Route path="profile" element={<ProfilePage merchant={merchant} />} />
              <Route path="settings" element={<SettingsPage merchant={merchant} />} />
              <Route path="support" element={<SupportPage merchant={merchant} />} />
              {merchant.kyc === 'verified' && networkEnabled && (
                <Route path="merchant-network" element={<MerchantNetworkPage merchant={merchant} />} />
              )}
              <Route path="inventory" element={<InventoryPage merchant={merchant} />} />
              <Route path="website/*" element={<WebsitePage merchant={merchant} />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </div>
      </main>

      {/* AKAI Fullscreen Laser Scan Live Audit Orchestrator */}
      <AkaiAuditOverlay
        active={akaiAuditActive}
        merchant={merchant}
        onComplete={(report) => {
          setAkaiAuditActive(false);
          setCompletedReport(report);
        }}
        onCancel={() => setAkaiAuditActive(false)}
      />

      {/* AKAI Final Verified Audit Report Modal */}
      {completedReport && (
        <AkaiAuditReportModal
          report={completedReport}
          onClose={() => setCompletedReport(null)}
        />
      )}

      <MerchantChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onSelectCustomerForInvoice={(customerCode) => {
          nav('/dashboard/requests', { state: { autofillCode: customerCode } });
        }}
      />
    </div>
  );
}
