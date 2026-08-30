import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LifeBuoy, ArrowLeft, Mail, Globe, Clock, MessageSquare } from 'lucide-react';
import Logo from '../components/Logo';

const channels = [
  { icon: Mail, title: 'Email Support', value: 'aklogicaihelp@gmail.com', href: 'mailto:aklogicaihelp@gmail.com' },
  { icon: Globe, title: 'Website', value: 'www.ak-logicai.in', href: 'https://www.ak-logicai.in' },
  { icon: Clock, title: 'Support Hours', value: 'Monday – Saturday, 9 AM to 8 PM IST' },
];

export default function Contact() {
  return (
    <div className="min-h-screen bg-[var(--color-ink)] text-[var(--color-ivory)] grid-bg overflow-x-hidden">
      <div className="pointer-events-none fixed -top-40 -right-40 w-[480px] h-[480px] rounded-full blur-[120px]" style={{ background: 'radial-gradient(circle, rgba(56,224,200,0.12), transparent 70%)' }} />
      <header className="relative z-10 max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link to="/"><Logo /></Link>
        <Link to="/" className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border border-[var(--color-line)] hover:border-[var(--color-aqua)] transition">
          <ArrowLeft size={16} /> Back to Home
        </Link>
      </header>
      <main className="relative z-10 max-w-3xl mx-auto px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-[var(--color-aqua)] mb-5"><LifeBuoy size={14} /> Contact Support</div>
          <h1 className="font-[var(--font-display)] text-4xl font-extrabold tracking-tight">Contact Support</h1>
          <p className="text-[var(--color-mist)] mt-3 max-w-lg">Need help with your account, invoices, or billing? Our team is here to assist you.</p>
        </motion.div>
        <div className="mt-10 grid sm:grid-cols-2 gap-4">
          {channels.map((c, i) => (
            <motion.div key={c.title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="depth-card rounded-2xl p-6">
              <div className="w-11 h-11 rounded-xl grid place-items-center depth-raised" style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}>
                <c.icon size={20} className="text-[var(--color-aqua)]" />
              </div>
              <div className="mt-4 text-sm text-[var(--color-mist-2)]">{c.title}</div>
              {c.href ? (
                <a href={c.href} className="font-semibold hover:text-[var(--color-aqua)] transition">{c.value}</a>
              ) : (
                <div className="font-semibold">{c.value}</div>
              )}
            </motion.div>
          ))}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="depth-card rounded-2xl p-6 sm:col-span-2 flex gap-4">
            <div className="w-11 h-11 rounded-xl grid place-items-center depth-raised shrink-0" style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}>
              <MessageSquare size={20} className="text-[var(--color-emerald)]" />
            </div>
            <div>
              <h2 className="font-[var(--font-display)] font-semibold text-lg">In-App Support</h2>
              <p className="text-sm text-[var(--color-mist)] mt-2 leading-relaxed">Registered merchants can raise and track support tickets directly from the Support section inside the dashboard.</p>
            </div>
          </motion.div>
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
