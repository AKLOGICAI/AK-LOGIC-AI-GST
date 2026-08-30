import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookUser, Plus, Search, Phone, Mail, MapPin, Trash2, X, Building2, ShieldCheck } from 'lucide-react';
import type { Merchant } from '../../lib/types';
import { store, useContacts, useInvoices } from '../../lib/store';
import { PageHeader, GoldButton, EmptyState } from '../../components/ui';
import { Field, Area } from '../../components/Field';

export default function AddressBookPage({ merchant }: { merchant: Merchant }) {
  const localContacts = useContacts().filter((c) => c.merchantId === merchant.id);
  const invoices = useInvoices().filter((iv) => iv.merchantId === merchant.id);

  // Unified contacts from explicit contacts + all historical invoices
  const contacts = useMemo(() => {
    const map = new Map<string, typeof localContacts[0]>();
    for (const c of localContacts) {
      if (c.phone) map.set(c.phone, c);
    }
    for (const iv of invoices) {
      if (iv.customerPhone && !map.has(iv.customerPhone)) {
        map.set(iv.customerPhone, {
          id: `c_inv_${iv.id}`,
          merchantId: merchant.id,
          name: iv.customerName || 'Customer',
          phone: iv.customerPhone,
          email: iv.customerEmail || '',
          gstin: iv.customerGstin || '',
          address: iv.customerAddress || '',
          createdAt: iv.invoiceDate || iv.createdAt,
        });
      }
    }
    return Array.from(map.values());
  }, [localContacts, invoices, merchant.id]);

  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', gstin: '', address: '' });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);

  const rows = contacts
    .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q) || (c.gstin || '').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt);

  const save = () => {
    if (!form.name || !form.phone || saving) return;
    setSaving(true);
    store.upsertContact(merchant.id, form);
    setForm({ name: '', phone: '', email: '', gstin: '', address: '' });
    setOpen(false);
    setSaving(false);
  };

  return (
    <div>
      <PageHeader
        title="Address Book & Customers"
        subtitle="Unified customer directory — auto-synchronized from approved invoices and customer vault."
        action={<GoldButton onClick={() => setOpen(true)}><Plus size={17} /> Add Contact</GoldButton>}
      />

      <div className="relative max-w-md mb-6">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-mist-2)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by customer name, phone, or GSTIN..."
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-aqua)]"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<BookUser size={28} />}
          title="No contacts found"
          body="Customers are automatically saved here whenever you approve an invoice or when a customer orders via QR or website."
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="depth-card rounded-2xl p-5 group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl grid place-items-center text-[var(--color-ink)] font-bold depth-raised" style={{ background: 'linear-gradient(135deg,#6ff2dc,#38e0c8)' }}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{c.name}</div>
                    {c.gstin ? (
                      <div className="text-[11px] text-[var(--color-mist-2)] flex items-center gap-1">
                        <Building2 size={11} className="text-amber-400" /> B2B Registered
                      </div>
                    ) : (
                      <div className="text-[11px] text-[var(--color-mist-2)] flex items-center gap-1">
                        <ShieldCheck size={11} className="text-emerald-400" /> Retail Customer
                      </div>
                    )}
                  </div>
                </div>
                {!c.id.startsWith('c_inv_') && (
                  <button onClick={() => store.deleteContact(c.id)} className="text-[var(--color-mist-2)] hover:text-[var(--color-rose)] opacity-0 group-hover:opacity-100 transition">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <div className="mt-4 space-y-1.5 text-sm text-[var(--color-mist)]">
                <div className="flex items-center gap-2 font-mono"><Phone size={13} className="text-cyan-400" /> {c.phone}</div>
                {c.email && <div className="flex items-center gap-2"><Mail size={13} className="text-indigo-400" /> <span className="truncate">{c.email}</span></div>}
                {c.address && <div className="flex items-start gap-2"><MapPin size={13} className="mt-0.5 text-rose-400 shrink-0" /> <span className="line-clamp-2 text-xs">{c.address}</span></div>}
                {c.gstin && <div className="text-[11px] font-mono text-[var(--color-gold)] pt-1">GSTIN: {c.gstin}</div>}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
            <motion.div initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 16 }} onClick={(e) => e.stopPropagation()} className="depth-card rounded-[24px] w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-[var(--font-display)] font-bold text-lg text-white">Add Customer Contact</h3>
                <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-lg grid place-items-center depth-soft text-[var(--color-mist)] hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-4">
                <Field label="Customer Name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Full Name or Business Name" />
                <Field label="Mobile Number" value={form.phone} maxLength={10} onChange={(e) => set('phone', e.target.value.replace(/\D/g, ''))} placeholder="10-digit mobile number" />
                <Field label="Email Address (optional)" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="email@example.com" />
                <Field label="GSTIN (optional)" value={form.gstin} maxLength={15} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="15-character GSTIN for B2B" />
                <Area label="Billing / Delivery Address" rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Full street address and city" />
                <GoldButton onClick={save} loading={saving} className="w-full">Save Customer</GoldButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
