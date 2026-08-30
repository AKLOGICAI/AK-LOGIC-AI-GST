import { useState } from 'react';
import { KeyRound, ShieldAlert, Loader2, CheckCircle2 } from 'lucide-react';
import { Field, PinField } from './Field';
import { merchantService } from '../lib/services';

interface CustomerPinVerifyProps {
  onSelectCustomer: (customer: {
    customerCode: string;
    name: string;
    phone: string;
    email?: string;
    gstin?: string;
    billingAddress?: string;
    companyName?: string;
    state?: string;
  }) => void;
  className?: string;
}

export default function CustomerPinVerify({ onSelectCustomer, className = '' }: CustomerPinVerifyProps) {
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleVerify = async () => {
    const cleanCode = code.trim();
    if (!cleanCode) {
      setErr('Enter Customer AKC ID (e.g. AKC-00000001)');
      return;
    }
    if (!pin || pin.length < 4) {
      setErr('Enter customer 4-digit PIN');
      return;
    }

    setErr('');
    setVerifying(true);

    try {
      const res = await merchantService.autofillCustomer(cleanCode, pin);
      if (res.ok && res.customer) {
        onSelectCustomer(res.customer);
        setCode('');
        setPin('');
        setExpanded(false);
      } else {
        setErr('Invalid AKC ID or PIN.');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invalid AKC ID or PIN.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className={`depth-soft rounded-2xl p-4 border border-cyan-500/20 ${className}`}>
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-between text-xs font-semibold text-cyan-300 hover:text-white transition"
        >
          <span className="flex items-center gap-2">
            <KeyRound size={15} /> Already have an AKC ID? Verify & Auto Fill
          </span>
          <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-[10px] border border-cyan-500/20">
            Customer PIN Entry
          </span>
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <KeyRound size={14} className="text-cyan-400" /> Customer AKC Verification
            </div>
            <button
              onClick={() => {
                setExpanded(false);
                setErr('');
              }}
              className="text-[11px] text-[var(--color-mist-2)] hover:text-white"
            >
              Cancel
            </button>
          </div>

          {/* Mandatory Security Notice */}
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2 text-xs text-amber-200">
            <ShieldAlert size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="leading-snug">
              <strong className="text-amber-300">Please enter your AKC PIN yourself.</strong> Do not share it with anyone, including the merchant.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="AKC ID *"
              className="font-mono text-xs"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. AKC-00000001"
            />
            <PinField
              label="4-Digit Customer PIN *"
              className="text-xs"
              value={pin}
              maxLength={4}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter PIN"
              onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
            />
          </div>

          {err && <p className="text-xs text-[var(--color-rose)]">{err}</p>}

          <button
            onClick={handleVerify}
            disabled={verifying}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-white depth-raised disabled:opacity-60 transition"
            style={{ background: 'linear-gradient(135deg,#0284c7,#2563eb)' }}
          >
            {verifying ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Verifying Credentials…
              </>
            ) : (
              <>
                <CheckCircle2 size={14} /> Verify & Auto Fill Billing Form
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
