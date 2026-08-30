import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, KeyRound, ShieldCheck, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import Logo from '../../components/Logo';
import { Field, PinField } from '../../components/Field';
import { requestOtp, verifyOtp } from '../../lib/authClient';
import { customerService } from '../../lib/services';

export default function CustomerForgotPin() {
  const nav = useNavigate();
  const [step, setStep] = useState<'email' | 'otp' | 'new_pin' | 'done'>('email');

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSendOtp = async () => {
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setErr('Enter a valid registered email address.');
      return;
    }

    setErr('');
    setBusy(true);

    try {
      await requestOtp('9876543210', email.trim());
      setStep('otp');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to send OTP. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length < 6) {
      setErr('Enter the 6-digit verification code.');
      return;
    }

    setErr('');
    setBusy(true);

    try {
      const res = await verifyOtp('9876543210', otp);
      if (!res.ok || !res.resetToken) {
        throw new Error(res.message || 'OTP verification failed.');
      }

      setResetToken(res.resetToken);
      setStep('new_pin');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invalid OTP code.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetPin = async () => {
    if (!newPin || newPin.length < 4) {
      setErr('Enter a new 4-digit PIN.');
      return;
    }
    if (newPin !== confirmPin) {
      setErr('New PIN and Confirm PIN do not match.');
      return;
    }

    setErr('');
    setBusy(true);

    try {
      await customerService.resetPin(email.trim(), resetToken, newPin);
      setStep('done');
      setTimeout(() => {
        nav('/customer/login');
      }, 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to reset PIN.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-ink)] text-[var(--color-ivory)] grid place-items-center px-6 grid-bg">
      <div
        className="pointer-events-none fixed -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[120px]"
        style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.14), transparent 70%)' }}
      />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative depth-card rounded-[28px] p-8 sm:p-10 max-w-md w-full"
      >
        <Link to="/" className="inline-block mb-6">
          <Logo />
        </Link>
        <h2 className="font-[var(--font-display)] text-2xl font-bold">Reset Customer PIN</h2>
        <p className="text-sm text-[var(--color-mist)] mt-1">
          Verify your email address to set a new PIN
        </p>

        {step === 'email' && (
          <div className="mt-6 space-y-4">
            <div className="relative">
              <Mail size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)]" />
              <Field
                label="Registered Email Address *"
                className="pl-11"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
              />
            </div>

            {err && <p className="text-xs text-[var(--color-rose)]">{err}</p>}

            <button
              onClick={handleSendOtp}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-white depth-raised disabled:opacity-60 transition"
              style={{ background: 'linear-gradient(135deg,#0284c7,#2563eb)' }}
            >
              {busy ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Sending Email OTP…
                </>
              ) : (
                <>
                  Send OTP to Email <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div className="mt-6 space-y-4">
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200">
              Code sent to <span className="font-bold text-white">{email}</span>
            </div>

            <div className="relative">
              <ShieldCheck size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)]" />
              <Field
                label="Enter 6-Digit OTP *"
                className="pl-11 font-mono tracking-widest text-lg"
                value={otp}
                maxLength={6}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit code"
                onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtp()}
              />
            </div>

            {err && <p className="text-xs text-[var(--color-rose)]">{err}</p>}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setStep('email')}
                className="w-1/3 py-3 rounded-xl text-sm font-semibold depth-soft text-[var(--color-mist)] hover:text-white"
              >
                Back
              </button>
              <button
                onClick={handleVerifyOtp}
                disabled={busy}
                className="w-2/3 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-white depth-raised disabled:opacity-60 transition"
                style={{ background: 'linear-gradient(135deg,#0284c7,#2563eb)' }}
              >
                {busy ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Verifying…
                  </>
                ) : (
                  <>
                    Verify OTP <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'new_pin' && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <KeyRound size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)] z-10" />
                <PinField
                  label="New 4-Digit PIN *"
                  name="cust-new-pin"
                  className="pl-11"
                  value={newPin}
                  maxLength={4}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="New PIN"
                />
              </div>

              <div className="relative">
                <KeyRound size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)] z-10" />
                <PinField
                  label="Confirm New PIN *"
                  name="cust-confirm-new-pin"
                  className="pl-11"
                  value={confirmPin}
                  maxLength={4}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Confirm"
                />
              </div>
            </div>

            {err && <p className="text-xs text-[var(--color-rose)]">{err}</p>}

            <button
              onClick={handleResetPin}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-white depth-raised disabled:opacity-60 transition"
              style={{ background: 'linear-gradient(135deg,#0284c7,#2563eb)' }}
            >
              {busy ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Resetting PIN…
                </>
              ) : (
                <>
                  Save New PIN <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="mt-8 text-center py-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 grid place-items-center mx-auto mb-4 border border-emerald-500/30">
              <CheckCircle2 size={36} />
            </div>
            <h3 className="text-xl font-extrabold text-white">PIN Reset Successful!</h3>
            <p className="text-sm text-[var(--color-mist)] mt-2">You can now log in with your new PIN.</p>
            <p className="text-xs text-cyan-200/80 animate-pulse mt-4">Redirecting to Customer Login…</p>
          </div>
        )}

        <p className="text-center text-sm text-[var(--color-mist)] mt-6">
          Remembered your PIN?{' '}
          <Link to="/customer/login" className="text-[var(--color-aqua)] font-semibold hover:underline">
            Customer Login
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
