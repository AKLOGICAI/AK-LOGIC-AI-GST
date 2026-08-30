import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RotateCcw, ArrowLeft, CheckCircle2, XCircle, CreditCard, Copy, AlertOctagon, Clock, Mail } from 'lucide-react';
import Logo from '../components/Logo';

const sections = [
  {
    icon: CheckCircle2,
    title: 'Refund Eligibility',
    body: 'Subscription fees are eligible for a refund only if a technical issue on our end prevented you from using the platform for the paid period and our support team is unable to resolve it within a reasonable time. Refund requests must be raised within 7 days of the payment date.',
  },
  {
    icon: XCircle,
    title: 'Non-Refundable Services',
    body: 'PDF credits already consumed for approved invoices, plan validity already used, and any amount beyond the unused portion of your current billing cycle are non-refundable. Change-of-mind cancellations after successful use of the service are not eligible for a refund.',
  },
  {
    icon: RotateCcw,
    title: 'Subscription Cancellation',
    body: 'You may cancel your subscription at any time from your merchant dashboard. Cancellation stops future renewals; it does not entitle you to a refund for the remaining days of an active billing cycle unless the eligibility criteria above are met.',
  },
  {
    icon: CreditCard,
    title: 'Credit Usage Policy',
    body: 'PDF credits are consumed only when a customer request is approved and an invoice is generated. Credits are tied to your account and plan validity; unused credits may carry forward only as described in your plan terms at the time of purchase.',
  },
  {
    icon: Copy,
    title: 'Duplicate Payment Policy',
    body: 'If you are charged more than once for the same subscription due to a technical error, the duplicate amount will be identified and refunded in full to the original payment method after verification.',
  },
  {
    icon: AlertOctagon,
    title: 'Failed Payment Policy',
    body: 'If a payment fails or is deducted but not confirmed by our system, the amount is either auto-reversed by the payment gateway within the standard banking timeline or refunded by us after verification. No plan or credits are activated for an unconfirmed payment.',
  },
  {
    icon: Clock,
    title: 'Refund Processing Timeline',
    body: 'Approved refunds are processed within 5–10 business days to the original payment method, subject to your bank or payment provider\u2019s own processing timelines.',
  },
  {
    icon: Mail,
    title: 'Support & Company Details',
    body: 'To request a refund or raise a billing concern, contact aklogicaihelp@gmail.com. AK-LOGIC-AI, GSTIN 10JRHPK3124A1ZI, Purbi Champaran, Bihar \u2013 845435. We respond within 7 business days.',
  },
];

export default function RefundPolicy() {
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
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-[var(--color-gold)] mb-5"><RotateCcw size={14} /> Refund &amp; Cancellation Policy</div>
          <h1 className="font-[var(--font-display)] text-4xl font-extrabold tracking-tight">Refund &amp; Cancellation Policy</h1>
          <p className="text-[var(--color-mist)] mt-3 max-w-lg">This policy explains how subscription payments, cancellations, and refunds are handled on AK-LOGIC AI.</p>
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
