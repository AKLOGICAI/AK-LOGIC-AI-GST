import { apiRequest } from './apiClient';
import { auth } from './services';
import { offlineDb } from './offlineDb';

export interface FinancialSummary {
  sales_revenue: number;
  purchases_cost: number;
  gross_profit: number;
  receivables_outstanding: number;
  payables_outstanding: number;
  cash_bank_balance: number;
  total_itc_available: number;
  total_gst_liability: number;
  net_gst_payable: number;
  is_books_balanced: boolean;
}

export interface AccountBalance {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  total_debit: number;
  total_credit: number;
  net_debit: number;
  net_credit: number;
}

export interface TrialBalanceReport {
  accounts: AccountBalance[];
  total_debit: number;
  total_credit: number;
  difference: number;
  is_balanced: boolean;
}

export interface LedgerTransaction {
  line_id: string;
  entry_id: string;
  entry_date: string;
  narration: string;
  source_type: string;
  source_id: string;
  is_reversed: boolean;
  debit: number;
  credit: number;
  party_type?: string;
  party_ref?: string;
  running_balance: number;
  created_at: number;
}

export interface AccountLedger {
  account: {
    id: string;
    code: string;
    name: string;
    type: string;
    description?: string;
  } | null;
  transactions: LedgerTransaction[];
  closing_balance: number;
}

export interface SupplierPayable {
  supplier_name: string;
  total_bills: number;
  total_purchased: number;
  total_paid: number;
  outstanding_balance: number;
  last_bill_at: number;
}

export interface CustomerReceivable {
  customer_name: string;
  total_invoices: number;
  total_billed: number;
  total_paid: number;
  outstanding_balance: number;
  last_invoice_at: number;
}

export interface GstTaxRegister {
  itc: {
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  };
  output_liability: {
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  };
  net_payable: {
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
    is_refund_eligible: boolean;
  };
}

export const accountingCache = {
  getOverview(merchantId: string): FinancialSummary | null {
    if (!merchantId) return null;
    try {
      const raw = localStorage.getItem(`ak_cache_acc_overview_${merchantId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  getTrialBalance(merchantId: string): TrialBalanceReport | null {
    if (!merchantId) return null;
    try {
      const raw = localStorage.getItem(`ak_cache_acc_tb_${merchantId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  getSupplierPayables(merchantId: string): SupplierPayable[] | null {
    if (!merchantId) return null;
    try {
      const raw = localStorage.getItem(`ak_cache_acc_payables_${merchantId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  getCustomerReceivables(merchantId: string): CustomerReceivable[] | null {
    if (!merchantId) return null;
    try {
      const raw = localStorage.getItem(`ak_cache_acc_receivables_${merchantId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  getGstRegister(merchantId: string): GstTaxRegister | null {
    if (!merchantId) return null;
    try {
      const raw = localStorage.getItem(`ak_cache_acc_gst_${merchantId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
};

export const accountingService = {
  async getOverview(): Promise<FinancialSummary> {
    const token = auth.merchantToken();
    const mid = auth.merchantSession();

    if (!navigator.onLine || !token) {
      if (mid) {
        const cached = accountingCache.getOverview(mid);
        if (cached) return cached;
        const localTb = await offlineDb.getLocalTrialBalance(mid);
        const sales = localTb.accounts.find((a) => a.code === '4010')?.credit || 0;
        const purch = localTb.accounts.find((a) => a.code === '5010')?.debit || 0;
        return {
          sales_revenue: sales,
          purchases_cost: purch,
          gross_profit: Math.round((sales - purch) * 100) / 100,
          receivables_outstanding: localTb.accounts.find((a) => a.code === '1020')?.debit || 0,
          payables_outstanding: localTb.accounts.find((a) => a.code === '2010')?.credit || 0,
          cash_bank_balance: localTb.accounts.find((a) => a.code === '1010')?.debit || 0,
          total_itc_available: 0,
          total_gst_liability: 0,
          net_gst_payable: 0,
          is_books_balanced: localTb.isBalanced,
        };
      }
    }

    try {
      const res = await apiRequest<{ ok: boolean; summary: FinancialSummary }>('/api/merchant/accounting/overview', {
        token,
      });
      if (res.summary && mid) {
        localStorage.setItem(`ak_cache_acc_overview_${mid}`, JSON.stringify(res.summary));
      }
      return res.summary;
    } catch (e) {
      if (mid) {
        const cached = accountingCache.getOverview(mid);
        if (cached) return cached;
      }
      throw e;
    }
  },

  async getTrialBalance(): Promise<TrialBalanceReport> {
    const token = auth.merchantToken();
    const mid = auth.merchantSession();

    if (!navigator.onLine || !token) {
      if (mid) {
        const cached = accountingCache.getTrialBalance(mid);
        if (cached) return cached;
      }
    }

    try {
      const res = await apiRequest<{ ok: boolean; trial_balance: TrialBalanceReport }>('/api/merchant/accounting/trial-balance', {
        token,
      });
      if (res.trial_balance && mid) {
        localStorage.setItem(`ak_cache_acc_tb_${mid}`, JSON.stringify(res.trial_balance));
      }
      return res.trial_balance;
    } catch (e) {
      if (mid) {
        const cached = accountingCache.getTrialBalance(mid);
        if (cached) return cached;
      }
      throw e;
    }
  },

  async getAccountLedger(accountCode: string, partyRef?: string): Promise<AccountLedger> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Session expired. Please log in.');
    const params = partyRef ? `?party_ref=${encodeURIComponent(partyRef)}` : '';
    const res = await apiRequest<{ ok: boolean; ledger: AccountLedger }>(`/api/merchant/accounting/ledger/${accountCode}${params}`, {
      token,
    });
    return res.ledger;
  },

  async getSupplierPayables(): Promise<SupplierPayable[]> {
    const token = auth.merchantToken();
    const mid = auth.merchantSession();

    if (!navigator.onLine || !token) {
      if (mid) {
        const cached = accountingCache.getSupplierPayables(mid);
        if (cached) return cached;
      }
    }

    try {
      const res = await apiRequest<{ ok: boolean; payables: SupplierPayable[] }>('/api/merchant/accounting/supplier-payables', {
        token,
      });
      if (res.payables && mid) {
        localStorage.setItem(`ak_cache_acc_payables_${mid}`, JSON.stringify(res.payables));
      }
      return res.payables || [];
    } catch (e) {
      if (mid) {
        const cached = accountingCache.getSupplierPayables(mid);
        if (cached) return cached;
      }
      return [];
    }
  },

  async getCustomerReceivables(): Promise<CustomerReceivable[]> {
    const token = auth.merchantToken();
    const mid = auth.merchantSession();

    if (!navigator.onLine || !token) {
      if (mid) {
        const cached = accountingCache.getCustomerReceivables(mid);
        if (cached) return cached;
      }
    }

    try {
      const res = await apiRequest<{ ok: boolean; receivables: CustomerReceivable[] }>('/api/merchant/accounting/customer-receivables', {
        token,
      });
      if (res.receivables && mid) {
        localStorage.setItem(`ak_cache_acc_receivables_${mid}`, JSON.stringify(res.receivables));
      }
      return res.receivables || [];
    } catch (e) {
      if (mid) {
        const cached = accountingCache.getCustomerReceivables(mid);
        if (cached) return cached;
      }
      return [];
    }
  },

  async getGstRegister(): Promise<GstTaxRegister> {
    const token = auth.merchantToken();
    const mid = auth.merchantSession();

    if (!navigator.onLine || !token) {
      if (mid) {
        const cached = accountingCache.getGstRegister(mid);
        if (cached) return cached;
      }
    }

    try {
      const res = await apiRequest<{ ok: boolean; gst_register: GstTaxRegister }>('/api/merchant/accounting/gst-register', {
        token,
      });
      if (res.gst_register && mid) {
        localStorage.setItem(`ak_cache_acc_gst_${mid}`, JSON.stringify(res.gst_register));
      }
      return res.gst_register;
    } catch (e) {
      if (mid) {
        const cached = accountingCache.getGstRegister(mid);
        if (cached) return cached;
      }
      throw e;
    }
  },

  async reverseEntry(entryId: string, reason: string): Promise<boolean> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Session expired. Please log in.');
    const res = await apiRequest<{ ok: boolean }>('/api/merchant/accounting/reversal', {
      method: 'POST',
      token,
      body: { entryId, reason },
    });
    return res.ok;
  },

  async syncBooks(): Promise<{ ok: boolean; sync_result: any }> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Session expired. Please log in.');
    return apiRequest<{ ok: boolean; sync_result: any }>('/api/merchant/accounting/sync', {
      method: 'POST',
      token,
    });
  },
};

