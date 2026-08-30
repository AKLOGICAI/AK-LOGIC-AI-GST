import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Smartphone, Mail, KeyRound, ArrowRight, Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react';
import Logo from '../../components/Logo';
import { Field, PinField } from '../../components/Field';
import { requestOtp, verifyOtp } from '../../lib/authClient';
import { customerService } from '../../lib/services';

export default function CustomerRegister() {
  const nav = useNavigate();
  const [step, setStep] = useState<'info' | 'otp' | 'success'>('info');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [assignedCode, setAssignedCode] = useState('');

  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSendOtp = async () => {
    if (!name.trim()) {
      setErr('Enter your full name.');
      return;
    }
    if (!phone || phone.length < 10) {
      setErr('Enter a valid 10-digit mobile number.');
      return;
    }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setErr('Enter a valid email address for OTP verification.');
      return;
    }
    if (!pin || pin.length < 4) {
      setErr('Create a 4-digit PIN.');
      return;
    }
    if (pin !== confirmPin) {
      setErr('PIN and Confirm PIN do not match.');
      return;
    }

    setErr('');
    setBusy(true);

    try {
      await requestOtp(phone, email.trim());
      setStep('otp');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to send OTP. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyAndRegister = async () => {
    if (!otp || otp.length < 6) {
      setErr('Enter the 6-digit verification code.');
      return;
    }

    setErr('');
    setBusy(true);

    try {
      // 1. Verify OTP
      const verifyRes = await verifyOtp(phone, otp);
      if (!verifyRes.ok || !verifyRes.resetToken) {
        throw new Error(verifyRes.message || 'OTP verification failed.');
      }

      setResetToken(verifyRes.resetToken);

      // 2. Register Customer with resetToken proof & email profile
      const created = await customerService.register(name.trim(), phone, pin, verifyRes.resetToken, { email: email.trim() });
      setAssignedCode(created.customerCode || 'AKC-SUCCESS');
      setStep('success');

      // Auto redirect to dashboard after 2 seconds
      setTimeout(() => {
        nav('/customer/dashboard');
      }, 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Registration failed. Please try again.');
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
        <h2 className="font-[var(--font-display)] text-2xl font-bold">Create Customer Account</h2>
        <p className="text-sm text-[var(--color-mist)] mt-1">
          Register to get your permanent AKC Customer ID
        </p>

        {step === 'info' && (
          <div className="mt-6 space-y-4">
            <div className="relative">
              <User size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)]" />
              <Field
                label="Full Name *"
                className="pl-11"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
              />
            </div>

            <div className="relative">
              <Smartphone size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)]" />
              <Field
                label="Mobile Number *"
                className="pl-11"
                value={phone}
                maxLength={10}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="10-digit mobile number"
              />
            </div>

            <div className="relative">
              <Mail size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)]" />
              <Field
                label="Email Address (for OTP Verification) *"
                className="pl-11"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <KeyRound size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)] z-10" />
                <PinField
                  label="Create 4-Digit PIN *"
                  name="cust-pin-create"
                  className="pl-11"
                  value={pin}
                  maxLength={4}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="PIN"
                />
              </div>

              <div className="relative">
                <KeyRound size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)] z-10" />
                <PinField
                  label="Confirm PIN *"
                  name="cust-pin-confirm"
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
              onClick={handleSendOtp}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-white depth-raised disabled:opacity-60 transition-all duration-150 hover:-translate-y-0.5 shadow-md"
              style={{ background: 'linear-gradient(135deg,#0284c7,#2563eb)' }}
            >
              {busy ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Sending Email OTP…
                </>
              ) : (
                <>
                  Verify Email via OTP <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div className="mt-6 space-y-4">
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200">
              OTP sent to <span className="font-bold text-white">{email}</span>
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
                onKeyDown={(e) => e.key === 'Enter' && handleVerifyAndRegister()}
              />
            </div>

            {err && <p className="text-xs text-[var(--color-rose)]">{err}</p>}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setStep('info')}
                className="w-1/3 py-3 rounded-xl text-sm font-semibold depth-soft text-[var(--color-mist)] hover:text-white"
              >
                Back
              </button>
              <button
                onClick={handleVerifyAndRegister}
                disabled={busy}
                className="w-2/3 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-white depth-raised disabled:opacity-60 transition"
                style={{ background: 'linear-gradient(135deg,#0284c7,#2563eb)' }}
              >
                {busy ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Registering…
                  </>
                ) : (
                  <>
                    Complete Registration <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="mt-8 text-center py-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 grid place-items-center mx-auto mb-4 border border-emerald-500/30">
              <CheckCircle2 size={36} />
            </div>
            <h3 className="text-xl font-extrabold text-white">Registration Successful!</h3>
            <p className="text-sm text-[var(--color-mist)] mt-1">Your Customer ID is:</p>
            <div className="my-4 inline-block px-5 py-2.5 rounded-xl bg-blue-600/20 border border-blue-400/40 text-2xl font-black font-mono text-cyan-300">
              {assignedCode}
            </div>
            <p className="text-xs text-cyan-200/80 animate-pulse">Redirecting to Customer Vault Dashboard…</p>
          </div>
        )}

        <p className="text-center text-sm text-[var(--color-mist)] mt-6">
          Already have a Customer ID?{' '}
          <Link to="/customer/login" className="text-[var(--color-aqua)] font-semibold hover:underline">
            Customer Login
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
