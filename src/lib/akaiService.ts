import { auth } from './services';
import { apiRequest } from './apiClient';

export interface AkaiActionCardData {
  card_type: 'invoice_preview' | 'invoice_success' | 'stock_preview' | 'request_preview';
  title?: string;
  customer_name?: string;
  customer_phone?: string;
  items?: Array<{
    name: string;
    qty: number;
    rate: number;
    hsn?: string;
    gstRate?: number;
  }>;
  taxable_value?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  total_tax?: number;
  round_off?: number;
  grand_total?: number;
  is_inter_state?: boolean;
  place_of_supply?: string;
  payment_mode?: string;
  invoice_no?: string;
  pdf_url?: string;
  actions?: Array<{ id: string; label: string; style: string }>;
}

export interface AkaiQueryResponse {
  ok: boolean;
  reply: string;
  action_card?: AkaiActionCardData;
  confirmation_token?: string;
  confirmation_required?: boolean;
}

export const akaiService = {
  async query(prompt: string, context?: any): Promise<AkaiQueryResponse> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Merchant session expired. Please log in again.');
    return await apiRequest<AkaiQueryResponse>('/api/merchant/akai/query', {
      method: 'POST',
      token,
      body: { prompt, context },
    });
  },

  async executeAction(
    actionType: string,
    confirmationToken: string,
    idempotencyKey?: string
  ): Promise<{
    ok: boolean;
    status: string;
    invoice_id?: string;
    invoice_no?: string;
    grand_total?: number;
    customer_name?: string;
    pdf_url?: string;
    message: string;
    result_card?: AkaiActionCardData;
  }> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Merchant session expired. Please log in again.');
    return await apiRequest('/api/merchant/akai/execute-action', {
      method: 'POST',
      token,
      body: { actionType, confirmationToken, idempotencyKey },
    });
  },

  async getQuickPrompts(): Promise<Array<{ text: string; label: string }>> {
    const token = auth.merchantToken();
    if (!token) return [];
    try {
      const res = await apiRequest<{ ok: boolean; prompts: Array<{ text: string; label: string }> }>('/api/merchant/akai/quick-prompts', {
        token,
      });
      return res.prompts || [];
    } catch {
      return [];
    }
  },
};
