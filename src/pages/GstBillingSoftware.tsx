import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FileText, QrCode, Calculator, PenTool, CheckCircle2,
  ShieldCheck, ArrowRight, Zap, RefreshCw, UserCheck, Smartphone
} from 'lucide-react';
import Logo from '../components/Logo';

export default function GstBillingSoftware() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'GST Billing Software & Instant QR Invoicing | AK-LOGIC AI GST';
    
    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute('content') || '';
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Fast, compliant GST billing and QR-based invoice software for Indian merchants. Auto CGST/SGST/IGST calculation, HSN summary, 1 free invoice daily, and ₹20 1-day trial plan.');
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
              Start Free
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-16 sm:pt-20 sm:pb-24 border-b border-slate-100 bg-gradient-to-b from-blue-50/40 via-white to-slate-50/50">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-600 mb-6 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#059669]" /> GST Billing &amp; Invoicing Platform by AK-LOGIC AI
            </div>
            <h1 className="font-[var(--font-display)] text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-slate-900 leading-[1.18] max-w-4xl mx-auto">
              Scan, Request, Approve &amp; Generate Compliant GST Invoices Instantly
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Eliminate manual typing and billing errors. Allow customers to scan your merchant QR code, submit their billing request, and receive an official GST-compliant PDF invoice with your digital signature.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/register" className="w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition shadow-sm flex items-center justify-center gap-2">
                Register Your Business <ArrowRight size={16} />
              </Link>
              <Link to="/login" className="w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition">
                Merchant Login
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Verified Flow & Highlights */}
      <section className="py-16 sm:py-20 max-w-6xl mx-auto px-5 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">How Fast GST Billing Works</h2>
          <p className="mt-2 text-sm text-slate-500">A seamless 3-step workflow built specifically for high-speed counter billing and store checkouts.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center mb-4">
              1
            </div>
            <h3 className="font-semibold text-slate-900 text-lg">Customer Scans QR</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Customer scans your permanent Merchant QR code with any camera or browser — no app installation or account signup required.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center mb-4">
              2
            </div>
            <h3 className="font-semibold text-slate-900 text-lg">Merchant Approves</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              You review items, HSN codes, and GST rates on your dashboard, make instant adjustments if needed, and tap 1-click Approve.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center mb-4">
              3
            </div>
            <h3 className="font-semibold text-slate-900 text-lg">Instant GST Invoice</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              A clean, GST-compliant PDF invoice is generated immediately with automatic CGST/SGST/IGST breakdown and digital signature.
            </p>
          </div>
        </div>
      </section>

      {/* Feature Breakdown */}
      <section className="py-16 sm:py-20 bg-slate-50/60 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Engineered for Complete GST Compliance</h2>
            <p className="mt-2 text-sm text-slate-500">Full compliance with Indian GST rules and regulations.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-5 rounded-xl bg-white border border-slate-100 shadow-xs">
              <Calculator className="text-indigo-600 mb-3" size={24} />
              <h4 className="font-semibold text-slate-900">Automatic Tax Calculation</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Intra-state (CGST + SGST) and inter-state (IGST) calculated automatically based on merchant state and place of supply.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-white border border-slate-100 shadow-xs">
              <FileText className="text-emerald-600 mb-3" size={24} />
              <h4 className="font-semibold text-slate-900">HSN-Wise Summary</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Clear, organized tax tables with taxable value, tax rates, and breakdown per HSN code on every invoice.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-white border border-slate-100 shadow-xs">
              <PenTool className="text-amber-600 mb-3" size={24} />
              <h4 className="font-semibold text-slate-900">Digital Signature Support</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Draw or upload your digital signature once to have it embedded automatically on all official invoices.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-white border border-slate-100 shadow-xs">
              <Smartphone className="text-blue-600 mb-3" size={24} />
              <h4 className="font-semibold text-slate-900">Scan-to-Autofill Registration</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Onboard in minutes by scanning your GST Certificate or Bank Passbook/Cheque to auto-populate registration details.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-white border border-slate-100 shadow-xs">
              <UserCheck className="text-purple-600 mb-3" size={24} />
              <h4 className="font-semibold text-slate-900">Permanent Merchant &amp; Customer IDs</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Permanent AKM Merchant ID and AKC Customer Vault IDs allow customers to autofill their billing details securely with their PIN.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-white border border-slate-100 shadow-xs">
              <Zap className="text-rose-600 mb-3" size={24} />
              <h4 className="font-semibold text-slate-900">1 Free Invoice Daily &amp; ₹20 Trial</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Every merchant receives 1 free invoice every 24 hours. Recharge only when you need with transparent 1-day ₹20 trial plans (no auto-debit).
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="py-16 text-center max-w-4xl mx-auto px-5 sm:px-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Ready to Upgrade Your Invoicing?</h2>
        <p className="text-slate-600 text-sm mt-2">Get started with your free merchant account and permanent QR code in under 3 minutes.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/register" className="px-6 py-3 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition">
            Create Free Merchant Account
          </Link>
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
                <Link to="/gst-billing-software" className="text-slate-700 font-medium hover:text-slate-900 transition">GST Billing Software</Link>
                <Link to="/merchant-website" className="text-slate-500 hover:text-slate-900 transition">Merchant Website Builder</Link>
                <Link to="/merchant-network" className="text-slate-500 hover:text-slate-900 transition">Verified B2B Network</Link>
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
            © {new Date().getFullYear()} AK-LOGIC AI · GST Invoicing Platform · All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
