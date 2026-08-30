import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Theme } from '../lib/theme';
import {
  Card, GradientButton, FilledButton, OutlineButton, SectionHeader, InputField,
  SearchBar, StatusBadge, FilterChip, Avatar, MenuItem, Divider,
  EmptyState, LoadingState, ErrorState, OfflineBanner, Snackbar,
  ShieldLogo, IconButton, BottomSheet, StatCard, AlertDialog,
  TopAppBar, FAB, formatCurrency,
} from '../components/DesignSystem';

export default function UIStatesScreen({ navigation }: { navigation: any }) {
  const [showSheet, setShowSheet] = useState(false);
  const [showSnack, setShowSnack] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  return (
    <View style={st.container}>
      <TopAppBar title="Design System" onBack={() => navigation?.goBack?.()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <SectionHeader title="Buttons" />
        <Card style={{ gap: 12 }}>
          <GradientButton title="Gradient Button" icon="checkmark-circle-outline" />
          <FilledButton title="Filled Primary" icon="check" />
          <FilledButton title="Filled Error" icon="error" color="error" />
          <OutlineButton title="Outlined" icon="add-outline" />
          <GradientButton title="Disabled" disabled />
          <GradientButton title="Loading" loading />
        </Card>

        <SectionHeader title="Status Badges" />
        <Card style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['paid', 'pending', 'overdue', 'new', 'processing', 'approved', 'rejected', 'verified', 'low', 'out'] as const).map(s => <StatusBadge key={s} status={s} />)}
        </Card>

        <SectionHeader title="Inputs" />
        <Card><InputField label="Normal" placeholder="Type..." icon="text-outline" /><InputField label="Error" placeholder="" icon="alert-circle-outline" error="This field is required" /><SearchBar placeholder="Search..." /></Card>

        <SectionHeader title="Filter Chips" />
        <Card style={{ flexDirection: 'row', flexWrap: 'wrap' }}><FilterChip label="All" active /><FilterChip label="Paid" /><FilterChip label="Pending" /></Card>

        <SectionHeader title="Avatars" />
        <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Avatar name="Amit Kumar" size={32} /><Avatar name="Priya Patel" size={40} color={Theme.secondary} /><Avatar name="Suresh" size={48} color={Theme.tertiary} />
        </Card>

        <SectionHeader title="Brand" />
        <Card style={{ alignItems: 'center', gap: 16 }}>
          <ShieldLogo size={72} />
          <Text style={{ color: Theme.onSurface, fontSize: Theme.titleMedium, fontWeight: '600' }}>AK-LOGIC <Text style={{ color: Theme.primary }}>AI GST</Text></Text>
        </Card>

        <SectionHeader title="States" />
        <Card><LoadingState message="Loading invoices..." /></Card>
        <Card style={{ marginTop: 12 }}><EmptyState icon="document-text-outline" title="No Invoices" message="Create your first invoice" actionLabel="Create" /></Card>
        <Card style={{ marginTop: 12 }}><ErrorState message="Connection failed" onRetry={() => {}} /></Card>
        <OfflineBanner />

        <SectionHeader title="Dialogs & Sheets" />
        <GradientButton title="Show Dialog" onPress={() => setShowDialog(true)} />
        <GradientButton title="Show Bottom Sheet" onPress={() => setShowSheet(true)} style={{ marginTop: 8 }} />
        <FilledButton title="Show Snackbar" icon="check" onPress={() => { setShowSnack(true); setTimeout(() => setShowSnack(false), 3000); }} style={{ marginTop: 8 }} />
      </ScrollView>

      <AlertDialog visible={showDialog} onDismiss={() => setShowDialog(false)} icon="information-circle-outline" title="M3 Dialog" message="This is a Material 3 AlertDialog with proper scrim, shape, and button placement." confirmLabel="Got it" cancelLabel="Cancel" onConfirm={() => setShowDialog(false)} onCancel={() => setShowDialog(false)} />
      <BottomSheet visible={showSheet} onClose={() => setShowSheet(false)} title="M3 Bottom Sheet">
        <Text style={{ color: Theme.onSurfaceVariant, fontSize: Theme.bodyMedium, lineHeight: 20, marginBottom: 16 }}>Modal bottom sheet with drag handle, proper M3 shape and scrim.</Text>
        <MenuItem icon="document-text-outline" title="View Invoice" subtitle="INV-2024-1247" color={Theme.primary} />
        <MenuItem icon="share-social-outline" title="Share" color={Theme.secondary} />
        <Divider />
        <GradientButton title="Close" onPress={() => setShowSheet(false)} style={{ marginTop: 8 }} />
      </BottomSheet>
      <Snackbar message="Action completed successfully" visible={showSnack} type="success" actionLabel="Undo" />
    </View>
  );
}

const st = StyleSheet.create({ container: { flex: 1, backgroundColor: Theme.bg } });
