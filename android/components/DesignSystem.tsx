// AK-LOGIC AI GST — Android Material 3 Design System
// All components follow M3 specs: shape, elevation, touch targets, state layers
import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, TextInput,
  StyleSheet, ActivityIndicator, Dimensions, Modal, Platform,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Theme } from '../lib/theme';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SW } = Dimensions.get('window');

// ════════════════════════════════════════════════════
// ════════════════════════════════════════════════════
// M3 FILLED BUTTON (primary CTA)
// ════════════════════════════════════════════════════
export const FilledButton = ({
  title, onPress, icon, style, disabled = false, loading = false,
  color = 'primary', size = 'md',
}: {
  title: string; onPress?: () => void; icon?: string; style?: any;
  disabled?: boolean; loading?: boolean;
  color?: 'primary' | 'error' | 'tertiary'; size?: 'sm' | 'md' | 'lg';
}) => {
  const bg = color === 'error' ? Theme.error : color === 'tertiary' ? Theme.tertiary : Theme.primary;
  const fg = color === 'error' ? '#fff' : color === 'tertiary' ? '#fff' : Theme.onPrimary;
  const h = size === 'sm' ? 36 : size === 'lg' ? 56 : 48;
  const fs = size === 'sm' ? 13 : size === 'lg' ? 16 : 14;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [
        s.filledBtn, { height: h, backgroundColor: disabled ? Theme.surface4 : bg, opacity: pressed ? 0.75 : 1 },
        style,
      ]}
      android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : (
        <>
          {icon && <MaterialIcons name={icon as any} size={18} color={disabled ? Theme.onSurfaceDisabled : fg} style={{ marginRight: 8 }} />}
          <Text style={[s.filledBtnText, { fontSize: fs, color: disabled ? Theme.onSurfaceDisabled : fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
};

// ════════════════════════════════════════════════════
// M3 GRADIENT BUTTON (brand accent CTA)
// ════════════════════════════════════════════════════
export const GradientButton = ({
  title, onPress, icon, gradient = Theme.gradientPrimary,
  style, disabled = false, loading = false, size = 'md',
}: {
  title: string; onPress?: () => void; icon?: string;
  gradient?: [string, string]; style?: any;
  disabled?: boolean; loading?: boolean; size?: 'sm' | 'md' | 'lg';
}) => {
  const h = size === 'sm' ? 36 : size === 'lg' ? 56 : 48;
  const fs = size === 'sm' ? 13 : size === 'lg' ? 16 : 14;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [{ opacity: pressed ? 0.78 : 1 }, style]}
    >
      <LinearGradient
        colors={disabled ? [Theme.surface4, Theme.surface4] : gradient}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[s.filledBtn, { height: h }]}
      >
        {loading ? <ActivityIndicator color="#fff" size="small" /> : (
          <>
            {icon && <Ionicons name={icon as any} size={18} color={disabled ? Theme.onSurfaceDisabled : '#fff'} style={{ marginRight: 8 }} />}
            <Text style={[s.filledBtnText, { fontSize: fs, color: disabled ? Theme.onSurfaceDisabled : '#fff' }]}>{title}</Text>
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
};

// ════════════════════════════════════════════════════
// M3 OUTLINED BUTTON
// ════════════════════════════════════════════════════
export const OutlineButton = ({
  title, onPress, icon, color = Theme.primary, style, size = 'md',
  disabled = false, loading = false,
}: {
  title: string; onPress?: () => void; icon?: string;
  color?: string; style?: any; size?: 'sm' | 'md' | 'lg';
  disabled?: boolean; loading?: boolean;
}) => {
  const h = size === 'sm' ? 36 : size === 'lg' ? 52 : 44;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [
        s.outlineBtn, { height: h, borderColor: disabled ? Theme.outlineVariant : Theme.outline, opacity: pressed ? 0.7 : (disabled ? 0.5 : 1) }, style,
      ]}
    >
      {icon && <Ionicons name={icon as any} size={size === 'sm' ? 16 : 18} color={disabled ? Theme.onSurfaceDisabled : color} style={{ marginRight: 8 }} />}
      <Text style={[s.outlineBtnText, { color: disabled ? Theme.onSurfaceDisabled : color }]}>{title}</Text>
    </Pressable>
  );
};

// ════════════════════════════════════════════════════
// M3 ICON BUTTON (40dp standard, 48dp with container)
// ════════════════════════════════════════════════════
export const IconButton = ({
  icon, onPress, size = 48, color = Theme.onSurfaceVariant,
  bgColor, badge, materialIcon = false,
}: {
  icon: string; onPress?: () => void; size?: number;
  color?: string; bgColor?: string; badge?: number; materialIcon?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    style={({ pressed }) => [
      s.iconBtn,
      { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor || 'transparent', opacity: pressed ? 0.65 : 1 },
    ]}
  >
    {materialIcon
      ? <MaterialIcons name={icon as any} size={24} color={color} />
      : <Ionicons name={icon as any} size={24} color={color} />
    }
    {badge !== undefined && badge > 0 && (
      <View style={s.badge}><Text style={s.badgeText}>{badge > 99 ? '99+' : badge}</Text></View>
    )}
  </Pressable>
);

// ════════════════════════════════════════════════════
// M3 CARD (Filled variant, elevation 1)
// ════════════════════════════════════════════════════
export const Card = ({
  children, style, onPress,
}: {
  children: React.ReactNode; style?: any; onPress?: () => void;
}) => {
  const content = <View style={[s.card, style]}>{children}</View>;
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
      >
        {content}
      </Pressable>
    );
  }
  return content;
};

// ════════════════════════════════════════════════════
// M3 TEXT FIELD (Outlined variant)
// ════════════════════════════════════════════════════
export const InputField = ({
  label, placeholder, value, onChangeText, icon,
  keyboardType = 'default', secureTextEntry = false,
  multiline = false, style, editable = true,
  trailingIcon, onTrailingPress, error, autoCapitalize = 'none', maxLength,
}: {
  label?: string; placeholder?: string; value?: string;
  onChangeText?: (t: string) => void; icon?: string;
  keyboardType?: any; secureTextEntry?: boolean;
  multiline?: boolean; style?: any; editable?: boolean;
  trailingIcon?: string; onTrailingPress?: () => void; error?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
}) => {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? Theme.error : focused ? Theme.primary : Theme.outline;
  const labelColor = error ? Theme.error : focused ? Theme.primary : Theme.onSurfaceVariant;
  return (
    <View style={[s.inputWrapper, style]}>
      {label && <Text style={[s.inputLabel, { color: labelColor }]}>{label}</Text>}
      <View style={[
        s.inputContainer,
        multiline && { minHeight: 96, height: undefined, alignItems: 'flex-start', paddingTop: 10, paddingBottom: 10 },
        { borderColor },
      ]}>
        {icon && (
          <Ionicons
            name={icon as any}
            size={20}
            color={focused ? Theme.primary : Theme.onSurfaceDisabled}
            style={{ marginRight: 12, marginTop: multiline ? 2 : 0 }}
          />
        )}
        <TextInput
          style={[
            s.input,
            multiline && {
              minHeight: 76,
              textAlignVertical: 'top',
              paddingTop: Platform.OS === 'android' ? 6 : 4,
              paddingBottom: 6,
            },
          ]}
          placeholder={placeholder}
          placeholderTextColor={Theme.onSurfaceDisabled}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          multiline={multiline}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={editable}
          returnKeyType={multiline ? 'default' : 'done'}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
        />
        {trailingIcon && (
          <Pressable onPress={onTrailingPress} style={{ padding: 4 }}>
            <Ionicons name={trailingIcon as any} size={20} color={Theme.onSurfaceVariant} />
          </Pressable>
        )}
      </View>
      {error && <Text style={s.inputError}>{error}</Text>}
    </View>
  );
};

// ════════════════════════════════════════════════════
// M3 SEARCH BAR (Surface Container High)
// ════════════════════════════════════════════════════
export const SearchBar = ({
  placeholder = 'Search...', value, onChangeText, style,
}: {
  placeholder?: string; value?: string; onChangeText?: (t: string) => void; style?: any;
}) => (
  <View style={[s.searchBar, style]}>
    <MaterialIcons name="search" size={24} color={Theme.onSurfaceVariant} />
    <TextInput
      style={s.searchInput}
      placeholder={placeholder}
      placeholderTextColor={Theme.onSurfaceDisabled}
      value={value}
      onChangeText={onChangeText}
      returnKeyType="search"
    />
    {value ? (
      <Pressable onPress={() => onChangeText?.('')} hitSlop={8}>
        <MaterialIcons name="close" size={20} color={Theme.onSurfaceVariant} />
      </Pressable>
    ) : null}
  </View>
);

// ════════════════════════════════════════════════════
// M3 STATUS BADGE (small label chip)
// ════════════════════════════════════════════════════
export const StatusBadge = ({
  status, size = 'md',
}: {
  status: 'paid' | 'pending' | 'overdue' | 'new' | 'processing' | 'approved' | 'rejected' | 'active' | 'inactive' | 'verified' | 'low' | 'out';
  size?: 'sm' | 'md';
}) => {
  const cfg: Record<string, { bg: string; fg: string; label: string }> = {
    paid:       { bg: Theme.successContainer, fg: Theme.success, label: 'Paid' },
    pending:    { bg: Theme.warningContainer, fg: Theme.warning, label: 'Pending' },
    overdue:    { bg: Theme.errorContainer, fg: Theme.error, label: 'Overdue' },
    new:        { bg: Theme.primaryContainer, fg: Theme.primary, label: 'New' },
    processing: { bg: Theme.secondaryContainer, fg: Theme.secondary, label: 'Processing' },
    approved:   { bg: Theme.successContainer, fg: Theme.success, label: 'Approved' },
    rejected:   { bg: Theme.errorContainer, fg: Theme.error, label: 'Rejected' },
    active:     { bg: Theme.successContainer, fg: Theme.success, label: 'Active' },
    inactive:   { bg: Theme.errorContainer, fg: Theme.error, label: 'Inactive' },
    verified:   { bg: Theme.primaryContainer, fg: Theme.primary, label: 'Verified' },
    low:        { bg: Theme.warningContainer, fg: Theme.warning, label: 'Low Stock' },
    out:        { bg: Theme.errorContainer, fg: Theme.error, label: 'Out of Stock' },
  };
  const c = cfg[status] || cfg.pending;
  const sm = size === 'sm';
  return (
    <View style={[s.statusBadge, { backgroundColor: c.bg }, sm && { paddingHorizontal: 8, paddingVertical: 2 }]}>
      <View style={[s.statusDot, { backgroundColor: c.fg }]} />
      <Text style={[s.statusText, { color: c.fg }, sm && { fontSize: 10 }]}>{c.label}</Text>
    </View>
  );
};

// ════════════════════════════════════════════════════
// STAT CARD
// ════════════════════════════════════════════════════
export const StatCard = ({
  icon, label, value, color = Theme.primary, onPress,
}: {
  icon: string; label: string; value: string; color?: string; onPress?: () => void;
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [s.statCard, { borderLeftColor: color, borderLeftWidth: 3, opacity: pressed && onPress ? 0.85 : 1 }]}
  >
    <View style={[s.statIcon, { backgroundColor: color + '1A' }]}>
      <Ionicons name={icon as any} size={22} color={color} />
    </View>
    <Text style={s.statValue}>{value}</Text>
    <Text style={s.statLabel}>{label}</Text>
  </Pressable>
);

// ════════════════════════════════════════════════════
// SECTION HEADER
// ════════════════════════════════════════════════════
export const SectionHeader = ({
  title, action, onAction, icon, style,
}: {
  title: string; action?: string; onAction?: () => void; icon?: string; style?: any;
}) => (
  <View style={[s.sectionHeader, style]}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {icon && <Ionicons name={icon as any} size={18} color={Theme.primary} style={{ marginRight: 8 }} />}
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
    {action && (
      <Pressable onPress={onAction} hitSlop={8}>
        <Text style={s.sectionAction}>{action}</Text>
      </Pressable>
    )}
  </View>
);

// ════════════════════════════════════════════════════
// M3 AVATAR (monogram)
// ════════════════════════════════════════════════════
export const Avatar = ({
  name, size = 40, color = Theme.primary,
}: {
  name: string; size?: number; color?: string;
}) => {
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color + '22' }]}>
      <Text style={[s.avatarText, { fontSize: size * 0.36, color }]}>{initials}</Text>
    </View>
  );
};

// ════════════════════════════════════════════════════
// M3 MODAL BOTTOM SHEET
// ════════════════════════════════════════════════════
export const BottomSheet = ({
  visible, onClose, onDismiss, title, children,
}: {
  visible: boolean; onClose?: () => void; onDismiss?: () => void; title?: string; children: React.ReactNode;
}) => {
  const handleClose = onClose || onDismiss || (() => {});
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <View style={s.sheetScrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={s.sheetContent}>
          <View style={s.sheetDragHandle} />
          {title && <Text style={s.sheetTitle}>{title}</Text>}
          {children}
        </View>
      </View>
    </Modal>
  );
};

// ════════════════════════════════════════════════════
// M3 DIALOG (AlertDialog)
// ════════════════════════════════════════════════════
export const AlertDialog = ({
  visible, onDismiss, title, message,
  confirmLabel = 'OK', cancelLabel, onConfirm, onCancel,
  icon,
}: {
  visible: boolean; onDismiss: () => void;
  title: string; message: string;
  confirmLabel?: string; cancelLabel?: string;
  onConfirm?: () => void; onCancel?: () => void;
  icon?: string;
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
    <View style={s.dialogScrim}>
      <View style={s.dialogContainer}>
        {icon && (
          <View style={s.dialogIcon}>
            <Ionicons name={icon as any} size={24} color={Theme.primary} />
          </View>
        )}
        <Text style={s.dialogTitle}>{title}</Text>
        <Text style={s.dialogMessage}>{message}</Text>
        <View style={s.dialogActions}>
          {cancelLabel && (
            <Pressable onPress={onCancel || onDismiss} style={({ pressed }) => [s.dialogBtn, { opacity: pressed ? 0.7 : 1 }]}>
              <Text style={s.dialogBtnText}>{cancelLabel}</Text>
            </Pressable>
          )}
          <Pressable onPress={onConfirm || onDismiss} style={({ pressed }) => [s.dialogBtn, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[s.dialogBtnText, { color: Theme.primary }]}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);

// ════════════════════════════════════════════════════
// M3 SNACKBAR
// ════════════════════════════════════════════════════
export const Snackbar = ({
  message, visible, actionLabel, onAction, type = 'default',
}: {
  message: string; visible: boolean; actionLabel?: string;
  onAction?: () => void; type?: 'default' | 'success' | 'error';
}) => {
  if (!visible) return null;
  const bgColor = type === 'success' ? '#2E7D32' : type === 'error' ? '#C62828' : Theme.inverseSurface;
  return (
    <View style={[s.snackbar, { backgroundColor: bgColor }]}>
      {type === 'success' && <MaterialIcons name="check-circle" size={20} color="#fff" style={{ marginRight: 8 }} />}
      {type === 'error' && <MaterialIcons name="error" size={20} color="#fff" style={{ marginRight: 8 }} />}
      <Text style={s.snackbarText}>{message}</Text>
      {actionLabel && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={s.snackbarAction}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
};

// ════════════════════════════════════════════════════
// EMPTY / LOADING / ERROR / OFFLINE STATES
// ════════════════════════════════════════════════════
export const EmptyState = ({ icon, title, message, actionLabel, onAction }: {
  icon: string; title: string; message: string; actionLabel?: string; onAction?: () => void;
}) => (
  <View style={s.emptyState}>
    <View style={s.emptyIcon}><Ionicons name={icon as any} size={48} color={Theme.onSurfaceDisabled} /></View>
    <Text style={s.emptyTitle}>{title}</Text>
    <Text style={s.emptyMessage}>{message}</Text>
    {actionLabel && <FilledButton title={actionLabel} onPress={onAction} style={{ marginTop: 20 }} />}
  </View>
);

export const LoadingState = ({ message = 'Loading...' }: { message?: string }) => (
  <View style={s.loadingState}>
    <ActivityIndicator size="large" color={Theme.primary} />
    <Text style={s.loadingText}>{message}</Text>
  </View>
);

export const ErrorState = ({ message = 'Something went wrong', onRetry }: { message?: string; onRetry?: () => void }) => (
  <View style={s.emptyState}>
    <View style={[s.emptyIcon, { backgroundColor: Theme.errorContainer }]}>
      <MaterialIcons name="error-outline" size={48} color={Theme.error} />
    </View>
    <Text style={s.emptyTitle}>Something went wrong</Text>
    <Text style={s.emptyMessage}>{message}</Text>
    {onRetry && <FilledButton title="Retry" onPress={onRetry} color="error" style={{ marginTop: 20 }} />}
  </View>
);

export const OfflineBanner = () => (
  <View style={s.offlineBanner}>
    <MaterialIcons name="cloud-off" size={16} color={Theme.warning} />
    <Text style={s.offlineText}>You're offline. Some features may not work.</Text>
  </View>
);

// ════════════════════════════════════════════════════
// SHIELD LOGO
// ════════════════════════════════════════════════════
export const ShieldLogo = ({ size = 56 }: { size?: number }) => (
  <LinearGradient
    colors={Theme.gradientPrimary}
    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
    style={{ width: size, height: size, borderRadius: size * 0.22, alignItems: 'center', justifyContent: 'center' }}
  >
    <View style={{ width: size * 0.88, height: size * 0.88, borderRadius: size * 0.18, backgroundColor: Theme.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="shield-checkmark" size={size * 0.48} color={Theme.primary} />
    </View>
  </LinearGradient>
);

// ════════════════════════════════════════════════════
// M3 LIST ITEM (single-line / two-line)
// ════════════════════════════════════════════════════
export const MenuItem = ({
  icon, title, subtitle, onPress, rightElement, color = Theme.onSurfaceVariant, showArrow = true,
}: {
  icon: string; title: string; subtitle?: string; onPress?: () => void;
  rightElement?: React.ReactNode; color?: string; showArrow?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [s.menuItem, { backgroundColor: pressed ? Theme.surface3 : 'transparent' }]}
    android_ripple={{ color: Theme.surface4 }}
  >
    <View style={[s.menuIcon, { backgroundColor: color + '14' }]}>
      <Ionicons name={icon as any} size={22} color={color} />
    </View>
    <View style={s.menuContent}>
      <Text style={s.menuTitle}>{title}</Text>
      {subtitle && <Text style={s.menuSubtitle}>{subtitle}</Text>}
    </View>
    {rightElement || (showArrow && <MaterialIcons name="chevron-right" size={24} color={Theme.onSurfaceDisabled} />)}
  </Pressable>
);

// ════════════════════════════════════════════════════
// M3 FILTER CHIP
// ════════════════════════════════════════════════════
export const FilterChip = ({
  label, active = false, selected = false, onPress,
}: {
  label: string; active?: boolean; selected?: boolean; onPress?: () => void;
}) => {
  const isSelected = active || selected;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.filterChip,
        isSelected && s.filterChipActive,
        { opacity: pressed ? 0.8 : 1 },
      ]}
    >
      {isSelected && <MaterialIcons name="check" size={16} color={Theme.primary} style={{ marginRight: 4 }} />}
      <Text style={[s.filterChipText, isSelected && { color: Theme.primary }]}>{label}</Text>
    </Pressable>
  );
};

// ════════════════════════════════════════════════════
// M3 TOP APP BAR (Small, Center-aligned)
// ════════════════════════════════════════════════════
export const TopAppBar = ({
  title, onBack, actions,
}: {
  title: string; onBack?: () => void; actions?: React.ReactNode;
}) => (
  <View style={s.topAppBar}>
    {onBack ? (
      <IconButton icon="arrow-back" onPress={onBack} materialIcon />
    ) : <View style={{ width: 48 }} />}
    <Text style={s.topAppBarTitle} numberOfLines={1}>{title}</Text>
    {actions || <View style={{ width: 48 }} />}
  </View>
);

// ════════════════════════════════════════════════════
// M3 FAB (Floating Action Button)
// ════════════════════════════════════════════════════
export const FAB = ({
  icon = 'add', onPress, extended, label,
}: {
  icon?: string; onPress?: () => void; extended?: boolean; label?: string;
}) => (
  <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}>
    <LinearGradient
      colors={Theme.gradientPrimary}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[
        s.fab,
        extended && {
          width: 'auto',
          minWidth: 56,
          height: 48,
          borderRadius: 24,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      <MaterialIcons name={icon as any} size={22} color={Theme.onPrimary} />
      {extended && label && <Text style={s.fabLabel}>{label}</Text>}
    </LinearGradient>
  </Pressable>
);

// ════════════════════════════════════════════════════
// PLACE OF SUPPLY BANNER (Intra-State vs Inter-State)
// ════════════════════════════════════════════════════
export const PlaceOfSupplyBanner = ({
  placeOfSupply, isInterState,
}: {
  placeOfSupply: string; isInterState: boolean;
}) => (
  <View style={[s.posBanner, { backgroundColor: isInterState ? 'rgba(139,92,246,0.12)' : 'rgba(0,212,170,0.10)', borderColor: isInterState ? 'rgba(139,92,246,0.3)' : 'rgba(0,212,170,0.25)' }]}>
    <MaterialIcons name="place" size={18} color={isInterState ? '#8B5CF6' : Theme.primary} />
    <View style={{ flex: 1, marginLeft: 8 }}>
      <Text style={[s.posTitle, { color: isInterState ? '#A78BFA' : Theme.primary }]}>
        Place of Supply: <Text style={{ fontWeight: '700' }}>{placeOfSupply}</Text>
      </Text>
      <Text style={s.posSub}>
        {isInterState ? 'Inter-State Supply (IGST Applicable)' : 'Intra-State Supply (CGST + SGST Applicable)'}
      </Text>
    </View>
    <View style={[s.posBadge, { backgroundColor: isInterState ? 'rgba(139,92,246,0.2)' : 'rgba(0,212,170,0.2)' }]}>
      <Text style={[s.posBadgeText, { color: isInterState ? '#C4B5FD' : Theme.primary }]}>
        {isInterState ? 'IGST' : 'CGST+SGST'}
      </Text>
    </View>
  </View>
);

// ════════════════════════════════════════════════════
// GST RATE SELECTOR (0%, 5%, 12%, 18%, 28%)
// ════════════════════════════════════════════════════
export const GST_RATES = [0, 5, 12, 18, 28];

export const GstRateSelector = ({
  value, onSelect, onChange,
}: {
  value: number; onSelect?: (rate: number) => void; onChange?: (rate: number) => void;
}) => {
  const handleSelect = onSelect || onChange || (() => {});
  return (
    <View style={s.gstRateRow}>
      {GST_RATES.map((rate) => {
        const active = value === rate;
        return (
          <Pressable
            key={rate}
            onPress={() => handleSelect(rate)}
            style={[s.gstRateChip, active && s.gstRateChipActive]}
          >
            <Text style={[s.gstRateText, active && s.gstRateTextActive]}>{rate}%</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

// ════════════════════════════════════════════════════
// PAYMENT METHOD PICKER (matching Web App payment modes)
// ════════════════════════════════════════════════════
export const PAYMENT_MODES: { value: 'cash' | 'upi' | 'card' | 'netbanking' | 'credit' | 'cheque'; label: string; icon: string }[] = [
  { value: 'cash', label: 'Cash', icon: 'payments' },
  { value: 'upi', label: 'UPI / QR', icon: 'qr-code-2' },
  { value: 'card', label: 'Card / POS', icon: 'credit-card' },
  { value: 'netbanking', label: 'Net Banking', icon: 'account-balance' },
  { value: 'credit', label: 'Credit / Khata', icon: 'schedule' },
  { value: 'cheque', label: 'Cheque', icon: 'receipt' },
];

export const PaymentModePicker = ({
  value, onSelect, onChange, style,
}: {
  value: string; onSelect?: (m: any) => void; onChange?: (m: any) => void; style?: any;
}) => {
  const handleSelect = onSelect || onChange || (() => {});
  return (
    <View style={[s.payGrid, style]}>
      {PAYMENT_MODES.map((m) => {
        const active = value === m.value;
        return (
          <Pressable
            key={m.value}
            onPress={() => handleSelect(m.value)}
            style={[s.payChip, active && s.payChipActive]}
          >
            <MaterialIcons name={m.icon as any} size={18} color={active ? Theme.primary : Theme.onSurfaceVariant} />
            <Text style={[s.payLabel, active && s.payLabelActive]}>{m.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

// ════════════════════════════════════════════════════
// HSN SUGGEST CHIP (AI Learning signal)
// ════════════════════════════════════════════════════
export const HsnSuggestChip = ({
  suggestedHsn, suggestedGst, onApply,
}: {
  suggestedHsn: string; suggestedGst: number; onApply: () => void;
}) => (
  <Pressable onPress={onApply} style={s.hsnChip}>
    <Ionicons name="sparkles" size={12} color={Theme.primary} />
    <Text style={s.hsnChipText}>
      AI HSN Suggestion: <Text style={{ fontWeight: '700', color: Theme.onSurface }}>{suggestedHsn}</Text> ({suggestedGst}% GST)
    </Text>
    <Text style={s.hsnApplyText}>Apply</Text>
  </Pressable>
);

// ════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════
export const Divider = ({ style }: { style?: any }) => <View style={[s.divider, style]} />;

export const formatCurrency = (amount: number): string => '₹' + Math.round(amount).toLocaleString('en-IN');

export const inr = (amount: number): string => '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });


// ════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════
const s = StyleSheet.create({
  // Filled Button
  filledBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, paddingHorizontal: 24,
  },
  filledBtnText: { fontWeight: '600', letterSpacing: 0.3 },
  // Outline Button
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, paddingHorizontal: 20, borderWidth: 1,
  },
  outlineBtnText: { fontWeight: '600', fontSize: 14 },
  // Icon Button
  iconBtn: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  badge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: Theme.error, borderRadius: 8,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  // Card
  card: {
    backgroundColor: Theme.surface2, borderRadius: Theme.shapeLg,
    padding: Theme.space16, ...Theme.elevation1,
  },
  // Input
  inputWrapper: { marginBottom: 16 },
  inputLabel: {
    fontSize: Theme.bodySmall, fontWeight: '500',
    marginBottom: 6, marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Theme.surface1, borderRadius: Theme.shapeSm,
    borderWidth: 1, paddingHorizontal: 14, height: 52,
  },
  input: { flex: 1, color: Theme.onSurface, fontSize: Theme.bodyLarge },
  inputError: { color: Theme.error, fontSize: Theme.labelSmall, marginTop: 4, marginLeft: 4 },
  // Search Bar
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Theme.surface3, borderRadius: Theme.shapeXl,
    paddingHorizontal: 16, height: 48, gap: 12,
  },
  searchInput: { flex: 1, color: Theme.onSurface, fontSize: Theme.bodyLarge },
  // Status Badge
  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Theme.shapeFull, gap: 5,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  // Stat Card
  statCard: {
    backgroundColor: Theme.surface2, borderRadius: Theme.shapeLg,
    padding: 14, flex: 1, ...Theme.elevation1,
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { color: Theme.onSurface, fontSize: 18, fontWeight: '700', marginBottom: 1 },
  statLabel: { color: Theme.onSurfaceVariant, fontSize: Theme.labelSmall },
  // Section Header
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12, paddingHorizontal: 4,
  },
  sectionTitle: { color: Theme.onSurfaceVariant, fontSize: Theme.labelLarge, fontWeight: '600', letterSpacing: 0.2 },
  sectionAction: { color: Theme.primary, fontSize: Theme.labelMedium, fontWeight: '600' },
  // Avatar
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '600' },
  // Bottom Sheet (M3)
  sheetScrim: { flex: 1, backgroundColor: Theme.scrim, justifyContent: 'flex-end' },
  sheetContent: {
    backgroundColor: Theme.surface3, borderTopLeftRadius: Theme.shapeXl,
    borderTopRightRadius: Theme.shapeXl, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40,
    maxHeight: '85%',
  },
  sheetDragHandle: {
    width: 32, height: 4, backgroundColor: Theme.outlineVariant,
    borderRadius: 2, alignSelf: 'center', marginBottom: 20,
  },
  sheetTitle: { color: Theme.onSurface, fontSize: Theme.titleLarge, fontWeight: '600', marginBottom: 16 },
  // Dialog (M3)
  dialogScrim: { flex: 1, backgroundColor: Theme.scrim, alignItems: 'center', justifyContent: 'center', padding: 48 },
  dialogContainer: {
    backgroundColor: Theme.surface3, borderRadius: Theme.shapeXl,
    padding: 24, width: '100%', maxWidth: 312, ...Theme.elevation3,
  },
  dialogIcon: { alignSelf: 'center', marginBottom: 16 },
  dialogTitle: { color: Theme.onSurface, fontSize: Theme.headlineSmall, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  dialogMessage: { color: Theme.onSurfaceVariant, fontSize: Theme.bodyMedium, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  dialogBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Theme.shapeFull },
  dialogBtnText: { color: Theme.onSurfaceVariant, fontSize: Theme.labelLarge, fontWeight: '600' },
  // Snackbar
  snackbar: {
    position: 'absolute', bottom: 96, left: 16, right: 16,
    borderRadius: Theme.shapeMd, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, ...Theme.elevation3,
  },
  snackbarText: { color: '#fff', fontSize: Theme.bodyMedium, flex: 1 },
  snackbarAction: { color: Theme.primary, fontSize: Theme.labelLarge, fontWeight: '600', marginLeft: 12 },
  // Empty / Loading
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, paddingHorizontal: 40 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Theme.surface4, alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { color: Theme.onSurface, fontSize: Theme.titleMedium, fontWeight: '600', marginBottom: 8 },
  emptyMessage: { color: Theme.onSurfaceVariant, fontSize: Theme.bodyMedium, textAlign: 'center', lineHeight: 20 },
  loadingState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  loadingText: { color: Theme.onSurfaceVariant, fontSize: Theme.bodyMedium, marginTop: 16 },
  // Offline
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Theme.warningContainer, paddingHorizontal: 16, paddingVertical: 12, gap: 8,
  },
  offlineText: { color: Theme.warning, fontSize: Theme.bodySmall, fontWeight: '500', flex: 1 },
  // Menu Item
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16,
    minHeight: 56,
  },
  menuIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  menuContent: { flex: 1 },
  menuTitle: { color: Theme.onSurface, fontSize: Theme.bodyLarge, fontWeight: '500' },
  menuSubtitle: { color: Theme.onSurfaceVariant, fontSize: Theme.bodySmall, marginTop: 2 },
  // Filter Chip
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: Theme.shapeSm, borderWidth: 1,
    borderColor: Theme.outline, backgroundColor: 'transparent', marginRight: 8,
    height: 32,
  },
  filterChipActive: { backgroundColor: Theme.primaryContainer, borderColor: Theme.primary },
  filterChipText: { color: Theme.onSurfaceVariant, fontSize: Theme.labelMedium, fontWeight: '500' },
  // Top App Bar
  topAppBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: Theme.topAppBarHeight, paddingHorizontal: 4,
  },
  topAppBarTitle: {
    color: Theme.onSurface, fontSize: Theme.titleLarge, fontWeight: '500',
    flex: 1, textAlign: 'center',
  },
  // FAB
  fab: {
    width: Theme.fabSize, height: Theme.fabSize, borderRadius: Theme.shapeLg,
    alignItems: 'center', justifyContent: 'center', ...Theme.elevation3,
    flexDirection: 'row',
  },
  fabLabel: { color: Theme.onPrimary, fontSize: Theme.labelLarge, fontWeight: '600', marginLeft: 8 },
  // Divider
  divider: { height: 1, backgroundColor: Theme.outlineVariant, marginVertical: 12 },
  // Place of Supply Banner
  posBanner: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: Theme.shapeMd, borderWidth: 1,
    marginVertical: 8,
  },
  posTitle: { fontSize: Theme.bodySmall, fontWeight: '500' },
  posSub: { color: Theme.onSurfaceVariant, fontSize: 11, marginTop: 2 },
  posBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Theme.shapeXs, marginLeft: 8 },
  posBadgeText: { fontSize: 10, fontWeight: '700' },
  // GST Rate Selector
  gstRateRow: { flexDirection: 'row', gap: 6, marginVertical: 4 },
  gstRateChip: {
    flex: 1, paddingVertical: 8, alignItems: 'center', justifyContent: 'center',
    borderRadius: Theme.shapeSm, backgroundColor: Theme.surface4, borderWidth: 1, borderColor: Theme.outline,
  },
  gstRateChipActive: { backgroundColor: Theme.primaryContainer, borderColor: Theme.primary },
  gstRateText: { color: Theme.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
  gstRateTextActive: { color: Theme.primary },
  // Payment Mode Picker
  payGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 },
  payChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: Theme.shapeSm,
    backgroundColor: Theme.surface4, borderWidth: 1, borderColor: Theme.outline,
    minWidth: '30%', flexGrow: 1, justifyContent: 'center',
  },
  payChipActive: { backgroundColor: Theme.primaryContainer, borderColor: Theme.primary },
  payLabel: { color: Theme.onSurfaceVariant, fontSize: 12, fontWeight: '500' },
  payLabelActive: { color: Theme.primary, fontWeight: '600' },
  // HSN Suggest Chip
  hsnChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Theme.surface4, borderRadius: Theme.shapeSm,
    paddingHorizontal: 10, paddingVertical: 6, marginTop: 6, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: 'rgba(0,212,170,0.2)',
  },
  hsnChipText: { color: Theme.onSurfaceVariant, fontSize: 11 },
  hsnApplyText: { color: Theme.primary, fontSize: 11, fontWeight: '700', marginLeft: 4 },
});

