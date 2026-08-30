import { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, ShieldCheck, Ban, CheckCircle2, Building2 } from 'lucide-react';
import { useDuplicateGstins, useMerchants, store } from '../../lib/store';
import { PageHeader, EmptyState } from '../../components/ui';
import { StatusBadge } from './AdminKit';

export default function AdminDuplicateGst() {
  const groups = useDuplicateGstins();
  useMerchants(); // subscribe to live updates
  const [reason, setReason] = useState('');

  const act = (fn: () => void) => { const r = reason.trim() || 'Duplicate GSTIN review'; fn(); void r; };

  return (
    <div>
      <PageHeader title="Duplicate GST Detection" subtitle="Ek hi GSTIN par multiple accounts — side-by-side review aur action." />
      {groups.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={28} />} title="No duplicate GSTINs" body="Har GSTIN ek hi merchant account se linked hai. All clear." />
      ) : (
        <>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Action reason (audit logged)..." className="w-full max-w-md mb-5 rounded-xl bg-[#0c1322] border border-[var(--color-line)] px-4 py-2.5 text-sm outline-none focus:border-[var(--color-violet)]" />
          <div className="space-y-5">
            {groups.map((g, gi) => (
              <motion.div key={g.gstin} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.05 }} className="depth-card rounded-2xl p-6 border-l-4" style={{ borderLeftColor: 'var(--color-rose)' }}>
                <div className="flex items-center gap-2 mb-4"><Copy size={18} className="text-[var(--color-rose)]" /><span className="font-semibold">Duplicate GSTIN:</span><span className="font-mono text-[var(--color-gold)]">{g.gstin}</span><span className="ml-auto text-xs text-[var(--color-mist-2)]">{g.merchants.length} accounts</span></div>
                <div className="grid md:grid-cols-2 gap-4">
                  {g.merchants.map((m) => (
                    <div key={m.id} className="depth-soft rounded-2xl p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2"><Building2 size={15} className="text-[var(--color-violet)]" /><span className="font-semibold">{m.shopName}</span></div>
                        <StatusBadge status={m.status} />
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-[var(--color-mist)]">
                        <div>Owner: {m.ownerName}</div>
                        <div>Mobile: {m.phone}</div>
                        <div>Registered: {new Date(m.createdAt).toLocaleDateString('en-IN')}</div>
                        <div>Bank: {m.bankName} · {m.accountNumber}</div>
                        <div>IFSC: {m.ifsc}</div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => act(() => store.admin.setStatus(m.id, 'active', reason || 'Approved after duplicate review'))} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-[rgba(47,208,122,0.12)] text-[var(--color-emerald)]"><CheckCircle2 size={13} /> Approve</button>
                        <button onClick={() => act(() => store.admin.setStatus(m.id, 'suspended', reason || 'Suspended for duplicate GSTIN'))} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-[rgba(255,107,136,0.12)] text-[var(--color-rose)]"><Ban size={13} /> Suspend</button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
