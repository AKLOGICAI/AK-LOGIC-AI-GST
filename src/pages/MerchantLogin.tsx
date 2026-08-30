import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Smartphone, Mail, KeyRound, Loader2 } from 'lucide-react';
import Logo from '../components/Logo';
import { Field, PinField } from '../components/Field';
import { store, useMerchantSession, useMerchantAccountActive, useCurrentMerchant } from '../lib/store';
import { subscribeToPushNotifications } from '../lib/push';

// Client-side soft-lock after repeated bad MPIN attempts. This is
// defense-in-depth only (not a real security boundary — it lives in
// localStorage and can be cleared by the same browser it protects). Real
// enforcement should move server-side once merchant login is proxied
// through FastAPI instead of verifying credentials directly against
// Supabase from the browser (see the RLS findings in the security audit).
const LOGIN_LOCK_KEY = 'aklogic_login_lock';
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

interface LockState { attempts: number; lockedUntil: number }

function readLocks(): Record<string, LockState> {
  try { return JSON.parse(localStorage.getItem(LOGIN_LOCK_KEY) || '{}'); }
  catch { return {}; }
}
function writeLocks(locks: Record<string, LockState>) {
  try { localStorage.setItem(LOGIN_LOCK_KEY, JSON.stringify(locks)); } catch { /* ignore */ }
}
function getLockRemainingMs(phone: string): number {
  const locks = readLocks();
  const entry = locks[phone];
  if (!entry) return 0;
  return Math.max(0, entry.lockedUntil - Date.now());
}
function recordFailedAttempt(phone: string) {
  const locks = readLocks();
  const entry = locks[phone] || { attempts: 0, lockedUntil: 0 };
  entry.attempts += 1;
  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCK_MS;
    entry.attempts = 0;
  }
  locks[phone] = entry;
  writeLocks(locks);
}
function clearAttempts(phone: string) {
  const locks = readLocks();
  if (locks[phone]) { delete locks[phone]; writeLocks(locks); }
}

export default function MerchantLogin() {
  const nav = useNavigate();
  const merchantId = useMerchantSession();
  const accountActive = useMerchantAccountActive();
  const merchant = useCurrentMerchant();
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [mpin, setMpin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (merchantId && accountActive && merchant) {
      nav('/dashboard', { replace: true });
    }
  }, [merchantId, accountActive, merchant, nav]);

  const enterSession = (id: string) => {
    store.loginMerchant(id);
    const sess = store.getSession();
    if (sess.merchantId === id) {
      subscribeToPushNotifications();
      nav('/dashboard', { replace: true });
    }
    else { console.error('[login] session not established', sess); setErr('Could not start your session. Please try again.'); }
  };

  const login = async () => {
    if (busy) return;
    setErr('');

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setErr('Please enter a valid email address.');
      return;
    }

    const lockedMs = getLockRemainingMs(phone);
    if (lockedMs > 0) {
      const mins = Math.ceil(lockedMs / 60000);
      setErr(`Too many incorrect attempts. Please try again in ${mins} minute(s).`);
      return;
    }

    setBusy(true);
    try {
      // RLS hardening Phase 2: login is now verified only by the backend
      // (bcrypt hash + real, unbypassable server-side lockout — see
      // LOGIN_MAX_ATTEMPTS in backend/app/routers/merchant.py). The old
      // "local cache fast path" compared MPINs against a client-side
      // SHA-256 digest that lived in localStorage; that's gone.
      const res = await store.verifyMpinRemote(phone, email, mpin);
      if (res.status === 'ok') {
        clearAttempts(phone);
        store.activity.record(res.merchant.id, true);
        enterSession(res.merchant.id);
      } else if (res.status === 'error') {
        setErr(res.message || 'Could not reach the server to verify your login. Check your connection and try again.');
      } else {
        const byPhone = store.getMerchants().find((x) => x.phone === phone);
        if (byPhone) store.activity.record(byPhone.id, false);
        recordFailedAttempt(phone);
        const remaining = getLockRemainingMs(phone);
        setErr(remaining > 0
          ? `Too many incorrect attempts. Please try again in ${Math.ceil(remaining / 60000)} minute(s).`
          : 'Incorrect mobile number, email, or MPIN.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-ink)] text-[var(--color-ivory)] grid place-items-center px-6 grid-bg">
      <div className="pointer-events-none fixed -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[120px]" style={{ background: 'radial-gradient(circle, rgba(233,196,106,0.12), transparent 70%)' }} />
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="relative depth-card rounded-[28px] p-8 sm:p-10 max-w-md w-full">
        <Link to="/" className="inline-block mb-8"><Logo /></Link>
        <h2 className="font-[var(--font-display)] text-2xl font-bold">Merchant Login</h2>
        <p className="text-sm text-[var(--color-mist)] mt-1">Sign in with your mobile number, email, and MPIN</p>
        <div className="mt-6 space-y-4">
          <div className="relative"><Smartphone size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)]" /><Field label="Mobile Number" className="pl-11" value={phone} maxLength={10} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="Enter your mobile number" onKeyDown={(e) => e.key === 'Enter' && login()} /></div>
          <div className="relative"><Mail size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)]" /><Field label="Email Address" type="email" className="pl-11" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email address" onKeyDown={(e) => e.key === 'Enter' && login()} /></div>
          <div className="relative"><KeyRound size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)] z-10" /><PinField label="MPIN" name="mpin-login" className="pl-11" value={mpin} maxLength={4} onChange={(e) => setMpin(e.target.value.replace(/\D/g, ''))} placeholder="Enter 4-digit MPIN" onKeyDown={(e) => e.key === 'Enter' && login()} /></div>
          <div className="text-right -mt-2"><Link to="/forgot-mpin" className="text-xs text-[var(--color-aqua)] hover:underline font-medium">Forgot MPIN?</Link></div>
          {err && <p className="text-xs text-[var(--color-rose)]">{err}</p>}
          <button onClick={login} disabled={busy} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-white depth-raised disabled:opacity-60 transition-all duration-150 hover:-translate-y-0.5 shadow-md active:translate-y-0" style={{ background: 'linear-gradient(135deg,#1E3A5F,#2563EB)' }}>
            {busy ? <><Loader2 size={18} className="animate-spin" /> Signing in…</> : <>Login <ArrowRight size={18} /></>}
          </button>
        </div>
        <p className="text-center text-sm text-[var(--color-mist)] mt-6">New merchant? <Link to="/register" className="text-[var(--color-aqua)] font-semibold hover:underline">Create an account</Link></p>
        <p className="text-center text-sm text-[var(--color-mist)] mt-2">Are you a customer? <Link to="/customer/login" className="text-[var(--color-aqua)] font-semibold hover:underline">Customer Login</Link></p>
      </motion.div>
    </div>
  );
}
