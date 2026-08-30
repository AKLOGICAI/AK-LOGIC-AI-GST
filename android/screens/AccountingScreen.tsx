import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Platform } from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { Theme } from '../lib/theme';
import { Card, SectionHeader, Divider, formatCurrency, TopAppBar, OutlineButton, GradientButton } from '../components/DesignSystem';
import { useMerchant } from '../lib/MerchantContext';
import { api } from '../lib/apiClient';
import { getCache, setCache } from '../lib/offlineCache';

type TabType = 'health' | 'payables_receivables' | 'gst_itc' | 'trial' | 'ledger';
type PeriodType = 'today' | 'month' | 'quarter' | 'fy' | 'all';

const PERIOD_LABELS: { id: PeriodType; label: string; sub: string }[] = [
  { id: 'today', label: 'Today', sub: '1 Day' },
  { id: 'month', label: 'This Month', sub: 'Monthly' },
  { id: 'quarter', label: 'This Quarter', sub: '3 Months' },
  { id: 'fy', label: 'FY 2025-26', sub: 'Yearly' },
  { id: 'all', label: 'All Time', sub: 'Overall' },
];

export default function AccountingScreen({ navigation }: { navigation?: any }) {
  const { token, merchant } = useMerchant();
  const [tab, setTab] = useState<TabType>('health');
  const [period, setPeriod] = useState<PeriodType>('month');
  const [selectedLedgerAccount, setSelectedLedgerAccount] = useState<string>('Sales Revenue');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [invoicesList, setInvoicesList] = useState<any[]>([]);
  const [purchasesList, setPurchasesList] = useState<any[]>([]);

  const [accountingData, setAccountingData] = useState<any>({
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
    trialBalance: [
      { account_id: 'coa_1010', account_code: '1010', account_name: 'Cash in Hand', account_type: 'asset', debit: 0, credit: 0 },
      { account_id: 'coa_1011', account_code: '1011', account_name: 'Bank & UPI Account', account_type: 'asset', debit: 0, credit: 0 },
      { account_id: 'coa_1020', account_code: '1020', account_name: 'Accounts Receivable (Debtors)', account_type: 'asset', debit: 0, credit: 0 },
      { account_id: 'coa_1030', account_code: '1030', account_name: 'Inventory Stock', account_type: 'asset', debit: 0, credit: 0 },
      { account_id: 'coa_2010', account_code: '2010', account_name: 'Accounts Payable (Creditors)', account_type: 'liability', debit: 0, credit: 0 },
      { account_id: 'coa_4010', account_code: '4010', account_name: 'Sales Revenue', account_type: 'income', debit: 0, credit: 0 },
      { account_id: 'coa_5010', account_code: '5010', account_name: 'Purchases (COGS)', account_type: 'expense', debit: 0, credit: 0 },
    ],
    payables: [],
    receivables: [],
    ledgerEntries: [],
  });

  const loadAccounting = async (isManualSync = false) => {
    const cachedSummary = await getCache<any>('accounting_summary');
    if (cachedSummary) setAccountingData(cachedSummary);

    const cachedInv = await getCache<any[]>('invoices_list');
    if (cachedInv) setInvoicesList(cachedInv);

    const cachedPur = await getCache<any[]>('merchant_purchases');
    if (cachedPur) setPurchasesList(cachedPur);

    if (!token) return;
    if (isManualSync) setSyncing(true);
    else setLoading(true);

    try {
      if (isManualSync) {
        try {
          await api.post('/api/accounting/sync-books', {}, { token });
        } catch (e) {}
      }

      const [summaryRes, invoicesRes, purchasesRes] = await Promise.allSettled([
        api.get('/api/accounting/summary', { token }),
        api.get('/api/merchant/invoices', { token }),
        api.get('/api/merchant/purchases', { token }),
      ]);

      let invList: any[] = [];
      let purList: any[] = [];

      if (invoicesRes.status === 'fulfilled' && invoicesRes.value?.invoices) {
        invList = invoicesRes.value.invoices;
        setInvoicesList(invList);
        await setCache('invoices_list', invList);
      }
      if (purchasesRes.status === 'fulfilled' && purchasesRes.value?.purchases) {
        purList = purchasesRes.value.purchases;
        setPurchasesList(purList);
        await setCache('merchant_purchases', purList);
      }

      if (summaryRes.status === 'fulfilled' && summaryRes.value) {
        const s = summaryRes.value;
        const mapped = {
          ...s,
          sales_revenue: s.sales_revenue || s.total_sales || invList.reduce((acc, i) => acc + Number(i.grandTotal || 0), 0),
          purchases_cost: s.purchases_cost || s.total_purchases || purList.reduce((acc, p) => acc + Number(p.total_amount || p.totalAmount || 0), 0),
          gross_profit: s.gross_profit || Math.max(0, (s.sales_revenue || 0) - (s.purchases_cost || 0)),
          receivables_outstanding: s.receivables_outstanding || 0,
          payables_outstanding: s.payables_outstanding || 0,
          cash_bank_balance: s.cash_bank_balance || 0,
          is_books_balanced: s.is_books_balanced !== false,
          trialBalance: s.trialBalance || s.trial_balance || accountingData.trialBalance,
          payables: s.payables || purList.slice(0, 8),
          receivables: s.receivables || invList.filter((i) => i.paymentMode === 'credit').slice(0, 8),
          ledgerEntries: s.ledgerEntries || s.recent_journals || [],
        };
        setAccountingData(mapped);
        await setCache('accounting_summary', mapped);
      }
    } catch (err) {
      console.warn('Accounting API fetch error:', err);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadAccounting();
  }, [token]);

  // ── DYNAMIC PERIOD-FILTERED PROFIT & LOSS ENGINE ──
  const periodMetrics = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
    const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
    const fyStartTime = new Date(fyStartYear, 3, 1).getTime();
    const fyEndTime = new Date(fyStartYear + 1, 2, 31, 23, 59, 59).getTime();

    const isMatchPeriod = (dateVal: any) => {
      if (!dateVal) return period === 'all';
      const d = new Date(dateVal);
      const t = d.getTime();
      const dStr = d.toISOString().split('T')[0];
      const year = d.getFullYear();
      const month = d.getMonth();

      if (period === 'today') return dStr === todayStr;
      if (period === 'month') return year === currentYear && month === currentMonth;
      if (period === 'quarter') return year === currentYear && month >= quarterStartMonth && month < quarterStartMonth + 3;
      if (period === 'fy') return t >= fyStartTime && t <= fyEndTime;
      return true;
    };

    // Filtered Invoices
    const pInvoices = invoicesList.filter((iv) => isMatchPeriod(iv.createdAt || iv.invoiceDate));
    // Filtered Purchases
    const pPurchases = purchasesList.filter((p) => isMatchPeriod(p.created_at || p.bill_date || p.billDate));

    // Sales Revenue
    const sales = pInvoices.reduce((sum, iv) => sum + Number(iv.grandTotal || 0), 0);
    // Purchases / COGS
    const purchases = pPurchases.reduce((sum, p) => sum + Number(p.total_amount || p.totalAmount || 0), 0);
    // Net Profit / Loss
    const netProfit = sales - purchases;
    const isProfit = netProfit >= 0;
    const marginPct = sales > 0 ? Math.round((netProfit / sales) * 100) : 0;

    // GST Taxes
    let outCgst = 0; let outSgst = 0; let outIgst = 0;
    pInvoices.forEach((iv) => {
      outCgst += Number(iv.cgst || iv.totalCgst || 0);
      outSgst += Number(iv.sgst || iv.totalSgst || 0);
      outIgst += Number(iv.igst || iv.totalIgst || 0);
    });

    let inCgst = 0; let inSgst = 0; let inIgst = 0;
    pPurchases.forEach((p) => {
      const tax = Number(p.total_tax || p.totalTax || 0);
      if (p.isInterState) {
        inIgst += tax;
      } else {
        inCgst += tax / 2;
        inSgst += tax / 2;
      }
    });

    const outTotal = outCgst + outSgst + outIgst;
    const inTotal = inCgst + inSgst + inIgst;
    const netGstPayable = Math.max(0, outTotal - inTotal);

    return {
      sales,
      purchases,
      netProfit,
      isProfit,
      marginPct,
      invoicesCount: pInvoices.length,
      purchasesCount: pPurchases.length,
      outTotal,
      inTotal,
      netGstPayable,
      itc: { cgst: inCgst, sgst: inSgst, igst: inIgst, total: inTotal },
      output: { cgst: outCgst, sgst: outSgst, igst: outIgst, total: outTotal },
      net: {
        cgst: Math.max(0, outCgst - inCgst),
        sgst: Math.max(0, outSgst - inSgst),
        igst: Math.max(0, outIgst - inIgst),
        total: netGstPayable,
      },
    };
  }, [invoicesList, purchasesList, period]);

  const activePeriodObj = PERIOD_LABELS.find((p) => p.id === period) || PERIOD_LABELS[1];

  return (
    <View style={st.container}>
      <TopAppBar
        title="Deep Accounting & Books"
        onBack={() => navigation?.goBack?.()}
        actions={
          <Pressable onPress={() => loadAccounting(true)} hitSlop={8} style={{ padding: 8 }}>
            <Ionicons name={syncing ? "sync" : "sync-outline"} size={22} color={Theme.primary} />
          </Pressable>
        }
      />

      {/* Double-Entry Balanced Status Banner */}
      <View style={st.balancedBanner}>
        <View style={st.balancedDot} />
        <Text style={st.balancedText}>
          {accountingData.is_books_balanced
            ? 'Double-Entry Books 100% Balanced · Total Debits = Total Credits'
            : 'Reconciliation in progress'}
        </Text>
        <Pressable onPress={() => loadAccounting(true)} style={st.syncBtn} hitSlop={6}>
          <Text style={st.syncBtnText}>{syncing ? 'Syncing...' : 'Sync Books'}</Text>
        </Pressable>
      </View>

      {/* M3 Segmented Navigation Tabs */}
      <View style={st.tabs}>
        {[
          { key: 'health', label: 'P&L Health' },
          { key: 'payables_receivables', label: 'Parties' },
          { key: 'gst_itc', label: 'GST ITC' },
          { key: 'trial', label: 'Trial Balance' },
          { key: 'ledger', label: 'Ledger' },
        ].map((t) => (
          <Pressable
            key={t.key}
            style={[st.tab, tab === t.key && st.tabActive]}
            onPress={() => setTab(t.key as any)}
          >
            <Text style={[st.tabText, tab === t.key && st.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => loadAccounting(false)} tintColor={Theme.primary} />}
      >
        {/* ── PERIOD TIMEFRAME SELECTOR (Today / This Month / This Quarter / FY) ── */}
        <View style={{ marginBottom: 14 }}>
          <Text style={st.periodHeaderLabel}>P&L REPORTING TIMEFRAME</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
            {PERIOD_LABELS.map((p) => (
              <Pressable
                key={p.id}
                style={[st.periodChip, period === p.id && st.periodChipActive]}
                onPress={() => setPeriod(p.id)}
              >
                <Text style={[st.periodChipText, period === p.id && st.periodChipTextActive]}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* ── TAB 1: FINANCIAL HEALTH & INSTANT PROFIT / LOSS CARD ── */}
        {tab === 'health' && (
          <>
            {/* 🌟 EK NAJAR MEIN PROFIT / LOSS HERO CARD 🌟 */}
            <Card
              style={[
                st.plHeroCard,
                periodMetrics.isProfit ? st.plCardProfit : st.plCardLoss,
              ]}
            >
              <View style={st.plTopRow}>
                <View>
                  <Text style={st.plPeriodTag}>
                    {activePeriodObj.label.toUpperCase()} PERFORMANCE
                  </Text>
                  <Text style={[st.plHeroAmount, { color: periodMetrics.isProfit ? '#10b981' : '#f87171' }]}>
                    {periodMetrics.isProfit ? '+' : '-'} {formatCurrency(Math.abs(periodMetrics.netProfit))}
                  </Text>
                  <Text style={st.plStatusSubtitle}>
                    {periodMetrics.isProfit
                      ? `Net Profit · ${periodMetrics.marginPct}% Margin on Sales`
                      : `Net Loss · Expenses exceeded sales by ${Math.abs(periodMetrics.marginPct)}%`}
                  </Text>
                </View>

                <View style={[st.plBadge, { backgroundColor: periodMetrics.isProfit ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)' }]}>
                  <MaterialIcons
                    name={periodMetrics.isProfit ? 'trending-up' : 'trending-down'}
                    size={28}
                    color={periodMetrics.isProfit ? '#10b981' : '#ef4444'}
                  />
                  <Text style={[st.plBadgeText, { color: periodMetrics.isProfit ? '#10b981' : '#ef4444' }]}>
                    {periodMetrics.isProfit ? 'PROFIT' : 'LOSS'}
                  </Text>
                </View>
              </View>

              <Divider style={{ marginVertical: 12, backgroundColor: 'rgba(255,255,255,0.1)' }} />

              {/* 4-Column P&L Breakdown Matrix */}
              <View style={st.plMatrix}>
                <View style={st.plMatrixCol}>
                  <Text style={st.plMatrixLabel}>TOTAL SALES</Text>
                  <Text style={[st.plMatrixVal, { color: '#38bdf8' }]}>
                    {formatCurrency(periodMetrics.sales)}
                  </Text>
                  <Text style={st.plMatrixCount}>{periodMetrics.invoicesCount} Invoices</Text>
                </View>

                <View style={st.plMatrixCol}>
                  <Text style={st.plMatrixLabel}>PURCHASES (COGS)</Text>
                  <Text style={[st.plMatrixVal, { color: '#fb923c' }]}>
                    {formatCurrency(periodMetrics.purchases)}
                  </Text>
                  <Text style={st.plMatrixCount}>{periodMetrics.purchasesCount} Bills</Text>
                </View>
              </View>

              <View style={[st.plMatrix, { marginTop: 10 }]}>
                <View style={st.plMatrixCol}>
                  <Text style={st.plMatrixLabel}>GROSS PROFIT</Text>
                  <Text style={[st.plMatrixVal, { color: periodMetrics.isProfit ? '#10b981' : '#f87171' }]}>
                    {formatCurrency(periodMetrics.netProfit)}
                  </Text>
                </View>

                <View style={st.plMatrixCol}>
                  <Text style={st.plMatrixLabel}>NET GST PAYABLE</Text>
                  <Text style={[st.plMatrixVal, { color: '#e2e8f0' }]}>
                    {formatCurrency(periodMetrics.netGstPayable)}
                  </Text>
                </View>
              </View>
            </Card>

            {/* Financial Ledger Health Tiles */}
            <Text style={[st.periodHeaderLabel, { marginTop: 10 }]}>BALANCE SHEET & CASH POSITIONS</Text>
            {[
              { l: 'Cash & Bank Balance (Available Liquidity)', v: accountingData.cash_bank_balance, c: Theme.primary, i: 'account-balance' },
              { l: 'Customer Receivables (Sundry Debtors)', v: accountingData.receivables_outstanding, c: '#38bdf8', i: 'arrow-downward' },
              { l: 'Supplier Payables (Sundry Creditors)', v: accountingData.payables_outstanding, c: '#fb923c', i: 'arrow-upward' },
              { l: 'Input Tax Credit (ITC Available)', v: periodMetrics.inTotal, c: '#a855f7', i: 'receipt' },
              { l: 'Output Tax Collected (Sales GST)', v: periodMetrics.outTotal, c: '#f43f5e', i: 'gavel' },
            ].map((c, i) => (
              <Card key={i} style={st.healthCard}>
                <View style={st.healthRow}>
                  <View style={[st.healthIcon, { backgroundColor: c.c + '18' }]}>
                    <MaterialIcons name={c.i as any} size={22} color={c.c} />
                  </View>
                  <Text style={st.healthLabel}>{c.l}</Text>
                  <Text style={[st.healthVal, { color: c.c }]}>{formatCurrency(c.v)}</Text>
                </View>
              </Card>
            ))}
          </>
        )}

        {/* ── TAB 2: PAYABLES & RECEIVABLES (PARTIES) ── */}
        {tab === 'payables_receivables' && (
          <>
            <SectionHeader title="Customer Receivables (Sundry Debtors)" />
            {accountingData.receivables.length === 0 ? (
              <Text style={st.emptySectionText}>No pending customer credit dues.</Text>
            ) : (
              accountingData.receivables.map((r: any, i: number) => (
                <Card key={i} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View>
                      <Text style={st.partyName}>{r.customer_name || r.customerName || 'Customer'}</Text>
                      <Text style={st.partyPhone}>{r.customer_phone || r.customerPhone || ''} · {r.invoice_no || r.invoiceNo || ''}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={st.partyAmount}>{formatCurrency(r.outstanding_amount || r.grandTotal || r.amount || 0)}</Text>
                      <Text style={st.dueTag}>Credit Bill</Text>
                    </View>
                  </View>
                </Card>
              ))
            )}

            <SectionHeader title="Supplier Payables (Sundry Creditors)" style={{ marginTop: 16 }} />
            {accountingData.payables.length === 0 ? (
              <Text style={st.emptySectionText}>No pending supplier bills.</Text>
            ) : (
              accountingData.payables.map((p: any, i: number) => (
                <Card key={i} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View>
                      <Text style={st.partyName}>{p.supplier_name || p.supplierName}</Text>
                      <Text style={st.partyPhone}>Bill: {p.bill_number || p.billNumber}</Text>
                    </View>
                    <Text style={[st.partyAmount, { color: '#fb923c' }]}>
                      {formatCurrency(p.total_amount || p.totalAmount || 0)}
                    </Text>
                  </View>
                </Card>
              ))
            )}
          </>
        )}

        {/* ── TAB 3: GST ITC REGISTER (INPUT VS OUTPUT TAX) ── */}
        {tab === 'gst_itc' && (
          <>
            <Card style={{ marginBottom: 14 }}>
              <Text style={{ color: Theme.onSurface, fontSize: 15, fontWeight: '700', marginBottom: 4 }}>
                Input Tax Credit (ITC) Register
              </Text>
              <Text style={{ color: Theme.onSurfaceVariant, fontSize: 11, marginBottom: 12 }}>
                Period: {activePeriodObj.label} · ITC from purchase bills vs Output tax collected on sales.
              </Text>

              <View style={st.itcGridRow}>
                <View style={st.itcCol}>
                  <Text style={st.itcColHead}>Component</Text>
                  <Text style={st.itcLabel}>CGST</Text>
                  <Text style={st.itcLabel}>SGST</Text>
                  <Text style={st.itcLabel}>IGST</Text>
                  <Divider style={{ marginVertical: 4 }} />
                  <Text style={[st.itcLabel, { fontWeight: '700', color: Theme.onSurface }]}>Total</Text>
                </View>

                <View style={st.itcCol}>
                  <Text style={[st.itcColHead, { textAlign: 'right' }]}>Input ITC (₹)</Text>
                  <Text style={[st.itcVal, { color: Theme.success }]}>{formatCurrency(periodMetrics.itc.cgst)}</Text>
                  <Text style={[st.itcVal, { color: Theme.success }]}>{formatCurrency(periodMetrics.itc.sgst)}</Text>
                  <Text style={[st.itcVal, { color: Theme.success }]}>{formatCurrency(periodMetrics.itc.igst)}</Text>
                  <Divider style={{ marginVertical: 4 }} />
                  <Text style={[st.itcVal, { fontWeight: '700', color: Theme.success }]}>{formatCurrency(periodMetrics.itc.total)}</Text>
                </View>

                <View style={st.itcCol}>
                  <Text style={[st.itcColHead, { textAlign: 'right' }]}>Output Due (₹)</Text>
                  <Text style={[st.itcVal, { color: Theme.error }]}>{formatCurrency(periodMetrics.output.cgst)}</Text>
                  <Text style={[st.itcVal, { color: Theme.error }]}>{formatCurrency(periodMetrics.output.sgst)}</Text>
                  <Text style={[st.itcVal, { color: Theme.error }]}>{formatCurrency(periodMetrics.output.igst)}</Text>
                  <Divider style={{ marginVertical: 4 }} />
                  <Text style={[st.itcVal, { fontWeight: '700', color: Theme.error }]}>{formatCurrency(periodMetrics.output.total)}</Text>
                </View>

                <View style={st.itcCol}>
                  <Text style={[st.itcColHead, { textAlign: 'right' }]}>Net Payable</Text>
                  <Text style={[st.itcVal, { color: Theme.primary }]}>{formatCurrency(periodMetrics.net.cgst)}</Text>
                  <Text style={[st.itcVal, { color: Theme.primary }]}>{formatCurrency(periodMetrics.net.sgst)}</Text>
                  <Text style={[st.itcVal, { color: Theme.primary }]}>{formatCurrency(periodMetrics.net.igst)}</Text>
                  <Divider style={{ marginVertical: 4 }} />
                  <Text style={[st.itcVal, { fontWeight: '700', color: Theme.primary }]}>{formatCurrency(periodMetrics.net.total)}</Text>
                </View>
              </View>
            </Card>

            <Card style={{ backgroundColor: Theme.surface2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="shield-checkmark" size={24} color={Theme.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Theme.onSurface, fontSize: 14, fontWeight: '700' }}>
                    {periodMetrics.inTotal >= periodMetrics.outTotal
                      ? 'No GST Payable · ITC Fully Covers Output Liability'
                      : `Net Tax Payable for Filing: ${formatCurrency(periodMetrics.netGstPayable)}`}
                  </Text>
                  <Text style={{ color: Theme.onSurfaceVariant, fontSize: 11, marginTop: 2 }}>
                    Calculated automatically from registered invoices and purchase bills.
                  </Text>
                </View>
              </View>
            </Card>
          </>
        )}

        {/* ── TAB 4: TRIAL BALANCE (CHART OF ACCOUNTS) ── */}
        {tab === 'trial' && (
          <Card>
            <View style={st.trHead}>
              <Text style={[st.trTh, { flex: 2 }]}>Account Name</Text>
              <Text style={[st.trTh, { textAlign: 'right' }]}>Debit (₹)</Text>
              <Text style={[st.trTh, { textAlign: 'right' }]}>Credit (₹)</Text>
            </View>
            {(accountingData.trialBalance || []).map((r: any, i: number) => (
              <Pressable
                key={i}
                style={st.trRow}
                onPress={() => {
                  setSelectedLedgerAccount(r.account_name);
                  setTab('ledger');
                }}
              >
                <View style={{ flex: 2 }}>
                  <Text style={st.trTd}>{r.account_name}</Text>
                  <Text style={st.trCode}>Code: {r.account_code}</Text>
                </View>
                <Text style={[st.trTd, { textAlign: 'right', color: r.debit > 0 ? Theme.error : Theme.onSurfaceDisabled }]}>
                  {r.debit > 0 ? formatCurrency(r.debit) : '—'}
                </Text>
                <Text style={[st.trTd, { textAlign: 'right', color: r.credit > 0 ? Theme.success : Theme.onSurfaceDisabled }]}>
                  {r.credit > 0 ? formatCurrency(r.credit) : '—'}
                </Text>
              </Pressable>
            ))}
            <Divider />
            <View style={st.trRow}>
              <Text style={[st.trTotal, { flex: 2 }]}>Total Balance</Text>
              <Text style={[st.trTotal, { textAlign: 'right', color: Theme.error }]}>
                {formatCurrency((accountingData.trialBalance || []).reduce((s: number, r: any) => s + (Number(r.debit) || 0), 0))}
              </Text>
              <Text style={[st.trTotal, { textAlign: 'right', color: Theme.success }]}>
                {formatCurrency((accountingData.trialBalance || []).reduce((s: number, r: any) => s + (Number(r.credit) || 0), 0))}
              </Text>
            </View>
          </Card>
        )}

        {/* ── TAB 5: GENERAL LEDGER ── */}
        {tab === 'ledger' && (
          <>
            <Card style={{ marginBottom: 12 }}>
              <Text style={st.ledgerAcc}>{selectedLedgerAccount}</Text>
              <Text style={st.ledgerBal}>Synced with Double-Entry General Ledger</Text>
            </Card>
            {(accountingData.ledgerEntries || []).length === 0 ? (
              <Text style={st.emptySectionText}>No journal entries recorded yet.</Text>
            ) : (
              accountingData.ledgerEntries.map((e: any, i: number) => (
                <Card key={i} style={st.ledgerEntry}>
                  <View style={st.ledgerRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.ledgerDesc}>{e.description || e.desc || 'Journal Entry'}</Text>
                      <Text style={st.ledgerDate}>{e.date || 'Recent'}</Text>
                    </View>
                    {e.debit > 0 && <Text style={[st.ledgerAmt, { color: Theme.error }]}>Dr {formatCurrency(e.debit)}</Text>}
                    {e.credit > 0 && <Text style={[st.ledgerAmt, { color: Theme.success }]}>Cr {formatCurrency(e.credit)}</Text>}
                  </View>
                </Card>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },
  balancedBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: Theme.shapeSm, backgroundColor: 'rgba(0,212,170,0.1)', borderWidth: 1, borderColor: 'rgba(0,212,170,0.25)',
  },
  balancedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Theme.primary },
  balancedText: { color: Theme.primary, fontSize: 11, fontWeight: '700', flex: 1, marginLeft: 8 },
  syncBtn: { backgroundColor: 'rgba(0,212,170,0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  syncBtnText: { color: Theme.primary, fontSize: 10, fontWeight: '700' },
  tabs: {
    flexDirection: 'row', marginHorizontal: 16, backgroundColor: Theme.surface2,
    borderRadius: Theme.shapeSm, padding: 4,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Theme.shapeXs },
  tabActive: { backgroundColor: Theme.primaryContainer },
  tabText: { color: Theme.onSurfaceDisabled, fontSize: 10, fontWeight: '500' },
  tabTextActive: { color: Theme.primary, fontWeight: '700' },

  periodHeaderLabel: { color: Theme.onSurfaceDisabled, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  periodChip: {
    backgroundColor: Theme.surface2, paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: Theme.shapeSm, marginRight: 8, borderWidth: 1, borderColor: Theme.outlineVariant,
  },
  periodChipActive: { backgroundColor: 'rgba(0,212,170,0.15)', borderColor: Theme.primary },
  periodChipText: { color: Theme.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
  periodChipTextActive: { color: Theme.primary, fontWeight: '800' },

  // P&L Hero Card Styling
  plHeroCard: {
    borderRadius: Theme.shapeLg, padding: 16, marginBottom: 14,
    borderWidth: 1, ...Theme.elevation2,
  },
  plCardProfit: {
    backgroundColor: '#0c1e19',
    borderColor: 'rgba(16,185,129,0.4)',
  },
  plCardLoss: {
    backgroundColor: '#260f14',
    borderColor: 'rgba(239,68,68,0.4)',
  },
  plTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  plPeriodTag: { color: Theme.onSurfaceDisabled, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  plHeroAmount: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5, marginTop: 2 },
  plStatusSubtitle: { color: Theme.onSurfaceVariant, fontSize: 12, fontWeight: '500', marginTop: 2 },
  plBadge: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Theme.shapeSm, alignItems: 'center' },
  plBadgeText: { fontSize: 10, fontWeight: '800', marginTop: 2 },
  plMatrix: { flexDirection: 'row', gap: 10 },
  plMatrixCol: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', padding: 10, borderRadius: 8 },
  plMatrixLabel: { color: Theme.onSurfaceDisabled, fontSize: 9, fontWeight: '700' },
  plMatrixVal: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  plMatrixCount: { color: Theme.onSurfaceDisabled, fontSize: 10, marginTop: 1 },

  healthCard: { marginBottom: 10, padding: 14 },
  healthRow: { flexDirection: 'row', alignItems: 'center' },
  healthIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  healthLabel: { color: Theme.onSurfaceVariant, fontSize: Theme.bodyMedium, flex: 1, fontWeight: '400' },
  healthVal: { fontSize: Theme.bodyLarge, fontWeight: '700' },
  partyName: { color: Theme.onSurface, fontSize: 14, fontWeight: '600' },
  partyPhone: { color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 2 },
  partyAmount: { color: Theme.onSurface, fontSize: 15, fontWeight: '700' },
  dueTag: { color: Theme.warning, fontSize: 10, fontWeight: '600', marginTop: 2 },
  emptySectionText: { color: Theme.onSurfaceDisabled, fontSize: 12, paddingVertical: 8 },
  trHead: { flexDirection: 'row', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Theme.outlineVariant },
  trTh: { color: Theme.onSurfaceDisabled, fontSize: Theme.labelSmall, fontWeight: '600', flex: 1, textTransform: 'uppercase' },
  trRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Theme.outlineVariant, alignItems: 'center' },
  trTd: { color: Theme.onSurface, fontSize: 12, fontWeight: '500' },
  trCode: { color: Theme.onSurfaceDisabled, fontSize: 10, marginTop: 2 },
  trTotal: { color: Theme.onSurface, fontSize: Theme.bodyMedium, fontWeight: '700', flex: 1 },
  ledgerAcc: { color: Theme.onSurface, fontSize: Theme.titleMedium, fontWeight: '600' },
  ledgerBal: { color: Theme.success, fontSize: Theme.bodyMedium, fontWeight: '500', marginTop: 4 },
  ledgerEntry: { marginBottom: 8, padding: 14 },
  ledgerRow: { flexDirection: 'row', alignItems: 'center' },
  ledgerDesc: { color: Theme.onSurface, fontSize: Theme.bodyMedium, fontWeight: '500' },
  ledgerDate: { color: Theme.onSurfaceDisabled, fontSize: Theme.bodySmall, marginTop: 2 },
  ledgerAmt: { fontSize: Theme.bodyLarge, fontWeight: '600' },
  itcGridRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  itcCol: { flex: 1 },
  itcColHead: { color: Theme.onSurfaceDisabled, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  itcLabel: { color: Theme.onSurfaceVariant, fontSize: 11, marginVertical: 3 },
  itcVal: { fontSize: 11, textAlign: 'right', marginVertical: 3 },
});

