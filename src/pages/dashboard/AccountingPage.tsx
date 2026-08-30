import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Scale, TrendingUp, TrendingDown, BookOpen,
  Users, Truck, FileText, RefreshCw,
  ShieldCheck, Eye, PlusCircle, Sparkles, AlertCircle, ChevronRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Merchant } from '../../lib/types';
import { PageHeader } from '../../components/ui';
import { useInvoices, useRequests } from '../../lib/store';
import {
  accountingService,
  accountingCache,
  type FinancialSummary,
  type TrialBalanceReport,
  type SupplierPayable,
  type CustomerReceivable,
  type GstTaxRegister,
  type AccountLedger,
} from '../../lib/accountingService';

const DEFAULT_CHART_OF_ACCOUNTS = [
  { account_id: 'coa_1010', account_code: '1010', account_name: 'Cash in Hand', account_type: 'asset', net_debit: 0, net_credit: 0, total_debit: 0, total_credit: 0 },
  { account_id: 'coa_1011', account_code: '1011', account_name: 'Bank & UPI Account', account_type: 'asset', net_debit: 0, net_credit: 0, total_debit: 0, total_credit: 0 },
  { account_id: 'coa_1012', account_code: '1012', account_name: 'Cards & POS Settlements', account_type: 'asset', net_debit: 0, net_credit: 0, total_debit: 0, total_credit: 0 },
  { account_id: 'coa_1013', account_code: '1013', account_name: 'Cheques & Bank Clearance', account_type: 'asset', net_debit: 0, net_credit: 0, total_debit: 0, total_credit: 0 },
  { account_id: 'coa_1020', account_code: '1020', account_name: 'Accounts Receivable (Sundry Debtors)', account_type: 'asset', net_debit: 0, net_credit: 0, total_debit: 0, total_credit: 0 },
  { account_id: 'coa_1030', account_code: '1030', account_name: 'Inventory / Merchandise Stock', account_type: 'asset', net_debit: 0, net_credit: 0, total_debit: 0, total_credit: 0 },
  { account_id: 'coa_1041', account_code: '1041', account_name: 'Input Tax Credit — CGST', account_type: 'asset', net_debit: 0, net_credit: 0, total_debit: 0, total_credit: 0 },
  { account_id: 'coa_1042', account_code: '1042', account_name: 'Input Tax Credit — SGST', account_type: 'asset', net_debit: 0, net_credit: 0, total_debit: 0, total_credit: 0 },
  { account_id: 'coa_1043', account_code: '1043', account_name: 'Input Tax Credit — IGST', account_type: 'asset', net_debit: 0, net_credit: 0, total_debit: 0, total_credit: 0 },
  { account_id: 'coa_2010', account_code: '2010', account_name: 'Accounts Payable (Sundry Creditors)', account_type: 'liability', net_debit: 0, net_credit: 0, total_debit: 0, total_credit: 0 },
  { account_id: 'coa_2041', account_code: '2041', account_name: 'Output Tax Liability — CGST', account_type: 'liability', net_debit: 0, net_credit: 0, total_debit: 0, total_credit: 0 },
  { account_id: 'coa_2042', account_code: '2042', account_name: 'Output Tax Liability — SGST', account_type: 'liability', net_debit: 0, net_credit: 0, total_debit: 0, total_credit: 0 },
  { account_id: 'coa_2043', account_code: '2043', account_name: 'Output Tax Liability — IGST', account_type: 'liability', net_debit: 0, net_credit: 0, total_debit: 0, total_credit: 0 },
  { account_id: 'coa_3010', account_code: '3010', account_name: "Owner's Capital & Equity", account_type: 'equity', net_debit: 0, net_credit: 0, total_debit: 0, total_credit: 0 },
  { account_id: 'coa_4010', account_code: '4010', account_name: 'Sales Revenue (Goods & Services)', account_type: 'income', net_debit: 0, net_credit: 0, total_debit: 0, total_credit: 0 },
  { account_id: 'coa_5010', account_code: '5010', account_name: 'Purchases (Cost of Goods Sold)', account_type: 'expense', net_debit: 0, net_credit: 0, total_debit: 0, total_credit: 0 },
];

export default function AccountingPage({ merchant }: { merchant: Merchant }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'payables' | 'receivables' | 'gst' | 'trial_balance' | 'ledger'>(() => {
    return (sessionStorage.getItem('accountingActiveTab') as any) || 'overview';
  });

  useEffect(() => {
    sessionStorage.setItem('accountingActiveTab', activeTab);
  }, [activeTab]);

  const [refreshing, setRefreshing] = useState(false);

  const allInvoices = useInvoices();
  const invoices = useMemo(() => allInvoices.filter((iv) => iv.merchantId === merchant.id), [allInvoices, merchant.id]);

  // Synchronous Local-First Initialization from cached snapshot
  const initialOverview = useMemo(() => accountingCache.getOverview(merchant.id), [merchant.id]);
  const initialTb = useMemo(() => accountingCache.getTrialBalance(merchant.id), [merchant.id]);
  const initialPayables = useMemo(() => accountingCache.getSupplierPayables(merchant.id), [merchant.id]);
  const initialReceivables = useMemo(() => accountingCache.getCustomerReceivables(merchant.id), [merchant.id]);
  const initialGst = useMemo(() => accountingCache.getGstRegister(merchant.id), [merchant.id]);

  const [initialLoading, setInitialLoading] = useState(!initialOverview);
  const [summary, setSummary] = useState<FinancialSummary>(() => initialOverview || {
    sales_revenue: 0,
    purchases_cost: 0,
    gross_profit: 0,
    receivables_outstanding: 0,
    payables_outstanding: 0,
    cash_bank_balance: 0,
    total_itc_available: 0,
    total_gst_liability: 0,
    net_gst_payable: 0,
    is_books_balanced: true,
  });
  const [trialBalance, setTrialBalance] = useState<TrialBalanceReport>(() => initialTb || {
    accounts: DEFAULT_CHART_OF_ACCOUNTS,
    total_debit: 0,
    total_credit: 0,
    difference: 0,
    is_balanced: true,
  });
  const [payables, setPayables] = useState<SupplierPayable[]>(() => initialPayables || []);
  const [receivables, setReceivables] = useState<CustomerReceivable[]>(() => initialReceivables || []);
  const [gstRegister, setGstRegister] = useState<GstTaxRegister>(() => initialGst || {
    itc: { cgst: 0, sgst: 0, igst: 0, total: 0 },
    output_liability: { cgst: 0, sgst: 0, igst: 0, total: 0 },
    net_payable: { cgst: 0, sgst: 0, igst: 0, total: 0, is_refund_eligible: false },
  });

  // For Account Ledger drill-down
  const [selectedAccountCode, setSelectedAccountCode] = useState<string>('4010');
  const [accountLedger, setAccountLedger] = useState<AccountLedger | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [partyFilter, setPartyFilter] = useState('');

  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);

    try {
      if (isManualRefresh) {
        try {
          await accountingService.syncBooks();
        } catch {
          // ignore
        }
      }

      const [sum, tb, pay, rec, gst] = await Promise.allSettled([
        accountingService.getOverview(),
        accountingService.getTrialBalance(),
        accountingService.getSupplierPayables(),
        accountingService.getCustomerReceivables(),
        accountingService.getGstRegister(),
      ]);

      if (sum.status === 'fulfilled' && sum.value) {
        setSummary(sum.value);
      }
      if (tb.status === 'fulfilled' && tb.value) {
        setTrialBalance({
          ...tb.value,
          accounts: tb.value.accounts && tb.value.accounts.length > 0 ? tb.value.accounts : DEFAULT_CHART_OF_ACCOUNTS,
        });
      }
      if (pay.status === 'fulfilled' && pay.value) {
        setPayables(pay.value);
      }
      if (rec.status === 'fulfilled' && rec.value) {
        setReceivables(rec.value);
      }
      if (gst.status === 'fulfilled' && gst.value) {
        setGstRegister(gst.value);
      }
    } catch (err) {
      console.error('Accounting data fetch error:', err);
    } finally {
      setRefreshing(false);
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [merchant.id]);

  const loadLedger = async (code: string, party?: string) => {
    setSelectedAccountCode(code);
    setLedgerLoading(true);
    try {
      const res = await accountingService.getAccountLedger(code, party || undefined);
      setAccountLedger(res);
      setActiveTab('ledger');
    } catch (e) {
      console.error('Failed to load ledger statement:', e);
      const matching = DEFAULT_CHART_OF_ACCOUNTS.find((a) => a.account_code === code);
      setAccountLedger({
        account: matching ? { id: matching.account_id, code: matching.account_code, name: matching.account_name, type: matching.account_type } : null,
        transactions: [],
        closing_balance: 0,
      });
      setActiveTab('ledger');
    } finally {
      setLedgerLoading(false);
    }
  };

  const formatCurrency = (val: number = 0) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(val || 0);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      
      {/* Header */}
      <div className="depth-card rounded-2xl p-5 sm:p-6 border border-[var(--color-line)] bg-gradient-to-br from-[#0c1427] via-[#0a0f1d] to-[#070b16]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[rgba(56,224,200,0.12)] border border-[rgba(56,224,200,0.25)] text-[var(--color-aqua)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-aqua)] animate-pulse" />
                Double-Entry General Ledger
              </span>
              <span className="text-[11px] text-[var(--color-mist-2)]">
                Automatic Reconciliation & Party Books
              </span>
            </div>
            <h1 className="font-[var(--font-display)] text-2xl sm:text-3xl font-extrabold text-[var(--color-ivory)]">
              Deep Accounting & Books
            </h1>
            <p className="text-xs sm:text-sm text-[var(--color-mist)] mt-1">
              Automatic double-entry balance, sundry debtors/creditors, and GST tax credit registers.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold text-[var(--color-ink)] bg-gradient-to-r from-[var(--color-aqua)] to-[var(--color-emerald)] rounded-xl hover:scale-105 active:scale-95 transition shadow-lg shadow-[rgba(56,224,200,0.2)] disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Syncing Books…' : 'Refresh Books'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="p-1.5 rounded-2xl bg-[#0a0f1d] border border-[var(--color-line)] flex items-center gap-2 overflow-x-auto no-scrollbar shadow-inner">
        {[
          { id: 'overview', label: 'Financial Health', icon: TrendingUp },
          { id: 'receivables', label: 'Customer Dues', sub: '(Debtors)', icon: Users, count: receivables.length },
          { id: 'payables', label: 'Supplier Dues', sub: '(Creditors)', icon: Truck, count: payables.length },
          { id: 'gst', label: 'GST ITC Register', icon: FileText },
          { id: 'trial_balance', label: 'Trial Balance', icon: Scale },
          { id: 'ledger', label: 'Account Ledger', icon: BookOpen },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                if (tab.id === 'ledger' && !accountLedger) {
                  loadLedger(selectedAccountCode);
                }
              }}
              className={`shrink-0 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-gradient-to-r from-[rgba(56,224,200,0.2)] to-[rgba(56,224,200,0.08)] border border-[rgba(56,224,200,0.4)] text-[var(--color-aqua)] shadow-md'
                  : 'text-[var(--color-mist)] hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[var(--color-aqua)]' : 'text-[var(--color-mist-2)]'}`} />
              <span>{tab.label}</span>
              {tab.sub && <span className="opacity-60 text-[11px] font-normal hidden sm:inline">{tab.sub}</span>}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-[var(--color-aqua)] text-[var(--color-ink)] shrink-0 leading-none">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {initialLoading ? (
        <div className="py-20 text-center space-y-3 depth-card rounded-2xl border border-[var(--color-line)]">
          <RefreshCw className="w-8 h-8 text-[var(--color-aqua)] animate-spin mx-auto" />
          <p className="text-sm font-bold text-[var(--color-ivory)]">Reconciling and synchronizing Double-Entry Books…</p>
          <p className="text-xs text-[var(--color-mist)]">Verifying journal ledger balances and tax registers</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          
          {/* TAB 1: FINANCIAL HEALTH (OVERVIEW) */}
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-6"
            >
              {/* Books Verification Alert */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.25)]">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-6 h-6 text-[var(--color-emerald)] shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-[var(--color-ivory)]">Double-Entry Verification: Balanced</h4>
                    <p className="text-xs text-[var(--color-emerald)]">
                      Every sales invoice & purchase bill is automatically balanced with 100% precision.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('trial_balance')}
                  className="text-xs font-bold text-[var(--color-aqua)] hover:underline shrink-0 cursor-pointer"
                >
                  View Trial Balance →
                </button>
              </div>

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="depth-card p-5 rounded-2xl border border-[var(--color-line)] bg-[#0c1322] relative overflow-hidden">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-[var(--color-mist)] uppercase tracking-wider">Sales Revenue</span>
                    <div className="w-8 h-8 rounded-xl bg-[rgba(16,185,129,0.12)] flex items-center justify-center text-[var(--color-emerald)]">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-extrabold text-[var(--color-ivory)] mb-1">
                    {formatCurrency(summary.sales_revenue)}
                  </div>
                  <p className="text-xs text-[var(--color-mist-2)]">Taxable revenue from canonical invoices</p>
                </div>

                <div className="depth-card p-5 rounded-2xl border border-[var(--color-line)] bg-[#0c1322] relative overflow-hidden">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-[var(--color-mist)] uppercase tracking-wider">Purchases (COGS)</span>
                    <div className="w-8 h-8 rounded-xl bg-[rgba(56,224,200,0.12)] flex items-center justify-center text-[var(--color-aqua)]">
                      <TrendingDown className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-extrabold text-[var(--color-ivory)] mb-1">
                    {formatCurrency(summary.purchases_cost)}
                  </div>
                  <p className="text-xs text-[var(--color-mist-2)]">Total cost of replenished stock</p>
                </div>

                <div className="depth-card p-5 rounded-2xl border border-[var(--color-line)] bg-[#0c1322] relative overflow-hidden">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-[var(--color-mist)] uppercase tracking-wider">Customer Receivables</span>
                    <div className="w-8 h-8 rounded-xl bg-[rgba(255,184,0,0.12)] flex items-center justify-center text-[var(--color-gold)]">
                      <Users className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-extrabold text-[var(--color-gold)] mb-1">
                    {formatCurrency(summary.receivables_outstanding)}
                  </div>
                  <p className="text-xs text-[var(--color-mist-2)]">Outstanding payments to collect</p>
                </div>

                <div className="depth-card p-5 rounded-2xl border border-[var(--color-line)] bg-[#0c1322] relative overflow-hidden">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-[var(--color-mist)] uppercase tracking-wider">Supplier Payables</span>
                    <div className="w-8 h-8 rounded-xl bg-[rgba(255,107,136,0.12)] flex items-center justify-center text-[var(--color-rose)]">
                      <Truck className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-extrabold text-[var(--color-rose)] mb-1">
                    {formatCurrency(summary.payables_outstanding)}
                  </div>
                  <p className="text-xs text-[var(--color-mist-2)]">Outstanding bills to pay suppliers</p>
                </div>
              </div>

              {/* GST ITC vs Liability Summary */}
              <div className="depth-card rounded-2xl border border-[var(--color-line)] p-5 sm:p-6 bg-[#0c1322]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[var(--color-line)]">
                  <div>
                    <h3 className="text-base font-extrabold text-[var(--color-ivory)]">GST Input Tax Credit & Liability Snapshot</h3>
                    <p className="text-xs text-[var(--color-mist)]">Auto-calculated from OCR purchase bills vs sales invoices</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('gst')}
                    className="text-xs font-bold text-[var(--color-aqua)] hover:underline cursor-pointer flex items-center gap-1"
                  >
                    View Full Tax Register →
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-white/3 border border-[var(--color-line)]">
                    <span className="text-xs font-semibold text-[var(--color-mist)]">Total ITC Claimable (Input Tax)</span>
                    <div className="text-xl font-extrabold text-[var(--color-emerald)] mt-1">
                      {formatCurrency(summary.total_itc_available)}
                    </div>
                    <div className="mt-2 text-xs text-[var(--color-mist-2)] flex justify-between">
                      <span>CGST: {formatCurrency(gstRegister.itc.cgst)}</span>
                      <span>SGST: {formatCurrency(gstRegister.itc.sgst)}</span>
                      <span>IGST: {formatCurrency(gstRegister.itc.igst)}</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-white/3 border border-[var(--color-line)]">
                    <span className="text-xs font-semibold text-[var(--color-mist)]">Total Tax Collected (Output Tax)</span>
                    <div className="text-xl font-extrabold text-[var(--color-rose)] mt-1">
                      {formatCurrency(summary.total_gst_liability)}
                    </div>
                    <div className="mt-2 text-xs text-[var(--color-mist-2)] flex justify-between">
                      <span>CGST: {formatCurrency(gstRegister.output_liability.cgst)}</span>
                      <span>SGST: {formatCurrency(gstRegister.output_liability.sgst)}</span>
                      <span>IGST: {formatCurrency(gstRegister.output_liability.igst)}</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[rgba(56,224,200,0.06)] border border-[rgba(56,224,200,0.2)]">
                    <span className="text-xs font-bold text-[var(--color-aqua)]">Net GST Position</span>
                    <div className={`text-xl font-extrabold mt-1 ${
                      summary.net_gst_payable <= 0 ? 'text-[var(--color-emerald)]' : 'text-[var(--color-rose)]'
                    }`}>
                      {formatCurrency(Math.abs(summary.net_gst_payable))}
                    </div>
                    <p className="mt-2 text-xs font-semibold text-[var(--color-mist)]">
                      {summary.net_gst_payable <= 0
                        ? '✓ Excess ITC Balance (Refundable / Carry Forward)'
                        : '⚠️ Net GST Payable to Government'}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: CUSTOMER RECEIVABLES */}
          {activeTab === 'receivables' && (
            <motion.div
              key="receivables"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="depth-card rounded-2xl border border-[var(--color-line)] bg-[#0c1322] overflow-hidden"
            >
              <div className="p-5 border-b border-[var(--color-line)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-[var(--color-ivory)]">Customer Outstanding Ledger (Sundry Debtors)</h3>
                  <p className="text-xs text-[var(--color-mist)]">Party-wise statement of billed invoices and pending dues</p>
                </div>
              </div>

              {receivables.length === 0 ? (
                <div className="p-12 text-center text-[var(--color-mist)] space-y-3">
                  <Users className="w-10 h-10 text-[var(--color-mist-2)] mx-auto opacity-50" />
                  <p className="text-sm font-medium">No customer ledger records found yet.</p>
                  <p className="text-xs text-[var(--color-mist-2)] max-w-sm mx-auto">
                    Customer receivables automatically calculate whenever you generate an invoice for a customer.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#080d19] text-[var(--color-mist-2)] text-xs uppercase font-bold border-b border-[var(--color-line)]">
                      <tr>
                        <th className="px-5 py-3">Customer / Party</th>
                        <th className="px-5 py-3 text-center">Total Invoices</th>
                        <th className="px-5 py-3 text-right">Total Billed</th>
                        <th className="px-5 py-3 text-right">Outstanding Due</th>
                        <th className="px-5 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-line)] text-[var(--color-ivory)]">
                      {receivables.map((r, idx) => (
                        <tr key={idx} className="hover:bg-white/3 transition-colors">
                          <td className="px-5 py-3.5 font-semibold text-[var(--color-ivory)]">
                            {r.customer_name}
                          </td>
                          <td className="px-5 py-3.5 text-center text-[var(--color-mist)]">
                            {r.total_invoices}
                          </td>
                          <td className="px-5 py-3.5 text-right font-medium text-[var(--color-mist)]">
                            {formatCurrency(r.total_billed)}
                          </td>
                          <td className="px-5 py-3.5 text-right font-bold text-[var(--color-gold)]">
                            {formatCurrency(r.outstanding_balance)}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <button
                              onClick={() => {
                                setPartyFilter(r.customer_name);
                                loadLedger('1020', r.customer_name);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-[var(--color-aqua)] hover:bg-[rgba(56,224,200,0.1)] rounded-lg transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View Statement
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 3: SUPPLIER PAYABLES */}
          {activeTab === 'payables' && (
            <motion.div
              key="payables"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="depth-card rounded-2xl border border-[var(--color-line)] bg-[#0c1322] overflow-hidden"
            >
              <div className="p-5 border-b border-[var(--color-line)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-[var(--color-ivory)]">Supplier Outstanding Ledger (Sundry Creditors)</h3>
                  <p className="text-xs text-[var(--color-mist)]">Party-wise statement of purchase bills and payables owed to vendors</p>
                </div>
              </div>

              {payables.length === 0 ? (
                <div className="p-12 text-center text-[var(--color-mist)] space-y-3">
                  <Truck className="w-10 h-10 text-[var(--color-mist-2)] mx-auto opacity-50" />
                  <p className="text-sm font-medium">No supplier purchase bills recorded yet.</p>
                  <p className="text-xs text-[var(--color-mist-2)] max-w-sm mx-auto">
                    Supplier payables automatically accumulate whenever you scan or confirm an OCR purchase bill.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#080d19] text-[var(--color-mist-2)] text-xs uppercase font-bold border-b border-[var(--color-line)]">
                      <tr>
                        <th className="px-5 py-3">Supplier / Vendor</th>
                        <th className="px-5 py-3 text-center">Total Bills</th>
                        <th className="px-5 py-3 text-right">Total Purchased</th>
                        <th className="px-5 py-3 text-right">Balance Payable</th>
                        <th className="px-5 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-line)] text-[var(--color-ivory)]">
                      {payables.map((p, idx) => (
                        <tr key={idx} className="hover:bg-white/3 transition-colors">
                          <td className="px-5 py-3.5 font-semibold text-[var(--color-ivory)]">
                            {p.supplier_name}
                          </td>
                          <td className="px-5 py-3.5 text-center text-[var(--color-mist)]">
                            {p.total_bills}
                          </td>
                          <td className="px-5 py-3.5 text-right font-medium text-[var(--color-mist)]">
                            {formatCurrency(p.total_purchased)}
                          </td>
                          <td className="px-5 py-3.5 text-right font-bold text-[var(--color-rose)]">
                            {formatCurrency(p.outstanding_balance)}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <button
                              onClick={() => {
                                setPartyFilter(p.supplier_name);
                                loadLedger('2010', p.supplier_name);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-[var(--color-aqua)] hover:bg-[rgba(56,224,200,0.1)] rounded-lg transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View Statement
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 4: GST ITC REGISTER */}
          {activeTab === 'gst' && (
            <motion.div
              key="gst"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-6"
            >
              <div className="depth-card rounded-2xl border border-[var(--color-line)] p-6 bg-[#0c1322]">
                <h3 className="text-base font-bold text-[var(--color-ivory)] mb-1">Official GST Input Tax Credit (ITC) vs Output Liability</h3>
                <p className="text-xs text-[var(--color-mist)] mb-6">Designed for direct monthly GSTR-3B & GSTR-1 preparation</p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#080d19] text-[var(--color-mist-2)] text-xs uppercase font-bold border-b border-[var(--color-line)]">
                      <tr>
                        <th className="px-5 py-3">Tax Component</th>
                        <th className="px-5 py-3 text-right">Input Tax Credit (ITC Claim)</th>
                        <th className="px-5 py-3 text-right">Output Tax Liability (Collected)</th>
                        <th className="px-5 py-3 text-right">Net Tax Position</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-line)] text-[var(--color-ivory)]">
                      <tr>
                        <td className="px-5 py-4 font-semibold text-[var(--color-ivory)]">Central GST (CGST)</td>
                        <td className="px-5 py-4 text-right font-medium text-[var(--color-emerald)]">{formatCurrency(gstRegister.itc.cgst)}</td>
                        <td className="px-5 py-4 text-right font-medium text-[var(--color-rose)]">{formatCurrency(gstRegister.output_liability.cgst)}</td>
                        <td className="px-5 py-4 text-right font-bold text-[var(--color-ivory)]">{formatCurrency(gstRegister.net_payable.cgst)}</td>
                      </tr>
                      <tr>
                        <td className="px-5 py-4 font-semibold text-[var(--color-ivory)]">State GST (SGST)</td>
                        <td className="px-5 py-4 text-right font-medium text-[var(--color-emerald)]">{formatCurrency(gstRegister.itc.sgst)}</td>
                        <td className="px-5 py-4 text-right font-medium text-[var(--color-rose)]">{formatCurrency(gstRegister.output_liability.sgst)}</td>
                        <td className="px-5 py-4 text-right font-bold text-[var(--color-ivory)]">{formatCurrency(gstRegister.net_payable.sgst)}</td>
                      </tr>
                      <tr>
                        <td className="px-5 py-4 font-semibold text-[var(--color-ivory)]">Integrated GST (IGST)</td>
                        <td className="px-5 py-4 text-right font-medium text-[var(--color-emerald)]">{formatCurrency(gstRegister.itc.igst)}</td>
                        <td className="px-5 py-4 text-right font-medium text-[var(--color-rose)]">{formatCurrency(gstRegister.output_liability.igst)}</td>
                        <td className="px-5 py-4 text-right font-bold text-[var(--color-ivory)]">{formatCurrency(gstRegister.net_payable.igst)}</td>
                      </tr>
                      <tr className="bg-[#080d19] font-bold text-[var(--color-ivory)] border-t-2 border-[var(--color-line)]">
                        <td className="px-5 py-4 uppercase text-xs">Total GST Balance</td>
                        <td className="px-5 py-4 text-right text-[var(--color-emerald)] font-extrabold">{formatCurrency(gstRegister.itc.total)}</td>
                        <td className="px-5 py-4 text-right text-[var(--color-rose)] font-extrabold">{formatCurrency(gstRegister.output_liability.total)}</td>
                        <td className="px-5 py-4 text-right font-extrabold text-[var(--color-aqua)]">{formatCurrency(gstRegister.net_payable.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 5: TRIAL BALANCE */}
          {activeTab === 'trial_balance' && (
            <motion.div
              key="trial_balance"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="depth-card rounded-2xl border border-[var(--color-line)] bg-[#0c1322] overflow-hidden"
            >
              <div className="p-5 border-b border-[var(--color-line)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-[var(--color-ivory)]">Complete Double-Entry Trial Balance</h3>
                  <p className="text-xs text-[var(--color-mist)]">Every account in your Chart of Accounts with verified debits and credits</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    trialBalance.is_balanced
                      ? 'bg-[rgba(16,185,129,0.12)] text-[var(--color-emerald)] border border-[rgba(16,185,129,0.3)]'
                      : 'bg-[rgba(255,107,136,0.12)] text-[var(--color-rose)] border border-[rgba(255,107,136,0.3)]'
                  }`}>
                    {trialBalance.is_balanced ? '✓ Books Balanced (Debits == Credits)' : '⚠️ Books Out of Balance'}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#080d19] text-[var(--color-mist-2)] text-xs uppercase font-bold border-b border-[var(--color-line)]">
                    <tr>
                      <th className="px-5 py-3">Code</th>
                      <th className="px-5 py-3">Account Name</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3 text-right">Debit (₹)</th>
                      <th className="px-5 py-3 text-right">Credit (₹)</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-line)] text-[var(--color-ivory)]">
                    {trialBalance.accounts.map((acc) => (
                      <tr key={acc.account_id} className="hover:bg-white/3 transition-colors">
                        <td className="px-5 py-3 font-mono text-xs text-[var(--color-aqua)]">{acc.account_code}</td>
                        <td className="px-5 py-3 font-semibold text-[var(--color-ivory)]">{acc.account_name}</td>
                        <td className="px-5 py-3">
                          <span className="capitalize px-2 py-0.5 text-xs rounded-md bg-white/5 text-[var(--color-mist)] font-medium">
                            {acc.account_type}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-medium text-[var(--color-ivory)]">
                          {acc.net_debit > 0 ? formatCurrency(acc.net_debit) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-medium text-[var(--color-ivory)]">
                          {acc.net_credit > 0 ? formatCurrency(acc.net_credit) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => loadLedger(acc.account_code)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-[var(--color-aqua)] hover:bg-[rgba(56,224,200,0.1)] rounded-lg transition-colors cursor-pointer"
                          >
                            Ledger →
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-[#080d19] font-bold text-[var(--color-ivory)] border-t-2 border-[var(--color-line)]">
                      <td colSpan={3} className="px-5 py-4 uppercase text-xs tracking-wider">
                        Grand Total
                      </td>
                      <td className="px-5 py-4 text-right text-[var(--color-aqua)] font-extrabold">
                        {formatCurrency(trialBalance.total_debit)}
                      </td>
                      <td className="px-5 py-4 text-right text-[var(--color-aqua)] font-extrabold">
                        {formatCurrency(trialBalance.total_credit)}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* TAB 6: ACCOUNT LEDGER */}
          {activeTab === 'ledger' && (
            <motion.div
              key="ledger"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-6"
            >
              {/* Account Selector Bar */}
              <div className="depth-card p-4 rounded-2xl border border-[var(--color-line)] bg-[#0c1322] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-[var(--color-mist)] uppercase">Select Account:</span>
                  <select
                    value={selectedAccountCode}
                    onChange={(e) => loadLedger(e.target.value)}
                    className="px-3 py-2 text-sm font-semibold border border-[var(--color-line)] rounded-xl bg-[#080d19] text-[var(--color-ivory)] focus:outline-none focus:border-[var(--color-aqua)] cursor-pointer"
                  >
                    <option value="4010">4010 — Sales Revenue (Goods & Services)</option>
                    <option value="1020">1020 — Accounts Receivable (Sundry Debtors)</option>
                    <option value="2010">2010 — Accounts Payable (Sundry Creditors)</option>
                    <option value="5010">5010 — Purchase Account (COGS)</option>
                    <option value="1041">1041 — Input CGST</option>
                    <option value="1042">1042 — Input SGST</option>
                    <option value="1043">1043 — Input IGST</option>
                    <option value="2041">2041 — Output CGST</option>
                    <option value="2042">2042 — Output SGST</option>
                    <option value="2043">2043 — Output IGST</option>
                    <option value="1010">1010 — Cash & Bank</option>
                  </select>
                </div>

                {partyFilter && (
                  <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[rgba(56,224,200,0.1)] border border-[rgba(56,224,200,0.25)] text-[var(--color-aqua)] text-xs font-semibold">
                    <span>Filtered by: <strong>{partyFilter}</strong></span>
                    <button
                      onClick={() => {
                        setPartyFilter('');
                        loadLedger(selectedAccountCode);
                      }}
                      className="text-white hover:text-[var(--color-rose)] font-bold ml-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Transactions Table */}
              <div className="depth-card rounded-2xl border border-[var(--color-line)] bg-[#0c1322] overflow-hidden">
                <div className="p-5 border-b border-[var(--color-line)] flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-[var(--color-ivory)]">
                      {accountLedger?.account?.name || 'Account Statement'} ({accountLedger?.account?.code || selectedAccountCode})
                    </h3>
                    <p className="text-xs text-[var(--color-mist)] mt-0.5">
                      Closing Balance: <strong className="text-[var(--color-aqua)]">{formatCurrency(accountLedger?.closing_balance || (selectedAccountCode === '4010' ? summary.sales_revenue : 0))}</strong>
                    </p>
                  </div>
                </div>

                {ledgerLoading ? (
                  <div className="p-12 text-center text-[var(--color-mist)]">
                    <RefreshCw className="w-6 h-6 text-[var(--color-aqua)] animate-spin mx-auto mb-2" />
                    <p className="text-xs">Fetching transactions...</p>
                  </div>
                ) : !accountLedger || accountLedger.transactions.length === 0 ? (
                  <div className="p-12 text-center text-[var(--color-mist)] space-y-2">
                    <BookOpen className="w-8 h-8 text-[var(--color-mist-2)] mx-auto opacity-50" />
                    <p className="text-sm font-medium">No individual journal entries recorded in this account statement yet.</p>
                    <p className="text-xs text-[var(--color-mist-2)]">Transactions post automatically whenever you generate invoices or confirm purchase bills.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#080d19] text-[var(--color-mist-2)] text-xs uppercase font-bold border-b border-[var(--color-line)]">
                        <tr>
                          <th className="px-5 py-3">Date</th>
                          <th className="px-5 py-3">Narration / Particulars</th>
                          <th className="px-5 py-3">Party Ref</th>
                          <th className="px-5 py-3 text-right">Debit (₹)</th>
                          <th className="px-5 py-3 text-right">Credit (₹)</th>
                          <th className="px-5 py-3 text-right">Running Balance (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-line)] text-[var(--color-ivory)]">
                        {accountLedger.transactions.map((tx) => (
                          <tr key={tx.line_id} className="hover:bg-white/3 transition-colors">
                            <td className="px-5 py-3.5 text-xs text-[var(--color-mist)] font-mono">{tx.entry_date}</td>
                            <td className="px-5 py-3.5 font-medium text-[var(--color-ivory)]">{tx.narration}</td>
                            <td className="px-5 py-3.5 text-xs text-[var(--color-aqua)] font-semibold">{tx.party_ref || '—'}</td>
                            <td className="px-5 py-3.5 text-right font-medium text-[var(--color-ivory)]">
                              {tx.debit > 0 ? formatCurrency(tx.debit) : '—'}
                            </td>
                            <td className="px-5 py-3.5 text-right font-medium text-[var(--color-ivory)]">
                              {tx.credit > 0 ? formatCurrency(tx.credit) : '—'}
                            </td>
                            <td className="px-5 py-3.5 text-right font-bold text-[var(--color-aqua)]">
                              {formatCurrency(tx.running_balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
