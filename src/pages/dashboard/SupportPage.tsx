import { useState } from 'react';
import { motion } from 'framer-motion';
import { LifeBuoy, Plus, MessageSquare, CheckCircle2, Clock, BookOpen, Mail, Globe } from 'lucide-react';
import type { Merchant } from '../../lib/types';
import { store, useTickets } from '../../lib/store';
import { PageHeader, GoldButton, Badge, timeAgo } from '../../components/ui';
import { Field, Area } from '../../components/Field';

const CATEGORIES = ['Account', 'Billing', 'Branding', 'GST/Invoice', 'Technical', 'Other'];
const FAQS = [
  { q: 'How is an invoice generated?', a: 'The customer scans your QR code, fills in their details, and submits a request. You review and approve it — the invoice is generated automatically.' },
  { q: 'How do I show my own logo on invoices?', a: 'Subscribe to a monthly (30+ day) plan, then upload your logo from Business Settings. On shorter plans, AK-LOGIC AI branding is used.' },
  { q: 'How is GST calculated?', a: 'Based on each item\'s HSN code and GST rate, CGST/SGST (or IGST for inter-state) is split and calculated automatically.' },
  { q: 'How does the customer get the invoice?', a: 'As soon as you approve the request, the customer can instantly download and share the invoice PDF.' },
];

export default function SupportPage({ merchant }: { merchant: Merchant }) {
  const tickets = useTickets().filter((t) => t.merchantId === merchant.id).sort((a, b) => b.createdAt - a.createdAt);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: '', category: 'Account', message: '' });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.subject || !form.message || submitting) return;
    setSubmitting(true);
    
    const userAgent = navigator.userAgent;
    const planText = `${merchant.planName} (Credits: ${merchant.pdfCredits})`;
    const networkText = merchant.networkTermsAccepted ? 'Enabled/Accepted' : 'Not Accepted';
    const diagnostics = `\n\n--- Smart Diagnostics ---\nBrowser: ${userAgent}\nPlan: ${planText}\nNetwork: ${networkText}`;
    const finalMessage = form.message + diagnostics;
    
    const ok = await store.createTicket({ merchantId: merchant.id, subject: form.subject, category: form.category, message: finalMessage });
    if (ok) {
      setForm({ subject: '', category: 'Account', message: '' });
      setOpen(false);
    }
    setSubmitting(false);
  };

  return (
    <div>
      <PageHeader title="Support" subtitle="Need help? Raise a ticket or browse the FAQs." action={<GoldButton onClick={() => setOpen((v) => !v)}><Plus size={17} /> New Ticket</GoldButton>} />

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {open && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="depth-card rounded-2xl p-6">
              <h3 className="font-[var(--font-display)] font-semibold mb-4">Raise a Ticket</h3>
              <div className="space-y-4">
                <Field label="Subject" value={form.subject} onChange={(e) => set('subject', e.target.value)} placeholder="Brief subject" />
                <label className="block">
                  <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase">Category</span>
                  <select value={form.category} onChange={(e) => set('category', e.target.value)} className="mt-1.5 w-full rounded-xl bg-[#0c1322] border border-[var(--color-line)] px-4 py-3 text-[var(--color-ivory)] outline-none focus:border-[var(--color-aqua)]">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <Area label="Message" rows={3} value={form.message} onChange={(e) => set('message', e.target.value)} placeholder="Describe your issue..." />
                <GoldButton onClick={submit} loading={submitting} aqua className="w-full">Submit Ticket</GoldButton>
              </div>
            </motion.div>
          )}

          <div className="depth-card rounded-2xl p-6">
            <h3 className="font-[var(--font-display)] font-semibold mb-4 flex items-center gap-2"><MessageSquare size={18} className="text-[var(--color-aqua)]" /> My Tickets</h3>
            <div className="space-y-3">
              {tickets.map((t) => (
                <div key={t.id} className="depth-soft rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><div className="font-medium text-sm">{t.subject}</div><div className="text-[11px] text-[var(--color-mist-2)] mt-0.5">{t.category} · {timeAgo(t.createdAt)}</div></div>
                    {t.status === 'resolved' ? <Badge tone="emerald"><CheckCircle2 size={11} className="inline mr-1" />Resolved</Badge> : t.status === 'pending' ? <Badge tone="amber">Pending</Badge> : <Badge tone="aqua"><Clock size={11} className="inline mr-1" />Open</Badge>}
                  </div>
                  <p className="text-sm text-[var(--color-mist)] mt-2">{t.message}</p>
                  {t.reply && <div className="mt-3 p-3 rounded-xl bg-[rgba(56,224,200,0.06)] text-sm"><span className="text-[var(--color-aqua)] font-medium">Support: </span>{t.reply}</div>}
                </div>
              ))}
              {tickets.length === 0 && <p className="text-sm text-[var(--color-mist-2)]">No tickets yet.</p>}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="depth-card rounded-2xl p-6">
            <h3 className="font-[var(--font-display)] font-semibold mb-4 flex items-center gap-2"><BookOpen size={18} className="text-[var(--color-gold)]" /> FAQs</h3>
            <div className="space-y-2">
              {FAQS.map((f, i) => (
                <div key={i} className="depth-soft rounded-xl overflow-hidden">
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full text-left px-4 py-3 text-sm font-medium">{f.q}</button>
                  {openFaq === i && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 pb-3 text-sm text-[var(--color-mist)]">{f.a}</motion.p>}
                </div>
              ))}
            </div>
          </div>
          <div className="depth-card rounded-2xl p-6">
            <h3 className="font-[var(--font-display)] font-semibold mb-3 flex items-center gap-2"><LifeBuoy size={18} className="text-[var(--color-aqua)]" /> Contact Us</h3>
            <div className="space-y-2.5 text-sm text-[var(--color-mist)]">
              <a href="mailto:aklogicaihelp@gmail.com" className="flex items-center gap-3 hover:text-[var(--color-aqua)] transition"><Mail size={15} className="text-[var(--color-aqua)]" /> aklogicaihelp@gmail.com</a>
              <a href="https://www.ak-logicai.in" target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:text-[var(--color-aqua)] transition"><Globe size={15} className="text-[var(--color-aqua)]" /> www.ak-logicai.in</a>
            </div>
            <p className="text-[11px] text-[var(--color-mist-2)] mt-3">Support hours: Mon-Sat, 9 AM - 8 PM IST</p>
          </div>
        </div>
      </div>
    </div>
  );
}
