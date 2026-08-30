import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileUp, Upload, Sparkles, CheckCircle2, ShieldCheck, FileText,
  Building2, Hash, Calendar, Layers, Loader2, RefreshCw, AlertCircle, Plus, Trash2, Edit3, AlertTriangle
} from 'lucide-react';
import type { Merchant } from '../../lib/types';
import { PageHeader, Badge } from '../../components/ui';
import { purchaseService, type PurchaseInvoice, type PurchaseItem } from '../../lib/purchaseService';
import { fetchMerchantInventory } from '../../lib/inventoryService';

export default function PurchasesPage({ merchant }: { merchant: Merchant }) {
  const [file, setFile] = useState<File | null>(null);
  const [dataUrl, setDataUrl] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [parsedInvoice, setParsedInvoice] = useState<PurchaseInvoice | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Load past purchases on mount
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const history = await purchaseService.getPurchases();
      setPurchases(history);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    // Server & Client File Size Limit Check (15MB)
    if (selected.size > 15 * 1024 * 1024) {
      setErr('File size exceeds the 15MB limit. Please upload a smaller PDF or image file.');
      e.target.value = '';
      return;
    }

    setFile(selected);
    setErr('');
    setSuccessMsg('');
    setAllowDuplicate(false);

    const reader = new FileReader();
    reader.onload = async () => {
      const url = reader.result as string;
      setDataUrl(url);
      await runOcr(url, selected.name);
    };
    reader.readAsDataURL(selected);
    e.target.value = '';
  };

  const runOcr = async (url: string, filename: string) => {
    setScanning(true);
    setErr('');
    try {
      const parsed = await purchaseService.uploadOcr(url, filename);
      setParsedInvoice(parsed);
    } catch (e: any) {
      setErr(e.message || 'Could not scan purchase invoice. Please check the file and try again.');
    } finally {
      setScanning(false);
    }
  };

  const handleCreateManualEntry = () => {
    setErr('');
    setSuccessMsg('');
    setFile(null);
    setDataUrl('');
    setAllowDuplicate(false);
    setParsedInvoice({
      supplierName: 'New Supplier',
      supplierGstin: '',
      billNumber: `BILL-${Math.floor(100000 + Math.random() * 900000)}`,
      billDate: new Date().toISOString().split('T')[0],
      totalAmount: 1000,
      totalTax: 152.54,
      cgst: 76.27,
      sgst: 76.27,
      igst: 0,
      items: [
        {
          name: 'Purchased Stock Item 1',
          hsn: '9983',
          qty: 10,
          unit: 'pcs',
          rate: 100,
          gstRate: 18,
          amount: 1000,
        },
      ],
    });
  };

  const handleConfirmPurchase = async () => {
    if (!parsedInvoice) return;
    setConfirming(true);
    setErr('');
    try {
      const ok = await purchaseService.confirmPurchase(parsedInvoice, allowDuplicate);
      if (ok) {
        setSuccessMsg(`Purchase Invoice #${parsedInvoice.billNumber} confirmed! Inventory stock updated successfully.`);
        setParsedInvoice(null);
        setFile(null);
        setDataUrl('');
        setAllowDuplicate(false);
        await Promise.allSettled([
          loadHistory(),
          fetchMerchantInventory(merchant.id),
        ]);
      } else {
        setErr('Could not save purchase invoice. Please try again.');
      }
    } catch (e: any) {
      setErr(e.message || 'Error processing purchase invoice.');
    } finally {
      setConfirming(false);
    }
  };

  const updateParsedField = (key: keyof PurchaseInvoice, val: any) => {
    if (!parsedInvoice) return;
    setParsedInvoice({ ...parsedInvoice, [key]: val });
  };

  const updateItem = (index: number, key: keyof PurchaseItem, val: any) => {
    if (!parsedInvoice) return;
    const items = [...parsedInvoice.items];
    items[index] = { ...items[index], [key]: val };

    // Recalculate amount when qty, rate, or gstRate changes
    if (key === 'qty' || key === 'rate' || key === 'gstRate') {
      const q = Number(items[index].qty) || 0;
      const r = Number(items[index].rate) || 0;
      items[index].amount = round2(q * r);
    }

    // Calculate tax per-item based on actual gstRate
    const newTotal = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    let totalTax = 0;
    for (const i of items) {
      const gst = Number(i.gstRate) || 18;
      const amt = Number(i.amount) || 0;
      totalTax += round2(amt * gst / (100 + gst));
    }
    setParsedInvoice({
      ...parsedInvoice,
      items,
      totalAmount: round2(newTotal),
      totalTax: round2(totalTax),
      cgst: round2(totalTax / 2),
      sgst: round2(totalTax / 2),
      calculationMismatch: false,
    });
  };

  const addItemRow = () => {
    if (!parsedInvoice) return;
    const newItems = [
      ...parsedInvoice.items,
      { name: 'New Stock Item', hsn: '9983', qty: 1, unit: 'pcs', rate: 100, gstRate: 18, amount: 100 },
    ];
    const newTotal = newItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const newTax = round2(newTotal * 0.18 / 1.18);

    setParsedInvoice({
      ...parsedInvoice,
      items: newItems,
      totalAmount: round2(newTotal),
      totalTax: newTax,
      cgst: round2(newTax / 2),
      sgst: round2(newTax / 2),
    });
  };

  const removeItemRow = (index: number) => {
    if (!parsedInvoice) return;
    const items = parsedInvoice.items.filter((_, i) => i !== index);
    const newTotal = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const newTax = round2(newTotal * 0.18 / 1.18);

    setParsedInvoice({
      ...parsedInvoice,
      items,
      totalAmount: round2(newTotal),
      totalTax: newTax,
      cgst: round2(newTax / 2),
      sgst: round2(newTax / 2),
    });
  };

  return (
    <div className="space-y-7 max-w-7xl mx-auto px-2 sm:px-4">
      <PageHeader
        title="Purchase Bills & Stock Replenishment (OCR)"
        subtitle="Upload Purchase PDFs or Photos — AI extracts Supplier GSTIN, HSN, Tax & automatically updates Inventory Stock."
      />

      {successMsg && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium flex items-center gap-2">
          <CheckCircle2 size={18} /> {successMsg}
        </motion.div>
      )}

      {err && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm font-medium flex items-center gap-2">
          <AlertCircle size={18} /> {err}
        </div>
      )}

      {/* UPLOAD & OCR SCANNER CARD */}
      <div className="depth-card rounded-2xl p-4 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-line)]">
          <div>
            <h2 className="font-[var(--font-display)] font-semibold text-lg sm:text-xl flex items-center gap-2 text-white">
              <FileUp size={22} className="text-cyan-400 shrink-0" /> Upload Purchase Bill (PDF / Photo)
            </h2>
            <p className="text-xs text-[var(--color-mist-2)] mt-1">
              Supports Tax Invoices, Purchase Receipts & Stock Inward Bills (PDF, JPG, PNG up to 15MB)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateManualEntry}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold border border-cyan-500/30 transition flex items-center gap-1.5 shrink-0"
            >
              <Edit3 size={14} /> Manual Entry
            </button>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-semibold shrink-0">
              <Sparkles size={14} /> Google Cloud Vision OCR
            </div>
          </div>
        </div>

        {/* Drag & Drop Box */}
        {!parsedInvoice && !scanning && (
          <label className="border-2 border-dashed border-cyan-500/30 hover:border-cyan-400 bg-[#0c1322]/60 hover:bg-[#0c1322] rounded-2xl p-8 sm:p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all group">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 grid place-items-center mb-4 group-hover:scale-110 transition-transform">
              <Upload size={30} className="text-cyan-400" />
            </div>
            <span className="font-bold text-sm text-white">Click or Drag Purchase Bill PDF / Photo here</span>
            <span className="text-xs text-[var(--color-mist-2)] mt-1">Automatic HSN extraction, Tax & Stock Increment (Max 15MB)</span>
            <input type="file" accept="application/pdf,image/*" onChange={handleFileSelect} className="hidden" />
          </label>
        )}

        {/* Scanning State */}
        {scanning && (
          <div className="py-12 text-center space-y-3">
            <Loader2 size={36} className="animate-spin text-cyan-400 mx-auto" />
            <h3 className="font-bold text-base text-white">Extracting Invoice Details via OCR...</h3>
            <p className="text-xs text-[var(--color-mist-2)]">Reading Supplier GSTIN, Line Items, HSN & ITC calculation</p>
          </div>
        )}

        {/* REVIEW EXTRACTED OCR DATA */}
        {parsedInvoice && !scanning && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
              <span className="text-cyan-300 font-semibold flex items-center gap-1.5">
                <CheckCircle2 size={16} className="shrink-0" /> OCR Extraction Complete. Please review extracted fields below:
              </span>
              <button onClick={() => setParsedInvoice(null)} className="text-[var(--color-mist-2)] hover:text-white underline text-xs">
                Upload Different File
              </button>
            </div>

            {/* DUPLICATE INVOICE ALERT BANNER */}
            {parsedInvoice.isDuplicate && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
                <div className="font-bold flex items-center gap-1.5 text-amber-200">
                  <AlertTriangle size={16} /> Duplicate Purchase Bill Detected!
                </div>
                <p>
                  Purchase Bill <strong>#{parsedInvoice.billNumber}</strong> from <strong>'{parsedInvoice.supplierName}'</strong> was already recorded.
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-white">
                    <input
                      type="checkbox"
                      checked={allowDuplicate}
                      onChange={(e) => setAllowDuplicate(e.target.checked)}
                      className="rounded border-amber-400 bg-slate-900 accent-amber-500"
                    />
                    I understand, allow duplicate recording & stock addition
                  </label>
                </div>
              </div>
            )}

            {/* CALCULATION MISMATCH ALERT BANNER */}
            {parsedInvoice.calculationMismatch && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>
                  <strong>Calculation Notice:</strong> Extracted grand total (₹{parsedInvoice.totalAmount}) differs from the line item total sum (₹{parsedInvoice.itemSum}). Please verify line item prices and GST rates below.
                </span>
              </div>
            )}

            {/* Main Purchase Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">Supplier Name *</label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0c1322] border border-[var(--color-line)]">
                  <Building2 size={15} className="text-cyan-400 shrink-0" />
                  <input
                    type="text"
                    value={parsedInvoice.supplierName}
                    onChange={(e) => updateParsedField('supplierName', e.target.value)}
                    className="bg-transparent text-xs text-white outline-none w-full font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">Supplier GSTIN</label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0c1322] border border-[var(--color-line)]">
                  <ShieldCheck size={15} className="text-emerald-400 shrink-0" />
                  <input
                    type="text"
                    value={parsedInvoice.supplierGstin}
                    onChange={(e) => updateParsedField('supplierGstin', e.target.value.toUpperCase())}
                    placeholder="27AAAAA0000A1Z5"
                    className="bg-transparent text-xs text-white outline-none w-full font-mono font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">Bill / Invoice No *</label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0c1322] border border-[var(--color-line)]">
                  <Hash size={15} className="text-cyan-400 shrink-0" />
                  <input
                    type="text"
                    value={parsedInvoice.billNumber}
                    onChange={(e) => updateParsedField('billNumber', e.target.value)}
                    className="bg-transparent text-xs text-white outline-none w-full font-mono font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">Bill Date</label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0c1322] border border-[var(--color-line)]">
                  <Calendar size={15} className="text-cyan-400 shrink-0" />
                  <input
                    type="text"
                    value={parsedInvoice.billDate}
                    onChange={(e) => updateParsedField('billDate', e.target.value)}
                    placeholder="YYYY-MM-DD"
                    className="bg-transparent text-xs text-white outline-none w-full"
                  />
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-xs sm:text-sm text-white flex items-center gap-1.5">
                  <Layers size={16} className="text-cyan-400 shrink-0" /> Extracted Purchase Line Items & Stock Quantity
                </h4>
                <button onClick={addItemRow} className="px-3 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/30 transition flex items-center gap-1 shrink-0">
                  <Plus size={13} /> Add Item Row
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[var(--color-line)] bg-[#0c1322]">
                <table className="w-full text-left text-xs min-w-[650px]">
                  <thead className="bg-[#131b2e] text-[var(--color-mist-2)] font-semibold border-b border-[var(--color-line)]">
                    <tr>
                      <th className="p-3">Item Name</th>
                      <th className="p-3 w-28">HSN Code</th>
                      <th className="p-3 w-24">Qty (+Stock)</th>
                      <th className="p-3 w-20">Unit</th>
                      <th className="p-3 w-28">Cost Rate (₹)</th>
                      <th className="p-3 w-20">GST %</th>
                      <th className="p-3 w-28 text-right">Amount (₹)</th>
                      <th className="p-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-line)]">
                    {parsedInvoice.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/40">
                        <td className="p-3">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateItem(idx, 'name', e.target.value)}
                            className="bg-transparent text-white font-medium outline-none w-full border-b border-transparent focus:border-cyan-400"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={item.hsn}
                            onChange={(e) => updateItem(idx, 'hsn', e.target.value)}
                            className="bg-transparent font-mono text-cyan-300 outline-none w-full"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={item.qty}
                            onChange={(e) => updateItem(idx, 'qty', e.target.value === '' ? '' : parseFloat(e.target.value))}
                            className="bg-slate-800/80 px-2 py-1 rounded text-emerald-400 font-bold outline-none w-full"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={item.unit || 'pcs'}
                            onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                            className="bg-transparent font-mono text-cyan-300 text-xs outline-none w-full"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="number"
                            step="0.01"
                            value={item.rate}
                            onChange={(e) => updateItem(idx, 'rate', e.target.value === '' ? '' : parseFloat(e.target.value))}
                            className="bg-transparent text-white outline-none w-full"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="number"
                            value={item.gstRate}
                            onChange={(e) => updateItem(idx, 'gstRate', parseFloat(e.target.value) || 18)}
                            className="bg-transparent text-white outline-none w-full"
                          />
                        </td>
                        <td className="p-3 text-right font-bold text-white">
                          ₹{round2(item.amount)}
                        </td>
                        <td className="p-3 text-center">
                          <button onClick={() => removeItemRow(idx)} className="text-[var(--color-mist-2)] hover:text-rose-400 p-1">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Total Tax & Stock Replenish Action */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl depth-soft border border-emerald-500/30">
              <div>
                <div className="text-xs text-[var(--color-mist)]">Total Purchase Bill Amount</div>
                <div className="text-2xl font-bold text-emerald-400">₹{round2(parsedInvoice.totalAmount)}</div>
                <div className="text-[11px] text-cyan-300 mt-0.5">
                  Input Tax Credit (ITC Eligible): CGST ₹{round2(parsedInvoice.cgst)} + SGST ₹{round2(parsedInvoice.sgst)}
                </div>
              </div>

              <button
                onClick={handleConfirmPurchase}
                disabled={confirming || (parsedInvoice.isDuplicate && !allowDuplicate)}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-sm text-black depth-raised transition-transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                {confirming ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-black" /> Updating Inventory Stock...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} /> Confirm & Replenish Inventory Stock
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* PURCHASE HISTORY TABLE */}
      <div className="depth-card rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-[var(--font-display)] font-semibold text-base sm:text-lg flex items-center gap-2 text-white">
            <FileText size={18} className="text-cyan-400 shrink-0" /> Purchase Bills & ITC Log History
          </h2>
          <button onClick={loadHistory} className="text-xs text-cyan-400 hover:underline flex items-center gap-1">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {loadingHistory ? (
          <div className="py-8 text-center text-xs text-[var(--color-mist)] flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin text-cyan-400" /> Loading purchase log...
          </div>
        ) : purchases.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--color-mist-2)]">
            No purchase bills uploaded yet. Upload a PDF or photo bill above to automatically add stock.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--color-line)] bg-[#0c1322]">
            <table className="w-full text-left text-xs min-w-[600px]">
              <thead className="bg-[#131b2e] text-[var(--color-mist-2)] font-semibold border-b border-[var(--color-line)]">
                <tr>
                  <th className="p-3">Bill No / Date</th>
                  <th className="p-3">Supplier Name</th>
                  <th className="p-3">Supplier GSTIN</th>
                  <th className="p-3">Total Bill Amount</th>
                  <th className="p-3">ITC (Tax Credit)</th>
                  <th className="p-3">Items Purchased</th>
                  <th className="p-3 text-right">Stock Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-900/40">
                    <td className="p-3">
                      <div className="font-mono font-bold text-white">{p.billNumber}</div>
                      <div className="text-[10px] text-[var(--color-mist-2)]">{p.billDate || 'N/A'}</div>
                    </td>
                    <td className="p-3 font-semibold text-white">{p.supplierName}</td>
                    <td className="p-3 font-mono text-cyan-300">{p.supplierGstin || '—'}</td>
                    <td className="p-3 font-bold text-emerald-400">₹{round2(p.totalAmount)}</td>
                    <td className="p-3 text-cyan-300">₹{round2(p.totalTax)}</td>
                    <td className="p-3 text-[var(--color-mist)]">{p.items?.length || 0} Line Items</td>
                    <td className="p-3 text-right">
                      <Badge tone="emerald">
                        <CheckCircle2 size={12} className="inline mr-1" /> Stock Added
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}
