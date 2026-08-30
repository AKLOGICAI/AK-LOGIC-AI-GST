import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Dimensions,
  Platform, Share, Modal, FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Theme } from '../lib/theme';
import {
  Card, StatCard, SectionHeader, StatusBadge, Avatar, IconButton,
  formatCurrency, FAB, OutlineButton, GradientButton, Divider,
} from '../components/DesignSystem';
import { useMerchant } from '../lib/MerchantContext';
import { api } from '../lib/apiClient';
import { getCache, setCache } from '../lib/offlineCache';
import { QRCodeSvg } from '../lib/qrSvg';
import AkaiAuditModal from '../components/AkaiAuditModal';

const { width: SW } = Dimensions.get('window');

interface DayDetail {
  label: string;
  fullDate: string;
  sum: number;
  count: number;
  invoices: { customerName: string; grandTotal: number; invoiceNo: string }[];
}

export default function HomeScreen({ navigation }: { navigation?: any }) {
  const { merchant, token, refreshProfile } = useMerchant();
  const [chartDays, setChartDays] = useState<7 | 30>(7);
  const [selectedDay, setSelectedDay] = useState<DayDetail | null>(null);

  // Live Stats State with instant cache fallback
  const [recentRequests, setRecentRequests] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [akaiAuditVisible, setAkaiAuditVisible] = useState(false);
  const [dashboardStats, setDashboardStats] = useState({
    todaySales: 0,
    pendingRequests: 0,
    totalInvoices: 0,
    monthSales: 0,
    gstCollected: 0,
  });

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  useEffect(() => {
    async function loadDashboard() {
      // 1. Instant render from local cache
      const cachedRequests = await getCache<any[]>('home_requests');
      const cachedInvoices = await getCache<any[]>('invoices_list');
      const cachedStats = await getCache<any>('home_stats');
      if (cachedRequests) setRecentRequests(cachedRequests);
      if (cachedInvoices) setInvoices(cachedInvoices);
      if (cachedStats) setDashboardStats(cachedStats);

      if (!token) return;

      // 2. Fetch fresh data in background
      try {
        refreshProfile();

        const [requestsRes, invoicesRes] = await Promise.allSettled([
          api.get('/api/merchant/billing-requests', { token }),
          api.get('/api/merchant/invoices', { token }),
        ]);

        let reqList: any[] = [];
        let invList: any[] = [];

        if (requestsRes.status === 'fulfilled' && requestsRes.value?.requests) {
          reqList = requestsRes.value.requests;
          setRecentRequests(reqList);
          await setCache('home_requests', reqList);
        }

        if (invoicesRes.status === 'fulfilled' && invoicesRes.value?.invoices) {
          invList = invoicesRes.value.invoices;
          setInvoices(invList);
          await setCache('invoices_list', invList);
        }

        // Aggregate live stats
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

        let todaySum = 0;
        let monthSum = 0;
        let totalGst = 0;

        for (const inv of invList) {
          const dt = inv.createdAt || inv.invoiceDate || 0;
          const total = Number(inv.grandTotal || inv.total || 0);
          const tax = Number(inv.totalTax || 0);

          if (dt >= startOfDay) todaySum += total;
          if (dt >= startOfMonth) monthSum += total;
          totalGst += tax;
        }

        const pendingCount = reqList.filter((r: any) => r.status === 'pending').length;

        const newStats = {
          todaySales: todaySum,
          pendingRequests: pendingCount,
          totalInvoices: invList.length,
          monthSales: monthSum,
          gstCollected: totalGst,
        };

        setDashboardStats(newStats);
        await setCache('home_stats', newStats);
      } catch (err) {
        console.warn('Dashboard background fetch error:', err);
      }
    }

    loadDashboard();
  }, [token]);

  // Real Date-Bucket Aggregation matching Master Web App (src/pages/dashboard/Overview.tsx:46-56)
  const currentChart = useMemo(() => {
    return Array.from({ length: chartDays }, (_, i) => {
      const day = new Date();
      day.setDate(day.getDate() - ((chartDays - 1) - i));
      const dayInvoices = invoices.filter(
        (iv) => new Date(iv.createdAt || iv.invoiceDate || 0).toDateString() === day.toDateString()
      );
      const sum = dayInvoices.reduce((s, iv) => s + (Number(iv.grandTotal || iv.total) || 0), 0);
      return {
        label: chartDays === 7
          ? day.toLocaleDateString('en-IN', { weekday: 'short' })
          : String(day.getDate()),
        fullDate: day.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' }),
        sum,
        count: dayInvoices.length,
        invoices: dayInvoices.map((iv) => ({
          customerName: iv.customerName || iv.customer_name || 'Walk-in Buyer',
          grandTotal: Number(iv.grandTotal || iv.total || 0),
          invoiceNo: iv.invoiceNo || iv.invoice_no || 'INV-001',
        })),
      };
    });
  }, [invoices, chartDays]);

  const maxChartVal = useMemo(() => Math.max(1, ...currentChart.map((c: any) => c.sum)), [currentChart]);
  const isChartAllZero = useMemo(() => currentChart.every((c: any) => c.sum === 0), [currentChart]);

  const quickActions = [
    { icon: 'add-circle-outline', label: 'Create\nInvoice', color: Theme.primary, screen: 'InvoiceCreate' },
    { icon: 'qr-code-outline', label: 'My QR\nStandee', color: Theme.tertiary, screen: 'QR' },
    { icon: 'receipt-outline', label: 'Billing\nRequests', color: Theme.secondary, screen: 'Requests' },
    { icon: 'document-text-outline', label: 'GST Return\nCenter', color: Theme.success, screen: 'GstReturnCenter' },
    { icon: 'calculator-outline', label: 'Deep\nAccounting', color: '#8B5CF6', screen: 'Accounting' },
    { icon: 'scan-outline', label: 'Scan\nPurchase', color: Theme.secondary, screen: 'PurchaseBills' },
    { icon: 'cube-outline', label: 'Inventory\nStock', color: Theme.warning, screen: 'Inventory' },
    { icon: 'chatbubble-ellipses-outline', label: 'Ask\n@AKAI', color: '#EC4899', screen: 'Chat' },
  ];

  const displayName = merchant?.ownerName ? merchant.ownerName.split(' ')[0] : 'Merchant';
  const shopName = merchant?.shopName || 'My Store';
  const merchantCode = merchant?.merchantCode || 'AKM-000000';
  const qrId = merchant?.qrId || merchantCode;
  const pdfCredits = merchant?.pdfCredits ?? 0;
  const payUrl = `https://gst.ak-logicai.in/pay/${qrId}`;

  return (
    <View style={st.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        {/* ── Top Header Bar ── */}
        <View style={st.header}>
          <View style={st.headerLeft}>
            <View style={st.logoSmall}>
              <Ionicons name="shield-checkmark" size={20} color={Theme.primary} />
            </View>
            <View>
              <Text style={st.greeting}>{greeting()}, {displayName}!</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={st.shopName}>{shopName}</Text>
                <View style={st.akmTag}>
                  <Text style={st.akmTagText}>{merchantCode}</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={st.headerRight}>
            <Pressable
              style={st.creditsChip}
              onPress={() => navigation?.navigate?.('Recharge')}
            >
              <MaterialIcons name="description" size={14} color={Theme.tertiary} />
              <Text style={st.creditsText}>{pdfCredits} Credits</Text>
            </Pressable>
            <IconButton icon="notifications-outline" onPress={() => navigation?.navigate?.('Notifications')} badge={dashboardStats.pendingRequests || undefined} />
          </View>
        </View>

        {/* ── AKAI Business AI Controller Banner ── */}
        <View style={{ marginHorizontal: 16, marginTop: 6, marginBottom: 6 }}>
          <Pressable
            onPress={() => setAkaiAuditVisible(true)}
            style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
          >
            <LinearGradient
              colors={['#0A1D30', '#071924']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={st.akaiBanner}
            >
              <View style={st.akaiRobotIcon}>
                <Text style={{ fontSize: 24 }}>🤖</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={st.akaiTitle}>AKAI AI Controller</Text>
                  <View style={st.akaiBadge}>
                    <Text style={st.akaiBadgeText}>LIVE PRODUCTION AUDIT</Text>
                  </View>
                </View>
                <Text style={st.akaiSubtitle}>
                  Scan &amp; audit invoices, billing requests, stocks, and books.
                </Text>
              </View>
              <View style={st.akaiArrowBox}>
                <MaterialIcons name="arrow-forward" size={18} color={Theme.primary} />
              </View>
            </LinearGradient>
          </Pressable>
        </View>

        {/* ── Sales Card (Today's Sales) ── */}
        <View style={{ marginHorizontal: 16, marginTop: 4 }}>
          <LinearGradient
            colors={['#0D3260', '#0A2448']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={st.salesCard}
          >
            <View style={{ flex: 1 }}>
              <Text style={st.salesLabel}>Today's Gross Sales</Text>
              <Text style={st.salesAmount}>{formatCurrency(dashboardStats.todaySales)}</Text>
              <View style={st.salesTrend}>
                <MaterialIcons name="trending-up" size={16} color={Theme.success} />
                <Text style={st.salesTrendText}>Live Synced with PostgreSQL</Text>
              </View>
            </View>
            <View style={st.salesIcon}>
              <MaterialIcons name="trending-up" size={30} color={Theme.primary} />
            </View>
          </LinearGradient>
        </View>

        {/* ── Live QR Code Card with Pure SVG QR Preview ── */}
        <Pressable onPress={() => navigation?.navigate?.('QR')}>
          <Card style={st.qrCard}>
            <View style={st.qrCardHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={st.qrIconBox}>
                  <Ionicons name="qr-code-outline" size={20} color={Theme.primary} />
                </View>
                <View>
                  <Text style={st.qrTitle}>My Counter QR Standee</Text>
                  <Text style={st.qrSub}>Tap to view full QR, download & print standee</Text>
                </View>
              </View>
              <View style={st.activePulse}>
                <View style={st.pulseDot} />
                <Text style={st.pulseText}>Active</Text>
              </View>
            </View>

            <View style={st.qrCodePreviewBox}>
              <View style={st.qrFrame}>
                <QRCodeSvg value={payUrl} size={84} />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={st.qrIdText}>ID: {qrId}</Text>
                <Text style={st.qrUrlText} numberOfLines={1}>{payUrl}</Text>
                <OutlineButton
                  title="Open Full QR"
                  icon="expand-outline"
                  size="sm"
                  style={{ marginTop: 10 }}
                  onPress={() => navigation?.navigate?.('QR')}
                />
              </View>
            </View>
          </Card>
        </Pressable>

        {/* ── Stat Grid ── */}
        <View style={st.statsRow}>
          <StatCard
            icon="receipt-outline"
            label="Pending Requests"
            value={String(dashboardStats.pendingRequests)}
            color={Theme.warning}
            onPress={() => navigation?.navigate?.('Requests')}
          />
          <StatCard
            icon="document-text-outline"
            label="Total Invoices"
            value={dashboardStats.totalInvoices.toLocaleString()}
            color={Theme.primary}
            onPress={() => navigation?.navigate?.('InvoiceHistory')}
          />
        </View>

        <View style={st.statsRow}>
          <StatCard
            icon="cash-outline"
            label="Month Revenue"
            value={formatCurrency(dashboardStats.monthSales)}
            color={Theme.tertiary}
            onPress={() => navigation?.navigate?.('Reports')}
          />
          <StatCard
            icon="account-balance-wallet-outline"
            label="GST Collected"
            value={formatCurrency(dashboardStats.gstCollected)}
            color={Theme.success}
            onPress={() => navigation?.navigate?.('Accounting')}
          />
        </View>

        {/* ── Revenue Trend Chart (7D vs 30D with Day Drilldown) ── */}
        <Card style={{ marginHorizontal: 16, marginTop: 14, padding: 16 }}>
          <View style={st.chartHeader}>
            <View>
              <Text style={st.chartTitle}>Revenue Trend</Text>
              <Text style={st.chartSub}>{chartDays === 7 ? 'Past 7 Days (Tap to inspect)' : 'Past 30 Days (Tap to inspect)'}</Text>
            </View>
            <View style={st.chartToggle}>
              <Pressable
                style={[st.toggleBtn, chartDays === 7 && st.toggleBtnActive]}
                onPress={() => setChartDays(7)}
              >
                <Text style={[st.toggleText, chartDays === 7 && st.toggleTextActive]}>7D</Text>
              </Pressable>
              <Pressable
                style={[st.toggleBtn, chartDays === 30 && st.toggleBtnActive]}
                onPress={() => setChartDays(30)}
              >
                <Text style={[st.toggleText, chartDays === 30 && st.toggleTextActive]}>30D</Text>
              </Pressable>
            </View>
          </View>

          {isChartAllZero ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', height: 110, paddingVertical: 12 }}>
              <MaterialIcons name="receipt-long" size={32} color={Theme.onSurfaceDisabled} />
              <Text style={{ color: Theme.onSurface, fontSize: 13, fontWeight: '700', marginTop: 6 }}>
                No Invoices in {chartDays === 7 ? 'Past 7 Days' : 'Past 30 Days'}
              </Text>
              <Text style={{ color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 2 }}>
                Approve requests or create invoices to see your real revenue trend.
              </Text>
            </View>
          ) : (
            <View style={st.chartBarsContainer}>
              {currentChart.map((c: any, i: number) => {
                const barHeight = Math.max(12, (c.sum / maxChartVal) * 110);
                return (
                  <Pressable
                    key={i}
                    style={st.chartBarCol}
                    onPress={() => setSelectedDay(c)}
                  >
                    <Text style={st.chartValText}>
                      {c.sum > 0 ? `₹${(c.sum / 1000).toFixed(0)}k` : '₹0'}
                    </Text>
                    <LinearGradient
                      colors={i === currentChart.length - 1 ? Theme.gradientPrimary : ['#F59E0B', '#B45309']}
                      style={[st.chartBar, { height: barHeight }]}
                    />
                    <Text style={st.chartLabel}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Card>

        {/* ── AKAI Live Controller Audit Banner ── */}
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <Card style={st.aiAuditBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <LinearGradient colors={Theme.gradientPrimary} style={st.aiAuditIcon}>
                <Ionicons name="sparkles" size={18} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={st.aiAuditTitle}>AKAI Live Business Controller</Text>
                <Text style={st.aiAuditSub}>
                  Inspect all double-entry ledgers, stock reconciliations & GSTR-1 compliance.
                </Text>
              </View>
            </View>
            <GradientButton
              title="Open AI Business Controller"
              icon="chatbubble-ellipses-outline"
              size="sm"
              style={{ marginTop: 12 }}
              onPress={() => navigation?.navigate?.('Chat')}
            />
          </Card>
        </View>

        {/* ── Quick Actions Grid ── */}
        <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
          <SectionHeader title="Quick Business Tools" />
          <View style={st.quickGrid}>
            {quickActions.map((a, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [st.quickActionItem, { opacity: pressed ? 0.7 : 1 }]}
                onPress={() => navigation?.navigate?.(a.screen)}
              >
                <View style={[st.quickIcon, { backgroundColor: a.color + '18' }]}>
                  <Ionicons name={a.icon as any} size={24} color={a.color} />
                </View>
                <Text style={st.quickLabel}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── Recent Requests ── */}
        <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
          <SectionHeader
            title="Recent Customer Requests"
            action="View All"
            onAction={() => navigation?.navigate?.('Requests')}
          />
          {recentRequests.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ color: Theme.onSurfaceDisabled }}>No recent customer requests.</Text>
            </View>
          ) : (
            recentRequests.slice(0, 4).map((req) => (
              <Pressable
                key={req.id}
                style={({ pressed }) => [st.invoiceItem, pressed && { backgroundColor: Theme.surface2 }]}
                android_ripple={{ color: Theme.surface3 }}
                onPress={() => navigation?.navigate?.('Requests')}
              >
                <Avatar
                  name={req.customerName || 'Customer'}
                  size={40}
                  color={req.status === 'pending' ? Theme.primary : req.status === 'approved' ? Theme.success : Theme.error}
                />
                <View style={st.invoiceInfo}>
                  <Text style={st.invoiceName}>{req.customerName || 'Walk-in Customer'}</Text>
                  <Text style={st.invoiceMeta}>{(req.items || []).length} item{(req.items || []).length !== 1 ? 's' : ''} · {req.customerPhone || 'Direct'}</Text>
                </View>
                <View style={st.invoiceRight}>
                  <StatusBadge status={req.status as any} size="sm" />
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      {/* ── Day Detail Drilldown Modal ── */}
      <Modal visible={!!selectedDay} transparent animationType="slide">
        <View style={st.modalOverlay}>
          <View style={st.modalCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View>
                <Text style={st.modalTitle}>{selectedDay?.fullDate}</Text>
                <Text style={{ color: Theme.primary, fontSize: 13, fontWeight: '700', marginTop: 2 }}>
                  Total Sales: {formatCurrency(selectedDay?.sum || 0)} ({selectedDay?.count || 0} Bills)
                </Text>
              </View>
              <Pressable onPress={() => setSelectedDay(null)} hitSlop={10}>
                <Ionicons name="close-circle" size={24} color={Theme.onSurfaceDisabled} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
              {selectedDay?.invoices && selectedDay.invoices.length > 0 ? (
                selectedDay.invoices.map((iv, idx) => (
                  <Card key={idx} style={{ marginBottom: 8, padding: 12, backgroundColor: Theme.surface3 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View>
                        <Text style={{ color: Theme.onSurface, fontSize: 13, fontWeight: '700' }}>{iv.customerName}</Text>
                        <Text style={{ color: Theme.onSurfaceDisabled, fontSize: 10, marginTop: 2 }}>#{iv.invoiceNo}</Text>
                      </View>
                      <Text style={{ color: Theme.tertiary, fontSize: 14, fontWeight: '800' }}>
                        {formatCurrency(iv.grandTotal)}
                      </Text>
                    </View>
                  </Card>
                ))
              ) : (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: Theme.onSurfaceDisabled }}>No invoices generated on this day.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      {/* ── AKAI Live Multi-Step Laser Scan Audit & Final Verified Report Modal ── */}
      <AkaiAuditModal
        visible={akaiAuditVisible}
        merchant={merchant}
        invoices={invoices}
        requests={recentRequests}
        onClose={() => setAkaiAuditVisible(false)}
        onOpenChat={() => navigation?.navigate?.('Chat')}
      />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, height: Theme.topAppBarHeight,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  logoSmall: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Theme.primaryContainer, alignItems: 'center', justifyContent: 'center',
  },
  greeting: { color: Theme.onSurfaceVariant, fontSize: Theme.bodySmall },
  shopName: { color: Theme.onSurface, fontSize: 14, fontWeight: '700' },
  akmTag: { backgroundColor: Theme.surface4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  akmTagText: { color: Theme.primary, fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  creditsChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Theme.tertiaryContainer, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: Theme.shapeSm, gap: 4,
  },
  creditsText: { color: Theme.tertiary, fontSize: Theme.labelMedium, fontWeight: '600' },
  akaiBanner: {
    borderRadius: Theme.shapeLg,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,212,170,0.3)',
  },
  akaiRobotIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(0,212,170,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  akaiTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  akaiBadge: {
    backgroundColor: 'rgba(0,212,170,0.18)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,212,170,0.35)',
  },
  akaiBadgeText: {
    color: Theme.primary,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  akaiSubtitle: {
    color: Theme.onSurfaceVariant,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
  },
  akaiArrowBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(0,212,170,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  salesCard: {
    borderRadius: Theme.shapeLg, padding: 18,
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(0,212,170,0.15)',
  },
  salesLabel: { color: Theme.onSurfaceVariant, fontSize: Theme.labelMedium, fontWeight: '500' },
  salesAmount: { color: Theme.onSurface, fontSize: 26, fontWeight: '800', marginTop: 2, letterSpacing: -0.5 },
  salesTrend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  salesTrendText: { color: Theme.success, fontSize: 12, fontWeight: '500' },
  salesIcon: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: Theme.primaryContainer, alignItems: 'center', justifyContent: 'center',
  },
  qrCard: { marginHorizontal: 16, marginTop: 12, padding: 16, backgroundColor: Theme.surface2, borderRadius: Theme.shapeLg },
  qrCardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qrIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: Theme.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  qrTitle: { color: Theme.onSurface, fontSize: 14, fontWeight: '700' },
  qrSub: { color: Theme.onSurfaceDisabled, fontSize: 11 },
  activePulse: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,212,170,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Theme.shapeXs },
  pulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Theme.primary },
  pulseText: { color: Theme.primary, fontSize: 10, fontWeight: '700' },
  qrCodePreviewBox: { flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: Theme.outlineVariant },
  qrFrame: { backgroundColor: '#fff', borderRadius: 12, padding: 6, alignItems: 'center', justifyContent: 'center' },
  qrIdText: { color: Theme.tertiary, fontSize: 13, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  qrUrlText: { color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 2 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginTop: 10 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  chartTitle: { color: Theme.onSurface, fontSize: 15, fontWeight: '700' },
  chartSub: { color: Theme.onSurfaceDisabled, fontSize: 11 },
  chartToggle: { flexDirection: 'row', backgroundColor: Theme.surface3, borderRadius: 6, padding: 2 },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  toggleBtnActive: { backgroundColor: Theme.tertiary },
  toggleText: { color: Theme.onSurfaceDisabled, fontSize: 11, fontWeight: '600' },
  toggleTextActive: { color: '#000', fontWeight: '700' },
  chartBarsContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 140, paddingTop: 10 },
  chartBarCol: { alignItems: 'center', flex: 1 },
  chartValText: { color: Theme.onSurfaceDisabled, fontSize: 9, marginBottom: 4 },
  chartBar: { width: 22, borderRadius: 4 },
  chartLabel: { color: Theme.onSurfaceVariant, fontSize: 10, marginTop: 6, fontWeight: '500' },
  aiAuditBanner: { padding: 16, borderWidth: 1, borderColor: 'rgba(0,212,170,0.35)', backgroundColor: Theme.surface2 },
  aiAuditIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  aiAuditTitle: { color: Theme.onSurface, fontSize: 14, fontWeight: '700' },
  aiAuditSub: { color: Theme.onSurfaceVariant, fontSize: 11, marginTop: 2, lineHeight: 16 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickActionItem: { alignItems: 'center', width: (SW - 62) / 4, paddingVertical: 4 },
  quickIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  quickLabel: { color: Theme.onSurfaceVariant, fontSize: 11, fontWeight: '500', textAlign: 'center', lineHeight: 14 },
  invoiceItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: Theme.outlineVariant,
  },
  invoiceInfo: { flex: 1, marginLeft: 12 },
  invoiceName: { color: Theme.onSurface, fontSize: 14, fontWeight: '600' },
  invoiceMeta: { color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 2 },
  invoiceRight: { alignItems: 'flex-end' },
  fabContainer: { position: 'absolute', bottom: 16, right: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 400, backgroundColor: Theme.surface2, borderRadius: Theme.shapeXl, padding: 20, borderWidth: 1, borderColor: Theme.outline },
  modalTitle: { color: Theme.onSurface, fontSize: 16, fontWeight: '700' },
});
