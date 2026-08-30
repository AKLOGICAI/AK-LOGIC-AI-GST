import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Theme } from '../lib/theme';
import {
  Card, SectionHeader, Divider, formatCurrency, GradientButton,
  OutlineButton, TopAppBar, Snackbar,
} from '../components/DesignSystem';
import { useMerchant } from '../lib/MerchantContext';
import { api } from '../lib/apiClient';
import { getCache, setCache } from '../lib/offlineCache';
import { exportCsvFile, SheetData } from '../lib/exporters';

type TimeRange = '7d' | '30d' | '90d' | 'all';
type MainTab = 'sales' | 'gst_slabs' | 'states';

export default function ReportsScreen({ route, navigation }: { route?: any; navigation?: any }) {
  const { token, merchant } = useMerchant();
  const [tab, setTab] = useState<MainTab>('sales');
  const [range, setRange] = useState<TimeRange>('30d');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarText, setSnackbarText] = useState('');

  const notify = (msg: string) => {
    setSnackbarText(msg);
    setShowSnackbar(true);
    setTimeout(() => setShowSnackbar(false), 3000);
  };

  const loadInvoices = async () => {
    const cached = await getCache<any[]>('invoices_list');
    if (cached) setInvoices(cached);

    if (!token) return;
    setLoading(true);
    try {
      const res = await api.get('/api/merchant/invoices', { token });
      if (res && res.invoices) {
        setInvoices(res.invoices);
        await setCache('invoices_list', res.invoices);
      }
    } catch (err) {
      console.warn('Reports fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, [token]);

  // Filter invoices by time range
  const filteredInvoices = useMemo(() => {
    const now = Date.now();
    const rangeMs =
      range === '7d' ? 7 * 86400000 :
      range === '30d' ? 30 * 86400000 :
      range === '90d' ? 90 * 86400000 : Infinity;

    return invoices.filter((iv: any) => {
      const t = new Date(iv.createdAt || iv.invoiceDate || 0).getTime();
      return now - t <= rangeMs;
    });
  }, [invoices, range]);

  // Comprehensive analytics
  const report = useMemo(() => {
    let totalSales = 0;
    let totalTaxable = 0;
    let totalTax = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    const slabMap: Record<number, { taxable: number; tax: number; count: number }> = {
      0: { taxable: 0, tax: 0, count: 0 },
      5: { taxable: 0, tax: 0, count: 0 },
      12: { taxable: 0, tax: 0, count: 0 },
      18: { taxable: 0, tax: 0, count: 0 },
      28: { taxable: 0, tax: 0, count: 0 },
    };

    const stateMap: Record<string, { count: number; total: number; tax: number }> = {};

    filteredInvoices.forEach((iv: any) => {
      const gTotal = Number(iv.grandTotal || iv.total || 0);
      const taxVal = Number(iv.taxableValue || iv.subtotal || 0);
      const cgst = Number(iv.totalCgst || iv.cgst || 0);
      const sgst = Number(iv.totalSgst || iv.sgst || 0);
      const igst = Number(iv.totalIgst || iv.igst || 0);
      const tTax = Number(iv.totalTax || cgst + sgst + igst || 0);

      totalSales += gTotal;
      totalTaxable += taxVal;
      totalTax += tTax;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;

      // Slab breakdown from line items
      (iv.items || []).forEach((it: any) => {
        const rate = Math.round(Number(it.gstRate ?? it.gst_rate ?? 18));
        const itemTaxable = (Number(it.qty) || 1) * (Number(it.rate) || 0);
        const itemTax = (itemTaxable * rate) / 100;

        if (!slabMap[rate]) {
          slabMap[rate] = { taxable: 0, tax: 0, count: 0 };
        }
        slabMap[rate].taxable += itemTaxable;
        slabMap[rate].tax += itemTax;
        slabMap[rate].count += 1;
      });

      // State breakdown
      const stName = iv.customerState || iv.placeOfSupply || 'Maharashtra';
      if (!stateMap[stName]) {
        stateMap[stName] = { count: 0, total: 0, tax: 0 };
      }
      stateMap[stName].count += 1;
      stateMap[stName].total += gTotal;
      stateMap[stName].tax += tTax;
    });

    const stateRows = Object.entries(stateMap)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.total - a.total);

    return {
      count: filteredInvoices.length,
      totalSales,
      totalTaxable,
      totalTax,
      totalCgst,
      totalSgst,
      totalIgst,
      slabMap,
      stateRows,
    };
  }, [filteredInvoices]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const sheet: SheetData = {
        name: 'Sales_Report',
        header: ['Invoice No', 'Date', 'Customer Name', 'GSTIN', 'State', 'Taxable Value', 'GST Amount', 'Grand Total'],
        rows: filteredInvoices.map((iv: any) => [
          iv.invoiceNo || iv.invoice_no || '',
          iv.createdAt || iv.invoiceDate ? new Date(iv.createdAt || iv.invoiceDate).toISOString().split('T')[0] : '',
          iv.customerName || iv.customer_name || 'Retail',
          iv.customerGstin || iv.customer_gstin || 'N/A',
          iv.customerState || iv.placeOfSupply || 'Maharashtra',
          iv.taxableValue || iv.subtotal || 0,
          iv.totalTax || iv.tax || 0,
          iv.grandTotal || iv.total || 0,
        ]),
      };

      const filename = `Sales_Report_${merchant?.gstin || 'AKM'}_${range}.csv`;
      await exportCsvFile(sheet, filename);
      notify('Sales Report CSV generated & ready to share 📊');
    } catch (e: any) {
      Alert.alert('Export Error', e.message || 'Could not export CSV.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={st.container}>
      <TopAppBar title="GST & Financial Reports" onBack={() => navigation?.goBack?.()} />

      {/* Time Range Bar */}
      <View style={st.rangeRow}>
        {[
          { id: '7d', label: '7 Days' },
          { id: '30d', label: '30 Days' },
          { id: '90d', label: '90 Days' },
          { id: 'all', label: 'All Time' },
        ].map((r) => (
          <Pressable
            key={r.id}
            style={[st.rangeChip, range === r.id && st.rangeChipActive]}
            onPress={() => setRange(r.id as any)}
          >
            <Text style={[st.rangeChipText, range === r.id && st.rangeChipTextActive]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Tab Segment */}
      <View style={st.tabs}>
        {[
          { key: 'sales', label: 'Sales & Tax' },
          { key: 'gst_slabs', label: 'GST Slabs (0-28%)' },
          { key: 'states', label: 'State Breakdown' },
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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* ── 1. SALES & TAX REVENUE SUMMARY ── */}
        {tab === 'sales' && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: Theme.onSurface, fontSize: 15, fontWeight: '700' }}>
                Summary for {range.toUpperCase()} ({report.count} Invoices)
              </Text>
              <GradientButton
                title={exporting ? 'Exporting...' : 'Export CSV'}
                icon="cloud-download-outline"
                size="sm"
                onPress={handleExportCsv}
                disabled={exporting}
              />
            </View>

            <View style={st.grid}>
              <Card style={st.gridCard}>
                <Text style={st.cardLabel}>GROSS SALES</Text>
                <Text style={[st.cardVal, { color: Theme.primary }]}>{formatCurrency(report.totalSales)}</Text>
                <Text style={st.cardSub}>Total Bill Amount</Text>
              </Card>
              <Card style={st.gridCard}>
                <Text style={st.cardLabel}>TAXABLE VALUE</Text>
                <Text style={[st.cardVal, { color: Theme.tertiary }]}>{formatCurrency(report.totalTaxable)}</Text>
                <Text style={st.cardSub}>Base Value</Text>
              </Card>
              <Card style={st.gridCard}>
                <Text style={st.cardLabel}>TOTAL GST COLLECTED</Text>
                <Text style={[st.cardVal, { color: Theme.success }]}>{formatCurrency(report.totalTax)}</Text>
                <Text style={st.cardSub}>Output Tax</Text>
              </Card>
              <Card style={st.gridCard}>
                <Text style={st.cardLabel}>INTRA-STATE (CGST+SGST)</Text>
                <Text style={[st.cardVal, { color: Theme.onSurface }]}>{formatCurrency(report.totalCgst + report.totalSgst)}</Text>
                <Text style={st.cardSub}>State Local Sales</Text>
              </Card>
            </View>

            <SectionHeader title="Quick Links & Drilldown" />
            {[
              { t: 'GST Return Center (GSTR-1 & 3B)', d: 'Table-wise return prep & JSON offline export', s: 'GstReturnCenter', i: 'receipt-outline', c: Theme.primary },
              { t: 'Deep Accounting & ITC Register', d: 'Double-entry trial balance & input tax credit', s: 'Accounting', i: 'calculator-outline', c: '#8B5CF6' },
              { t: 'Purchase Bills & Stock Inward', d: 'OCR bill scans & inventory replenishment', s: 'PurchaseBills', i: 'scan-outline', c: Theme.secondary },
            ].map((l, i) => (
              <Card key={i} style={st.linkCard} onPress={() => navigation?.navigate?.(l.s)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={[st.linkIcon, { backgroundColor: l.c + '18' }]}>
                    <Ionicons name={l.i as any} size={22} color={l.c} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.linkTitle}>{l.t}</Text>
                    <Text style={st.linkDesc}>{l.d}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color={Theme.onSurfaceDisabled} />
                </View>
              </Card>
            ))}
          </>
        )}

        {/* ── 2. 5-TIER GST SLABS BREAKDOWN ── */}
        {tab === 'gst_slabs' && (
          <>
            <SectionHeader title="5-Tier GST Rate Slab Breakdown" />
            {[0, 5, 12, 18, 28].map((slab) => {
              const d = report.slabMap[slab] || { taxable: 0, tax: 0, count: 0 };
              const pctOfTotal = report.totalTaxable > 0 ? Math.round((d.taxable / report.totalTaxable) * 100) : 0;

              return (
                <Card key={slab} style={{ marginBottom: 10, padding: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={st.slabBadge}>
                        <Text style={st.slabBadgeText}>{slab}%</Text>
                      </View>
                      <View>
                        <Text style={{ color: Theme.onSurface, fontSize: 14, fontWeight: '700' }}>
                          {slab === 0 ? 'NIL / Exempted' : slab === 5 ? 'Essential Goods (5%)' : slab === 12 ? 'Standard Low (12%)' : slab === 18 ? 'Standard High (18%)' : 'Luxury / De-merit (28%)'}
                        </Text>
                        <Text style={{ color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 2 }}>
                          {d.count} line item(s) · {pctOfTotal}% of turnover
                        </Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: Theme.onSurface, fontSize: 14, fontWeight: '700' }}>{formatCurrency(d.taxable)}</Text>
                      <Text style={{ color: Theme.primary, fontSize: 11, fontWeight: '600', marginTop: 2 }}>
                        GST: {formatCurrency(d.tax)}
                      </Text>
                    </View>
                  </View>
                </Card>
              );
            })}
          </>
        )}

        {/* ── 3. STATE-WISE PLACE OF SUPPLY BREAKDOWN ── */}
        {tab === 'states' && (
          <>
            <SectionHeader title="State-wise Place of Supply Distribution" />
            {report.stateRows.length === 0 ? (
              <View style={st.emptyBox}>
                <Text style={{ color: Theme.onSurfaceDisabled }}>No invoices in this time range.</Text>
              </View>
            ) : (
              report.stateRows.map((stRow, i) => (
                <Card key={i} style={{ marginBottom: 8, padding: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <Text style={{ color: Theme.onSurface, fontSize: 14, fontWeight: '700' }}>{stRow.name}</Text>
                      <Text style={{ color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 2 }}>
                        {stRow.count} invoice(s)
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: Theme.onSurface, fontSize: 14, fontWeight: '700' }}>{formatCurrency(stRow.total)}</Text>
                      <Text style={{ color: Theme.tertiary, fontSize: 11, marginTop: 2 }}>GST: {formatCurrency(stRow.tax)}</Text>
                    </View>
                  </View>
                </Card>
              ))
            )}
          </>
        )}
      </ScrollView>

      <Snackbar visible={showSnackbar} message={snackbarText} />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },
  rangeRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  rangeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: Theme.surface2, borderWidth: 1, borderColor: Theme.outlineVariant },
  rangeChipActive: { backgroundColor: Theme.primaryContainer, borderColor: Theme.primary },
  rangeChipText: { color: Theme.onSurfaceVariant, fontSize: 11, fontWeight: '600' },
  rangeChipTextActive: { color: Theme.primary, fontWeight: '700' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: Theme.surface2, borderRadius: Theme.shapeSm, padding: 4, marginVertical: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Theme.shapeXs },
  tabActive: { backgroundColor: Theme.primaryContainer },
  tabText: { color: Theme.onSurfaceDisabled, fontSize: 11, fontWeight: '600' },
  tabTextActive: { color: Theme.primary, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  gridCard: { width: '48%', padding: 12, backgroundColor: Theme.surface2 },
  cardLabel: { color: Theme.onSurfaceDisabled, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  cardVal: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  cardSub: { color: Theme.onSurfaceVariant, fontSize: 10, marginTop: 2 },
  linkCard: { marginBottom: 10, padding: 14, backgroundColor: Theme.surface2 },
  linkIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  linkTitle: { color: Theme.onSurface, fontSize: 13, fontWeight: '700' },
  linkDesc: { color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 2 },
  slabBadge: { width: 40, height: 40, borderRadius: 10, backgroundColor: Theme.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  slabBadgeText: { color: Theme.primary, fontSize: 13, fontWeight: '800' },
  emptyBox: { padding: 32, alignItems: 'center', justifyContent: 'center' },
});
