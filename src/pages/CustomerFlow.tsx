import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ScanLine, CreditCard, User, FileText, Loader2, Sparkles, CheckCircle2, ShieldCheck, X, UserCheck, KeyRound, Smartphone, Lock } from 'lucide-react';
import Logo from '../components/Logo';
import BrandMark from '../components/BrandMark';
import { Field, Area } from '../components/Field';
import { store, credits } from '../lib/store';
import type { MerchantLookupResult } from '../lib/store';
import type { Merchant } from '../lib/types';
import { PAYMENT_MODES, paymentNeedsRef, type PaymentMode } from '../lib/payment';
import { INDIAN_STATES } from '../lib/states';
import { requestOtp, verifyOtp } from '../lib/authClient';
import { customerService } from '../lib/services';

export default function CustomerFlow() {
  const { qrId } = useParams();
  const nav = useNavigate();
  const cleanQr = (qrId || '').trim();

  // No local-only initial state: a QR code must resolve identically on
  // every device, so the merchant is ALWAYS fetched from Supabase — there
  // is no localStorage fast path that could let a stale/absent cache decide
  // the outcome.
  const [scanned, setScanned] = useState<Merchant | undefined>(undefined);
  const [scanInput, setScanInput] = useState(cleanQr);
  const [scanErr, setScanErr] = useState('');
  const [loading, setLoading] = useState(!!cleanQr);

  // Optional Post-Submission Premium Welcome Popup state
  const [showWelcomePopup, setShowWelcomePopup] = useState(false);
  const [popupMode, setPopupMode] = useState<'create' | 'welcome_back'>('create');
  const [submittedRequestId, setSubmittedRequestId] = useState('');
  const [quickOtpStep, setQuickOtpStep] = useState<'prompt' | 'otp' | 'registering'>('prompt');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickEmail, setQuickEmail] = useState('');
  const [quickOtp, setQuickOtp] = useState('');
  const [quickErr, setQuickErr] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);

  // Existing Customer Login Modal state
  const [showCustomerLoginModal, setShowCustomerLoginModal] = useState(false);
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loggedInCustomerName, setLoggedInCustomerName] = useState<string | null>(null);

  const applyLookupResult = (res: MerchantLookupResult) => {
    if (res.status === 'found') {
      if (res.merchant.status === 'suspended' || res.merchant.status === 'disabled') {
        setScanned(undefined);
        setScanErr('This merchant is not active at the moment.');
      } else {
        setScanned(res.merchant);
        setScanErr('');
      }
    } else if (res.status === 'not_found') {
      setScanned(undefined);
      setScanErr('No merchant found for this QR code. Please check the ID and try again.');
    } else if (res.status === 'permission_denied') {
      setScanned(undefined);
      setScanErr('Unable to verify this merchant right now (server permission error). Please try again later or contact support.');
    } else {
      setScanned(undefined);
      setScanErr('Could not reach the server to verify this merchant. Check your internet connection and try again.');
    }
  };

  // On page load (QR scanned): resolve the merchant from Supabase. This is
  // the only lookup path — it is what makes a QR generated on one device
  // work immediately on every other phone/computer.
  useEffect(() => {
    if (!cleanQr) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    store.getMerchantByQr(cleanQr).then((res) => {
      if (cancelled) return;
      setLoading(false);
      applyLookupResult(res);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanQr]);

  const [cust, setCust] = useState({ customerName: '', customerPhone: '', customerEmail: '', customerGstin: '', customerPan: '', customerAddress: '', customerState: 'Uttar Pradesh', notes: '' });
  const setC = (k: string, v: string) => setCust((c) => ({ ...c, [k]: v }));

  const fillCustomerProfile = (customer: any) => {
    if (!customer) return;
    setCust((prev) => ({
      ...prev,
      customerName: customer.name || customer.companyName || prev.customerName,
      customerPhone: customer.phone ? customer.phone.replace(/^\+91/, '').replace(/\D/g, '') : prev.customerPhone,
      customerEmail: customer.email || prev.customerEmail,
      customerGstin: customer.gstin || prev.customerGstin,
      customerPan: customer.pan || (customer.gstin && customer.gstin.length === 15 ? customer.gstin.slice(2, 12) : prev.customerPan),
      customerAddress: customer.billingAddress || prev.customerAddress,
      customerState: customer.state || prev.customerState,
    }));
    setLoggedInCustomerName(customer.name || customer.phone || 'Customer');
  };

  // SECURITY & PRIVACY: Customer details are NEVER automatically
  // auto-filled from localStorage on QR scan mount to protect customer PII.
  // The form starts clean. Details are only populated when the customer
  // explicitly taps "Have an AKC ID?" and verifies their 4-digit PIN.

  const handleCustomerLoginSubmit = async () => {
    const idClean = loginIdentifier.trim();
    const pinClean = loginPin.trim();
    if (!idClean) {
      setLoginErr('Please enter your Mobile Number or AKC ID.');
      return;
    }
    if (!pinClean || pinClean.length < 4) {
      setLoginErr('Please enter your 4-digit Customer PIN.');
      return;
    }

    setLoginErr('');
    setLoginBusy(true);

    try {
      const customer = await customerService.login(idClean, pinClean);
      fillCustomerProfile(customer);
      setShowCustomerLoginModal(false);
      setLoginIdentifier('');
      setLoginPin('');
    } catch (e: any) {
      setLoginErr(e?.message || 'Invalid Mobile Number / AKC ID or PIN.');
    } finally {
      setLoginBusy(false);
    }
  };
  const [payMode, setPayMode] = useState<PaymentMode>('cash');
  const [payRef, setPayRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState('');

  const tryScan = async () => {
    const id = scanInput.trim();
    if (!id) return;
    setLoading(true);
    const res = await store.getMerchantByQr(id);
    setLoading(false);
    applyLookupResult(res);
  };

  const submit = async () => {
    if (!scanned || submitting) return;
    setSubmitting(true);
    setSubmitErr('');
    const result = await store.createRequest({
      merchantId: scanned.id,
      ...cust,
      paymentMode: payMode,
      paymentRef: paymentNeedsRef(payMode) ? payRef : undefined,
      items: [],
      branded: credits.brandingEnabled(scanned) && !!(scanned.logoUrl || scanned.logoDataUrl),
    });
    setSubmitting(false);
    if (!result.ok) {
      setSubmitErr(result.message || 'Could not send your request. Please check your internet connection and try again.');
      return;
    }

    setSubmittedRequestId(result.request.id);
    setQuickPhone(cust.customerPhone || '');
    setQuickEmail(cust.customerEmail || '');

    // If customer already verified/logged-in with their AKC ID in this session,
    // NEVER show registration popups — take them directly to live tracking!
    if (loggedInCustomerName) {
      nav(`/track/${result.request.id}`);
      return;
    }

    // Server-side nextStep determination:
    // If customer already has an AKC ID in database -> Welcome Back (Track / Login)
    // Only if completely new -> Create Free ID popup
    const nextStep = result.nextStep;
    if (nextStep === 'welcome_back') {
      setPopupMode('welcome_back');
      setShowWelcomePopup(true);
    } else {
      setPopupMode('create');
      setShowWelcomePopup(true);
    }
  };

  const handleMaybeLater = () => {
    setShowWelcomePopup(false);
    if (submittedRequestId) {
      nav(`/track/${submittedRequestId}`);
    }
  };

  const handleCreateFreeId = async () => {
    const emailToUse = quickEmail || cust.customerEmail;
    if (!emailToUse || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailToUse.trim())) {
      setQuickErr('Please enter a valid email address for OTP verification.');
      return;
    }
    const phoneToUse = quickPhone || cust.customerPhone || '9876543210';
    setQuickErr('');
    setQuickBusy(true);

    try {
      await requestOtp(phoneToUse, emailToUse.trim());
      setQuickEmail(emailToUse.trim());
      setQuickOtpStep('otp');
    } catch (e) {
      setQuickErr(e instanceof Error ? e.message : 'Could not send OTP.');
    } finally {
      setQuickBusy(false);
    }
  };

  const handleVerifyOtpAndRegister = async () => {
    if (!quickOtp || quickOtp.length < 6) {
      setQuickErr('Enter the 6-digit OTP code.');
      return;
    }

    const phoneToUse = quickPhone || cust.customerPhone || '9876543210';
    const emailToUse = quickEmail || cust.customerEmail;

    setQuickErr('');
    setQuickBusy(true);

    try {
      const res = await verifyOtp(phoneToUse, quickOtp);
      if (!res.ok || !res.resetToken) {
        throw new Error(res.message || 'Invalid OTP code.');
      }

      await customerService.register(
        cust.customerName || 'Customer',
        phoneToUse,
        '', // Empty PIN -> backend auto-generates secure 4-digit default PIN!
        res.resetToken,
        {
          email: emailToUse,
          gstin: cust.customerGstin,
          billingAddress: cust.customerAddress,
          companyName: (cust as any).customerCompany || '',
          state: cust.customerState,
        }
      );

      nav('/customer/dashboard');
    } catch (e) {
      setQuickErr(e instanceof Error ? e.message : 'Registration failed.');
      setQuickOtpStep('otp');
    } finally {
      setQuickBusy(false);
    }
  };

  const valid = scanned && cust.customerName && cust.customerAddress;

  // ---- LOADING (verifying against Supabase) ----
  if (cleanQr && loading && !scanned) {
    return (
      <div className="min-h-screen bg-[var(--color-ink)] text-[var(--color-ivory)] grid place-items-center px-6 grid-bg">
        <div className="depth-card rounded-[28px] p-10 max-w-md w-full text-center">
          <Link to="/" className="inline-block mb-6"><Logo /></Link>
          <Loader2 size={28} className="mx-auto animate-spin text-[var(--color-aqua)]" />
          <p className="text-sm text-[var(--color-mist)] mt-4">Verifying merchant…</p>
        </div>
      </div>
    );
  }

  // ---- SCAN SCREEN ----
  if (!scanned) {
    return (
      <div className="min-h-screen bg-[var(--color-ink)] text-[var(--color-ivory)] grid place-items-center px-6 grid-bg">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="depth-card rounded-[28px] p-8 sm:p-10 max-w-md w-full text-center">
          <Link to="/" className="inline-block mb-6"><Logo /></Link>
          <div className="w-20 h-20 rounded-2xl grid place-items-center mx-auto mb-5 relative depth-raised" style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}>
            <ScanLine size={34} className="text-[var(--color-aqua)]" />
            <div className="absolute inset-0 rounded-2xl pulse-ring border border-[var(--color-aqua)]" />
          </div>
          <h2 className="font-[var(--font-display)] text-2xl font-bold">Scan Merchant QR</h2>
          <p className="text-sm text-[var(--color-mist)] mt-1">No login required — just enter the QR ID</p>
          <div className="mt-6 space-y-3 text-left">
            <Field label="Merchant QR ID" value={scanInput} onChange={(e) => setScanInput(e.target.value.toUpperCase())} placeholder="Enter the merchant QR ID" onKeyDown={(e) => e.key === 'Enter' && tryScan()} />
            {scanErr && <p className="text-xs text-[var(--color-rose)]">{scanErr}</p>}
            <button onClick={tryScan} disabled={loading} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-[var(--color-ink)] depth-raised disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#6ff2dc,#38e0c8)' }}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : <>Continue <ArrowRight size={18} /></>}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ---- FORM ----
  return (
    <div className="min-h-screen bg-[var(--color-ink)] text-[var(--color-ivory)] grid-bg">
      <header className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link to="/"><Logo /></Link>
        <span className="text-xs px-3 py-1.5 rounded-full glass text-[var(--color-mist)]">No login needed</span>
      </header>
      <div className="max-w-3xl mx-auto px-6 pb-32">
        <div className="depth-card rounded-2xl p-5 flex items-center gap-4 mb-6">
          <BrandMark merchant={scanned} size={48} showName={false} />
          <div>
            <p className="text-xs text-[var(--color-mist-2)] uppercase tracking-wider">Billing To Merchant</p>
            <h2 className="font-[var(--font-display)] font-bold">{scanned.tradeName || scanned.shopName}</h2>
            <p className="text-xs text-[var(--color-mist)]">GSTIN: {scanned.gstin} · {scanned.state}</p>
            {scanned.merchantCode && <p className="text-[11px] font-mono text-[var(--color-aqua)] mt-0.5">Merchant ID: {scanned.merchantCode}</p>}
          </div>
        </div>

        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-[var(--font-display)] font-semibold flex items-center gap-2">
            <User size={18} className="text-[var(--color-aqua)]" /> Your Details
          </h3>
          {loggedInCustomerName ? (
            <div className="flex items-center gap-2 text-xs px-3.5 py-1.5 rounded-full bg-[rgba(56,224,200,0.15)] text-[var(--color-aqua)] border border-[var(--color-aqua)]/30">
              <UserCheck size={14} /> Verified Customer: <span className="font-semibold text-white">{loggedInCustomerName}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCustomerLoginModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[rgba(56,224,200,0.12)] text-[var(--color-aqua)] border border-[var(--color-aqua)]/30 hover:bg-[rgba(56,224,200,0.22)] transition depth-raised"
            >
              <UserCheck size={14} /> Have an AKC ID? <span className="underline ml-0.5">Auto-fill with PIN</span>
            </button>
          )}
        </div>
        <div className="depth-soft rounded-2xl p-6 grid sm:grid-cols-2 gap-4">
          <Field label="Full Name *" value={cust.customerName} onChange={(e) => setC('customerName', e.target.value)} placeholder="Your name" />
          <Field label="Mobile (optional)" value={cust.customerPhone} maxLength={10} onChange={(e) => setC('customerPhone', e.target.value.replace(/\D/g, ''))} placeholder="Mobile" />
          <Field label="Email (optional)" value={cust.customerEmail} onChange={(e) => setC('customerEmail', e.target.value)} placeholder="email@example.com" />
          <Field label="GSTIN (optional)" value={cust.customerGstin} maxLength={15} onChange={(e) => setC('customerGstin', e.target.value.toUpperCase())} placeholder="For B2B" />
          <Field label="PAN (optional)" value={cust.customerPan} maxLength={10} onChange={(e) => setC('customerPan', e.target.value.toUpperCase())} placeholder="ABCDE1234F" />
          <label className="block">
            <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase">State (Place of Supply) *</span>
            <select value={cust.customerState} onChange={(e) => setC('customerState', e.target.value)} className="mt-1.5 w-full rounded-xl bg-[#0c1322] border border-[var(--color-line)] px-4 py-3 text-[var(--color-ivory)] outline-none focus:border-[var(--color-aqua)]">
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2"><Area label="Address *" rows={2} value={cust.customerAddress} onChange={(e) => setC('customerAddress', e.target.value)} placeholder="Billing address" /></div>
        </div>

        <h3 className="font-[var(--font-display)] font-semibold mb-3 mt-7 flex items-center gap-2"><FileText size={18} className="text-[var(--color-mist)]" /> Notes (optional)</h3>
        <div className="depth-soft rounded-2xl p-6">
          <Area label="Anything the merchant should know?" rows={2} value={cust.notes} onChange={(e) => setC('notes', e.target.value)} placeholder="e.g. delivery instructions, special request..." />
        </div>
      </div>

      {/* sticky footer */}
      <div className="fixed bottom-0 inset-x-0 glass border-t border-[var(--color-line)]">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="text-sm">
            <div className="text-[var(--color-mist)] text-xs">Sending request to</div>
            <div className="font-[var(--font-display)] text-base font-bold text-[var(--color-ivory)]">{scanned.tradeName || scanned.shopName}</div>
            {submitErr && <div className="text-xs text-[var(--color-rose)] mt-1 max-w-[220px]">{submitErr}</div>}
          </div>
          <button disabled={!valid || submitting} onClick={submit} className="flex items-center gap-2 px-6 py-3.5 rounded-2xl font-semibold disabled:opacity-40 text-[var(--color-ink)] depth-raised" style={{ background: 'linear-gradient(135deg,#6ff2dc,#38e0c8)' }}>
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <>Send Request <ArrowRight size={18} /></>}
          </button>
        </div>
      </div>

      {/* Post-Submission Premium Welcome Popup Modal */}
      <AnimatePresence>
        {showWelcomePopup && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md grid place-items-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative depth-card rounded-[28px] max-w-lg w-full p-6 sm:p-8 border border-cyan-400/40 shadow-2xl overflow-hidden my-auto"
            >
              <button
                onClick={handleMaybeLater}
                aria-label="Close"
                className="absolute right-4 top-4 w-11 h-11 grid place-items-center rounded-full text-[var(--color-mist-2)] hover:text-white transition"
              >
                <X size={20} />
              </button>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-semibold mb-3 border border-cyan-500/30">
                <Sparkles size={14} /> Request Sent! {submittedRequestId && <span className="font-mono text-cyan-200">({submittedRequestId})</span>}
              </div>

              {popupMode === 'welcome_back' ? (
                <div>
                  <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
                    👋 Welcome Back!
                  </h2>
                  <p className="text-sm font-bold text-cyan-300 mt-1">
                    An AKC Customer ID is already registered for this mobile number.
                  </p>

                  <p className="text-xs text-[var(--color-mist)] mt-3 leading-relaxed">
                    Log in to your <strong className="text-white">Customer Vault</strong> anytime to view all your GST tax invoices across merchants, or track this billing request live.
                  </p>

                  <div className="my-5 p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/20 space-y-2 text-xs text-cyan-100">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                      <span>Instant profile auto-fill at all AK-LOGIC AI merchants</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                      <span>Permanent invoice backup in your private vault</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={handleMaybeLater}
                      className="w-1/2 py-3.5 rounded-2xl text-xs sm:text-sm font-semibold depth-soft text-[var(--color-mist)] hover:text-white transition"
                    >
                      Track Request
                    </button>

                    <button
                      onClick={() => nav('/customer/login')}
                      className="w-1/2 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-xs sm:text-sm font-bold text-white depth-raised transition shadow-lg"
                      style={{ background: 'linear-gradient(135deg,#0284c7,#2563eb)' }}
                    >
                      <User size={16} /> Customer Login
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
                    🎉 Welcome to AK-LOGIC AI
                  </h2>
                  <p className="text-sm font-bold text-cyan-300 mt-1">
                    Save time on every future visit.
                  </p>

                  <p className="text-xs text-[var(--color-mist)] mt-2 leading-relaxed">
                    Create your <strong className="text-white">FREE Unique Customer ID (AKC ID)</strong> and you'll never need to fill in your billing details again. Next time, simply enter your <strong className="text-cyan-300">Customer ID + PIN</strong>, and all your saved information will be filled automatically.
                  </p>

                  <div className="my-4 p-3.5 rounded-2xl bg-cyan-950/40 border border-cyan-500/20 space-y-2 text-xs text-cyan-100">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                      <span>A FREE Unique Customer ID (AKC ID)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                      <span>A secure default 4-digit PIN (auto-generated by system)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                      <span>One dashboard for all your invoices</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                      <span>Faster billing at every AK-LOGIC AI merchant</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                      <span>Access to future rewards, cashback, offers & upcoming services</span>
                    </div>
                  </div>

                  <p className="text-xs text-[var(--color-mist)] italic mb-5">
                    Your default PIN can be changed anytime from your Customer Dashboard.
                  </p>

                  {quickOtpStep === 'prompt' && (
                    <div className="space-y-3">
                      {!cust.customerEmail && (
                        <Field
                          label="Email Address for Verification *"
                          value={quickEmail}
                          onChange={(e) => setQuickEmail(e.target.value)}
                          placeholder="name@example.com"
                        />
                      )}
                      {quickErr && <p className="text-xs text-[var(--color-rose)]">{quickErr}</p>}

                      <div className="flex items-center gap-3 pt-2">
                        <button
                          onClick={handleMaybeLater}
                          className="w-1/3 py-3 rounded-2xl text-xs sm:text-sm font-semibold depth-soft text-[var(--color-mist)] hover:text-white transition"
                        >
                          Maybe Later
                        </button>

                        <button
                          onClick={handleCreateFreeId}
                          disabled={quickBusy}
                          className="w-2/3 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-xs sm:text-sm font-bold text-white depth-raised disabled:opacity-60 transition shadow-lg"
                          style={{ background: 'linear-gradient(135deg,#0284c7,#2563eb)' }}
                        >
                          {quickBusy ? (
                            <>
                              <Loader2 size={16} className="animate-spin" /> Sending OTP…
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={16} /> Create My Free ID
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {quickOtpStep === 'otp' && (
                    <div className="space-y-3 pt-2">
                      <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200">
                        OTP sent to <strong className="text-white">{quickEmail}</strong>
                      </div>

                      <Field
                        label="Enter 6-Digit OTP *"
                        className="font-mono tracking-widest text-base"
                        value={quickOtp}
                        maxLength={6}
                        onChange={(e) => setQuickOtp(e.target.value.replace(/\D/g, ''))}
                        placeholder="6-digit OTP code"
                        onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtpAndRegister()}
                      />

                      {quickErr && <p className="text-xs text-[var(--color-rose)]">{quickErr}</p>}

                      <div className="flex items-center gap-3 pt-2">
                        <button
                          onClick={handleMaybeLater}
                          className="w-1/3 py-3 rounded-2xl text-xs sm:text-sm font-semibold depth-soft text-[var(--color-mist)] hover:text-white transition"
                        >
                          Skip
                        </button>

                        <button
                          onClick={handleVerifyOtpAndRegister}
                          disabled={quickBusy}
                          className="w-2/3 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-xs sm:text-sm font-bold text-white depth-raised disabled:opacity-60 transition shadow-lg"
                          style={{ background: 'linear-gradient(135deg,#0284c7,#2563eb)' }}
                        >
                          {quickBusy ? (
                            <>
                              <Loader2 size={16} className="animate-spin" /> Registering…
                            </>
                          ) : (
                            <>
                              Verify & Open Dashboard <ArrowRight size={16} />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Existing Customer Login Modal */}
      <AnimatePresence>
        {showCustomerLoginModal && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="depth-card rounded-[28px] p-6 sm:p-7 max-w-md w-full relative border border-[rgba(56,224,200,0.2)] shadow-2xl overflow-hidden"
            >
              {/* Subtle ambient top glow highlight */}
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-[var(--color-aqua)] to-transparent opacity-80" />

              <button
                onClick={() => {
                  setShowCustomerLoginModal(false);
                  setLoginErr('');
                }}
                aria-label="Close"
                className="absolute top-4 right-4 w-11 h-11 rounded-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.12)] flex items-center justify-center text-[var(--color-mist)] hover:text-white transition"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-3.5 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-[rgba(56,224,200,0.12)] border border-[rgba(56,224,200,0.25)] flex items-center justify-center text-[var(--color-aqua)] shadow-[0_0_20px_rgba(56,224,200,0.15)] shrink-0">
                  <UserCheck size={22} />
                </div>
                <div>
                  <h3 className="font-[var(--font-display)] text-xl font-bold text-white tracking-tight">Customer Login</h3>
                  <p className="text-xs text-[var(--color-mist)] mt-0.5">Log in to auto-fill your saved billing profile.</p>
                </div>
              </div>

              <div className="space-y-4 text-left">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="customerLoginIdentifier" className="text-xs font-semibold tracking-wider text-[var(--color-mist)] uppercase flex items-center gap-1.5">
                      <Smartphone size={13} className="text-[var(--color-aqua)]" /> Mobile Number or AKC ID *
                    </label>
                    <Link
                      to="/customer/register"
                      className="text-xs font-semibold text-[var(--color-aqua)] hover:text-white transition flex items-center gap-1"
                    >
                      <Sparkles size={12} /> Create account
                    </Link>
                  </div>
                  <input
                    id="customerLoginIdentifier"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="e.g. 9876543210 or AKC-00000001"
                    className="w-full rounded-xl bg-[#0c1322] border border-[var(--color-line)] px-4 py-3 text-[var(--color-ivory)] outline-none focus:border-[var(--color-aqua)] focus:ring-1 focus:ring-[var(--color-aqua)]/30 text-sm transition font-mono placeholder:font-sans placeholder:text-[var(--color-mist-2)]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="customerLoginPin" className="text-xs font-semibold tracking-wider text-[var(--color-mist)] uppercase flex items-center gap-1.5">
                      <Lock size={13} className="text-[var(--color-aqua)]" /> Customer 4-Digit PIN *
                    </label>
                    <Link
                      to="/customer/forgot-pin"
                      className="text-xs font-semibold text-[var(--color-aqua)] hover:text-white transition"
                    >
                      Forgot PIN?
                    </Link>
                  </div>
                  <input
                    id="customerLoginPin"
                    type="password"
                    maxLength={4}
                    value={loginPin}
                    onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    onKeyDown={(e) => e.key === 'Enter' && handleCustomerLoginSubmit()}
                    className="w-full rounded-xl bg-[#0c1322] border border-[var(--color-line)] px-4 py-3 text-center tracking-[0.6em] font-mono text-xl text-[var(--color-ivory)] outline-none focus:border-[var(--color-aqua)] focus:ring-1 focus:ring-[var(--color-aqua)]/30 transition placeholder:tracking-widest"
                  />
                </div>

                {/* Security trust badge notice */}
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[rgba(56,224,200,0.06)] border border-[rgba(56,224,200,0.15)] text-xs text-[var(--color-mist)]">
                  <ShieldCheck size={14} className="text-[var(--color-aqua)] shrink-0" />
                  <span>Verified 256-bit bcrypt encrypted customer session</span>
                </div>

                {loginErr && (
                  <p className="text-xs text-[var(--color-rose)] font-medium p-3 rounded-xl bg-[rgba(255,107,136,0.1)] border border-[rgba(255,107,136,0.25)] animate-shake">
                    {loginErr}
                  </p>
                )}

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomerLoginModal(false);
                      setLoginErr('');
                    }}
                    className="w-1/3 py-3.5 rounded-xl text-xs font-semibold glass text-[var(--color-mist)] hover:text-white hover:border-white/20 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={loginBusy}
                    onClick={handleCustomerLoginSubmit}
                    className="w-2/3 flex items-center justify-center gap-2 py-3.5 rounded-xl text-xs font-bold text-[var(--color-ink)] depth-raised disabled:opacity-60 shadow-lg shadow-[rgba(56,224,200,0.2)] transition active:scale-[0.98]"
                    style={{ background: 'linear-gradient(135deg,#6ff2dc,#38e0c8)' }}
                  >
                    {loginBusy ? <Loader2 size={16} className="animate-spin" /> : <>Log In & Auto-fill <ArrowRight size={14} /></>}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
