import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Network, ShieldCheck, Users, ArrowRight, Lock, CheckCircle2,
  Building2, Search, FileCheck, Check
} from 'lucide-react';
import Logo from '../components/Logo';

export default function MerchantNetwork() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Verified Merchant B2B Network | AK-LOGIC AI GST';
    
    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute('content') || '';
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Connect and trade directly with KYC-verified Indian merchants. Transparent GST invoicing, verified business credentials, and secure B2B commerce with AK-LOGIC AI GST.');
    }

    return () => {
      document.title = prevTitle;
      if (metaDesc) metaDesc.setAttribute('content', prevDesc);
    };
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-800 antialiased selection:bg-slate-900 selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/"><Logo size={30} onLight /></Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link to="/login" className="px-3 sm:px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 transition">
              Merchant Login
            </Link>
            <Link to="/register" className="px-3.5 sm:px-4 py-2 rounded-lg text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition">
              Join Network
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden pt-12 pb-16 sm:pt-20 sm:pb-24 border-b border-slate-100 bg-gradient-to-b from-teal-50/40 via-white to-slate-50/50">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-medium text-teal-700 mb-6 shadow-xs">
              <ShieldCheck size={14} /> KYC-Verified B2B Commerce Network
            </div>
            <h1 className="font-[var(--font-display)] text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-slate-900 leading-[1.18] max-w-4xl mx-auto">
              Direct, Verified B2B Trade Between Genuine GST Registered Businesses
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Connect with authentic distributors, manufacturers, and retailers. Trade with confidence knowing every participating business is verified through active GSTIN credentials.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/register" className="w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition shadow-sm flex items-center justify-center gap-2">
                Register &amp; Verify Business <ArrowRight size={16} />
              </Link>
              <Link to="/login" className="w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition">
                Access Network Portal
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Network Pillars */}
      <section className="py-16 sm:py-20 max-w-6xl mx-auto px-5 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Why Trade on the AK-LOGIC B2B Network?</h2>
          <p className="mt-2 text-sm text-slate-500">Security, transparency, and instant compliance for inter-merchant commerce.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 shadow-xs">
            <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center mb-4">
              <FileCheck size={22} />
            </div>
            <h3 className="font-semibold text-slate-900 text-lg">Strict KYC &amp; GST Verification</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Access is gated. Only merchants with verified GSTIN, bank details, and active status can participate in trade and listings.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 shadow-xs">
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
              <Building2 size={22} />
            </div>
            <h3 className="font-semibold text-slate-900 text-lg">Permanent Merchant ID (AKM)</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Every merchant receives a unique, unchangeable AKM-XXXXXX ID for fast lookup, trust verification, and audit trails.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 shadow-xs">
            <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-4">
              <Network size={22} />
            </div>
            <h3 className="font-semibold text-slate-900 text-lg">Direct B2B Invoicing</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Generate B2B GST tax invoices with buyer GSTIN, auto-reconciliation of inter-state IGST, and comprehensive HSN breakdowns.
            </p>
          </div>
        </div>
      </section>

      {/* Verification Process */}
      <section className="py-16 sm:py-20 bg-slate-50/60 border-y border-slate-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">How Businesses Join the Network</h2>
            <p className="mt-2 text-sm text-slate-500">5-step onboarding with AI-powered document scanning</p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-xs">
              <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center shrink-0 text-xs">1</div>
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">Mobile &amp; Email Verification</h4>
                <p className="text-xs text-slate-500 mt-0.5">Secure OTP authentication to establish your merchant account identity.</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-xs">
              <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center shrink-0 text-xs">2</div>
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">Create Private 4-Digit MPIN</h4>
                <p className="text-xs text-slate-500 mt-0.5">Protect dashboard access and quick approvals with your secure PIN.</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-xs">
              <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center shrink-0 text-xs">3</div>
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">Business &amp; GST Details</h4>
                <p className="text-xs text-slate-500 mt-0.5">Type manually or tap <strong>Scan Document</strong> to auto-fill directly from your GST certificate.</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-xs">
              <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center shrink-0 text-xs">4</div>
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">Bank Details &amp; Digital Signature</h4>
                <p className="text-xs text-slate-500 mt-0.5">Scan passbook/cheque and record your digital signature for compliant invoicing.</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-xs">
              <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center shrink-0 text-xs">5</div>
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">Instant Permanent Merchant ID &amp; QR Code</h4>
                <p className="text-xs text-slate-500 mt-0.5">Receive your permanent AKM ID and download your printable merchant QR code.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-10">
          <div className="grid sm:grid-cols-3 gap-8">
            <div className="text-center sm:text-left">
              <Logo size={28} onLight />
              <p className="mt-3 text-sm text-slate-400 max-w-xs">AK-LOGIC AI GST — GST Billing, Online Stores &amp; Merchant Commerce.</p>
            </div>
            <div className="text-center sm:text-left">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Explore Solutions</h4>
              <div className="flex flex-col gap-2 text-sm">
                <Link to="/gst-billing-software" className="text-slate-500 hover:text-slate-900 transition">GST Billing Software</Link>
                <Link to="/merchant-website" className="text-slate-500 hover:text-slate-900 transition">Merchant Website Builder</Link>
                <Link to="/merchant-network" className="text-slate-700 font-medium hover:text-slate-900 transition">Verified B2B Network</Link>
              </div>
            </div>
            <div className="text-center sm:text-left">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Legal &amp; Support</h4>
              <div className="flex flex-col gap-2 text-sm">
                <Link to="/privacy" className="text-slate-500 hover:text-slate-900 transition">Privacy Policy</Link>
                <Link to="/terms" className="text-slate-500 hover:text-slate-900 transition">Terms &amp; Conditions</Link>
                <Link to="/refund-policy" className="text-slate-500 hover:text-slate-900 transition">Refund Policy</Link>
                <Link to="/contact" className="text-slate-500 hover:text-slate-900 transition">Contact Support</Link>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-slate-100 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} AK-LOGIC AI · All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
