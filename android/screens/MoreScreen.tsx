import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Theme } from '../lib/theme';
import { MenuItem, Card, Avatar, Divider, AlertDialog } from '../components/DesignSystem';
import { useMerchant } from '../lib/MerchantContext';

export default function MoreScreen({ navigation }: { navigation: any }) {
  const { merchant, logout } = useMerchant();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const sections = [
    {
      title: 'Counter & Sales Operations',
      items: [
        { icon: 'add-circle-outline', title: 'Create Tax Invoice', subtitle: '4-step tax invoice builder & PDF', color: Theme.primary, onPress: () => navigation?.navigate?.('InvoiceCreate') },
        { icon: 'qr-code-outline', title: 'My Counter QR Code', subtitle: 'Self-billing standee & scan URL', color: Theme.primary, onPress: () => navigation?.navigate?.('QR') },
        { icon: 'receipt-outline', title: 'Billing Requests', subtitle: 'Customer scan orders review', color: Theme.tertiary, onPress: () => navigation?.navigate?.('Requests') },
        { icon: 'document-text-outline', title: 'Invoices & History', subtitle: 'Generated tax invoices & dispatch', color: Theme.secondary, onPress: () => navigation?.navigate?.('InvoiceHistory') },
        { icon: 'people-outline', title: 'Address Book & Customers', subtitle: 'Auto-saved parties directory', color: '#06B6D4', onPress: () => navigation?.navigate?.('AddressBook') },
      ],
    },
    {
      title: 'Business & Inventory Tools',
      items: [
        { icon: 'cart-outline', title: 'Purchase Bills & ITC', subtitle: 'Vendor bills & input tax credit', color: Theme.secondary, onPress: () => navigation?.navigate?.('PurchaseBills') },
        { icon: 'wallet-outline', title: 'Deep Accounting Engine', subtitle: '15 COA, trial balance & ledgers', color: '#8B5CF6', onPress: () => navigation?.navigate?.('Accounting') },
        { icon: 'cube-outline', title: 'Inventory & Stock Alert', subtitle: 'SKU, HSN, stock deductions', color: Theme.warning, onPress: () => navigation?.navigate?.('Inventory') },
        { icon: 'git-network-outline', title: 'Merchant B2B Network', subtitle: 'Nearby stock search & broadcast', color: Theme.primary, onPress: () => navigation?.navigate?.('MerchantNetwork') },
        { icon: 'globe-outline', title: 'Online Store Builder', subtitle: 'Live catalog & ordering link', color: '#EC4899', onPress: () => navigation?.navigate?.('WebsiteBuilder') },
      ],
    },
    {
      title: 'GST Compliance & Analytics',
      items: [
        { icon: 'checkbox-outline', title: 'GST Return Center', subtitle: 'GSTR-1, GSTR-3B filing summaries', color: Theme.success, onPress: () => navigation?.navigate?.('GstReturnCenter') },
        { icon: 'trending-up-outline', title: 'Business Analytics', subtitle: '6-month revenue, repeat buyers', color: Theme.tertiary, onPress: () => navigation?.navigate?.('Analytics') },
        { icon: 'bar-chart-outline', title: 'Financial Reports', subtitle: 'Sales, purchase & liability ledger', color: Theme.secondary, onPress: () => navigation?.navigate?.('Reports') },
      ],
    },
    {
      title: 'Account & Configuration',
      items: [
        { icon: 'card-outline', title: 'Recharge & Plans', subtitle: 'PDF credits & 1 daily free invoice', color: Theme.tertiary, onPress: () => navigation?.navigate?.('Recharge') },
        { icon: 'options-outline', title: 'Business Settings', subtitle: 'Prefix, UPI ID, logo & seal', color: Theme.primary, onPress: () => navigation?.navigate?.('Settings') },
        { icon: 'sparkles-outline', title: 'Ask @AKAI AI Assistant', subtitle: 'Autonomous auditor & tax guidance', color: '#8B5CF6', onPress: () => navigation?.navigate?.('Chat') },
        { icon: 'person-circle-outline', title: 'Merchant Profile & KYC', subtitle: 'Account status & certificates', color: Theme.onSurfaceVariant, onPress: () => navigation?.navigate?.('Profile') },
        { icon: 'headset-outline', title: 'Helpdesk & Support', subtitle: 'Raise ticket & WhatsApp helpline', color: Theme.secondary, onPress: () => navigation?.navigate?.('Support') },
      ],
    },
  ];

  const ownerName = merchant?.ownerName || 'Merchant Owner';
  const shopName = merchant?.shopName || 'My Store';
  const merchantCode = merchant?.merchantCode || 'AKM-000000';
  const planName = merchant?.planName || 'Free Trial Plan';
  const pdfCredits = merchant?.pdfCredits ?? 0;
  const validityDays = merchant?.planValidityDays ? `${merchant.planValidityDays} Days` : 'Free Tier';

  return (
    <ScrollView
      style={st.container}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled={true}
      keyboardShouldPersistTaps="handled"
    >
      {/* Top Header */}
      <View style={st.topBar}>
        <Text style={st.topBarTitle}>All Modules</Text>
      </View>

      {/* Profile surface */}
      <Pressable
        onPress={() => navigation?.navigate?.('Profile')}
        style={({ pressed }) => [st.profileCard, pressed && { opacity: 0.9 }]}
      >
        <View style={st.profileRow}>
          <Avatar name={ownerName} size={48} color={Theme.primary} />
          <View style={st.profileInfo}>
            <Text style={st.profileName}>{ownerName}</Text>
            <Text style={st.profileShop}>{shopName}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
              <View style={st.akmTag}>
                <Text style={st.akmTagText}>{merchantCode}</Text>
              </View>
              <View style={st.planBadge}>
                <MaterialIcons name="diamond" size={12} color={Theme.tertiary} />
                <Text style={st.planText}>{planName}</Text>
              </View>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={Theme.onSurfaceDisabled} />
        </View>
      </Pressable>

      {/* Quick stats */}
      <View style={st.quickStats}>
        {[
          { v: String(pdfCredits), l: 'PDF Credits', action: () => navigation?.navigate?.('Recharge') },
          { v: planName, l: 'Current Plan', action: () => navigation?.navigate?.('Recharge') },
          { v: validityDays, l: 'Validity', action: () => navigation?.navigate?.('Recharge') },
        ].map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={st.quickDivider} />}
            <Pressable style={st.quickItem} onPress={s.action}>
              <Text style={st.quickValue} numberOfLines={1}>{s.v}</Text>
              <Text style={st.quickLabel}>{s.l}</Text>
            </Pressable>
          </React.Fragment>
        ))}
      </View>

      {/* Section groups */}
      {sections.map((section) => (
        <View key={section.title} style={st.sectionGroup}>
          <Text style={st.sectionTitle}>{section.title}</Text>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {section.items.map((item, idx) => (
              <React.Fragment key={item.title}>
                {idx > 0 && <Divider />}
                <MenuItem
                  icon={item.icon as any}
                  title={item.title}
                  subtitle={item.subtitle}
                  color={item.color}
                  onPress={item.onPress}
                />
              </React.Fragment>
            ))}
          </Card>
        </View>
      ))}

      {/* Logout button */}
      <Pressable
        style={({ pressed }) => [st.logoutBtn, pressed && { opacity: 0.85 }]}
        onPress={() => setShowLogoutDialog(true)}
      >
        <Ionicons name="log-out-outline" size={20} color={Theme.error} />
        <Text style={st.logoutText}>Sign Out of Store Account</Text>
      </Pressable>

      <Text style={st.versionText}>
        AK-LOGIC AI GST Native Client · v1.0.0 (Build 4) · Material 3
      </Text>

      {/* Logout confirmation dialog */}
      <AlertDialog
        visible={showLogoutDialog}
        title="Sign Out"
        message="Are you sure you want to sign out? Your offline cache and data will remain safe."
        confirmLabel="Sign Out"
        cancelLabel="Cancel"
        onDismiss={() => setShowLogoutDialog(false)}
        onConfirm={async () => {
          setShowLogoutDialog(false);
          await logout();
        }}
        onCancel={() => setShowLogoutDialog(false)}
      />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 12 : 8,
    paddingBottom: 8,
  },
  topBarTitle: {
    color: Theme.onSurface,
    fontSize: Theme.headlineMedium,
    fontWeight: '700',
  },
  profileCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Theme.surface2,
    borderRadius: Theme.shapeLg,
    padding: 16,
    borderWidth: 1,
    borderColor: Theme.outlineVariant,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  profileInfo: { flex: 1, marginLeft: 12 },
  profileName: { color: Theme.onSurface, fontSize: Theme.titleMedium, fontWeight: '700' },
  profileShop: { color: Theme.onSurfaceVariant, fontSize: Theme.bodySmall, marginTop: 1 },
  akmTag: {
    backgroundColor: Theme.primaryContainer,
    borderRadius: Theme.shapeXs,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  akmTagText: { color: Theme.primary, fontSize: 10, fontWeight: '700', fontFamily: 'monospace' },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Theme.surface4,
    borderRadius: Theme.shapeXs,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  planText: { color: Theme.tertiary, fontSize: 10, fontWeight: '600' },
  quickStats: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: Theme.surface2,
    borderRadius: Theme.shapeMd,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Theme.outlineVariant,
  },
  quickItem: { flex: 1, alignItems: 'center' },
  quickDivider: { width: 1, backgroundColor: Theme.outlineVariant, height: '80%', alignSelf: 'center' },
  quickValue: { color: Theme.onSurface, fontSize: Theme.titleSmall, fontWeight: '700' },
  quickLabel: { color: Theme.onSurfaceDisabled, fontSize: 10, marginTop: 2 },
  sectionGroup: { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle: {
    color: Theme.onSurfaceVariant,
    fontSize: Theme.labelLarge,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: Theme.shapeMd,
    backgroundColor: Theme.surface2,
    borderWidth: 1,
    borderColor: 'rgba(255,107,136,0.3)',
  },
  logoutText: { color: Theme.error, fontSize: Theme.bodyMedium, fontWeight: '600' },
  versionText: {
    textAlign: 'center',
    color: Theme.onSurfaceDisabled,
    fontSize: Theme.bodySmall,
    marginBottom: 40,
  },
});
