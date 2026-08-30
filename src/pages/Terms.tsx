import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, ArrowLeft, ScrollText, UserCheck, CreditCard, AlertTriangle, RefreshCw, Mail } from 'lucide-react';
import Logo from '../components/Logo';

const sections = [
  { icon: ScrollText, title: 'Service Overview', body: 'AK-LOGIC AI lets merchants generate GST-compliant invoices from customer requests submitted via a unique QR code. An invoice is created only after a merchant reviews and approves a request. There is no manual invoice creation outside this flow.' },
  { icon: UserCheck, title: 'Merchant Responsibilities', body: 'Merchants must provide accurate business, GST, and bank details, verify invoice contents, tax rates, and HSN codes before approval, and keep their OTP and MPIN credentials confidential.' },
  { icon: CreditCard, title: 'Plans, Credits & Branding', body: 'Plans shorter than 30 days display AK-LOGIC AI branding on invoices. Monthly and longer subscriptions unlock custom business branding. Each approved invoice consumes one PDF credit, and unused credits may carry forward on timely renewal.' },
  { icon: AlertTriangle, title: 'Acceptable Use & Liability', body: 'You agree not to use the platform for unlawful invoicing or fraudulent activity. The platform assists with invoice generation but does not provide tax or legal advice; merchants remain responsible for the accuracy and compliance of their invoices and filings.' },
  { icon: RefreshCw, title: 'Changes to Terms', body: 'We may update these Terms from time to time. Continued use of the platform after changes constitutes acceptance of the revised Terms.' },
  { icon: Mail, title: 'Contact', body: 'For questions about these Terms, contact us at aklogicaihelp@gmail.com. We respond within 7 business days.' },
];

export default function Terms() {
  return (
    <div className="min-h-screen bg-[var(--color-ink)] text-[var(--color-ivory)] grid-bg overflow-x-hidden">
      <div className="pointer-events-none fixed -top-40 -left-40 w-[480px] h-[480px] rounded-full blur-[120px]" style={{ background: 'radial-gradient(circle, rgba(233,196,106,0.12), transparent 70%)' }} />
      <header className="relative z-10 max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link to="/"><Logo /></Link>
        <Link to="/" className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border border-[var(--color-line)] hover:border-[var(--color-aqua)] transition">
          <ArrowLeft size={16} /> Back to Home
        </Link>
      </header>
      <main className="relative z-10 max-w-3xl mx-auto px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-[var(--color-gold)] mb-5"><FileText size={14} /> Terms &amp; Conditions</div>
          <h1 className="font-[var(--font-display)] text-4xl font-extrabold tracking-tight">Terms &amp; Conditions</h1>
          <p className="text-[var(--color-mist)] mt-3 max-w-lg">By creating a merchant account or using AK-LOGIC AI, you agree to these Terms &amp; Conditions.</p>
          <p className="text-xs text-[var(--color-mist-2)] mt-2">Last updated: {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
        </motion.div>
        <div className="mt-10 space-y-4">
          {sections.map((s, i) => (
            <motion.div key={s.title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="depth-card rounded-2xl p-6 flex gap-4">
              <div className="w-11 h-11 rounded-xl grid place-items-center depth-raised shrink-0" style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}>
                <s.icon size={20} className="text-[var(--color-gold)]" />
              </div>
              <div>
                <h2 className="font-[var(--font-display)] font-semibold text-lg">{s.title}</h2>
                <p className="text-sm text-[var(--color-mist)] mt-2 leading-relaxed">{s.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </main>
      <footer className="relative z-10 border-t border-[var(--color-line)] mt-8">
        <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo size={28} />
          <div className="flex items-center gap-5 text-xs text-[var(--color-mist-2)]">
            <Link to="/privacy" className="hover:text-[var(--color-ivory)]">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-[var(--color-ivory)]">Terms</Link>
            <Link to="/refund-policy" className="hover:text-[var(--color-ivory)]">Refund Policy</Link>
            <Link to="/contact" className="hover:text-[var(--color-ivory)]">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
