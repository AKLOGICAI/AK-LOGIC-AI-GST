import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Smartphone, Mail, KeyRound, Loader2, Check, ShieldCheck } from 'lucide-react';
import Logo from '../components/Logo';
import { Field, PinField } from '../components/Field';
import { store } from '../lib/store';
import { requestOtp, verifyOtp, config } from '../lib/authClient';

// "Forgot MPIN" recovery flow. A returning merchant who doesn't remember
// their current MPIN previously had NO way back into their account —
// MerchantLogin.tsx had no forgot-MPIN link, and the only self-service
// MPIN change (Dashboard -> Settings) requires the current MPIN, which is
// exactly what's missing here. This page proves identity with a fresh OTP
// (same phone+email check as registration) instead of the old MPIN, then
// calls store.resetMpin (backend: POST /api/merchant/reset-mpin) to set a
// new one. See backend/app/routers/merchant.py for the server side.
const isValidEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

export default function ForgotMpin() {
  const nav = useNavigate();

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0); // 0: phone/email, 1: otp, 2: new mpin, 3: done
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [mpin, setMpin] = useState('');
  const [mpin2, setMpin2] = useState('');

  const [otpSent, setOtpSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [deliveredCode, setDeliveredCode] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onDeliver = (e: Event) => {
      const code = (e as CustomEvent<{ code: string }>).detail?.code;
      if (code) setDeliveredCode(code);
    };
    window.addEventListener('otp:deliver', onDeliver);
    return () => window.removeEventListener('otp:deliver', onDeliver);
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const sendOtp = async () => {
    if (phone.length !== 10 || !isValidEmail(email) || busy || resendIn > 0) return;
    setBusy(true); setErr(''); setMsg(''); setDeliveredCode('');
    try {
      const res = await requestOtp(phone, email.trim());
      if (res.ok) {
        setOtpSent(true);
        setMsg(res.message || 'A verification code has been sent.');
        setResendIn(60);
        setStep(1);
      } else {
        setErr(res.message || 'Could not send the verification code.');
      }
    } finally {
      setBusy(false);
    }
  };

  const checkOtp = async () => {
    if (otp.length < 4 || busy) return;
    setBusy(true); setErr('');
    try {
      const res = await verifyOtp(phone, otp);
      if (res.ok && res.resetToken) {
        setResetToken(res.resetToken);
        setStep(2);
      } else if (res.ok) {
        setErr('Could not verify your identity. Please try again.');
      } else {
        setErr(res.message || 'Invalid code. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const submitNewMpin = async () => {
    if (mpin.length !== 4 || mpin !== mpin2 || busy) return;
    setBusy(true); setErr('');
    try {
      const res = await store.resetMpin(phone, email.trim(), resetToken, mpin);
      if (res.status === 'ok') {
        setStep(3);
      } else {
        setErr(res.message || 'Could not reset your MPIN. Please try again.');
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

        {step !== 3 ? (
          <>
            <h2 className="font-[var(--font-display)] text-2xl font-bold">Reset your MPIN</h2>
            <p className="text-sm text-[var(--color-mist)] mt-1">
              {step === 0 && "Enter the mobile number and email on your account and we'll send a verification code."}
              {step === 1 && 'Enter the verification code we sent.'}
              {step === 2 && 'Choose a new 4-digit MPIN.'}
            </p>

            <div className="mt-6 space-y-4">
              {step === 0 && (
                <>
                  <div className="relative"><Smartphone size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)]" /><Field label="Mobile Number" className="pl-11" value={phone} maxLength={10} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="Enter your mobile number" /></div>
                  <div className="relative"><Mail size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)]" /><Field label="Email Address" type="email" className="pl-11" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email address" onKeyDown={(e) => e.key === 'Enter' && sendOtp()} /></div>
                  {err && <p className="text-xs text-[var(--color-rose)]">{err}</p>}
                  <button onClick={sendOtp} disabled={phone.length !== 10 || !isValidEmail(email) || busy} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-white depth-raised disabled:opacity-60 transition-all duration-150 hover:-translate-y-0.5 shadow-md active:translate-y-0" style={{ background: 'linear-gradient(135deg,#1E3A5F,#2563EB)' }}>
                    {busy ? <><Loader2 size={18} className="animate-spin" /> Sending…</> : <>Send Verification Code <ArrowRight size={18} /></>}
                  </button>
                </>
              )}

              {step === 1 && (
                <>
                  {msg && <p className="text-xs text-[var(--color-aqua)] bg-[rgba(37,99,235,0.08)] rounded-lg px-3 py-2">{msg}</p>}
                  <div className="relative"><ShieldCheck size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)]" /><Field label="Enter OTP" className="pl-11" value={otp} maxLength={6} inputMode="numeric" onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" onKeyDown={(e) => e.key === 'Enter' && checkOtp()} /></div>
                  {err && <p className="text-xs text-[var(--color-rose)]">{err}</p>}
                  <div className="flex items-center gap-3">
                    <button onClick={checkOtp} disabled={otp.length < 4 || busy} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-white depth-raised disabled:opacity-60 transition-all duration-150 hover:-translate-y-0.5 shadow-md active:translate-y-0" style={{ background: 'linear-gradient(135deg,#1E3A5F,#2563EB)' }}>
                      {busy ? <><Loader2 size={18} className="animate-spin" /> Verifying…</> : 'Verify Code'}
                    </button>
                    <button onClick={sendOtp} disabled={busy || resendIn > 0} className="text-xs text-[var(--color-mist)] hover:text-[var(--color-ivory)] underline whitespace-nowrap disabled:opacity-40 disabled:no-underline">{resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}</button>
                  </div>
                  {!config.apiConfigured && deliveredCode && (
                    <div className="text-[11px] text-[var(--color-amber)] bg-[rgba(255,180,84,0.08)] rounded-lg px-3 py-2.5">
                      <span className="block opacity-80">Email/SMS delivery is temporarily unavailable. Your verification code is:</span>
                      <span className="font-mono font-bold text-base tracking-[0.3em] text-[var(--color-ivory)]">{deliveredCode}</span>
                    </div>
                  )}
                </>
              )}

              {step === 2 && (
                <>
                  <div className="relative"><KeyRound size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)] z-10" /><PinField label="New MPIN" name="mpin-new" className="pl-11" value={mpin} maxLength={4} onChange={(e) => setMpin(e.target.value.replace(/\D/g, ''))} placeholder="Enter a new 4-digit MPIN" /></div>
                  <div className="relative"><KeyRound size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)] z-10" /><PinField label="Confirm New MPIN" name="mpin-confirm" className="pl-11" value={mpin2} maxLength={4} onChange={(e) => setMpin2(e.target.value.replace(/\D/g, ''))} placeholder="Re-enter your new MPIN" onKeyDown={(e) => e.key === 'Enter' && submitNewMpin()} /></div>
                  {mpin && mpin2 && mpin !== mpin2 && <p className="text-xs text-[var(--color-rose)]">MPINs do not match.</p>}
                  {err && <p className="text-xs text-[var(--color-rose)]">{err}</p>}
                  <button onClick={submitNewMpin} disabled={mpin.length !== 4 || mpin !== mpin2 || busy} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-white depth-raised disabled:opacity-60 transition-all duration-150 hover:-translate-y-0.5 shadow-md active:translate-y-0" style={{ background: 'linear-gradient(135deg,#1E3A5F,#2563EB)' }}>
                    {busy ? <><Loader2 size={18} className="animate-spin" /> Saving…</> : 'Reset MPIN'}
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-full grid place-items-center mx-auto glow-aqua" style={{ background: 'linear-gradient(135deg,#6ff2dc,#11a892)' }}>
              <Check size={32} className="text-[var(--color-ink)]" strokeWidth={3} />
            </div>
            <h2 className="font-[var(--font-display)] text-2xl font-bold mt-5">MPIN Reset</h2>
            <p className="text-[var(--color-mist)] mt-2 text-sm">You can now log in with your new MPIN.</p>
            <button onClick={() => nav('/login', { replace: true })} className="mt-7 w-full py-3.5 rounded-2xl font-semibold text-[var(--color-ink)] depth-raised" style={{ background: 'linear-gradient(135deg,#f6dd9b,#e9c46a)' }}>
              Go to Login
            </button>
          </div>
        )}

        {step !== 3 && <p className="text-center text-sm text-[var(--color-mist)] mt-6">Remember your MPIN? <Link to="/login" className="text-[var(--color-gold)] font-medium">Back to login</Link></p>}
      </motion.div>
    </div>
  );
}
