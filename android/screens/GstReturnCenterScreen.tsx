import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert,
  ActivityIndicator, Modal, FlatList, TextInput,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Theme } from '../lib/theme';
import {
  Card, TopAppBar, SearchBar, formatCurrency, GradientButton,
  OutlineButton, SectionHeader, Divider, Snackbar,
} from '../components/DesignSystem';
import { useMerchant } from '../lib/MerchantContext';
import { api } from '../lib/apiClient';
import { getCache, setCache } from '../lib/offlineCache';
import { exportCsvFile, exportJsonFile, SheetData } from '../lib/exporters';

type ReturnViewTab = 'gstr1' | 'gstr3b' | 'hsn' | 'register' | 'datewise' | 'filing';
type PeriodFilter = 'current_month' | 'prev_month' | 'current_quarter' | 'current_fy' | 'all' | 'custom';

export default function GstReturnCenterScreen({ navigation }: { navigation?: any }) {
  const { token, merchant } = useMerchant();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<PeriodFilter>('current_month');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [viewTab, setViewTab] = useState<ReturnViewTab>('gstr1');
  const [supplyFilter, setSupplyFilter] = useState<'all' | 'B2B' | 'B2C'>('all');
  const [exporting, setExporting] = useState(false);

  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarText, setSnackbarText] = useState('');

  const notify = (msg: string) => {
    setSnackbarText(msg);
    setShowSnackbar(true);
    setTimeout(() => setShowSnackbar(false), 3000);
  };

  const loadData = async () => {
    const cachedInv = await getCache<any[]>('invoices_list');
    const cachedPur = await getCache<any[]>('merchant_purchases');
    if (cachedInv) setInvoices(cachedInv);
    if (cachedPur) setPurchases(cachedPur);

    if (!token) return;
    setLoading(true);
    try {
      const [invRes, purRes] = await Promise.allSettled([
        api.get('/api/merchant/invoices', { token }),
        api.get('/api/merchant/purchases', { token }),
      ]);

      if (invRes.status === 'fulfilled' && invRes.value?.invoices) {
        setInvoices(invRes.value.invoices);
        await setCache('invoices_list', invRes.value.invoices);
      }
      if (purRes.status === 'fulfilled' && purRes.value?.purchases) {
        setPurchases(purRes.value.purchases);
        await setCache('merchant_purchases', purRes.value.purchases);
      }
    } catch (err) {
      console.warn('GST Return data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  // Date filtering logic matching Web App Master
  const periodFilteredInvoices = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return invoices.filter((iv: any) => {
      const d = new Date(iv.createdAt || iv.invoiceDate || 0);
      const invYear = d.getFullYear();
      const invMonth = d.getMonth();
      const t = d.getTime();

      if (period === 'current_month') {
        return invYear === currentYear && invMonth === currentMonth;
      }
      if (period === 'prev_month') {
        const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        return invYear === prevYear && invMonth === prevMonth;
      }
      if (period === 'current_quarter') {
        const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
        return invYear === currentYear && invMonth >= quarterStartMonth && invMonth < quarterStartMonth + 3;
      }
      if (period === 'current_fy') {
        const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
        const start = new Date(fyStartYear, 3, 1).getTime();
        const end = new Date(fyStartYear + 1, 2, 31, 23, 59, 59).getTime();
        return t >= start && t <= end;
      }
      if (period === 'custom') {
        const fromTs = fromDate ? new Date(fromDate + 'T00:00:00').getTime() : -Infinity;
        const toTs = toDate ? new Date(toDate + 'T23:59:59').getTime() : Infinity;
        return t >= fromTs && t <= toTs;
      }
      return true;
    });
  }, [invoices, period, fromDate, toDate]);

  // Search and supply filter
  const displayedInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return periodFilteredInvoices.filter((iv: any) => {
      const isB2b = !!(iv.customerGstin || iv.customer_gstin);
      if (supplyFilter === 'B2B' && !isB2b) return false;
      if (supplyFilter === 'B2C' && isB2b) return false;
      if (!q) return true;
      return (
        (iv.invoiceNo || iv.invoice_no || '').toLowerCase().includes(q) ||
        (iv.customerName || iv.customer_name || '').toLowerCase().includes(q) ||
        (iv.customerGstin || iv.customer_gstin || '').toLowerCase().includes(q)
      );
    });
  }, [periodFilteredInvoices, supplyFilter, search]);

  // GSTR-1 Metrics & Sections
  const gstr1 = useMemo(() => {
    const b2bInvoices: any[] = [];
    const b2cInvoices: any[] = [];
    const hsnMap: Record<string, { desc: string; qty: number; taxable: number; igst: number; cgst: number; sgst: number; total: number; uqc: string }> = {};

    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalTax = 0;
    let grandTotal = 0;

    periodFilteredInvoices.forEach((iv: any) => {
      const isB2b = !!(iv.customerGstin || iv.customer_gstin);
      if (isB2b) b2bInvoices.push(iv);
      else b2cInvoices.push(iv);

      const taxable = Number(iv.taxableValue || iv.subtotal || 0);
      const cgst = Number(iv.totalCgst || iv.cgst || 0);
      const sgst = Number(iv.totalSgst || iv.sgst || 0);
      const igst = Number(iv.totalIgst || iv.igst || 0);
      const tax = Number(iv.totalTax || cgst + sgst + igst || 0);
      const total = Number(iv.grandTotal || iv.total || taxable + tax);

      totalTaxable += taxable;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;
      totalTax += tax;
      grandTotal += total;

      // HSN items grouping
      (iv.items || []).forEach((it: any) => {
        const hsn = it.hsn || '9983';
        const desc = it.description || it.name || 'Goods/Services';
        const qty = Number(it.qty) || 1;
        const rate = Number(it.rate) || 0;
        const itemTaxable = qty * rate;
        const gstRate = Number(it.gstRate) || 18;
        const itemTax = (itemTaxable * gstRate) / 100;
        const isInter = !!iv.isInterState;

        if (!hsnMap[hsn]) {
          hsnMap[hsn] = { desc, qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0, uqc: it.unit || 'NOS' };
        }
        hsnMap[hsn].qty += qty;
        hsnMap[hsn].taxable += itemTaxable;
        if (isInter) {
          hsnMap[hsn].igst += itemTax;
        } else {
          hsnMap[hsn].cgst += itemTax / 2;
          hsnMap[hsn].sgst += itemTax / 2;
        }
        hsnMap[hsn].total += itemTaxable + itemTax;
      });
    });

    const hsnRows = Object.entries(hsnMap).map(([hsn, d]) => ({ hsn, ...d }));

    return {
      totalInvoices: periodFilteredInvoices.length,
      b2bInvoices,
      b2cInvoices,
      hsnRows,
      totalTaxable,
      totalCgst,
      totalSgst,
      totalIgst,
      totalTax,
      grandTotal,
    };
  }, [periodFilteredInvoices]);

  // Date-wise Summary calculation matching Web Master dateWiseSummary
  const dateWiseData = useMemo(() => {
    const map: Record<string, { date: string; count: number; taxable: number; cgst: number; sgst: number; igst: number; totalTax: number; grandTotal: number }> = {};

    periodFilteredInvoices.forEach((iv: any) => {
      const d = iv.createdAt || iv.invoiceDate ? new Date(iv.createdAt || iv.invoiceDate).toISOString().split('T')[0] : 'Unknown';
      const taxable = Number(iv.taxableValue || iv.subtotal || 0);
      const cgst = Number(iv.totalCgst || iv.cgst || 0);
      const sgst = Number(iv.totalSgst || iv.sgst || 0);
      const igst = Number(iv.totalIgst || iv.igst || 0);
      const tax = Number(iv.totalTax || cgst + sgst + igst || 0);
      const total = Number(iv.grandTotal || iv.total || taxable + tax);

      if (!map[d]) {
        map[d] = { date: d, count: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, grandTotal: 0 };
      }
      map[d].count += 1;
      map[d].taxable += taxable;
      map[d].cgst += cgst;
      map[d].sgst += sgst;
      map[d].igst += igst;
      map[d].totalTax += tax;
      map[d].grandTotal += total;
    });

    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [periodFilteredInvoices]);

  // GSTR-3B Metrics (Sales Liability vs Purchase ITC)
  const gstr3b = useMemo(() => {
    let itcCgst = 0; let itcSgst = 0; let itcIgst = 0;
    purchases.forEach((p) => {
      const tax = Number(p.total_tax || p.totalTax || 0);
      if (p.isInterState) {
        itcIgst += tax;
      } else {
        itcCgst += tax / 2;
        itcSgst += tax / 2;
      }
    });

    const outCgst = gstr1.totalCgst;
    const outSgst = gstr1.totalSgst;
    const outIgst = gstr1.totalIgst;

    const netCgst = Math.max(0, outCgst - itcCgst);
    const netSgst = Math.max(0, outSgst - itcSgst);
    const netIgst = Math.max(0, outIgst - itcIgst);
    const netTotal = netCgst + netSgst + netIgst;

    return {
      outTaxable: gstr1.totalTaxable,
      outCgst,
      outSgst,
      outIgst,
      outTotal: outCgst + outSgst + outIgst,
      itcCgst,
      itcSgst,
      itcIgst,
      itcTotal: itcCgst + itcSgst + itcIgst,
      netCgst,
      netSgst,
      netIgst,
      netTotal,
    };
  }, [gstr1, purchases]);

  // Native CSV Export for GSTR-1
  const handleExportGstr1Csv = async () => {
    setExporting(true);
    try {
      const sheet: SheetData = {
        name: 'GSTR-1_B2B',
        header: [
          'GSTIN/UIN of Recipient',
          'Receiver Name',
          'Invoice Number',
          'Invoice date',
          'Invoice Value',
          'Place Of Supply',
          'Reverse Charge',
          'Invoice Type',
          'Rate',
          'Taxable Value',
          'Cess Amount',
        ],
        rows: gstr1.b2bInvoices.map((iv) => [
          iv.customerGstin || iv.customer_gstin || '',
          iv.customerName || iv.customer_name || 'Buyer',
          iv.invoiceNo || iv.invoice_no || '',
          iv.createdAt || iv.invoiceDate ? new Date(iv.createdAt || iv.invoiceDate).toISOString().split('T')[0] : '',
          iv.grandTotal || iv.total || 0,
          iv.customerState || iv.placeOfSupply || '27-Maharashtra',
          'N',
          'Regular',
          (iv.items && iv.items[0]?.gstRate) || 18,
          iv.taxableValue || iv.subtotal || 0,
          0,
        ]),
      };

      const filename = `GSTR1_${merchant?.gstin || 'AKM'}_${period}.csv`;
      await exportCsvFile(sheet, filename);
      notify(`GSTR-1 CSV exported successfully 📁`);
    } catch (e: any) {
      Alert.alert('Export Error', e.message || 'Could not export GSTR-1 CSV');
    } finally {
      setExporting(false);
    }
  };

  // Native JSON Export for Government GSTR-1 Offline Utility
  const handleExportGstr1Json = async () => {
    setExporting(true);
    try {
      const payload = {
        gstin: merchant?.gstin || '27AAPFU0939F1ZV',
        fp: '032026',
        gt: gstr1.grandTotal,
        cur_gt: gstr1.grandTotal,
        b2b: gstr1.b2bInvoices.map((iv) => ({
          ctin: iv.customerGstin || iv.customer_gstin,
          inv: [
            {
              inum: iv.invoiceNo || iv.invoice_no,
              idt: iv.createdAt ? new Date(iv.createdAt).toLocaleDateString('en-GB') : '27/03/2026',
              val: iv.grandTotal || iv.total,
              pos: (iv.customerState || 'Maharashtra').slice(0, 2),
              rchrg: 'N',
              inv_typ: 'R',
              itms: (iv.items || []).map((it: any, num: number) => ({
                num: num + 1,
                itm_det: {
                  rt: it.gstRate || 18,
                  txval: (it.qty || 1) * (it.rate || 0),
                  iamt: iv.isInterState ? ((it.qty || 1) * (it.rate || 0) * (it.gstRate || 18)) / 100 : 0,
                  camt: !iv.isInterState ? ((it.qty || 1) * (it.rate || 0) * (it.gstRate || 18)) / 200 : 0,
                  samt: !iv.isInterState ? ((it.qty || 1) * (it.rate || 0) * (it.gstRate || 18)) / 200 : 0,
                  csamt: 0,
                },
              })),
            },
          ],
        })),
        hsn: {
          data: gstr1.hsnRows.map((h, i) => ({
            num: i + 1,
            hsn_sc: h.hsn,
            desc: h.desc,
            uqc: h.uqc,
            qty: h.qty,
            val: h.total,
            txval: h.taxable,
            iamt: h.igst,
            camt: h.cgst,
            samt: h.sgst,
            csamt: 0,
          })),
        },
      };

      const filename = `GSTR1_OFFLINE_${merchant?.gstin || 'AKM'}.json`;
      await exportJsonFile(payload, filename);
      notify('GSTR-1 JSON Offline Utility generated ⚡');
    } catch (e: any) {
      Alert.alert('Export Error', e.message || 'Could not export JSON.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={st.container}>
      <TopAppBar title="GST Return Center" onBack={() => navigation?.goBack?.()} />

      {/* Period Selector ScrollBar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.periodBar} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {[
          { id: 'current_month', label: 'This Month' },
          { id: 'prev_month', label: 'Last Month' },
          { id: 'current_quarter', label: 'This Quarter' },
          { id: 'current_fy', label: 'FY 2025-26' },
          { id: 'all', label: 'All Time' },
          { id: 'custom', label: 'Custom Range' },
        ].map((p) => (
          <Pressable
            key={p.id}
            style={[st.periodChip, period === p.id && st.periodChipActive]}
            onPress={() => setPeriod(p.id as any)}
          >
            <Text style={[st.periodChipText, period === p.id && st.periodChipTextActive]}>{p.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Custom Date Range Selector (When 'custom' period is active) */}
      {period === 'custom' && (
        <Card style={st.customDateCard}>
          <Text style={st.customDateHeader}>Select Custom Date Range (YYYY-MM-DD)</Text>
          <View style={st.customDateRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.customDateLabel}>FROM DATE</Text>
              <TextInput
                style={st.customDateInput}
                placeholder="2026-03-01"
                placeholderTextColor={Theme.onSurfaceDisabled}
                value={fromDate}
                onChangeText={setFromDate}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.customDateLabel}>TO DATE</Text>
              <TextInput
                style={st.customDateInput}
                placeholder="2026-03-31"
                placeholderTextColor={Theme.onSurfaceDisabled}
                value={toDate}
                onChangeText={setToDate}
              />
            </View>
          </View>
        </Card>
      )}

      {/* Navigation Tabs */}
      <View style={st.navTabs}>
        {[
          { key: 'gstr1', label: 'GSTR-1' },
          { key: 'gstr3b', label: 'GSTR-3B' },
          { key: 'hsn', label: 'HSN Table' },
          { key: 'register', label: 'Register' },
          { key: 'datewise', label: 'Date-wise' },
          { key: 'filing', label: 'Deadlines' },
        ].map((t) => (
          <Pressable
            key={t.key}
            style={[st.navTab, viewTab === t.key && st.navTabActive]}
            onPress={() => setViewTab(t.key as any)}
          >
            <Text style={[st.navTabText, viewTab === t.key && st.navTabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      >
        {/* ── GSTR-1 OUTWARD SUPPLIES ── */}
        {viewTab === 'gstr1' && (
          <>
            {/* Action Bar */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <GradientButton
                title={exporting ? 'Exporting...' : 'Export GSTR-1 CSV'}
                icon="document-text-outline"
                size="sm"
                style={{ flex: 1 }}
                onPress={handleExportGstr1Csv}
                disabled={exporting}
              />
              <OutlineButton
                title="JSON Offline"
                icon="cloud-download-outline"
                size="sm"
                style={{ flex: 1 }}
                onPress={handleExportGstr1Json}
                disabled={exporting}
              />
            </View>

            {/* Metrics Cards */}
            <View style={st.grid}>
              <Card style={st.gridCard}>
                <Text style={st.cardLabel}>TOTAL INVOICES</Text>
                <Text style={st.cardVal}>{gstr1.totalInvoices}</Text>
                <Text style={st.cardSub}>B2B: {gstr1.b2bInvoices.length} · B2C: {gstr1.b2cInvoices.length}</Text>
              </Card>
              <Card style={st.gridCard}>
                <Text style={st.cardLabel}>TAXABLE TURNOVER</Text>
                <Text style={[st.cardVal, { color: Theme.tertiary }]}>{formatCurrency(gstr1.totalTaxable)}</Text>
                <Text style={st.cardSub}>Net Base Turnover</Text>
              </Card>
              <Card style={st.gridCard}>
                <Text style={st.cardLabel}>CGST (CENTRAL TAX)</Text>
                <Text style={[st.cardVal, { color: Theme.primary }]}>{formatCurrency(gstr1.totalCgst)}</Text>
                <Text style={st.cardSub}>Intra-state sales</Text>
              </Card>
              <Card style={st.gridCard}>
                <Text style={st.cardLabel}>SGST (STATE TAX)</Text>
                <Text style={[st.cardVal, { color: Theme.success }]}>{formatCurrency(gstr1.totalSgst)}</Text>
                <Text style={st.cardSub}>Intra-state sales</Text>
              </Card>
              <Card style={st.gridCard}>
                <Text style={st.cardLabel}>IGST (INTEGRATED TAX)</Text>
                <Text style={[st.cardVal, { color: '#8B5CF6' }]}>{formatCurrency(gstr1.totalIgst)}</Text>
                <Text style={st.cardSub}>Inter-state supplies</Text>
              </Card>
              <Card style={st.gridCard}>
                <Text style={st.cardLabel}>TOTAL TAX LIABILITY</Text>
                <Text style={[st.cardVal, { color: Theme.tertiary }]}>{formatCurrency(gstr1.totalTax)}</Text>
                <Text style={st.cardSub}>Output GST Collected</Text>
              </Card>
            </View>

            {/* GSTR-1 Section Summary */}
            <SectionHeader title="GSTR-1 Table-wise Filing Summary" />
            <Card style={{ marginBottom: 12 }}>
              <View style={st.tableRow}>
                <Text style={[st.tableCell, { flex: 2, fontWeight: '700' }]}>Table 4: B2B Invoices</Text>
                <Text style={st.tableCell}>{gstr1.b2bInvoices.length} invoices</Text>
                <Text style={[st.tableCell, { textAlign: 'right', fontWeight: '700', color: Theme.primary }]}>
                  {formatCurrency(gstr1.b2bInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0))}
                </Text>
              </View>
              <Divider style={{ marginVertical: 8 }} />
              <View style={st.tableRow}>
                <Text style={[st.tableCell, { flex: 2, fontWeight: '700' }]}>Table 7: B2C Retail Sales</Text>
                <Text style={st.tableCell}>{gstr1.b2cInvoices.length} invoices</Text>
                <Text style={[st.tableCell, { textAlign: 'right', fontWeight: '700', color: Theme.success }]}>
                  {formatCurrency(gstr1.b2cInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0))}
                </Text>
              </View>
              <Divider style={{ marginVertical: 8 }} />
              <View style={st.tableRow}>
                <Text style={[st.tableCell, { flex: 2, fontWeight: '700' }]}>Table 12: HSN Summary</Text>
                <Text style={st.tableCell}>{gstr1.hsnRows.length} items</Text>
                <Text style={[st.tableCell, { textAlign: 'right', fontWeight: '700', color: Theme.tertiary }]}>
                  {formatCurrency(gstr1.totalTaxable)}
                </Text>
              </View>
            </Card>
          </>
        )}

        {/* ── GSTR-3B MONTHLY SUMMARY & OFFSET ── */}
        {viewTab === 'gstr3b' && (
          <>
            <Card style={{ marginBottom: 14 }}>
              <Text style={{ color: Theme.onSurface, fontSize: 16, fontWeight: '700', marginBottom: 4 }}>
                GSTR-3B Monthly Tax Computation
              </Text>
              <Text style={{ color: Theme.onSurfaceVariant, fontSize: 12, marginBottom: 14 }}>
                Section 3.1 (Outward Tax) - Section 4 (Eligible ITC) = Section 5 (Cash Payable)
              </Text>

              <View style={st.calcRow}>
                <Text style={st.calcLabel}>3.1 Output Tax Liability (Sales)</Text>
                <Text style={[st.calcVal, { color: Theme.error }]}>{formatCurrency(gstr3b.outTotal)}</Text>
              </View>
              <View style={st.calcRow}>
                <Text style={st.calcLabel}>4.0 Eligible Input Tax Credit (Purchases)</Text>
                <Text style={[st.calcVal, { color: Theme.success }]}>- {formatCurrency(gstr3b.itcTotal)}</Text>
              </View>
              <Divider style={{ marginVertical: 10 }} />
              <View style={st.calcRow}>
                <Text style={[st.calcLabel, { fontWeight: '700', color: Theme.onSurface }]}>5.0 Net Tax Payable in Cash</Text>
                <Text style={[st.calcVal, { fontWeight: '800', color: Theme.primary, fontSize: 16 }]}>
                  {formatCurrency(gstr3b.netTotal)}
                </Text>
              </View>
            </Card>

            <Card style={{ backgroundColor: Theme.surface2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="information-circle" size={24} color={Theme.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Theme.onSurface, fontSize: 13, fontWeight: '700' }}>
                    {gstr3b.itcTotal >= gstr3b.outTotal
                      ? 'Zero Cash Tax Due. Excess ITC carries forward to next month.'
                      : `Pay ${formatCurrency(gstr3b.netTotal)} on GST Portal via Challan before 20th.`}
                  </Text>
                </View>
              </View>
            </Card>
          </>
        )}

        {/* ── HSN SUMMARY TABLE ── */}
        {viewTab === 'hsn' && (
          <>
            <SectionHeader title="Section 12: HSN-wise Summary Table" />
            {gstr1.hsnRows.length === 0 ? (
              <View style={st.emptyBox}>
                <MaterialIcons name="table-chart" size={40} color={Theme.onSurfaceDisabled} />
                <Text style={{ color: Theme.onSurface, fontSize: 14, fontWeight: '700', marginTop: 8 }}>No HSN Data in this Period</Text>
              </View>
            ) : (
              gstr1.hsnRows.map((h, i) => (
                <Card key={i} style={{ marginBottom: 10, padding: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: Theme.primary, fontSize: 14, fontWeight: '800' }}>HSN: {h.hsn}</Text>
                      <Text style={{ color: Theme.onSurface, fontSize: 13, fontWeight: '600', marginTop: 2 }}>{h.desc}</Text>
                      <Text style={{ color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 2 }}>
                        Qty: {h.qty} {h.uqc} · Taxable: {formatCurrency(h.taxable)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: Theme.onSurface, fontSize: 14, fontWeight: '700' }}>{formatCurrency(h.total)}</Text>
                      <Text style={{ color: Theme.success, fontSize: 11, marginTop: 2 }}>
                        GST: {formatCurrency(h.cgst + h.sgst + h.igst)}
                      </Text>
                    </View>
                  </View>
                </Card>
              ))
            )}
          </>
        )}

        {/* ── INVOICE REGISTER ── */}
        {viewTab === 'register' && (
          <>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search Invoice No, Customer, GSTIN..." style={{ marginBottom: 12 }} />
            {displayedInvoices.length === 0 ? (
              <View style={st.emptyBox}>
                <MaterialIcons name="receipt-long" size={40} color={Theme.onSurfaceDisabled} />
                <Text style={{ color: Theme.onSurface, fontSize: 14, fontWeight: '700', marginTop: 8 }}>No Matching Invoices</Text>
              </View>
            ) : (
              displayedInvoices.map((iv: any) => {
                const isB2b = !!(iv.customerGstin || iv.customer_gstin);
                return (
                  <Card key={iv.id} style={st.registerCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={st.regInvNo}>{iv.invoiceNo || iv.invoice_no}</Text>
                          <View style={[st.badgeB2b, { backgroundColor: isB2b ? 'rgba(233,196,106,0.15)' : 'rgba(0,212,170,0.12)' }]}>
                            <Text style={[st.badgeB2bText, { color: isB2b ? Theme.tertiary : Theme.primary }]}>{isB2b ? 'B2B' : 'B2C'}</Text>
                          </View>
                        </View>
                        <Text style={st.regCust}>{iv.customerName || iv.customer_name || 'Retail Customer'}</Text>
                        {!!(iv.customerGstin || iv.customer_gstin) && (
                          <Text style={st.regGstin}>GSTIN: {iv.customerGstin || iv.customer_gstin}</Text>
                        )}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={st.regAmount}>{formatCurrency(iv.grandTotal || iv.total || 0)}</Text>
                        <Text style={st.regTax}>GST: {formatCurrency(iv.totalTax || iv.tax || 0)}</Text>
                      </View>
                    </View>
                  </Card>
                );
              })
            )}
          </>
        )}

        {/* ── DATE-WISE SUMMARY LEDGER (Web Master Parity) ── */}
        {viewTab === 'datewise' && (
          <>
            <SectionHeader title="Date-wise Inward & GST Collection Summary" />
            {dateWiseData.length === 0 ? (
              <View style={st.emptyBox}>
                <MaterialIcons name="event" size={40} color={Theme.onSurfaceDisabled} />
                <Text style={{ color: Theme.onSurface, fontSize: 14, fontWeight: '700', marginTop: 8 }}>No Date Data in this Period</Text>
              </View>
            ) : (
              dateWiseData.map((d, i) => (
                <Card key={i} style={st.datewiseCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="calendar-outline" size={16} color={Theme.primary} />
                      <Text style={st.datewiseDate}>{d.date}</Text>
                    </View>
                    <View style={st.datewiseBadge}>
                      <Text style={st.datewiseBadgeText}>{d.count} {d.count === 1 ? 'Bill' : 'Bills'}</Text>
                    </View>
                  </View>
                  <Divider style={{ marginVertical: 6 }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <Text style={st.datewiseSubHead}>TAXABLE VALUE</Text>
                      <Text style={st.datewiseVal}>{formatCurrency(d.taxable)}</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={st.datewiseSubHead}>GST COLLECTED</Text>
                      <Text style={[st.datewiseVal, { color: Theme.tertiary }]}>{formatCurrency(d.totalTax)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={st.datewiseSubHead}>GROSS TOTAL</Text>
                      <Text style={[st.datewiseVal, { color: Theme.success }]}>{formatCurrency(d.grandTotal)}</Text>
                    </View>
                  </View>
                </Card>
              ))
            )}
          </>
        )}

        {/* ── FILING DEADLINES ── */}
        {viewTab === 'filing' && (
          <>
            <SectionHeader title="Official GST Return Deadlines" />
            {[
              { code: 'GSTR-1', desc: 'Outward Supplies & Sales Register', due: '11th of every month', freq: 'Monthly', status: 'Ready to File 🟢' },
              { code: 'GSTR-3B', desc: 'Monthly Summary Return & ITC Offset', due: '20th of every month', freq: 'Monthly', status: 'Ready to File 🟢' },
              { code: 'GSTR-9', desc: 'Annual Consolidated GST Return', due: '31st December', freq: 'Annual', status: 'Auto-Aggregated' },
            ].map((f, i) => (
              <Card key={i} style={st.filingCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={st.filingCode}>{f.code}</Text>
                      <Text style={st.filingFreq}>{f.freq}</Text>
                    </View>
                    <Text style={st.filingDesc}>{f.desc}</Text>
                    <Text style={st.filingDue}>Due Date: <Text style={{ color: Theme.onSurface, fontWeight: '700' }}>{f.due}</Text></Text>
                  </View>
                  <View style={st.filingBadge}>
                    <Text style={st.filingBadgeText}>{f.status}</Text>
                  </View>
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>

      <Snackbar visible={showSnackbar} message={snackbarText} />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },
  periodBar: { paddingVertical: 8 },
  periodChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: Theme.surface2, borderWidth: 1, borderColor: Theme.outlineVariant },
  periodChipActive: { backgroundColor: Theme.primaryContainer, borderColor: Theme.primary },
  periodChipText: { color: Theme.onSurfaceVariant, fontSize: 11, fontWeight: '600' },
  periodChipTextActive: { color: Theme.primary, fontWeight: '700' },
  customDateCard: { marginHorizontal: 16, marginBottom: 8, padding: 12, backgroundColor: Theme.surface2 },
  customDateHeader: { color: Theme.onSurfaceVariant, fontSize: 11, fontWeight: '700', marginBottom: 8 },
  customDateRow: { flexDirection: 'row', gap: 10 },
  customDateLabel: { color: Theme.onSurfaceDisabled, fontSize: 9, fontWeight: '700', marginBottom: 4 },
  customDateInput: {
    backgroundColor: Theme.bg, borderRadius: 8, borderWidth: 1, borderColor: Theme.outlineVariant,
    color: Theme.onSurface, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12,
  },
  navTabs: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: Theme.surface2, borderRadius: Theme.shapeSm, padding: 4, marginVertical: 4 },
  navTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Theme.shapeXs },
  navTabActive: { backgroundColor: Theme.primaryContainer },
  navTabText: { color: Theme.onSurfaceDisabled, fontSize: 10, fontWeight: '600' },
  navTabTextActive: { color: Theme.primary, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  gridCard: { width: '48%', padding: 12, backgroundColor: Theme.surface2 },
  cardLabel: { color: Theme.onSurfaceDisabled, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  cardVal: { color: Theme.onSurface, fontSize: 16, fontWeight: '800', marginTop: 4 },
  cardSub: { color: Theme.onSurfaceVariant, fontSize: 10, marginTop: 2 },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tableCell: { color: Theme.onSurface, fontSize: 12 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  calcLabel: { color: Theme.onSurfaceVariant, fontSize: 13 },
  calcVal: { fontSize: 14, fontWeight: '700' },
  registerCard: { padding: 12, marginBottom: 8, backgroundColor: Theme.surface2 },
  regInvNo: { color: Theme.onSurface, fontSize: 13, fontWeight: '700' },
  badgeB2b: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeB2bText: { fontSize: 10, fontWeight: '800' },
  regCust: { color: Theme.onSurfaceVariant, fontSize: 12, marginTop: 2 },
  regGstin: { color: Theme.onSurfaceDisabled, fontSize: 10, marginTop: 1, fontFamily: 'monospace' },
  regAmount: { color: Theme.onSurface, fontSize: 14, fontWeight: '700' },
  regTax: { color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 2 },
  datewiseCard: { padding: 12, marginBottom: 8, backgroundColor: Theme.surface2 },
  datewiseDate: { color: Theme.onSurface, fontSize: 13, fontWeight: '700' },
  datewiseBadge: { backgroundColor: Theme.primaryContainer, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  datewiseBadgeText: { color: Theme.primary, fontSize: 10, fontWeight: '700' },
  datewiseSubHead: { color: Theme.onSurfaceDisabled, fontSize: 9, fontWeight: '700' },
  datewiseVal: { color: Theme.onSurface, fontSize: 12, fontWeight: '700', marginTop: 2 },
  filingCard: { padding: 14, marginBottom: 10, backgroundColor: Theme.surface2 },
  filingCode: { color: Theme.primary, fontSize: 14, fontWeight: '800' },
  filingFreq: { color: Theme.onSurfaceDisabled, fontSize: 10, backgroundColor: Theme.surface3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  filingDesc: { color: Theme.onSurfaceVariant, fontSize: 12, marginTop: 4 },
  filingDue: { color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 4 },
  filingBadge: { backgroundColor: Theme.primaryContainer, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  filingBadgeText: { color: Theme.primary, fontSize: 10, fontWeight: '700' },
  emptyBox: { padding: 32, alignItems: 'center', justifyContent: 'center' },
});

