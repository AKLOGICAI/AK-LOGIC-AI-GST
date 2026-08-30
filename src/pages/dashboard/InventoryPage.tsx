import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Plus, Search, Edit3, Trash2, Save, X, PackageOpen, CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import type { Merchant } from '../../lib/types';
import { PageHeader, GoldButton, EmptyState } from '../../components/ui';
import { Field, Area } from '../../components/Field';
import { useInvoices } from '../../lib/store';
import {
  getInventorySummaryStats,
  LOW_STOCK_THRESHOLD,
  fetchMerchantInventory,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getMerchantInventory,
} from '../../lib/inventoryService';

import { EnterpriseInventoryCard } from '../../components/EnterpriseInventoryCard';

interface InventoryItem {
  id: string;
  name: string;
  description: string;
  hsn: string;
  gstRate: number;
  sellingPrice: number;
  costPrice: number;
  stockQuantity: number;
  unit: string;
}

const GST_RATES = [0, 5, 12, 18, 28];
const UNITS = ['pcs', 'kg', 'ltrs', 'box', 'set'];

export default function InventoryPage({ merchant }: { merchant: Merchant }) {
  const invoices = useInvoices();
  const [items, setItems] = useState<InventoryItem[]>(() => getMerchantInventory(merchant.id));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch inventory from backend API on mount and on real-time update events
  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      try {
        const data = await fetchMerchantInventory(merchant.id);
        if (mounted) setItems(data);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();

    const handleUpdate = () => {
      if (mounted) {
        setItems(getMerchantInventory(merchant.id));
      }
    };

    window.addEventListener('inventory-updated', handleUpdate);
    return () => {
      mounted = false;
      window.removeEventListener('inventory-updated', handleUpdate);
    };
  }, [merchant.id]);

  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const stats = getInventorySummaryStats(items);

  const defaultForm = {
    name: '',
    description: '',
    hsn: '',
    gstRate: 18,
    sellingPrice: '' as string | number,
    costPrice: '' as string | number,
    stockQuantity: '' as string | number,
    unit: 'pcs',
  };

  const [form, setForm] = useState(defaultForm);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const rows = items.filter(
    (item) =>
      item.name.toLowerCase().includes(q.toLowerCase()) ||
      item.hsn.toLowerCase().includes(q.toLowerCase())
  );

  const handleOpenAdd = () => {
    setForm(defaultForm);
    setEditingId(null);
    setOpen(true);
  };

  const handleOpenEdit = (item: InventoryItem) => {
    setForm({
      ...item,
      sellingPrice: item.sellingPrice || '',
      costPrice: item.costPrice || '',
      stockQuantity: item.stockQuantity !== undefined ? item.stockQuantity : '',
    });
    setEditingId(item.id);
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      await deleteInventoryItem(merchant.id, id);
    }
  };

  const handleSave = async () => {
    const sp = Number(form.sellingPrice) || 0;
    const cp = Number(form.costPrice) || 0;
    const qty = Number(form.stockQuantity) || 0;

    if (!form.name || !form.hsn || sp <= 0) {
      toast.error('Please enter Product Name, HSN code, and a valid Selling Price.');
      return;
    }

    setSaving(true);
    try {
      const itemInput = {
        name: form.name,
        description: form.description,
        hsn: form.hsn,
        gstRate: Number(form.gstRate) || 18,
        sellingPrice: sp,
        costPrice: cp,
        stockQuantity: qty,
        unit: form.unit || 'pcs',
      };

      if (editingId) {
        const updated = await updateInventoryItem(merchant.id, editingId, itemInput);
        setItems((prev) => prev.map((i) => (i.id === editingId ? updated : i)));
      } else {
        const created = await createInventoryItem(merchant.id, itemInput);
        setItems((prev) => [created, ...prev.filter((i) => i.id !== created.id)]);
      }

      setOpen(false);
    } catch (err) {
      console.error('[inventory] Save failed:', err);
      toast.error('Failed to save product. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="📦 Inventory"
        subtitle="Manage your product catalog and stock levels."
        action={
          <GoldButton onClick={handleOpenAdd}>
            <Plus size={17} /> Add Product
          </GoldButton>
        }
      />

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="depth-card rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-aqua)]/10 text-[var(--color-aqua)] grid place-items-center shrink-0">
            <Package size={20} />
          </div>
          <div>
            <div className="text-xl font-bold font-[var(--font-display)]">{stats.total}</div>
            <div className="text-xs text-[var(--color-mist)]">Total Products</div>
          </div>
        </div>

        <div className="depth-card rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-emerald)]/10 text-[var(--color-emerald)] grid place-items-center shrink-0">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="text-xl font-bold font-[var(--font-display)] text-[var(--color-emerald)]">{stats.inStock}</div>
            <div className="text-xs text-[var(--color-mist)]">In Stock</div>
          </div>
        </div>

        <div className="depth-card rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-amber)]/10 text-[var(--color-amber)] grid place-items-center shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <div className="text-xl font-bold font-[var(--font-display)] text-[var(--color-amber)]">{stats.lowStock}</div>
            <div className="text-xs text-[var(--color-mist)]">Low Stock (≤10)</div>
          </div>
        </div>

        <div className="depth-card rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-rose)]/10 text-[var(--color-rose)] grid place-items-center shrink-0">
            <XCircle size={20} />
          </div>
          <div>
            <div className="text-xl font-bold font-[var(--font-display)] text-[var(--color-rose)]">{stats.outOfStock}</div>
            <div className="text-xs text-[var(--color-mist)]">Out of Stock</div>
          </div>
        </div>
      </div>

      <div className="relative max-w-md mb-6">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-mist-2)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by product name or HSN..."
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-aqua)] transition"
        />
      </div>

      {loading && items.length === 0 ? (
        <div className="depth-card rounded-2xl p-16 text-center">
          <Loader2 size={32} className="text-[var(--color-aqua)] animate-spin mx-auto mb-3" />
          <p className="text-sm text-[var(--color-mist)]">Loading inventory from server...</p>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<PackageOpen size={28} />}
          title="No products found"
          body="Add products to your inventory to start managing them."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {rows.map((item) => (
            <EnterpriseInventoryCard
              key={item.id}
              item={item}
              merchantId={merchant.id}
              invoices={invoices}
              onEdit={handleOpenEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 16 }}
              onClick={(e) => e.stopPropagation()}
              className="depth-card rounded-[24px] w-full max-w-md p-6 my-8 relative"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-[var(--font-display)] font-bold text-lg">
                  {editingId ? 'Edit Product' : 'Add Product'}
                </h3>
                <button
                  onClick={() => setOpen(false)}
                  className="w-9 h-9 rounded-lg grid place-items-center depth-soft hover:bg-white/5 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                <Field
                  label="Product Name *"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="e.g. Wireless Mouse"
                />
                
                <Area
                  label="Description"
                  rows={2}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Short description..."
                />

                <div className="grid grid-cols-2 gap-4">
                  <Field
                    label="HSN Code *"
                    value={form.hsn}
                    onChange={(e) => set('hsn', e.target.value)}
                    placeholder="e.g. 8471"
                  />
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-mist)] mb-1.5 ml-1">GST Rate *</label>
                    <select
                      value={form.gstRate}
                      onChange={(e) => set('gstRate', Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-aqua)] text-[var(--color-ivory)] appearance-none"
                    >
                      {GST_RATES.map((rate) => (
                        <option key={rate} value={rate}>{rate}%</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field
                    label="Selling Price (₹) *"
                    type="number"
                    step="any"
                    value={form.sellingPrice}
                    onChange={(e) => set('sellingPrice', e.target.value)}
                    placeholder="e.g. 750"
                  />
                  <Field
                    label="Cost Price (₹)"
                    type="number"
                    step="any"
                    value={form.costPrice}
                    onChange={(e) => set('costPrice', e.target.value)}
                    placeholder="e.g. 500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field
                    label="Stock Quantity *"
                    type="number"
                    value={form.stockQuantity}
                    onChange={(e) => set('stockQuantity', e.target.value)}
                    placeholder="e.g. 10"
                  />
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-mist)] mb-1.5 ml-1">Unit *</label>
                    <select
                      value={form.unit}
                      onChange={(e) => set('unit', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-aqua)] text-[var(--color-ivory)] appearance-none"
                    >
                      {UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[var(--color-line)]">
                <GoldButton onClick={handleSave} disabled={saving} className="w-full">
                  {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
                  {saving ? 'Saving...' : 'Save Product'}
                </GoldButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
