import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, QrCode, Calculator, PenTool, FileText, LayoutDashboard, ShieldCheck, CheckCircle2,
} from 'lucide-react';
import Logo from '../components/Logo';
import { useMerchantSession, useMerchantAccountActive, useCurrentMerchant } from '../lib/store';

const features = [
  { icon: QrCode, title: 'QR Based Invoice Requests', desc: 'Customers scan your unique QR code and submit invoice details — no app or login required.' },
  { icon: Calculator, title: 'GST Auto Calculation', desc: 'CGST, SGST, and IGST are calculated automatically based on HSN codes and place of supply.' },
  { icon: PenTool, title: 'Digital Signature Support', desc: 'Upload your signature once and have it applied automatically to every invoice you generate.' },
  { icon: FileText, title: 'Instant PDF Invoice', desc: 'Generate clean, GST-compliant PDF invoices the moment a request is approved.' },
  { icon: LayoutDashboard, title: 'Merchant Dashboard', desc: 'Review requests, track invoices, manage credits, and view reports from one organised dashboard.' },
  { icon: ShieldCheck, title: 'Secure OTP Login', desc: 'Protect your account with OTP verification and a private 4-digit MPIN.' },
];

const steps = [
  { n: '01', title: 'Customer scans your QR', desc: 'The customer opens a secure page linked to your business and submits their invoice request.' },
  { n: '02', title: 'You review and approve', desc: 'Edit customer details, items, HSN codes, or GST rates if needed, then approve the request.' },
  { n: '03', title: 'Invoice is generated', desc: 'A GST-compliant PDF is created instantly and made available to download and share.' },
];

export default function Landing() {
  const merchantId = useMerchantSession();
  const accountActive = useMerchantAccountActive();
  const merchant = useCurrentMerchant();
  const navigate = useNavigate();

  useEffect(() => {
    if (merchantId && accountActive && merchant) {
      navigate('/dashboard', { replace: true });
    }
  }, [merchantId, accountActive, merchant, navigate]);

  return (
    <div className="min-h-screen bg-white text-slate-800 antialiased">
      {/* nav */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
          <Logo size={30} onLight />
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link to="/login" className="px-3 sm:px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 transition">
              Merchant Login
            </Link>
            <Link to="/register" className="px-3.5 sm:px-4 py-2 rounded-lg text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition">
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50/50 via-white to-[#F8FAFC] pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-5 sm:px-6 pt-16 pb-16 sm:pt-24 sm:pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-600 mb-6 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#059669]" /> GST-compliant invoicing for Indian businesses
          </div>
          <h1 className="font-[var(--font-display)] text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[#0F172A] leading-[1.15] max-w-3xl mx-auto">
            GST Invoice Generation Made Simple
          </h1>
          <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Create GST-compliant invoices instantly using QR-based customer requests.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/register" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-white bg-[#1E3A5F] hover:bg-[#152a45] transition-all duration-200 hover:-translate-y-0.5 shadow-md">
              Create Merchant Account <ArrowRight size={18} />
            </Link>
            <Link to="/login" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-slate-700 border border-slate-300 hover:border-slate-400 hover:bg-slate-50 transition-all duration-200 hover:-translate-y-0.5">
              Merchant Login
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
            <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-[#059669]" /> Automatic CGST / SGST / IGST</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-[#059669]" /> Digital signature</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-[#059669]" /> Instant PDF</span>
          </div>
        </div>
      </section>

      {/* how it works */}
      <section className="max-w-6xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="font-[var(--font-display)] text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A]">How it works</h2>
          <p className="mt-3 text-slate-600 leading-relaxed">From customer request to GST invoice in three simple steps.</p>
        </div>
        <div className="mt-10 sm:mt-12 grid md:grid-cols-3 gap-5">
          {steps.map((s) => (
            <div key={s.n} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
              <span className="text-sm font-semibold text-[#2563EB] font-[var(--font-display)]">{s.n}</span>
              <h3 className="mt-3 text-lg font-bold text-[#0F172A] font-[var(--font-display)]">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* features */}
      <section className="bg-[#F8FAFC] border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="font-[var(--font-display)] text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A]">Everything you need to invoice</h2>
            <p className="mt-3 text-slate-600 leading-relaxed">A complete, GST-ready toolkit built for Indian businesses.</p>
          </div>
          <div className="mt-10 sm:mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl bg-white border border-slate-200 p-6 hover:border-slate-300 transition-all duration-200 hover:-translate-y-0.5 shadow-xs">
                <div className="w-11 h-11 rounded-xl bg-[#1E3A5F] grid place-items-center">
                  <f.icon size={20} className="text-white" />
                </div>
                <h3 className="mt-4 font-bold text-[#0F172A] font-[var(--font-display)]">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* cta */}
      <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 sm:py-20">
        <div className="rounded-3xl bg-[#1E3A5F] px-6 sm:px-12 py-12 sm:py-14 text-center shadow-lg">
          <h2 className="font-[var(--font-display)] text-2xl sm:text-3xl font-bold tracking-tight text-white">Start invoicing in minutes</h2>
          <p className="mt-3 text-blue-100 max-w-xl mx-auto leading-relaxed">Register your business, generate your QR code, and create your first GST-compliant invoice today.</p>
          <Link to="/register" className="mt-7 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-[#1E3A5F] bg-white hover:bg-slate-100 transition-all duration-200 hover:-translate-y-0.5 shadow-md">
            Create Merchant Account <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-10">
          <div className="grid sm:grid-cols-4 gap-8">
            <div className="text-center sm:text-left">
              <Logo size={28} onLight />
              <p className="mt-3 text-sm text-slate-400 max-w-xs">AK-LOGIC AI GST — GST Billing, Online Stores &amp; Merchant Commerce.</p>
            </div>

            {/* Solutions column */}
            <div className="text-center sm:text-left">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Solutions</h4>
              <div className="flex flex-col gap-2 text-sm">
                <Link to="/gst-billing-software" className="text-slate-500 hover:text-slate-900 transition">GST Billing Software</Link>
                <Link to="/merchant-website" className="text-slate-500 hover:text-slate-900 transition">Merchant Website Builder</Link>
                <Link to="/merchant-network" className="text-slate-500 hover:text-slate-900 transition">Verified B2B Network</Link>
              </div>
            </div>

            {/* Company information */}
            <div className="text-center sm:text-left">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Company Information</h4>
              <div className="text-sm text-slate-500 space-y-1">
                <p className="font-semibold text-slate-700">AK-LOGIC-AI</p>
                <p>Legal Owner: Anil Kumar</p>
                <p>GSTIN: <span className="font-mono">10JRHPK3124A1ZI</span></p>
                <p>Purbi Champaran, Bihar – 845435</p>
              </div>
            </div>

            <div className="text-center sm:text-left">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Legal &amp; Support</h4>
              <div className="flex flex-col gap-2 text-sm">
                <Link to="/privacy" className="text-slate-500 hover:text-slate-900 transition">Privacy Policy</Link>
                <Link to="/terms" className="text-slate-500 hover:text-slate-900 transition">Terms &amp; Conditions</Link>
                <Link to="/refund-policy" className="text-slate-500 hover:text-slate-900 transition">Refund &amp; Cancellation</Link>
                <Link to="/contact" className="text-slate-500 hover:text-slate-900 transition">Contact Support</Link>
                <a href="mailto:aklogicaihelp@gmail.com" className="text-slate-500 hover:text-slate-900 transition">aklogicaihelp@gmail.com</a>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-slate-100 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} AK-LOGIC-AI · GST Invoicing Platform · GSTIN 10JRHPK3124A1ZI · Purbi Champaran, Bihar – 845435. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
