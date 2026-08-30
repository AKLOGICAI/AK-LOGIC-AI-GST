import { apiRequest } from './apiClient';
import { auth } from './services';

export interface PurchaseItem {
  id?: string;
  name: string;
  description?: string;
  hsn: string;
  qty: number;
  unit?: string;
  rate: number;
  gstRate: number;
  amount: number;
}

export interface PurchaseInvoice {
  id?: string;
  supplierName: string;
  supplierGstin: string;
  billNumber: string;
  billDate: string;
  totalAmount: number;
  totalTax: number;
  cgst: number;
  sgst: number;
  igst: number;
  items: PurchaseItem[];
  fileUrl?: string;
  isDuplicate?: boolean;
  duplicateInfo?: any;
  calculationMismatch?: boolean;
  itemSum?: number;
  created_at?: number;
}

export const purchaseService = {
  async uploadOcr(dataUrl: string, filename: string = 'invoice.pdf'): Promise<PurchaseInvoice> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Session expired. Please log in.');
    const res = await apiRequest<{ ok: boolean; parsed: PurchaseInvoice }>('/api/merchant/purchases/upload-ocr', {
      method: 'POST',
      token,
      body: { dataUrl, filename }
    });
    return res.parsed;
  },

  async confirmPurchase(purchase: Partial<PurchaseInvoice>, allowDuplicate: boolean = false): Promise<boolean> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Session expired. Please log in.');
    const res = await apiRequest<{ ok: boolean }>('/api/merchant/purchases/confirm', {
      method: 'POST',
      token,
      body: { ...purchase, allowDuplicate }
    });
    // Trigger inventory update event across app
    window.dispatchEvent(new CustomEvent('inventory-updated'));
    return res.ok;
  },

  async getPurchases(): Promise<PurchaseInvoice[]> {
    const token = auth.merchantToken();
    if (!token) return [];
    try {
      const res = await apiRequest<{ purchases: PurchaseInvoice[] }>('/api/merchant/purchases', { token });
      return res.purchases || [];
    } catch {
      return [];
    }
  }
};
