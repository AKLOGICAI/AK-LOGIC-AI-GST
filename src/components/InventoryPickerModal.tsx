import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, PackageOpen } from 'lucide-react';

import { fetchMerchantInventory, getMerchantInventory } from '../lib/inventoryService';

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

interface InventoryPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (item: { description: string; hsn: string; gstRate: number; rate: number }) => void;
  merchantId: string;
}

export default function InventoryPickerModal({
  open,
  onClose,
  onSelect,
  merchantId,
}: InventoryPickerModalProps) {
  const [items, setItems] = useState<InventoryItem[]>(() => getMerchantInventory(merchantId));
  const [q, setQ] = useState('');

  useEffect(() => {
    let mounted = true;
    const loadInventory = async () => {
      setItems(getMerchantInventory(merchantId));
      try {
        const remote = await fetchMerchantInventory(merchantId);
        if (mounted) setItems(remote);
      } catch {
        // Fallback
      }
    };

    if (open) {
      loadInventory();
      setQ('');
    }

    const handleUpdate = () => {
      if (mounted) setItems(getMerchantInventory(merchantId));
    };

    window.addEventListener('inventory-updated', handleUpdate);
    return () => {
      mounted = false;
      window.removeEventListener('inventory-updated', handleUpdate);
    };
  }, [open, merchantId]);

  const rows = items.filter(
    (item) =>
      item.name.toLowerCase().includes(q.toLowerCase()) ||
      item.hsn.toLowerCase().includes(q.toLowerCase())
  );

  const handleSelect = (item: InventoryItem) => {
    const qty = Number(item.stockQuantity) || 0;
    if (qty <= 0) {
      return; // Out of stock items cannot be selected
    }
    onSelect({
      description: item.name,
      hsn: item.hsn,
      gstRate: item.gstRate,
      rate: item.sellingPrice,
    });
    onClose();
  };

  const getStatusBadge = (qty: number) => {
    if (qty === 0) {
      return <span className="px-2 py-0.5 text-[10px] rounded-full bg-[var(--color-rose)]/15 text-[var(--color-rose)] font-bold uppercase">Out of Stock</span>;
    }
    if (qty <= 10) {
      return <span className="px-2 py-0.5 text-[10px] rounded-full bg-[var(--color-amber)]/15 text-[var(--color-amber)] font-bold uppercase">Low Stock ({qty})</span>;
    }
    return <span className="px-2 py-0.5 text-[10px] rounded-full bg-[var(--color-emerald)]/15 text-[var(--color-emerald)] font-bold uppercase">In Stock ({qty})</span>;
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 16 }}
            onClick={(e) => e.stopPropagation()}
            className="depth-card rounded-[24px] w-full max-w-3xl max-h-[85vh] flex flex-col relative bg-[#0a101d]"
          >
            <div className="flex items-center justify-between p-5 border-b border-[var(--color-line)]">
              <div>
                <h3 className="font-[var(--font-display)] font-bold text-lg text-[var(--color-ivory)]">Select Product from Inventory</h3>
                <p className="text-xs text-[var(--color-mist-2)] mt-0.5">Click any available item to auto-fill your invoice line item.</p>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-lg grid place-items-center depth-soft hover:bg-white/5 transition text-[var(--color-mist)]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 border-b border-[var(--color-line)] bg-[#0c1322]/50">
              <div className="relative w-full">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-mist-2)]" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  autoFocus
                  placeholder="Search products by name or HSN..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-aqua)] transition text-[var(--color-ivory)]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
              {rows.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12">
                  <PackageOpen size={48} className="text-[var(--color-mist-2)] mb-4 opacity-50" />
                  <p className="text-[var(--color-mist)] text-sm">
                    {q ? 'No matching products found.' : 'Your inventory is empty.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {rows.map((item, i) => {
                    const isOutOfStock = Number(item.stockQuantity) <= 0;
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        onClick={() => handleSelect(item)}
                        className={`group rounded-xl p-4 border transition flex items-center justify-between ${
                          isOutOfStock
                            ? 'opacity-50 cursor-not-allowed bg-[#0c1322]/40 border-[var(--color-line)]'
                            : 'cursor-pointer border-[var(--color-line)] bg-[#0c1322] hover:border-[var(--color-aqua)] hover:bg-[#0c1322]/80'
                        }`}
                      >
                        <div className="flex-1 overflow-hidden pr-3">
                          <div className="font-semibold text-[var(--color-ivory)] truncate">{item.name}</div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="font-mono text-[10px] text-[var(--color-gold)] bg-[var(--color-gold)]/10 px-1.5 py-0.5 rounded">HSN: {item.hsn}</span>
                            <span className="text-[10px] text-[var(--color-mist)] bg-[var(--color-ink)] px-1.5 py-0.5 rounded">GST {item.gstRate}%</span>
                            <span className="text-[10px] font-extrabold text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                              📦 Available: {item.stockQuantity} {item.unit || 'pcs'}
                            </span>
                          </div>
                        </div>
                        
                        <div className="text-right shrink-0">
                          <div className="font-bold text-[var(--color-aqua)] text-base">
                            {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(item.sellingPrice)}
                          </div>
                          <div className="mt-1.5">
                            {getStatusBadge(Number(item.stockQuantity))}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
