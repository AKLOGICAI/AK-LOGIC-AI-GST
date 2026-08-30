import { apiRequest } from './apiClient';
import { auth, db } from './services';
import type { InvoiceItem, Invoice } from './types';

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  hsn: string;
  gstRate: number;
  sellingPrice: number;
  costPrice: number;
  stockQuantity: number;
  unit: string;
  // Merchant Website Builder fields — optional so every existing caller
  // that never touches these (invoicing, inventory list) is unaffected.
  // See supabase migration adding these 4 columns to merchant_inventory,
  // and WebsitePage.tsx's Products tab which reads/writes them.
  isPublished?: boolean;
  featured?: boolean;
  websiteDescription?: string;
  displayOrder?: number;
}

export const LOW_STOCK_THRESHOLD = 10;

/**
 * Map backend Postgres row to frontend InventoryItem model
 */
export function backendToInventoryItem(raw: any): InventoryItem {
  return {
    id: String(raw.id || ''),
    name: String(raw.product_name || raw.name || ''),
    description: String(raw.description || ''),
    hsn: String(raw.hsn_code || raw.hsn || ''),
    gstRate: Number(raw.gst_rate ?? raw.gstRate ?? 18),
    sellingPrice: Number(raw.selling_price ?? raw.sellingPrice ?? 0),
    costPrice: Number(raw.cost_price ?? raw.costPrice ?? 0),
    stockQuantity: Number(raw.stock_quantity ?? raw.stockQuantity ?? 0),
    unit: String(raw.unit || 'pcs'),
    isPublished: raw.is_published !== undefined && raw.is_published !== null ? Boolean(raw.is_published) : undefined,
    featured: raw.featured !== undefined && raw.featured !== null ? Boolean(raw.featured) : undefined,
    websiteDescription: raw.website_description !== undefined ? String(raw.website_description || '') : undefined,
    displayOrder: raw.display_order !== undefined && raw.display_order !== null ? Number(raw.display_order) : undefined,
  };
}

/**
 * Map frontend InventoryItem model to backend FastAPI JSON payload
 */
export function inventoryItemToBackendPayload(item: Partial<InventoryItem>) {
  const payload: Record<string, any> = {};
  if (item.name !== undefined) payload.product_name = item.name;
  if (item.description !== undefined) payload.description = item.description;
  if (item.hsn !== undefined) payload.hsn_code = item.hsn;
  if (item.gstRate !== undefined) payload.gst_rate = Number(item.gstRate);
  if (item.sellingPrice !== undefined) payload.selling_price = Number(item.sellingPrice);
  if (item.costPrice !== undefined) payload.cost_price = Number(item.costPrice);
  if (item.stockQuantity !== undefined) payload.stock_quantity = Number(item.stockQuantity);
  if (item.unit !== undefined) payload.unit = item.unit;
  if (item.isPublished !== undefined) payload.is_published = item.isPublished;
  if (item.featured !== undefined) payload.featured = item.featured;
  if (item.websiteDescription !== undefined) payload.website_description = item.websiteDescription;
  if (item.displayOrder !== undefined) payload.display_order = item.displayOrder;
  return payload;
}

/**
 * Synchronous local cache reader for merchant inventory.
 */
export function getMerchantInventory(merchantId: string): InventoryItem[] {
  if (!merchantId) return [];
  try {
    const raw = localStorage.getItem(`inventory_${merchantId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save merchant inventory to local cache and emit real-time event.
 */
export function saveLocalMerchantInventory(merchantId: string, items: InventoryItem[]): void {
  if (!merchantId) return;
  try {
    localStorage.setItem(`inventory_${merchantId}`, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('inventory-updated', { detail: { merchantId, items } }));
  } catch (e) {
    console.error('[inventory] Save local cache failed:', e);
  }
}

/**
 * Fetch inventory from backend API (/api/merchant/inventory).
 * Includes one-time migration for legacy localStorage items.
 */
export async function fetchMerchantInventory(merchantId: string): Promise<InventoryItem[]> {
  if (!merchantId) return [];
  const token = auth.merchantToken();
  if (!token) return getMerchantInventory(merchantId);

  try {
    const res = await apiRequest<any[]>('/api/merchant/inventory', { method: 'GET', token });
    const items = Array.isArray(res) ? res.map(backendToInventoryItem) : [];

    // One-time data migration: Upload legacy local items if backend database is empty
    if (items.length === 0) {
      const localLegacy = getMerchantInventory(merchantId);
      if (localLegacy.length > 0) {
        console.log('[inventory] Migrating local items to backend database...');
        const migrated: InventoryItem[] = [];
        for (const item of localLegacy) {
          try {
            const created = await apiRequest<any>('/api/merchant/inventory', {
              method: 'POST',
              body: inventoryItemToBackendPayload(item),
              token,
            });
            migrated.push(backendToInventoryItem(created));
          } catch (err) {
            console.error('[inventory] Migration failed for item:', item.name, err);
          }
        }
        // Clear legacy local storage key after successful migration
        localStorage.removeItem(`inventory_${merchantId}`);
        if (migrated.length > 0) {
          saveLocalMerchantInventory(merchantId, migrated);
          return migrated;
        }
      }
    }

    saveLocalMerchantInventory(merchantId, items);
    return items;
  } catch (err) {
    console.warn('[inventory] Backend fetch failed, using local cache:', err);
    return getMerchantInventory(merchantId);
  }
}

/**
 * Create a new inventory item via backend API.
 */
export async function createInventoryItem(
  merchantId: string,
  item: Omit<InventoryItem, 'id'>
): Promise<InventoryItem> {
  const token = auth.merchantToken();
  const payload = inventoryItemToBackendPayload(item);

  if (token) {
    try {
      const res = await apiRequest<any>('/api/merchant/inventory', {
        method: 'POST',
        body: payload,
        token,
      });
      const created = backendToInventoryItem(res);
      const current = getMerchantInventory(merchantId);
      const updated = [created, ...current.filter((i) => i.id !== created.id)];
      saveLocalMerchantInventory(merchantId, updated);
      return created;
    } catch (err) {
      console.error('[inventory] Create API error, saving locally:', err);
    }
  }

  // Fallback if offline
  const fallbackItem: InventoryItem = {
    ...item,
    id: Math.random().toString(36).substring(2, 9),
  };
  const current = getMerchantInventory(merchantId);
  const updated = [fallbackItem, ...current];
  saveLocalMerchantInventory(merchantId, updated);
  return fallbackItem;
}

/**
 * Update an existing inventory item via backend API.
 */
export async function updateInventoryItem(
  merchantId: string,
  id: string,
  updates: Partial<InventoryItem>
): Promise<InventoryItem> {
  const token = auth.merchantToken();
  const payload = inventoryItemToBackendPayload(updates);

  if (token) {
    try {
      const res = await apiRequest<any>(`/api/merchant/inventory/${id}`, {
        method: 'PATCH',
        body: payload,
        token,
      });
      const updated = backendToInventoryItem(res);
      const current = getMerchantInventory(merchantId);
      const list = current.map((i) => (i.id === id ? updated : i));
      saveLocalMerchantInventory(merchantId, list);
      return updated;
    } catch (err) {
      console.error('[inventory] Update API error:', err);
    }
  }

  // Fallback
  const current = getMerchantInventory(merchantId);
  let updatedItem: InventoryItem | null = null;
  const list = current.map((i) => {
    if (i.id === id) {
      updatedItem = { ...i, ...updates };
      return updatedItem;
    }
    return i;
  });
  saveLocalMerchantInventory(merchantId, list);
  return updatedItem || ({ ...updates, id } as InventoryItem);
}

/**
 * Delete an inventory item via backend API.
 */
export async function deleteInventoryItem(merchantId: string, id: string): Promise<boolean> {
  const token = auth.merchantToken();

  if (token) {
    try {
      await apiRequest(`/api/merchant/inventory/${id}`, {
        method: 'DELETE',
        token,
      });
    } catch (err) {
      console.error('[inventory] Delete API error:', err);
    }
  }

  const current = getMerchantInventory(merchantId);
  const list = current.filter((i) => i.id !== id);
  saveLocalMerchantInventory(merchantId, list);
  return true;
}

/**
 * Validate if available stock is sufficient for all items in an invoice before approval.
 */
export function validateStockForInvoice(
  merchantId: string,
  invoiceItems: InvoiceItem[]
): { ok: boolean; error?: string; warning?: string } {
  const inventory = getMerchantInventory(merchantId);
  // If cache is empty, skip client-side validation and let backend handle it
  // (previously this silently allowed zero-stock approvals)
  if (!inventory || inventory.length === 0) return { ok: true, warning: 'Inventory cache empty — backend will validate stock.' };

  for (const item of invoiceItems) {
    const cleanDesc = (item.description || '').trim().toLowerCase();
    const cleanHsn = (item.hsn || '').trim();

    const matched = inventory.find(
      (inv) =>
        inv.name.toLowerCase() === cleanDesc ||
        (cleanHsn && inv.hsn && inv.hsn.trim() === cleanHsn)
    );

    if (matched) {
      const currentStock = Number(matched.stockQuantity) || 0;
      if (currentStock < item.qty) {
        return {
          ok: false,
          error: `Insufficient stock available for "${matched.name}". Current stock: ${currentStock}.`,
        };
      }
    }
  }

  return { ok: true };
}

/**
 * Deduct stock on invoice approval (both backend API and local cache sync).
 */
export function deductInventoryStock(merchantId: string, invoiceItems: InvoiceItem[]): boolean {
  const inventory = getMerchantInventory(merchantId);
  if (!inventory || inventory.length === 0) return false;

  let modified = false;
  const updatedInventory = inventory.map((invProduct) => {
    const invNameClean = invProduct.name.trim().toLowerCase();
    const invHsnClean = (invProduct.hsn || '').trim();

    const matchingLineItems = invoiceItems.filter(
      (item) =>
        (item.description || '').trim().toLowerCase() === invNameClean ||
        (invHsnClean && (item.hsn || '').trim() === invHsnClean)
    );

    if (matchingLineItems.length > 0) {
      const totalDeductQty = matchingLineItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      const currentStock = Number(invProduct.stockQuantity) || 0;
      const newStock = Math.max(0, currentStock - totalDeductQty);

      if (newStock !== currentStock) {
        modified = true;
        // Fire async API patch to backend
        updateInventoryItem(merchantId, invProduct.id, { stockQuantity: newStock }).catch(console.error);
        return { ...invProduct, stockQuantity: newStock };
      }
    }

    return invProduct;
  });

  if (modified) {
    saveLocalMerchantInventory(merchantId, updatedInventory);
    return true;
  }

  return false;
}

/**
 * Calculate KPI summary stats for inventory dashboard.
 */
export function getInventorySummaryStats(items: InventoryItem[]) {
  const total = items.length;
  let inStock = 0;
  let lowStock = 0;
  let outOfStock = 0;

  for (const item of items) {
    const qty = Number(item.stockQuantity) || 0;
    if (qty === 0) {
      outOfStock++;
    } else if (qty <= LOW_STOCK_THRESHOLD) {
      lowStock++;
    } else {
      inStock++;
    }
  }

  return { total, inStock, lowStock, outOfStock };
}

export interface ProductLiveMetrics {
  totalSoldThisWeek: number;
  totalSoldThisWeekDisplay: string;
  growthDisplay: string;
  isTopSelling: boolean;
  insightTitle: string;
  insightDescription: string;
  healthPercentDisplay: string;
}

/**
 * Compute real product sales metrics from actual store invoice history.
 * If no invoice data exists, returns "--" instead of hardcoded numbers.
 */
export function computeProductLiveMetrics(
  merchantId: string,
  productName: string,
  hsnCode: string,
  unit: string,
  currentStock: number,
  providedInvoices?: Invoice[]
): ProductLiveMetrics {
  try {
    // Read real invoices from store or parameter
    const allInvoices = providedInvoices || db.invoices.all();
    const merchantInvoices = Array.isArray(allInvoices)
      ? allInvoices.filter((iv: any) => iv.merchantId === merchantId)
      : [];

    const now = Date.now();
    const sevenDaysMs = 7 * 86400 * 1000;
    const fourteenDaysMs = 14 * 86400 * 1000;

    const nameClean = (productName || '').trim().toLowerCase();
    const hsnClean = (hsnCode || '').trim();

    let thisWeekSold = 0;
    let lastWeekSold = 0;

    for (const inv of merchantInvoices) {
      const invTime = Number(inv.invoiceDate || inv.createdAt) || 0;
      const isThisWeek = invTime >= now - sevenDaysMs;
      const isLastWeek = invTime >= now - fourteenDaysMs && invTime < now - sevenDaysMs;

      if (!isThisWeek && !isLastWeek) continue;

      if (Array.isArray(inv.items)) {
        for (const it of inv.items) {
          const itName = (it.description || '').trim().toLowerCase();
          const itHsn = (it.hsn || '').trim();
          if (itName === nameClean || (hsnClean && itHsn === hsnClean)) {
            const qty = Number(it.qty) || 0;
            if (isThisWeek) thisWeekSold += qty;
            if (isLastWeek) lastWeekSold += qty;
          }
        }
      }
    }

    const totalSoldThisWeekDisplay = thisWeekSold > 0 ? `${thisWeekSold} ${unit || 'pcs'}` : '--';

    let growthDisplay = '--';
    if (thisWeekSold > 0 || lastWeekSold > 0) {
      if (lastWeekSold > 0) {
        const pct = Math.round(((thisWeekSold - lastWeekSold) / lastWeekSold) * 100);
        growthDisplay = pct >= 0 ? `+${pct}%` : `${pct}%`;
      } else if (thisWeekSold > 0) {
        growthDisplay = '+100%';
      }
    }

    const inventory = getMerchantInventory(merchantId);
    let maxSold = 0;
    for (const p of inventory) {
      const pNameClean = p.name.trim().toLowerCase();
      const pHsnClean = (p.hsn || '').trim();
      let pSold = 0;
      for (const inv of merchantInvoices) {
        const invTime = Number(inv.invoiceDate || inv.createdAt) || 0;
        if (invTime >= now - sevenDaysMs && Array.isArray(inv.items)) {
          for (const it of inv.items) {
            if ((it.description || '').trim().toLowerCase() === pNameClean || (pHsnClean && (it.hsn || '').trim() === pHsnClean)) {
              pSold += Number(it.qty) || 0;
            }
          }
        }
      }
      if (pSold > maxSold) maxSold = pSold;
    }

    const isTopSelling = thisWeekSold > 0 && thisWeekSold >= maxSold;

    let insightTitle = 'BEST SELLING PRODUCT THIS WEEK';
    let insightDescription = 'This product is your top performing item this week.';

    if (!isTopSelling) {
      if (thisWeekSold > 0) {
        insightTitle = 'ACTIVE SALES THIS WEEK';
        insightDescription = `Generated ${thisWeekSold} ${unit || 'pcs'} in sales during the past 7 days.`;
      } else {
        insightTitle = 'NO SALES RECORDED THIS WEEK';
        insightDescription = 'No invoices generated for this product in the last 7 days.';
      }
    }

    let healthPercentDisplay = '--';
    if (currentStock === 0) {
      healthPercentDisplay = '0%';
    } else if (thisWeekSold > 0) {
      const pct = Math.min(100, Math.round((currentStock / (currentStock + thisWeekSold)) * 100));
      healthPercentDisplay = `${pct}%`;
    } else {
      healthPercentDisplay = currentStock > 10 ? '100%' : '50%';
    }

    return {
      totalSoldThisWeek: thisWeekSold,
      totalSoldThisWeekDisplay,
      growthDisplay,
      isTopSelling,
      insightTitle,
      insightDescription,
      healthPercentDisplay,
    };
  } catch {
    return {
      totalSoldThisWeek: 0,
      totalSoldThisWeekDisplay: '--',
      growthDisplay: '--',
      isTopSelling: false,
      insightTitle: 'NO SALES RECORDED THIS WEEK',
      insightDescription: 'No invoice sales data available.',
      healthPercentDisplay: '--',
    };
  }
}
