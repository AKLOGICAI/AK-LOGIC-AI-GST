import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Inbox, Check, X, Edit3, User, Phone, MapPin, Plus, Trash2, FileCheck2, CreditCard, MapPinned, Wallet, AlertTriangle, StickyNote, Loader2, Globe } from 'lucide-react';
import type { Merchant, InvoiceRequest, InvoiceItem } from '../../lib/types';
import { store, useRequests, useRequestsReady, useInvoices, uid, credits } from '../../lib/store';
import { inr } from '../../lib/gst';
import { resolveSupply, computeInvoice } from '../../lib/gstEngine';
import { PAYMENT_MODES, paymentNeedsRef, paymentLabel, type PaymentMode } from '../../lib/payment';
import { openInvoice } from '../../lib/invoicePdf';
import { INDIAN_STATES } from '../../lib/states';
import { PageHeader, GoldButton, Badge, timeAgo } from '../../components/ui';
import { MiniCalculator } from '../../components/MiniCalculator';
import { CalculatorShortcutButton } from '../../components/CalculatorShortcutButton';
import InventoryPickerModal from '../../components/InventoryPickerModal';
import { validateStockForInvoice, deductInventoryStock, fetchMerchantInventory } from '../../lib/inventoryService';
import HsnSuggestChip from '../../components/HsnSuggestChip';
import { bootstrapLearning } from '../../lib/hsnAi';
import { hsnLearningService } from '../../lib/services';
import CustomerSearchBar from '../../components/CustomerSearchBar';
import CustomerPinVerify from '../../components/CustomerPinVerify';
import GstRateSelect from '../../components/GstRateSelect';
import { Field, Area } from '../../components/Field';

const GST_RATES = [0, 5, 12, 18, 28];

// Shape returned by CustomerSearchBar / CustomerPinVerify when a merchant
// picks a customer from the header-level lookup. Kept here so the picked
// customer can be lifted out of the (now page-level) search UI and handed
// down into whichever Review Request modal is currently open.
type PickedCustomer = {
  customerCode?: string;
  name: string;
  phone: string;
  email?: string;
  gstin?: string;
  billingAddress?: string;
  companyName?: string;
  state?: string;
};

export default function RequestsPage({ merchant }: { merchant: Merchant }) {
  const pending = useRequests().filter((r) => r.merchantId === merchant.id && r.status === 'pending');
  // Requests are Supabase-backed and the cache starts empty until the first
  // fetch resolves — without checking this, an empty cache during that
  // brief window looks identical to "genuinely no pending requests", which
  // is exactly the confusing state this migration is meant to fix.
  const requestsReady = useRequestsReady();
  const allInvoices = useInvoices();
  const [active, setActive] = useState<InvoiceRequest | null>(null);

  // Customer picked via the "Search customer ID" lookup in the page header.
  // It's handed down to the currently open Review Request modal (if any)
  // to autofill that request's customer fields — same behaviour as before,
  // just triggered from the header instead of from inside the modal.
  const [pickedCustomer, setPickedCustomer] = useState<PickedCustomer | null>(null);

  // Reset any pending pick whenever the open request changes, so a lookup
  // done for one request never leaks into the next one that's opened.
  useEffect(() => { setPickedCustomer(null); }, [active?.id]);

  // Seed the AI memory from past approved invoices so suggestions start smart.
  useEffect(() => { bootstrapLearning(allInvoices); }, [allInvoices]);

  // Hydrate from DB-backed learning signals (additive, non-blocking).
  useEffect(() => { hsnLearningService.fetchAndHydrate(merchant.id).catch(console.error); }, [merchant.id]);

  // Searching a customer with no request currently open used to just
  // silently discard the pick — there was nowhere for it to go. Now it
  // starts a fresh billing request for that customer (same create path
  // customers use when scanning a QR) and immediately opens it in the
  // Review modal, so the merchant lands straight on an items/GST form
  // ready to generate an invoice.
  const [startingInvoice, setStartingInvoice] = useState(false);
  const [startErr, setStartErr] = useState('');

  const handleCustomerPicked = async (c: PickedCustomer) => {
    setPickedCustomer(c);
    if (active) {
      // A request is already open — keep the original behaviour of
      // autofilling that request's customer fields.
      return;
    }

    setStartErr('');
    setStartingInvoice(true);
    const result = await store.createRequest({
      merchantId: merchant.id,
      customerName: c.name,
      customerPhone: c.phone,
      customerEmail: c.email || '',
      customerGstin: c.gstin || '',
      customerAddress: c.billingAddress || merchant.address || 'Address Pending',
      customerState: c.state || merchant.state,
      paymentMode: 'cash',
      items: [],
      branded: credits.brandingEnabled(merchant) && !!(merchant.logoUrl || merchant.logoDataUrl),
    });
    setStartingInvoice(false);

    if (result.ok) {
      setActive(result.request);
    } else {
      setStartErr(result.message || 'Could not start a new invoice for this customer. Please check your internet connection and try again.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-display)] text-3xl font-bold">Pending Requests</h1>
          <p className="text-[var(--color-mist)] mt-1">Review incoming customer requests, edit details, and approve or reject them.</p>
        </div>

        {/* Nationwide customer lookup — moved here from inside the Review
            Request modal so merchants search once, from the request centre,
            instead of digging into every individual request. Picking a
            customer either fills an already-open Review modal, or (if none
            is open) starts a brand-new billing request for that customer
            and opens it straight away — see handleCustomerPicked. */}
        <div className="w-full lg:w-auto lg:min-w-[300px]">
          {merchant.kyc === 'verified' ? (
            <CustomerSearchBar compact onSelectCustomer={handleCustomerPicked} />
          ) : (
            <CustomerPinVerify onSelectCustomer={handleCustomerPicked} />
          )}
          {startingInvoice && (
            <div className="mt-2 flex items-center gap-2 text-xs text-[var(--color-mist)]">
              <Loader2 size={13} className="animate-spin" /> Starting invoice for this customer…
            </div>
          )}
          {startErr && <p className="mt-2 text-xs text-[var(--color-rose)]">{startErr}</p>}
        </div>
      </div>

      {!requestsReady ? (
        <div className="depth-card rounded-2xl p-16 text-center">
          <div className="w-16 h-16 rounded-2xl grid place-items-center mx-auto depth-soft mb-4"><Inbox size={28} className="text-[var(--color-mist-2)] animate-pulse" /></div>
          <h3 className="font-[var(--font-display)] font-semibold text-lg">Loading requests…</h3>
          <p className="text-sm text-[var(--color-mist)] mt-1">Checking for pending requests from every device.</p>
        </div>
      ) : pending.length === 0 ? (
        <div className="depth-card rounded-2xl p-16 text-center">
          <div className="w-16 h-16 rounded-2xl grid place-items-center mx-auto depth-soft mb-4"><Inbox size={28} className="text-[var(--color-mist-2)]" /></div>
          <h3 className="font-[var(--font-display)] font-semibold text-lg">No pending requests</h3>
          <p className="text-sm text-[var(--color-mist)] mt-1">When a customer scans your QR code, their requests will appear here.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {pending.map((r, i) => {
            const supply = resolveSupply({ sellerState: merchant.state, sellerGstin: merchant.gstin, buyerGstin: r.customerGstin, buyerState: r.customerState });
            const comp = computeInvoice(r.items, supply);
            return (
              <motion.div key={r.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="depth-card rounded-2xl p-5 tilt-hover">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl grid place-items-center text-[var(--color-ink)] font-bold depth-raised" style={{ background: 'linear-gradient(135deg,#6ff2dc,#38e0c8)' }}>{(r.customerName || 'C').charAt(0)}</div>
                    <div>
                      <div className="font-semibold">{r.customerName || 'Store Customer'}</div>
                      <div className="text-xs text-[var(--color-mist)]">{new Date(r.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[rgba(255,180,84,0.14)] text-[var(--color-amber)] uppercase tracking-wider">Pending</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[rgba(124,108,245,0.14)] text-[var(--color-violet)]">{comp.isInterState ? 'IGST' : 'CGST+SGST'}</span>
                    {(r.notes?.toLowerCase().includes('website') || r.notes?.toLowerCase().includes('store')) && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                        <Globe size={11} className="text-cyan-400" /> Online Store
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-4 space-y-1.5 text-sm text-[var(--color-mist)]">
                  <div className="flex items-center gap-2"><Phone size={13} /> {r.customerPhone || '—'}</div>
                  <div className="flex items-center gap-2"><MapPin size={13} /> <span className="truncate">{r.customerAddress || 'Address Pending'}</span></div>
                  {r.paymentMode && <div className="flex items-center gap-2"><CreditCard size={13} /> {paymentLabel(r.paymentMode)}{r.paymentRef ? ` · ${r.paymentRef}` : ''}</div>}
                </div>
                <div className="mt-4 pt-4 border-t border-[var(--color-line)] flex items-center justify-between">
                  <div>
                    <div className="text-xs text-[var(--color-mist)]">{(r.items || []).length} item{(r.items || []).length > 1 ? 's' : ''} · Total</div>
                    <div className="font-[var(--font-display)] text-xl font-bold gold-text">{inr(comp.grandTotal)}</div>
                  </div>
                  <button onClick={() => setActive(r)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-[var(--color-ink)] depth-raised" style={{ background: 'linear-gradient(135deg,#f6dd9b,#e9c46a)' }}>
                    <Edit3 size={15} /> Review
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {active && (
          <ReviewModal
            req={active}
            merchant={merchant}
            onClose={() => setActive(null)}
            pickedCustomer={pickedCustomer}
            onConsumePickedCustomer={() => setPickedCustomer(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ReviewModal({
  req,
  merchant,
  onClose,
  pickedCustomer,
  onConsumePickedCustomer,
}: {
  req: InvoiceRequest;
  merchant: Merchant;
  onClose: () => void;
  pickedCustomer?: PickedCustomer | null;
  onConsumePickedCustomer?: () => void;
}) {
  const [items, setItems] = useState<InvoiceItem[]>(() =>
    (req.items || []).map((it, idx) => ({
      id: it.id || `it_${idx}_${Math.random().toString(36).slice(2, 8)}`,
      description: it.description || '',
      hsn: it.hsn || '',
      qty: typeof it.qty === 'number' ? it.qty : (parseFloat(it.qty as any) || 1),
      rate: typeof it.rate === 'number' ? it.rate : (parseFloat(it.rate as any) || 0),
      gstRate: typeof it.gstRate === 'number' ? it.gstRate : (parseFloat(it.gstRate as any) ?? 18),
    }))
  );
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [editCust, setEditCust] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [payMode, setPayMode] = useState<PaymentMode>(req.paymentMode || 'cash');
  const [payRef, setPayRef] = useState<string>(req.paymentRef || '');
  const [notes, setNotes] = useState<string>(req.notes || '');
  const hasValidItem = items.some((i) => (i.description || '').trim().length > 0);
  const [cust, setCust] = useState({
    customerName: req.customerName || 'Store Customer',
    customerPhone: req.customerPhone || '',
    customerEmail: req.customerEmail || '',
    customerGstin: req.customerGstin || '',
    customerAddress: req.customerAddress || 'Address Pending',
    customerState: req.customerState || merchant.state,
  });
  const setC = (k: keyof typeof cust, v: string) => setCust((c) => ({ ...c, [k]: v }));

  // Autofill from a customer picked via the header-level lookup (see
  // RequestsPage). Once applied, tell the parent to clear the pick so it
  // doesn't get re-applied on a later re-render or a different request.
  useEffect(() => {
    if (!pickedCustomer) return;
    setCust((prev) => ({
      ...prev,
      customerName: pickedCustomer.name || prev.customerName,
      customerPhone: pickedCustomer.phone || prev.customerPhone,
      customerEmail: pickedCustomer.email || prev.customerEmail,
      customerGstin: pickedCustomer.gstin || prev.customerGstin,
      customerAddress: pickedCustomer.billingAddress || prev.customerAddress,
      customerState: pickedCustomer.state || prev.customerState,
    }));
    onConsumePickedCustomer?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedCustomer]);

  const up = (id: string, patch: Partial<InvoiceItem>) => setItems((x) => x.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const add = () => setItems((x) => [...x, { id: uid('it_'), description: '', hsn: '', qty: 1, rate: 0, gstRate: 18 }]);
  const rm = (id: string) => setItems((x) => x.filter((i) => i.id !== id));

  // Mini calculator state
  const [calcOpenFor, setCalcOpenFor] = useState<string | null>(null);

  // Inventory picker state
  const [invPickerFor, setInvPickerFor] = useState<string | null>(null);

  // live GST engine preview
  const comp = useMemo(() => {
    const supply = resolveSupply({ sellerState: merchant.state, sellerGstin: merchant.gstin, buyerGstin: cust.customerGstin, buyerState: cust.customerState });
    return computeInvoice(items.filter((i) => i.description), supply);
  }, [items, cust.customerGstin, cust.customerState, merchant.state, merchant.gstin]);

  const [noCredits, setNoCredits] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [syncErr, setSyncErr] = useState('');
  const [approving, setApproving] = useState(false);
  const [rejectingBusy, setRejectingBusy] = useState(false);
  const hasCredits = credits.canGenerate(merchant);
  const availCredits = credits.available(merchant);

  // Invoices are Supabase-backed, so approval is async — must await the
  // save before opening/printing the PDF or closing the modal, otherwise a
  // failed sync would look identical to a successful approval.
  const approve = async () => {
    if (approving) return;
    const cleanItems = items.filter((i) => i.description.trim());
    if (cleanItems.length === 0) {
      setShowValidation(true);
      return;
    }
    const hasInvalidItem = cleanItems.some((it) => {
      const hsnClean = (it.hsn || '').trim();
      const isValidHsn = /^\d+$/.test(hsnClean) && hsnClean.length >= 4;
      return !isValidHsn || it.qty <= 0 || it.rate <= 0;
    });
    if (hasInvalidItem) {
      setShowValidation(true);
      setSyncErr("Please make sure all items have a valid HSN (numeric, min 4 digits), Quantity (>0), and Rate (>0) before generating the invoice.");
      return;
    }

    // Validate inventory stock availability before generating invoice
    const stockValidation = validateStockForInvoice(merchant.id, cleanItems);
    if (!stockValidation.ok) {
      setSyncErr(stockValidation.error || 'Insufficient stock available.');
      return;
    }

    setApproving(true);
    setSyncErr('');
    const result = await store.approveRequest(req.id, cleanItems, {
      ...cust,
      paymentMode: payMode,
      paymentRef: paymentNeedsRef(payMode) ? (payRef.trim() || undefined) : undefined,
      notes: notes.trim() || undefined,
    });
    setApproving(false);
    if (result.ok) {
      // Automatically deduct inventory stock upon successful invoice approval
      deductInventoryStock(merchant.id, cleanItems);
      fetchMerchantInventory(merchant.id).catch(console.error);
      openInvoice(result.invoice, merchant);
      onClose();
    } else if (result.reason === 'no_credits' || result.reason === 'expired') {
      setNoCredits(true);
    } else if (result.reason === 'suspended') {
      setSuspended(true);
    } else if (result.reason === 'sync_failed') {
      setSyncErr('Could not save the invoice. Please check your internet connection and try again.');
    }
  };

  const reject = async () => {
    if (rejectingBusy) return;
    setRejectingBusy(true);
    setSyncErr('');
    const result = await store.rejectRequest(req.id, reason || 'Rejected by merchant');
    setRejectingBusy(false);
    if (result.ok) onClose();
    else setSyncErr('Could not reject the request. Please check your internet connection and try again.');
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }} onClick={(e) => e.stopPropagation()} className="depth-card rounded-[24px] w-full max-w-3xl max-h-[90vh] overflow-y-auto no-scrollbar">
        <div className="sticky top-0 glass border-b border-[var(--color-line)] px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h3 className="font-[var(--font-display)] font-bold text-lg">Review Request</h3>
            <p className="text-xs text-[var(--color-mist)]">{req.customerName} · {req.customerPhone || 'No phone'}</p>
          </div>
          <button onClick={onClose} aria-label="Close review request" className="w-11 h-11 rounded-lg grid place-items-center depth-soft shrink-0"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* customer */}
          <div className="depth-soft rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase flex items-center gap-2"><User size={14} className="text-[var(--color-aqua)]" /> Customer Details</span>
              <button onClick={() => setEditCust((v) => !v)} className="text-xs flex items-center gap-1 text-[var(--color-aqua)]"><Edit3 size={13} /> {editCust ? 'Done' : 'Edit'}</button>
            </div>
            {!editCust ? (
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><User size={15} className="text-[var(--color-aqua)]" /> {cust.customerName}</div>
                <div className="flex items-center gap-2"><Phone size={15} className="text-[var(--color-aqua)]" /> {cust.customerPhone || '—'}</div>
                <div className="sm:col-span-2 flex items-start gap-2"><MapPin size={15} className="text-[var(--color-aqua)] mt-0.5" /> {cust.customerAddress}, {cust.customerState}</div>
                {cust.customerGstin && <div className="text-xs font-mono text-[var(--color-gold)]">GSTIN: {cust.customerGstin}</div>}
                {req.customerPan && <div className="text-xs font-mono text-[var(--color-gold)]">PAN: {req.customerPan}</div>}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2.5">
                {([['customerName', 'Name'], ['customerPhone', 'Phone'], ['customerEmail', 'Email'], ['customerGstin', 'GSTIN (B2B)']] as const).map(([k, label]) => (
                  <Field key={k} label={label} value={cust[k]} onChange={(e) => setC(k, e.target.value)} placeholder={label} className="py-2 text-sm" />
                ))}
                <div className="sm:col-span-2">
                  <Field label="Address" value={cust.customerAddress} onChange={(e) => setC('customerAddress', e.target.value)} placeholder="Address" className="py-2 text-sm" />
                </div>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase">State</span>
                  <select aria-label="State" value={cust.customerState} onChange={(e) => setC('customerState', e.target.value)} className="mt-1.5 w-full rounded-lg bg-[#0c1322] border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-aqua)]">
                    {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>

          {!rejecting ? (
            <>
              {/* place of supply banner */}
              <div className="flex items-center justify-between rounded-xl px-4 py-3 text-sm" style={{ background: comp.isInterState ? 'rgba(124,108,245,0.1)' : 'rgba(56,224,200,0.08)' }}>
                <span className="flex items-center gap-2"><MapPinned size={15} className={comp.isInterState ? 'text-[var(--color-violet)]' : 'text-[var(--color-aqua)]'} /> Place of Supply: <strong>{comp.placeOfSupply}</strong></span>
                <span className="font-semibold" style={{ color: comp.isInterState ? 'var(--color-violet)' : 'var(--color-aqua)' }}>{comp.isInterState ? 'IGST applicable' : 'CGST + SGST'}</span>
              </div>

              {/* editable items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase">Items · HSN · GST (editable)</span>
                  <button 
                    onClick={add} 
                    className={`text-xs flex items-center gap-1 transition-all duration-300 ${
                      showValidation && !hasValidItem 
                        ? 'text-[var(--color-rose)] border border-[rgba(255,107,136,0.5)] bg-[rgba(255,107,136,0.1)] animate-pulse px-2 py-1 rounded-lg font-bold' 
                        : 'text-[var(--color-aqua)]'
                    }`}
                  >
                    <Plus size={13} /> Add
                  </button>
                </div>
                {showValidation && !hasValidItem && (
                  <p className="text-xs text-[var(--color-rose)] mb-3">
                    Please click '+ Add' and enter at least one item before generating the invoice.
                  </p>
                )}
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={it.id} className="depth-soft rounded-xl p-3.5 grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-12 md:col-span-4 flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--color-mist-2)] bg-[rgba(255,255,255,0.05)] w-5 h-5 rounded-full flex items-center justify-center shrink-0">{idx + 1}</span>
                        <input 
                          value={it.description} 
                          onChange={(e) => up(it.id, { description: e.target.value })} 
                          placeholder="Description" 
                          aria-label={`Item ${idx + 1} description`}
                          className={`flex-1 min-w-0 rounded-lg bg-[#0c1322] border px-3 py-2 text-sm outline-none ${
                            showValidation && !it.description.trim() 
                              ? 'border-[var(--color-rose)]' 
                              : 'border-[var(--color-line)] focus:border-[var(--color-aqua)]'
                          }`} 
                        />
                      </div>
                      <input 
                        value={it.hsn} 
                        onChange={(e) => up(it.id, { hsn: e.target.value })} 
                        placeholder="HSN" 
                        aria-label={`Item ${idx + 1} HSN code`}
                        className={`col-span-6 md:col-span-2 rounded-lg bg-[#0c1322] border px-3 py-2 text-sm outline-none ${
                          showValidation && (!it.hsn || !/^\d+$/.test(it.hsn) || it.hsn.trim().length < 4) 
                            ? 'border-[var(--color-rose)]' 
                            : 'border-[var(--color-line)] focus:border-[var(--color-aqua)]'
                        }`} 
                      />
                      <input 
                        type="number" 
                        value={it.qty} 
                        onChange={(e) => up(it.id, { qty: +e.target.value })} 
                        aria-label={`Item ${idx + 1} quantity`}
                        className={`col-span-6 md:col-span-1 rounded-lg bg-[#0c1322] border px-2 py-2 text-sm outline-none ${
                          showValidation && it.qty <= 0 
                            ? 'border-[var(--color-rose)]' 
                            : 'border-[var(--color-line)] focus:border-[var(--color-aqua)]'
                        }`} 
                      />
                      <input 
                        type="number" 
                        value={it.rate || ''} 
                        onChange={(e) => up(it.id, { rate: +e.target.value })} 
                        placeholder="Rate" 
                        aria-label={`Item ${idx + 1} rate`}
                        className={`col-span-6 md:col-span-2 rounded-lg bg-[#0c1322] border px-3 py-2 text-sm outline-none ${
                          showValidation && it.rate <= 0 
                            ? 'border-[var(--color-rose)]' 
                            : 'border-[var(--color-line)] focus:border-[var(--color-aqua)]'
                        }`} 
                      />
                      <GstRateSelect
                        value={it.gstRate}
                        onChange={(rate) => up(it.id, { gstRate: rate })}
                        className="col-span-6 md:col-span-1"
                      />
                      <div className="col-span-12 md:col-span-2 flex items-center justify-end gap-1.5 shrink-0">
                        <CalculatorShortcutButton onClick={() => setCalcOpenFor(it.id)} />
                        <button
                          type="button"
                          onClick={() => setInvPickerFor(it.id)}
                          aria-label={`Select item ${idx + 1} from inventory`}
                          className="grid place-items-center w-10 h-10 rounded-xl bg-[#0F172A] border border-[var(--color-aqua)]/40 hover:border-[var(--color-aqua)] shadow-[0_0_10px_rgba(56,224,200,0.2)] hover:shadow-[0_0_15px_rgba(56,224,200,0.5)] active:scale-95 hover:scale-105 transition-all duration-150 cursor-pointer shrink-0"
                          title="Select from Inventory"
                        >
                          📦
                        </button>
                        <button
                          onClick={() => rm(it.id)}
                          title="Delete Item"
                          aria-label={`Delete item ${idx + 1}`}
                          className="grid place-items-center w-10 h-10 rounded-xl text-[var(--color-rose)] hover:bg-[var(--color-rose)]/10 border border-transparent hover:border-[var(--color-rose)]/30 transition cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      
                      <InventoryPickerModal
                        open={invPickerFor === it.id}
                        onClose={() => setInvPickerFor(null)}
                        onSelect={(item: { description: string; hsn: string; gstRate: number; rate: number }) => {
                          up(it.id, { description: item.description, hsn: item.hsn, gstRate: item.gstRate, rate: item.rate });
                        }}
                        merchantId={merchant.id}
                      />
                      
                      <MiniCalculator
                        open={calcOpenFor === it.id}
                        onClose={() => setCalcOpenFor(null)}
                        onUseAmount={(amount) => {
                          up(it.id, { rate: amount });
                        }}
                      />
                      <HsnSuggestChip
                        itemName={it.description}
                        currentHsn={it.hsn}
                        currentGstRate={it.gstRate}
                        merchantId={merchant.id}
                        onApply={(hsn, gstRate) => up(it.id, { hsn, gstRate })}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* payment method selection (below items & tax details) */}
              <div className="depth-soft rounded-2xl p-4 border border-[var(--color-line)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-wide text-[var(--color-mist)] uppercase flex items-center gap-2">
                    <CreditCard size={14} className="text-[var(--color-aqua)]" /> Payment Method *
                  </span>
                  {paymentNeedsRef(payMode) && (
                    <span className="text-[11px] text-[var(--color-mist-2)]">Ref / UTR optional</span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {PAYMENT_MODES.map((p) => {
                    const isSelected = payMode === p.value;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setPayMode(p.value)}
                        className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs sm:text-sm font-semibold border transition-all duration-150 cursor-pointer ${
                          isSelected
                            ? 'border-[var(--color-aqua)] bg-[rgba(56,224,200,0.12)] text-white shadow-[0_0_12px_rgba(56,224,200,0.25)]'
                            : 'border-[var(--color-line)] bg-[#0c1322] text-[var(--color-mist)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-ivory)]'
                        }`}
                      >
                        <span className="text-base">{p.icon || '💳'}</span>
                        <span className="truncate">{p.label}</span>
                      </button>
                    );
                  })}
                </div>

                {paymentNeedsRef(payMode) && (
                  <div className="pt-1">
                    <input
                      type="text"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      placeholder="UTR / Transaction ID / Reference (optional)"
                      aria-label="Payment reference"
                      className="w-full rounded-xl bg-[#0c1322] border border-[var(--color-line)] px-3.5 py-2.5 text-xs sm:text-sm text-[var(--color-ivory)] outline-none focus:border-[var(--color-aqua)]"
                    />
                  </div>
                )}
              </div>

              {/* notes section */}
              <div className="depth-soft rounded-2xl p-4 border border-[var(--color-line)] space-y-2">
                <span className="text-xs font-semibold tracking-wide text-[var(--color-mist)] uppercase flex items-center gap-2">
                  <StickyNote size={14} className="text-[var(--color-mist)]" /> Notes (optional)
                </span>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything the merchant should know? (e.g. delivery terms, remarks)"
                  aria-label="Invoice notes"
                  className="w-full rounded-xl bg-[#0c1322] border border-[var(--color-line)] px-3.5 py-2.5 text-xs sm:text-sm text-[var(--color-ivory)] outline-none focus:border-[var(--color-aqua)] resize-none"
                />
              </div>

              {/* GST engine totals */}
              <div className="depth-soft rounded-2xl p-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-[var(--color-mist)]"><span>Taxable Value</span><span>{inr(comp.taxableValue)}</span></div>
                {comp.isInterState ? (
                  <div className="flex justify-between text-[var(--color-mist)]"><span>IGST</span><span>{inr(comp.totalIgst)}</span></div>
                ) : (
                  <>
                    <div className="flex justify-between text-[var(--color-mist)]"><span>CGST</span><span>{inr(comp.totalCgst)}</span></div>
                    <div className="flex justify-between text-[var(--color-mist)]"><span>SGST</span><span>{inr(comp.totalSgst)}</span></div>
                  </>
                )}
                {comp.roundOff !== 0 && <div className="flex justify-between text-[var(--color-mist)]"><span>Round Off</span><span>{inr(comp.roundOff)}</span></div>}
                <div className="flex justify-between font-[var(--font-display)] text-lg font-bold pt-2 border-t border-[var(--color-line)]"><span>Grand Total</span><span className="gold-text">{inr(comp.grandTotal)}</span></div>
                <div className="text-xs text-[var(--color-mist)] italic pt-1">{comp.amountInWords}</div>
              </div>

              {/* credit status */}
              <div className="flex items-center justify-between rounded-xl px-4 py-2.5 text-xs depth-soft">
                <span className="flex items-center gap-2 text-[var(--color-mist)]"><Wallet size={14} className="text-[var(--color-aqua)]" /> {availCredits} PDF credit{availCredits === 1 ? '' : 's'} available{credits.freeInvoiceAvailable(merchant) ? ' · 🎁 Free invoice ready' : ''} · {credits.daysRemaining(merchant)} days left</span>
                <span className="font-semibold text-[var(--color-ivory)]">{merchant.planName}</span>
              </div>

              {noCredits && (
                <div className="rounded-xl px-4 py-3.5 border border-[rgba(255,107,136,0.35)] bg-[rgba(255,107,136,0.08)]">
                  <div className="flex items-center gap-2 text-[var(--color-rose)] font-semibold text-sm"><AlertTriangle size={16} /> No PDF credits left</div>
                  <p className="text-xs text-[var(--color-mist)] mt-1">Please recharge before generating an invoice. Rejected requests do not consume any credits.</p>
                  <Link to="/dashboard/recharge" onClick={onClose} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-[var(--color-ink)]" style={{ background: 'linear-gradient(135deg,#f6dd9b,#e9c46a)' }}><Wallet size={15} /> Recharge Now</Link>
                </div>
              )}

              {suspended && (
                <div className="rounded-xl px-4 py-3.5 border border-[rgba(255,107,136,0.35)] bg-[rgba(255,107,136,0.08)]">
                  <div className="flex items-center gap-2 text-[var(--color-rose)] font-semibold text-sm"><AlertTriangle size={16} /> Account suspended</div>
                  <p className="text-xs text-[var(--color-mist)] mt-1">Your account has been suspended and cannot generate invoices. Please contact support.</p>
                </div>
              )}

              {syncErr && (
                <div className="rounded-xl px-4 py-3.5 border border-[rgba(255,107,136,0.35)] bg-[rgba(255,107,136,0.08)]">
                  <div className="flex items-center gap-2 text-[var(--color-rose)] font-semibold text-sm"><AlertTriangle size={16} /> {syncErr}</div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setRejecting(true)} className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-[var(--color-rose)] border border-[rgba(255,107,136,0.3)] hover:bg-[rgba(255,107,136,0.08)] transition">
                  <X size={17} /> Reject
                </button>
                {hasCredits ? (
                  <button onClick={approve} disabled={approving} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-[var(--color-ink)] depth-raised disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#6ff2dc,#38e0c8)' }}>
                    <FileCheck2 size={17} /> {approving ? 'Generating…' : 'Approve & Generate Invoice'}
                  </button>
                ) : (
                  <Link to="/dashboard/recharge" onClick={onClose} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-[var(--color-ink)] depth-raised" style={{ background: 'linear-gradient(135deg,#f6dd9b,#e9c46a)' }}>
                    <Wallet size={17} /> Recharge to Approve
                  </Link>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[var(--color-rose)]"><X size={18} /> <span className="font-semibold">Reject Request</span></div>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Reason for rejection (optional)" aria-label="Reason for rejection" className="w-full rounded-xl bg-[#0c1322] border border-[var(--color-line)] px-4 py-3 text-sm outline-none focus:border-[var(--color-rose)] resize-none" />
              {syncErr && <p className="text-xs text-[var(--color-rose)]">{syncErr}</p>}
              <div className="flex gap-3">
                <button onClick={() => setRejecting(false)} disabled={rejectingBusy} className="px-5 py-3 rounded-xl border border-[var(--color-line)] text-sm disabled:opacity-60">Cancel</button>
                <button onClick={reject} disabled={rejectingBusy} className="flex-1 py-3 rounded-xl font-semibold text-white disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#ff8aa0,#ff6b88)' }}>{rejectingBusy ? 'Rejecting…' : 'Confirm Reject'}</button>
              </div>
            </div>
          )}

          <p className="flex items-center gap-2 text-xs text-[var(--color-mist)] justify-center">
            <Check size={13} className="text-[var(--color-emerald)]" />
            {credits.brandingEnabled(merchant) && (merchant.logoUrl || merchant.logoDataUrl) ? 'Your own logo and branding will appear on the invoice.' : 'AK-LOGIC AI branding will appear on the invoice.'} 1 PDF credit will be used.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
