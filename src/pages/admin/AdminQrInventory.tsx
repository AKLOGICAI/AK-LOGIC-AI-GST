import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { QrCode, Search, Printer, Download, Layers, Link2, Unlink } from 'lucide-react';
import { useQrInventory, useMerchants, adminService } from '../../lib/store';
import { PageHeader, StatPill, GoldButton, EmptyState, Badge } from '../../components/ui';
import QRCodeCanvas, { qrToPngDataUrl } from '../../components/QRCode';
import type { QrInventoryItem } from '../../lib/types';

/**
 * QR Inventory — real, backend-only feature (see supabase/migrations/
 * 0008_qr_inventory.sql + backend/app/qr_inventory_repo.py).
 *
 * Generating a batch writes real rows to Postgres. Assigning a printed
 * sticker to a merchant writes that code straight into the merchant's live
 * `qrId` — the exact column the existing customer /pay/:qrId flow already
 * reads — so a sticker works for every customer, on every device, the
 * moment it's assigned. Unassigning (merchant stopped using their sticker,
 * left, etc.) frees the code back to "available" so it can be handed to a
 * different merchant later.
 */
export default function AdminQrInventory() {
  const itemsRaw = useQrInventory();
  const merchants = useMerchants();
  const items = useMemo(() => [...itemsRaw].sort((a, b) => a.seq - b.seq), [itemsRaw]);
  const stats = useMemo(() => ({
    total: items.length,
    available: items.filter((q) => q.status === 'available').length,
    assigned: items.filter((q) => q.status === 'assigned').length,
  }), [items]);

  const merchantName = (id?: string) => {
    if (!id) return null;
    const m = merchants.find((mm) => mm.id === id);
    return m ? `${m.shopName} (${m.merchantCode})` : id;
  };

  const [q, setQ] = useState('');
  const [count, setCount] = useState(500);
  const [generating, setGenerating] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<QrInventoryItem | null>(null);
  const [assigning, setAssigning] = useState<QrInventoryItem | null>(null);
  const [assignTarget, setAssignTarget] = useState('');

  useEffect(() => {
    adminService.loadQrInventory();
    adminService.loadAll();
  }, []);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter((r) => r.code.toLowerCase().includes(query));
  }, [items, q]);

  async function handleGenerate() {
    if (generating || count < 1) return;
    setGenerating(true);
    setError('');
    try {
      await adminService.generateQrBatch(count);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate QR codes.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleAssignConfirm() {
    if (!assigning || !assignTarget) return;
    setBusyCode(assigning.code);
    setError('');
    try {
      await adminService.assignQr(assigning.code, assignTarget);
      setAssigning(null);
      setAssignTarget('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assign this QR code.');
    } finally {
      setBusyCode(null);
    }
  }

  async function handleUnassign(item: QrInventoryItem) {
    setBusyCode(item.code);
    setError('');
    try {
      await adminService.unassignQr(item.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unassign this QR code.');
    } finally {
      setBusyCode(null);
    }
  }

  async function handleDownload(item: QrInventoryItem) {
    const dataUrl = await qrToPngDataUrl(item.payUrl, 1024, '#0a0e1a', '#ffffff', item.code);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${item.code}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handlePrint(item: QrInventoryItem) {
    const dataUrl = await qrToPngDataUrl(item.payUrl, 1024, '#0a0e1a', '#ffffff', item.code);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${item.code}</title></head>
      <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;">
        <img src="${dataUrl}" style="width:320px;height:auto;" onload="setTimeout(()=>window.print(),300)" />
      </body></html>`);
    w.document.close();
  }

  return (
    <div>
      <PageHeader
        title="QR Inventory"
        subtitle="Bulk-generate pre-printed Merchant QR stickers, then assign each one to a merchant. Unassign anytime to hand a sticker to a different merchant."
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6 max-w-xl">
        <StatPill label="Total QR Codes" value={String(stats.total)} color="var(--color-violet)" />
        <StatPill label="Available" value={String(stats.available)} color="var(--color-emerald)" />
        <StatPill label="Assigned" value={String(stats.assigned)} color="var(--color-amber)" />
      </div>

      {error && (
        <div className="mb-6 max-w-xl rounded-xl px-4 py-3 text-sm bg-[rgba(255,107,136,0.1)] text-[var(--color-rose)] border border-[rgba(255,107,136,0.25)]">
          {error}
        </div>
      )}

      <div className="depth-card rounded-2xl p-5 mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[var(--color-mist-2)] mb-1.5">Batch size</label>
          <input
            type="number"
            min={1}
            max={5000}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(5000, Number(e.target.value) || 0)))}
            className="w-32 px-4 py-3 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-violet)]"
          />
        </div>
        <GoldButton onClick={handleGenerate} loading={generating} className="!px-6">
          <Layers size={17} /> Generate {count} QR Codes
        </GoldButton>
        <p className="text-xs text-[var(--color-mist-2)] max-w-xs">
          Codes continue from the last one generated (e.g. next batch starts at AKM-{String(stats.total + 1).padStart(6, '0')}), so nothing is ever re-issued.
        </p>
      </div>

      <div className="relative max-w-md mb-6">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-mist-2)]" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by Merchant Code (e.g. AKM-000125)..." className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-violet)]" />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<QrCode size={28} />} title="No QR codes yet" body="Generate your first batch above to build the inventory." />
      ) : (
        <div className="depth-card rounded-2xl overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3.5 text-[11px] uppercase tracking-wider text-[var(--color-mist-2)] border-b border-[var(--color-line)]">
            <div className="col-span-3">Merchant Code</div><div className="col-span-3">Status / Merchant</div><div className="col-span-6 text-right">Actions</div>
          </div>
          <div className="max-h-[520px] overflow-y-auto no-scrollbar">
            {rows.slice(0, 300).map((r, i) => (
              <motion.div key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.01, 0.3) }} className="grid grid-cols-12 gap-4 px-6 py-3.5 items-center border-b border-[var(--color-line)] last:border-0 hover:bg-[rgba(255,255,255,0.02)] transition">
                <div className="col-span-6 md:col-span-3 font-mono text-sm text-[var(--color-gold)] cursor-pointer" onClick={() => setPreview(r)}>{r.code}</div>
                <div className="col-span-6 md:col-span-3">
                  {r.status === 'available' ? (
                    <Badge tone="emerald">Available</Badge>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <Badge tone="amber">Assigned</Badge>
                      <span className="text-xs text-[var(--color-mist-2)] truncate">{merchantName(r.assignedMerchantId)}</span>
                    </div>
                  )}
                </div>
                <div className="col-span-12 md:col-span-6 flex flex-wrap justify-end items-center gap-2">
                  {r.status === 'available' ? (
                    <button
                      onClick={() => { setAssigning(r); setAssignTarget(''); }}
                      disabled={busyCode === r.code}
                      className="h-9 px-3 rounded-lg flex items-center gap-1.5 text-xs font-semibold depth-soft hover:glow-aqua transition text-[var(--color-emerald)] disabled:opacity-50"
                    >
                      <Link2 size={14} /> Assign
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUnassign(r)}
                      disabled={busyCode === r.code}
                      className="h-9 px-3 rounded-lg flex items-center gap-1.5 text-xs font-semibold depth-soft hover:glow-aqua transition text-[var(--color-rose)] disabled:opacity-50"
                    >
                      <Unlink size={14} /> {busyCode === r.code ? 'Unassigning…' : 'Unassign'}
                    </button>
                  )}
                  <button onClick={() => handlePrint(r)} title="Print QR" className="w-9 h-9 rounded-lg grid place-items-center depth-soft hover:glow-aqua transition"><Printer size={15} className="text-[var(--color-mist)]" /></button>
                  <button onClick={() => handleDownload(r)} title="Download QR" className="w-9 h-9 rounded-lg grid place-items-center depth-soft hover:glow-aqua transition"><Download size={15} className="text-[var(--color-aqua)]" /></button>
                </div>
              </motion.div>
            ))}
          </div>
          {rows.length > 300 && (
            <div className="px-6 py-3 text-center text-xs text-[var(--color-mist-2)]">Showing first 300 of {rows.length} matching codes — refine your search to narrow down.</div>
          )}
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="depth-card rounded-2xl p-6 max-w-xs w-full text-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center mb-4"><QRCodeCanvas value={preview.payUrl} size={220} /></div>
            <div className="font-mono text-sm text-[var(--color-gold)] mb-1">{preview.code}</div>
            <div className="text-xs text-[var(--color-mist-2)] break-all mb-4">{preview.payUrl}</div>
            <div className="flex gap-2 justify-center mb-1">
              {preview.status === 'available' ? <Badge tone="emerald">Available</Badge> : <Badge tone="amber">Assigned — {merchantName(preview.assignedMerchantId)}</Badge>}
            </div>
            <div className="flex gap-2 mt-4">
              <GoldButton onClick={() => handlePrint(preview)} className="flex-1 !py-2.5 text-sm"><Printer size={15} /> Print</GoldButton>
              <GoldButton onClick={() => handleDownload(preview)} aqua className="flex-1 !py-2.5 text-sm"><Download size={15} /> Download</GoldButton>
            </div>
          </div>
        </div>
      )}

      {assigning && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setAssigning(null)}>
          <div className="depth-card rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="font-mono text-sm text-[var(--color-gold)] mb-1">{assigning.code}</div>
            <div className="text-sm text-[var(--color-mist)] mb-4">Choose which merchant this printed sticker goes to.</div>
            <select
              value={assignTarget}
              onChange={(e) => setAssignTarget(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-violet)] mb-4"
            >
              <option value="">Select a merchant…</option>
              {merchants.map((m) => (
                <option key={m.id} value={m.id}>{m.shopName} — {m.merchantCode}{m.qrId ? ' (already has a QR)' : ''}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setAssigning(null)} className="flex-1 py-2.5 rounded-xl text-sm depth-soft">Cancel</button>
              <GoldButton onClick={handleAssignConfirm} loading={busyCode === assigning.code} disabled={!assignTarget} className="flex-1 !py-2.5 text-sm">Assign</GoldButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
