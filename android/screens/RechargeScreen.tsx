import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal,
  Linking, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../lib/theme';
import {
  Card, GradientButton, OutlineButton, FilledButton, SectionHeader,
  Divider, TopAppBar, Snackbar,
} from '../components/DesignSystem';
import { useMerchant } from '../lib/MerchantContext';
import { api } from '../lib/apiClient';

export const PLANS = [
  { id: 'trial_20', name: '₹20 Trial', price: 20, validityDays: 1, credits: 10, tag: '1 Day' },
  { id: 'starter_50', name: '₹50 Starter', price: 50, validityDays: 3, credits: 30, tag: '3 Days' },
  { id: 'monthly_199', name: '₹199 Monthly', price: 199, validityDays: 30, credits: 300, tag: '30 Days', popular: true },
  { id: 'monthly_299', name: '₹299 Monthly', price: 299, validityDays: 30, credits: 600, tag: '30 Days' },
  { id: 'monthly_399', name: '₹399 Monthly', price: 399, validityDays: 30, credits: 1000, tag: '30 Days' },
  { id: 'monthly_900', name: '₹900 Enterprise', price: 900, validityDays: 30, credits: 2500, tag: '30 Days', best: true },
];

export const VALIDITY_ADDON = {
  id: 'addon_validity_50',
  name: '₹50 Validity Extension',
  price: 50,
  extendDays: 30,
};

export default function RechargeScreen({ navigation }: { navigation?: any }) {
  const { merchant, token, refreshProfile } = useMerchant();
  const [selPlan, setSelPlan] = useState<string>('monthly_199');
  const [loading, setLoading] = useState(false);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarText, setSnackbarText] = useState('');
  const [ticker, setTicker] = useState<string>('');

  // Payment Checkout Modal
  const [checkoutModal, setCheckoutModal] = useState(false);
  const [selectedCheckoutItem, setSelectedCheckoutItem] = useState<{
    id: string;
    name: string;
    price: number;
    credits?: number;
    validityDays?: number;
    type: 'plan' | 'addon';
  } | null>(null);

  const notify = (msg: string) => {
    setSnackbarText(msg);
    setShowSnackbar(true);
    setTimeout(() => setShowSnackbar(false), 3500);
  };

  // Free invoice cooldown countdown ticker
  useEffect(() => {
    const updateCountdown = () => {
      const lastFree = (merchant as any)?.lastFreeInvoiceAt ? Number((merchant as any).lastFreeInvoiceAt) : 0;
      if (!lastFree) {
        setTicker('Available Now');
        return;
      }
      const elapsed = Date.now() - lastFree;
      if (elapsed >= 86400000) {
        setTicker('Available Now');
      } else {
        const remainingMs = 86400000 - elapsed;
        const hours = Math.floor(remainingMs / 3600000);
        const mins = Math.floor((remainingMs % 3600000) / 60000);
        setTicker(`Resets in ${hours}h ${mins}m`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 30000);
    return () => clearInterval(interval);
  }, [(merchant as any)?.lastFreeInvoiceAt]);

  const handleOpenCheckout = (item: any, type: 'plan' | 'addon' = 'plan') => {
    setSelectedCheckoutItem({
      id: item.id,
      name: item.name,
      price: item.price,
      credits: item.credits,
      validityDays: item.validityDays || item.extendDays,
      type,
    });
    setCheckoutModal(true);
  };

  const handleLaunchPaymentGateway = async () => {
    if (!selectedCheckoutItem) return;
    const rechargePortalUrl = 'https://gst.ak-logicai.in/dashboard/recharge';
    try {
      await Linking.openURL(rechargePortalUrl);
    } catch (e: any) {
      Alert.alert('Payment Portal', `Please visit: ${rechargePortalUrl}`);
    }
  };

  const handleSyncPaymentStatus = async () => {
    setLoading(true);
    try {
      await refreshProfile();
      notify('✅ Profile & Credits Synchronized!');
      setCheckoutModal(false);
    } catch (err: any) {
      notify('Failed to sync. Please check your network.');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimFreeDaily = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.post('/api/merchant/claim-free-invoice', {}, { token });
      if (res && res.ok) {
        notify('🎁 Daily Free Invoice Credit Claimed!');
        await refreshProfile();
      } else {
        notify(res?.message || 'Daily free invoice allowance is already active.');
      }
    } catch (err: any) {
      notify(err.message || "Today's free daily invoice allowance is ready.");
    } finally {
      setLoading(false);
    }
  };

  const pdfCredits = merchant?.pdfCredits ?? 0;
  const planName = merchant?.planName || '₹199 Monthly';
  const customBranding = !!merchant?.customBranding;

  return (
    <View style={st.container}>
      <TopAppBar
        title="Recharge & Plans"
        onBack={() => navigation?.goBack?.()}
        actions={
          <Pressable onPress={handleSyncPaymentStatus} hitSlop={8} style={{ padding: 8, marginRight: 4 }}>
            <Ionicons name="refresh" size={20} color={Theme.primary} />
          </Pressable>
        }
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      >
        {/* Status Card */}
        <View style={st.statusCard}>
          <View style={st.statusRow}>
            {[
              { v: String(pdfCredits), l: 'PDF Credits', i: 'zap', c: Theme.tertiary },
              { v: planName, l: 'Current Plan', i: 'sparkles', c: Theme.primary },
              { v: 'Active', l: 'Status', i: 'checkmark-circle', c: Theme.secondary },
            ].map((s, i) => (
              <React.Fragment key={i}>
                {i > 0 && <View style={st.statusDiv} />}
                <View style={st.statusItem}>
                  <View style={[st.statusIcon, { backgroundColor: s.c + '18' }]}>
                    <Ionicons name={s.i as any} size={20} color={s.c} />
                  </View>
                  <Text style={st.statusVal} numberOfLines={1}>{s.v}</Text>
                  <Text style={st.statusLabel}>{s.l}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Branding Status Banner */}
        <View style={[st.brandBanner, { backgroundColor: customBranding ? 'rgba(0,212,170,0.12)' : 'rgba(233,196,106,0.12)', borderColor: customBranding ? 'rgba(0,212,170,0.3)' : 'rgba(233,196,106,0.3)' }]}>
          <Ionicons name={customBranding ? 'ribbon' : 'shield-outline'} size={24} color={customBranding ? Theme.primary : Theme.tertiary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[st.brandTitle, { color: customBranding ? Theme.primary : Theme.tertiary }]}>
              {customBranding ? 'Custom Branding Active' : 'AK-LOGIC AI Standard Branding'}
            </Text>
            <Text style={st.brandSub}>
              {customBranding
                ? 'Your custom business logo and seal appear on all customer bills.'
                : 'Plans with 30-day validity unlock custom logo and seal on invoices.'}
            </Text>
          </View>
        </View>

        {/* Free Daily Invoice Banner */}
        <Card style={st.freeDailyBanner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 28 }}>🎁</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.freeDailyTitle}>Claim Today's 1 Free Invoice</Text>
              <Text style={st.freeDailySub}>
                {ticker === 'Available Now'
                  ? 'Every active merchant gets 1 free PDF generation credit daily.'
                  : `Cooldown active · ${ticker}`}
              </Text>
            </View>
            <OutlineButton
              title={ticker === 'Available Now' ? 'Claim' : 'Active'}
              size="sm"
              disabled={ticker !== 'Available Now' || loading}
              onPress={handleClaimFreeDaily}
            />
          </View>
        </Card>

        {/* Validity Extension Add-on */}
        <Card style={st.addonCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={st.addonTitle}>{VALIDITY_ADDON.name}</Text>
              <Text style={st.addonSub}>Extend your plan validity by +30 days without changing credits</Text>
            </View>
            <GradientButton
              title={`Add ₹${VALIDITY_ADDON.price}`}
              size="sm"
              onPress={() => handleOpenCheckout(VALIDITY_ADDON, 'addon')}
            />
          </View>
        </Card>

        {/* Subscription Plans */}
        <SectionHeader title="Official Plans Catalog" />
        {PLANS.map((plan) => {
          const isSelected = selPlan === plan.id;
          const unlocksBranding = plan.validityDays >= 30;
          return (
            <Pressable key={plan.id} onPress={() => setSelPlan(plan.id)}>
              <Card style={[st.planCard, isSelected && { borderColor: Theme.primary, borderWidth: 2 }]}>
                <View style={st.planHeader}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={st.planName}>{plan.name}</Text>
                      {plan.popular && (
                        <View style={st.popBadge}><Text style={st.popBadgeText}>POPULAR</Text></View>
                      )}
                    </View>
                    <Text style={st.planCredits}>{plan.credits} PDF Credits · {plan.tag} Validity</Text>
                  </View>
                  <Text style={st.planPrice}>₹{plan.price}</Text>
                </View>
                <Divider style={{ marginVertical: 10 }} />
                <View style={st.planFeatures}>
                  <View style={st.planFeatRow}>
                    <Ionicons name="checkmark-circle" size={16} color={Theme.primary} />
                    <Text style={st.planFeatText}>{plan.credits} GST Tax Invoices Generation</Text>
                  </View>
                  <View style={st.planFeatRow}>
                    <Ionicons name="checkmark-circle" size={16} color={Theme.primary} />
                    <Text style={st.planFeatText}>{plan.validityDays} Days Active Account Validity</Text>
                  </View>
                  <View style={st.planFeatRow}>
                    <Ionicons name={unlocksBranding ? 'checkmark-circle' : 'close-circle'} size={16} color={unlocksBranding ? Theme.primary : Theme.onSurfaceDisabled} />
                    <Text style={[st.planFeatText, !unlocksBranding && { color: Theme.onSurfaceDisabled }]}>
                      {unlocksBranding ? 'Custom Shop Logo & Seal on Bills' : 'Standard AK-LOGIC Branding'}
                    </Text>
                  </View>
                </View>
                <GradientButton
                  title={isSelected ? `Purchase ${plan.name}` : 'Select Plan'}
                  size="sm"
                  style={{ marginTop: 12 }}
                  onPress={() => handleOpenCheckout(plan, 'plan')}
                />
              </Card>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Secure Payment Checkout Modal ── */}
      <Modal
        visible={checkoutModal}
        transparent
        animationType="slide"
        onRequestClose={() => setCheckoutModal(false)}
      >
        <View style={st.modalOverlay}>
          <Card style={st.modalCard}>
            <View style={st.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={st.modalIconBox}>
                  <Ionicons name="shield-checkmark" size={20} color={Theme.primary} />
                </View>
                <View>
                  <Text style={st.modalTitle}>Secure Checkout</Text>
                  <Text style={st.modalSub}>100% Verified Payment Gateway</Text>
                </View>
              </View>
              <Pressable onPress={() => setCheckoutModal(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={Theme.onSurfaceDisabled} />
              </Pressable>
            </View>

            <Divider style={{ marginVertical: 14 }} />

            {selectedCheckoutItem && (
              <View style={st.checkoutSummaryBox}>
                <View style={st.summaryRow}>
                  <Text style={st.summaryLabel}>Selected Item</Text>
                  <Text style={st.summaryVal}>{selectedCheckoutItem.name}</Text>
                </View>
                {selectedCheckoutItem.credits ? (
                  <View style={st.summaryRow}>
                    <Text style={st.summaryLabel}>PDF Credits</Text>
                    <Text style={[st.summaryVal, { color: Theme.primary }]}>+{selectedCheckoutItem.credits} Credits</Text>
                  </View>
                ) : null}
                <View style={st.summaryRow}>
                  <Text style={st.summaryLabel}>Validity</Text>
                  <Text style={st.summaryVal}>+{selectedCheckoutItem.validityDays} Days</Text>
                </View>
                <Divider style={{ marginVertical: 8 }} />
                <View style={st.summaryRow}>
                  <Text style={[st.summaryLabel, { fontWeight: '700', color: Theme.onSurface }]}>Total Amount</Text>
                  <Text style={st.summaryPrice}>₹{selectedCheckoutItem.price}</Text>
                </View>
              </View>
            )}

            {/* Payment Method Badges */}
            <View style={st.paymentMethodsRow}>
              <View style={st.payMethodTag}><Text style={st.payMethodText}>UPI (GPay / PhonePe / Paytm)</Text></View>
              <View style={st.payMethodTag}><Text style={st.payMethodText}>Cards / NetBanking</Text></View>
            </View>

            <View style={{ gap: 10, marginTop: 16 }}>
              <GradientButton
                title={`Pay ₹${selectedCheckoutItem?.price || 0} via Razorpay & UPI`}
                icon="card-outline"
                onPress={handleLaunchPaymentGateway}
              />
              <OutlineButton
                title={loading ? 'Checking...' : 'I Have Paid — Refresh & Sync Credits'}
                icon="refresh-outline"
                disabled={loading}
                onPress={handleSyncPaymentStatus}
              />
            </View>
          </Card>
        </View>
      </Modal>

      <Snackbar visible={showSnackbar} message={snackbarText} />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },
  statusCard: { backgroundColor: Theme.surface2, borderRadius: Theme.shapeLg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Theme.outlineVariant },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusItem: { flex: 1, alignItems: 'center' },
  statusDiv: { width: 1, height: 36, backgroundColor: Theme.outlineVariant },
  statusIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statusVal: { color: Theme.onSurface, fontSize: 13, fontWeight: '700' },
  statusLabel: { color: Theme.onSurfaceDisabled, fontSize: 10, marginTop: 2 },
  brandBanner: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: Theme.shapeMd, marginBottom: 12, borderWidth: 1 },
  brandTitle: { fontSize: 13, fontWeight: '700' },
  brandSub: { color: Theme.onSurfaceVariant, fontSize: 11, marginTop: 2 },
  freeDailyBanner: { padding: 14, backgroundColor: Theme.surface2, borderRadius: Theme.shapeMd, marginBottom: 12 },
  freeDailyTitle: { color: Theme.onSurface, fontSize: 13, fontWeight: '700' },
  freeDailySub: { color: Theme.onSurfaceVariant, fontSize: 11, marginTop: 2 },
  addonCard: { padding: 14, backgroundColor: Theme.surface2, borderRadius: Theme.shapeMd, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(0,212,170,0.2)' },
  addonTitle: { color: Theme.primary, fontSize: 13, fontWeight: '700' },
  addonSub: { color: Theme.onSurfaceVariant, fontSize: 11, marginTop: 2 },
  planCard: { marginBottom: 12, padding: 16, backgroundColor: Theme.surface2, borderRadius: Theme.shapeLg, borderWidth: 1, borderColor: Theme.outlineVariant },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  planName: { color: Theme.onSurface, fontSize: 15, fontWeight: '700' },
  planCredits: { color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 2 },
  planPrice: { color: Theme.primary, fontSize: 18, fontWeight: '800' },
  popBadge: { backgroundColor: Theme.tertiary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  popBadgeText: { color: '#000', fontSize: 9, fontWeight: '800' },
  planFeatures: { gap: 6 },
  planFeatRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  planFeatText: { color: Theme.onSurfaceVariant, fontSize: 12 },

  // Checkout Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: Theme.surface2, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: Theme.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { color: Theme.onSurface, fontSize: 16, fontWeight: '700' },
  modalSub: { color: Theme.onSurfaceVariant, fontSize: 11, marginTop: 1 },
  checkoutSummaryBox: { backgroundColor: Theme.surface3, borderRadius: 12, padding: 14 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  summaryLabel: { color: Theme.onSurfaceVariant, fontSize: 12 },
  summaryVal: { color: Theme.onSurface, fontSize: 12, fontWeight: '600' },
  summaryPrice: { color: Theme.primary, fontSize: 18, fontWeight: '800' },
  paymentMethodsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  payMethodTag: { backgroundColor: Theme.surface4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  payMethodText: { color: Theme.onSurfaceDisabled, fontSize: 10, fontWeight: '600' },
});

