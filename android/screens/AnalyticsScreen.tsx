import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Theme } from '../lib/theme';
import { Card, TopAppBar, SectionHeader, formatCurrency, Divider } from '../components/DesignSystem';
import { useMerchant } from '../lib/MerchantContext';
import { api } from '../lib/apiClient';
import { getCache, setCache } from '../lib/offlineCache';

const { width: SW } = Dimensions.get('window');

export default function AnalyticsScreen({ navigation }: { navigation?: any }) {
  const { token, merchant } = useMerchant();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
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
      } catch (err) {}
      finally { setLoading(false); }
    }
    loadData();
  }, [token]);

  // Analytics Computation
  const stats = useMemo(() => {
    const custMap: Record<string, { count: number; rev: number }> = {};
    const prodMap: Record<string, { qty: number; rev: number }> = {};
    let totalRev = 0;

    invoices.forEach((iv: any) => {
      const name = iv.customerName || iv.customer_name || 'Retail Customer';
      const total = iv.grandTotal || iv.total || 0;
      totalRev += total;

      if (!custMap[name]) custMap[name] = { count: 0, rev: 0 };
      custMap[name].count += 1;
      custMap[name].rev += total;

      const items = iv.items || [];
      items.forEach((it: any) => {
        const pName = it.description || it.name || 'Goods';
        const qty = it.qty || 1;
        const rate = it.rate || it.price || 0;
        if (!prodMap[pName]) prodMap[pName] = { qty: 0, rev: 0 };
        prodMap[pName].qty += qty;
        prodMap[pName].rev += qty * rate;
      });
    });

    const uniqueCustomers = Object.keys(custMap).length;
    const repeatCustomers = Object.values(custMap).filter((c) => c.count > 1).length;
    const repeatRate = uniqueCustomers > 0 ? Math.round((repeatCustomers / uniqueCustomers) * 100) : 0;
    const avgInvoice = invoices.length > 0 ? Math.round(totalRev / invoices.length) : 0;

    const topProducts = Object.entries(prodMap)
      .sort((a, b) => b[1].rev - a[1].rev)
      .slice(0, 5);

    const topCustomers = Object.entries(custMap)
      .sort((a, b) => b[1].rev - a[1].rev)
      .slice(0, 5);

    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const mIndex = d.getMonth();
      const y = d.getFullYear();
      const mLabel = d.toLocaleDateString('en-IN', { month: 'short' });
      const mInvoices = invoices.filter((iv) => {
        const invDate = new Date(iv.createdAt || iv.invoiceDate || 0);
        return invDate.getMonth() === mIndex && invDate.getFullYear() === y;
      });
      const mRev = mInvoices.reduce((s, iv) => s + (Number(iv.grandTotal || iv.total) || 0), 0);
      return {
        m: mLabel,
        rev: mRev,
        count: mInvoices.length,
      };
    });

    return {
      totalRev,
      avgInvoice,
      uniqueCustomers,
      repeatRate,
      topProducts,
      topCustomers,
      months,
    };
  }, [invoices]);

  const maxMonth = Math.max(1000, ...stats.months.map((d) => d.rev));
  const maxProdRev = stats.topProducts.length > 0 ? stats.topProducts[0][1].rev : 1;

  return (
    <View style={st.container}>
      <TopAppBar title="Business Analytics" onBack={() => navigation?.goBack?.()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* KPI Grid */}
        <View style={st.kpiGrid}>
          <Card style={st.kpiCard}>
            <Ionicons name="cash-outline" size={22} color={Theme.tertiary} />
            <Text style={st.kpiVal}>{formatCurrency(stats.avgInvoice)}</Text>
            <Text style={st.kpiLabel}>Avg. Invoice Value</Text>
          </Card>
          <Card style={st.kpiCard}>
            <Ionicons name="people-outline" size={22} color={Theme.primary} />
            <Text style={st.kpiVal}>{stats.uniqueCustomers}</Text>
            <Text style={st.kpiLabel}>Unique Customers</Text>
          </Card>
          <Card style={st.kpiCard}>
            <Ionicons name="trending-up-outline" size={22} color={Theme.success} />
            <Text style={st.kpiVal}>{stats.repeatRate}%</Text>
            <Text style={st.kpiLabel}>Repeat Customer Rate</Text>
          </Card>
          <Card style={st.kpiCard}>
            <Ionicons name="cube-outline" size={22} color="#8B5CF6" />
            <Text style={st.kpiVal}>{stats.topProducts.length}</Text>
            <Text style={st.kpiLabel}>Product Catalog</Text>
          </Card>
        </View>

        {/* Monthly Revenue Chart */}
        <Card style={{ marginBottom: 16, padding: 16 }}>
          <Text style={st.sectionTitle}>Monthly Revenue Trend (Last 6 Months)</Text>
          <View style={st.chartRow}>
            {stats.months.map((d, i) => {
              const h = Math.max(14, (d.rev / maxMonth) * 110);
              const isLast = i === stats.months.length - 1;
              return (
                <View key={d.m} style={st.chartCol}>
                  <View style={[st.chartBar, { height: h, backgroundColor: isLast ? Theme.primary : Theme.surface4 }]} />
                  <Text style={[st.chartLabel, isLast && { color: Theme.primary, fontWeight: '700' }]}>{d.m}</Text>
                </View>
              );
            })}
          </View>
        </Card>

        {/* Top Selling Products */}
        <SectionHeader title="Top Products by Revenue" />
        <Card style={{ marginBottom: 16 }}>
          {stats.topProducts.length === 0 ? (
            <Text style={st.emptyText}>No product sales data recorded yet.</Text>
          ) : (
            stats.topProducts.map(([name, data], idx) => {
              const pct = Math.round((data.rev / maxProdRev) * 100);
              return (
                <View key={name} style={{ marginBottom: idx < stats.topProducts.length - 1 ? 12 : 0 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={st.prodName} numberOfLines={1}>{name}</Text>
                    <Text style={st.prodRev}>{formatCurrency(data.rev)}</Text>
                  </View>
                  <View style={st.progTrack}>
                    <View style={[st.progFill, { width: `${pct}%` }]} />
                  </View>
                </View>
              );
            })
          )}
        </Card>

        {/* Top Customers */}
        <SectionHeader title="Top Customers by Lifetime Spend" />
        <Card>
          {stats.topCustomers.length === 0 ? (
            <Text style={st.emptyText}>No customer data recorded yet.</Text>
          ) : (
            stats.topCustomers.map(([name, data], idx) => (
              <View key={name} style={[st.custRow, idx > 0 && { borderTopWidth: 1, borderTopColor: Theme.outlineVariant, paddingTop: 10 }]}>
                <View style={st.custRank}><Text style={st.custRankText}>{idx + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={st.custName}>{name}</Text>
                  <Text style={st.custOrders}>{data.count} Invoice{data.count > 1 ? 's' : ''}</Text>
                </View>
                <Text style={st.custTotal}>{formatCurrency(data.rev)}</Text>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  kpiCard: { width: '48%', padding: 14, backgroundColor: Theme.surface2 },
  kpiVal: { color: Theme.onSurface, fontSize: 18, fontWeight: '800', marginTop: 8 },
  kpiLabel: { color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 2 },
  sectionTitle: { color: Theme.onSurface, fontSize: 14, fontWeight: '700', marginBottom: 16 },
  chartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 130, paddingTop: 10 },
  chartCol: { flex: 1, alignItems: 'center' },
  chartBar: { width: 22, borderRadius: 4 },
  chartLabel: { color: Theme.onSurfaceDisabled, fontSize: 10, marginTop: 6 },
  prodName: { color: Theme.onSurface, fontSize: 12, fontWeight: '600', flex: 1, marginRight: 8 },
  prodRev: { color: Theme.tertiary, fontSize: 12, fontWeight: '700' },
  progTrack: { height: 6, backgroundColor: Theme.surface3, borderRadius: 3, overflow: 'hidden' },
  progFill: { height: '100%', backgroundColor: Theme.primary, borderRadius: 3 },
  custRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  custRank: { width: 28, height: 28, borderRadius: 8, backgroundColor: Theme.primaryContainer, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  custRankText: { color: Theme.primary, fontSize: 12, fontWeight: '800' },
  custName: { color: Theme.onSurface, fontSize: 13, fontWeight: '600' },
  custOrders: { color: Theme.onSurfaceDisabled, fontSize: 11 },
  custTotal: { color: Theme.onSurface, fontSize: 13, fontWeight: '700' },
  emptyText: { color: Theme.onSurfaceDisabled, fontSize: 12, textAlign: 'center', paddingVertical: 12 },
});
