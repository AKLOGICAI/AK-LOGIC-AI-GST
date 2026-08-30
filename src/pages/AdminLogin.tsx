import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Lock, ShieldAlert, Loader2, KeyRound } from 'lucide-react';
import Logo from '../components/Logo';
import { Field } from '../components/Field';
import { store } from '../lib/store';
import { adminLogin, adminLoginDemoOtp } from '../lib/authClient';

export default function AdminLogin() {
  const nav = useNavigate();
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [demoOtp, setDemoOtp] = useState('');
  const [demoErr, setDemoErr] = useState('');
  const [demoBusy, setDemoBusy] = useState(false);

  const login = async () => {
    if (busy || !pass) return;
    setErr('');
    setBusy(true);
    try {
      const res = await adminLogin(pass);

      if (res.ok) {
        store.loginAdmin(res.token);
        nav('/admin');
      } else {
        // Backend se jo error aayega (Invalid Password, ya ADMIN_PASSWORD_HASH
        // configure na hone par "Admin password is not configured."), wo
        // ab yahan asli text ke saath dikhega — hardcoded nahi.
        setErr(res.message || 'Access denied.');
        if (res.reason === 'unavailable') setShowDemo(true);
      }
    } catch {
      setErr('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
};

  const loginDemo = async () => {
    if (demoBusy || !demoOtp) return;
    setDemoErr('');
    setDemoBusy(true);
    try {
      const res = await adminLoginDemoOtp(demoOtp);
      if (res.ok) {
        store.loginAdmin(res.token);
        nav('/admin');
      } else {
        setDemoErr(res.message || 'Invalid code.');
      }
    } catch {
      setDemoErr('Something went wrong. Please try again.');
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <div className="min-h-screen text-[var(--color-ivory)] grid place-items-center px-6" style={{ background: 'radial-gradient(circle at 50% 0%, #1a1426, #0a0a12)' }}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="depth-card rounded-[28px] p-8 sm:p-10 max-w-md w-full" style={{ borderColor: 'rgba(124,108,245,0.2)' }}>
        <Link to="/" className="inline-block mb-8"><Logo /></Link>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[rgba(124,108,245,0.12)] text-[var(--color-violet)] text-xs font-medium mb-4"><ShieldAlert size={14} /> Restricted · Admin Only</div>
        <h2 className="font-[var(--font-display)] text-2xl font-bold">Admin Console</h2>
        <p className="text-sm text-[var(--color-mist)] mt-1">Platform management portal</p>
        <div className="mt-6 space-y-4">
          <div className="relative"><Lock size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)]" /><Field label="Admin Password" type="password" className="pl-11" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Enter password" onKeyDown={(e) => e.key === 'Enter' && login()} /></div>
          {err && <p className="text-xs text-[var(--color-rose)]">{err}</p>}
          <button onClick={login} disabled={busy} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-white depth-raised disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}>
            {busy ? <><Loader2 size={18} className="animate-spin" /> Verifying…</> : <>Access Console <ArrowRight size={18} /></>}
          </button>
        </div>

        {/*
          Local-development-only fallback login path. The backend already hard-disables
          the underlying /api/admin/otp/verify endpoint whenever ENVIRONMENT=production
          (returns 403). We additionally strip this UI out of production bundles entirely
          via import.meta.env.DEV (a Vite build-time constant that is always `false` in a
          production build), so it can never render on the live site. No behavior change
          for real admin authentication.
        */}
        {import.meta.env.DEV && !showDemo && (
          <button
            onClick={() => setShowDemo(true)}
            className="mt-4 text-xs text-[var(--color-mist-2)] underline underline-offset-2 hover:text-[var(--color-mist)]"
          >
            Admin password not configured locally? Use local dev bypass
          </button>
        )}

        {import.meta.env.DEV && showDemo && (
          <div className="mt-5 pt-5 border-t border-white/10 space-y-3">
            <p className="text-xs text-[var(--color-mist-2)] flex items-center gap-1.5">
              <KeyRound size={13} /> Local development bypass only. Disabled automatically in production.
            </p>
            <Field
              label="Local Dev Code"
              value={demoOtp}
              onChange={(e) => setDemoOtp(e.target.value)}
              placeholder="Enter local dev code"
              onKeyDown={(e) => e.key === 'Enter' && loginDemo()}
            />
            {demoErr && <p className="text-xs text-[var(--color-rose)]">{demoErr}</p>}
            <button
              onClick={loginDemo}
              disabled={demoBusy}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm border border-white/15 disabled:opacity-60"
            >
              {demoBusy ? <><Loader2 size={16} className="animate-spin" /> Verifying…</> : 'Continue'}
            </button>
          </div>
        )}

        <p className="text-center text-xs text-[var(--color-mist-2)] mt-6">Authorized personnel only. All access is logged.</p>
      </motion.div>
    </div>
  );
}
