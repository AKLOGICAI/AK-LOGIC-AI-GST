import { apiRequest } from './apiClient';
import { auth } from './services';

export interface DeliveryRecord {
  id: string;
  merchant_id: string;
  invoice_id?: string;
  order_ref: string;
  status: 'pending' | 'picked' | 'in_transit' | 'delivered' | 'failed';
  address: string;
  recipient_name: string;
  recipient_phone: string;
  courier_name: string;
  tracking_ref: string;
  pickup_time?: number;
  delivered_at?: number;
  created_at: number;
  updated_at: number;
}

export interface DeliveryStatusEvent {
  id: string;
  delivery_id: string;
  status: string;
  notes?: string;
  updated_by?: string;
  created_at: number;
}

export interface TrackingInfo {
  delivery: DeliveryRecord;
  timeline: DeliveryStatusEvent[];
}

export const deliveryService = {
  async createFromInvoice(invoiceId: string, courierName?: string, trackingRef?: string): Promise<DeliveryRecord> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Session expired. Please log in.');
    const res = await apiRequest<{ ok: boolean; delivery: DeliveryRecord }>('/api/merchant/deliveries/create-from-invoice', {
      method: 'POST',
      token,
      body: { invoiceId, courierName, trackingRef },
    });
    return res.delivery;
  },

  async updateStatus(deliveryId: string, status: string, notes?: string): Promise<DeliveryRecord> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Session expired. Please log in.');
    const res = await apiRequest<{ ok: boolean; delivery: DeliveryRecord }>('/api/merchant/deliveries/status', {
      method: 'POST',
      token,
      body: { deliveryId, status, notes },
    });
    return res.delivery;
  },

  async listDeliveries(): Promise<DeliveryRecord[]> {
    const token = auth.merchantToken();
    if (!token) return [];
    try {
      const res = await apiRequest<{ ok: boolean; deliveries: DeliveryRecord[] }>('/api/merchant/deliveries', {
        token,
      });
      return res.deliveries || [];
    } catch {
      return [];
    }
  },

  async trackDelivery(deliveryId: string): Promise<TrackingInfo> {
    const res = await apiRequest<{ ok: boolean } & TrackingInfo>(`/api/public/deliveries/track/${deliveryId}`);
    return {
      delivery: res.delivery,
      timeline: res.timeline || [],
    };
  },
};
