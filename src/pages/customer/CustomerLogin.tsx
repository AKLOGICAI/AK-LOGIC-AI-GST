import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, KeyRound, ArrowRight, Loader2 } from 'lucide-react';
import Logo from '../../components/Logo';
import { Field, PinField } from '../../components/Field';
import { customerService } from '../../lib/services';

export default function CustomerLogin() {
  const nav = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const login = async () => {
    if (!identifier.trim()) {
      setErr('Enter your mobile number or AKC ID.');
      return;
    }
    if (!pin || pin.length < 4) {
      setErr('Enter your 4-digit PIN.');
      return;
    }

    setErr('');
    setBusy(true);

    try {
      await customerService.login(identifier.trim(), pin);
      nav('/customer/dashboard');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Login failed. Please check your credentials.');
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
        <Link to="/" className="inline-block mb-8">
          <Logo />
        </Link>
        <h2 className="font-[var(--font-display)] text-2xl font-bold">Customer Login</h2>
        <p className="text-sm text-[var(--color-mist)] mt-1">
          Access your invoices and vault with your mobile number or AKC ID
        </p>

        <div className="mt-6 space-y-4">
          <div className="relative">
            <User size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)]" />
            <Field
              label="Mobile Number or AKC ID"
              className="pl-11 font-mono"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. 9876543210 or AKC-00000001"
              onKeyDown={(e) => e.key === 'Enter' && login()}
            />
          </div>

          <div className="relative">
            <KeyRound size={18} className="absolute left-3.5 top-[42px] text-[var(--color-mist-2)] z-10" />
            <PinField
              label="4-Digit PIN"
              name="customer-pin-login"
              className="pl-11"
              value={pin}
              maxLength={4}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter 4-digit PIN"
              onKeyDown={(e) => e.key === 'Enter' && login()}
            />
          </div>

          <div className="text-right -mt-2">
            <Link to="/customer/forgot-pin" className="text-xs text-[var(--color-aqua)] hover:underline font-medium">
              Forgot PIN?
            </Link>
          </div>

          {err && <p className="text-xs text-[var(--color-rose)]">{err}</p>}

          <button
            onClick={login}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-white depth-raised disabled:opacity-60 transition-all duration-150 hover:-translate-y-0.5 shadow-md active:translate-y-0"
            style={{ background: 'linear-gradient(135deg,#0284c7,#2563eb)' }}
          >
            {busy ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Signing in…
              </>
            ) : (
              <>
                Login <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>

        <p className="text-center text-sm text-[var(--color-mist)] mt-6">
          New customer?{' '}
          <Link to="/customer/register" className="text-[var(--color-aqua)] font-semibold hover:underline">
            Create Customer ID
          </Link>
        </p>

        <p className="text-center text-sm text-[var(--color-mist)] mt-2">
          Are you a merchant?{' '}
          <Link to="/login" className="text-[var(--color-gold)] font-semibold hover:underline">
            Merchant Login
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
