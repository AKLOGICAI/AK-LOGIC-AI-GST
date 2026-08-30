import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Toaster } from 'sonner';
import { useMerchantSession, useCustomerSession, useAdminSession, useMerchantAccountActive, store, useAuthInitialized } from './lib/store';
import Landing from './pages/Landing';
import { PageSkeleton } from './components/Skeleton';
import PageTransition from './components/PageTransition';
import OfflineBanner from './components/OfflineBanner';
import UpdateBanner from './components/UpdateBanner';

/**
 * Resilient lazy loader.
 *
 * If a dynamic import fails (most commonly because a returning visitor's
 * cached index.html points at chunk filenames that changed in a newer
 * deploy), retry once, then force a single hard reload to pull the fresh
 * index.html. This prevents the "black screen" reported when navigating to
 * the dashboard right after a deployment.
 */
function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      // one quick retry for transient network blips
      try {
        await new Promise((r) => setTimeout(r, 350));
        return await factory();
      } catch {
        const KEY = 'aklogic_chunk_reloaded';
        if (!sessionStorage.getItem(KEY)) {
          sessionStorage.setItem(KEY, '1');
          window.location.reload();
        }
        throw err;
      }
    }
  });
}

/**
 * FOUR FULLY-ISOLATED REALMS
 * - Merchant Portal  : /dashboard/*  (guarded by merchant session only)
 * - Customer Portal  : /pay, /scan, /track/*  (fully public, no session)
 * - Super Admin Portal: /admin/*  (guarded by admin session only)
 * - Customer Vault    : /customer/*  (guarded by customer session only)
 *
 * Each guard reads ONLY its own realm's session. A merchant session never
 * grants admin access, and an admin session never grants merchant access.
 *
 * Code splitting: every non-landing route is lazy-loaded so the initial
 * bundle stays small and each portal only ships what it needs.
 *
 * PUBLIC STORE: /store/:slug is a fifth, fully public surface (Merchant
 * Website Builder) — no session/guard at all, same as /pay and /scan,
 * since it's meant to be shared with anyone.
 */

const Register = lazyWithRetry(() => import('./pages/Register'));
const MerchantLogin = lazyWithRetry(() => import('./pages/MerchantLogin'));
const ForgotMpin = lazyWithRetry(() => import('./pages/ForgotMpin'));
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const CustomerFlow = lazyWithRetry(() => import('./pages/CustomerFlow'));
const InvoiceStatus = lazyWithRetry(() => import('./pages/InvoiceStatus'));
const AdminLogin = lazyWithRetry(() => import('./pages/AdminLogin'));
const AdminDashboard = lazyWithRetry(() => import('./pages/AdminDashboard'));
const CustomerLogin = lazyWithRetry(() => import('./pages/customer/CustomerLogin'));
const CustomerRegister = lazyWithRetry(() => import('./pages/customer/CustomerRegister'));
const CustomerForgotPin = lazyWithRetry(() => import('./pages/customer/CustomerForgotPin'));
const CustomerDashboard = lazyWithRetry(() => import('./pages/customer/CustomerDashboard'));
const Privacy = lazyWithRetry(() => import('./pages/Privacy'));
const Terms = lazyWithRetry(() => import('./pages/Terms'));
const Contact = lazyWithRetry(() => import('./pages/Contact'));
const RefundPolicy = lazyWithRetry(() => import('./pages/RefundPolicy'));
const Docs = lazyWithRetry(() => import('./pages/Docs'));
const PublicStore = lazyWithRetry(() => import('./pages/store/PublicStore'));
const GstBillingSoftware = lazyWithRetry(() => import('./pages/GstBillingSoftware'));
const MerchantWebsite = lazyWithRetry(() => import('./pages/MerchantWebsite'));
const MerchantNetwork = lazyWithRetry(() => import('./pages/MerchantNetwork'));

function Loader() {
  return (
    <div className="min-h-screen bg-[var(--color-ink)] text-[var(--color-ivory)] p-6 sm:p-8">
      <div className="max-w-7xl mx-auto"><PageSkeleton /></div>
    </div>
  );
}

function MerchantOnly({ children }: { children: React.ReactNode }) {
  const merchantId = useMerchantSession();
  const accountActive = useMerchantAccountActive();

  useEffect(() => {
    if (merchantId && !accountActive) {
      store.logoutMerchant();
    }
  }, [merchantId, accountActive]);

  if (!merchantId) return <Navigate to="/login" replace />;
  // CRITICAL: revoke dashboard access immediately if an admin has since
  // suspended/disabled this merchant, even though their session is
  // otherwise still valid.
  if (!accountActive) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const isAdmin = useAdminSession();
  if (!isAdmin) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

function CustomerOnly({ children }: { children: React.ReactNode }) {
  const customerId = useCustomerSession();
  if (!customerId) return <Navigate to="/customer/login" replace />;
  return <>{children}</>;
}

function isCustomDomainHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  const isPlatformHost = 
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === 'gst.ak-logicai.in' ||
    host === 'ak-logicai.in' ||
    host === 'www.ak-logicai.in' ||
    host.endsWith('.vercel.app') ||
    host.endsWith('.onrender.com');
  return !isPlatformHost;
}

function AnimatedRoutes() {
  const location = useLocation();
  // Transition only on the top-level segment so internal dashboard tab changes
  // (which animate themselves) don't double-animate / feel janky.
  const segment = '/' + (location.pathname.split('/')[1] || '');

  // Land at the top of every new top-level page instead of keeping the
  // previous page's scroll offset — without this, navigating from the
  // bottom of a long page (e.g. Landing) to a short one (e.g. Login) can
  // leave the new page's content out of view until the user scrolls.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [segment]);

  const onCustomDomain = isCustomDomainHost();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <PageTransition key={segment}>
        <Suspense fallback={<Loader />}>
          <Routes location={location}>
            {/* Public marketing + entry (or Custom Domain Storefront) */}
            <Route path="/" element={onCustomDomain ? <PublicStore /> : <Landing />} />
            <Route path="/gst-billing-software" element={<GstBillingSoftware />} />
            <Route path="/merchant-website" element={<MerchantWebsite />} />
            <Route path="/merchant-network" element={<MerchantNetwork />} />
            <Route path="/register" element={<Register />} />
            <Route path="/login" element={<MerchantLogin />} />
            <Route path="/forgot-mpin" element={<ForgotMpin />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            {/* Internal technical documentation — admin-only, not publicly linked */}
            <Route path="/docs" element={<AdminOnly><Docs /></AdminOnly>} />

            {/* ---- MERCHANT PORTAL ---- */}
            <Route path="/dashboard/*" element={<MerchantOnly><Dashboard /></MerchantOnly>} />

            {/* ---- CUSTOMER PORTAL ---- */}
            <Route path="/pay/:qrId" element={<CustomerFlow />} />
            <Route path="/scan" element={<CustomerFlow />} />
            <Route path="/track/:requestId" element={<InvoiceStatus />} />

            {/* ---- CUSTOMER VAULT (separate auth, isolated from merchant/admin) ---- */}
            <Route path="/customer/login" element={<CustomerLogin />} />
            <Route path="/customer/register" element={<CustomerRegister />} />
            <Route path="/customer/forgot-pin" element={<CustomerForgotPin />} />
            <Route path="/customer/dashboard/*" element={<CustomerOnly><CustomerDashboard /></CustomerOnly>} />

            {/* ---- SUPER ADMIN PORTAL (separate auth) ---- */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/*" element={<AdminOnly><AdminDashboard /></AdminOnly>} />
            <Route path="/website/admin" element={<Navigate to="/admin" replace />} />
            <Route path="/website/admin/*" element={<Navigate to="/admin" replace />} />

            {/* ---- MERCHANT WEBSITE BUILDER: public storefront ---- */}
            <Route path="/store/:slug" element={<PublicStore />} />

            <Route path="*" element={onCustomDomain ? <PublicStore /> : <Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </PageTransition>
    </AnimatePresence>
  );
}

function AppContent() {
  const initialized = useAuthInitialized();

  useEffect(() => {
    store.initializeAuth();
  }, []);

  if (!initialized) {
    return <Loader />;
  }

  return <AnimatedRoutes />;
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Single Toaster mount — replaces all alert() / window.confirm() calls
          site-wide. rich-colors gives error/success their own brand tint.
          position="top-center" keeps it away from the nav rail on mobile. */}
      <Toaster
        richColors
        position="top-center"
        toastOptions={{ duration: 4000 }}
      />
      <OfflineBanner />
      <UpdateBanner />
      <AppContent />
    </BrowserRouter>
  );
}
