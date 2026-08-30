import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Theme } from '../lib/theme';
import { useMerchant } from '../lib/MerchantContext';
import { api } from '../lib/apiClient';
import { getCache, setCache } from '../lib/offlineCache';
import { TopAppBar, FilterChip, OutlineButton } from '../components/DesignSystem';

type NotifFilter = 'all' | 'unread' | 'requests' | 'gst';

const iconMap: Record<string, { icon: string; color: string }> = {
  request: { icon: 'receipt-long', color: Theme.primary },
  payment: { icon: 'payments', color: Theme.success },
  stock: { icon: 'inventory-2', color: Theme.warning },
  gst: { icon: 'description', color: '#8B5CF6' },
  approved: { icon: 'check-circle', color: Theme.success },
  rejected: { icon: 'cancel', color: Theme.error },
  system: { icon: 'notifications', color: Theme.tertiary },
};

export default function NotificationsScreen({ navigation }: { navigation?: any }) {
  const { token, merchant } = useMerchant();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [filter, setFilter] = useState<NotifFilter>('all');
  const [loading, setLoading] = useState(false);

  const loadNotifications = async () => {
    const cached = await getCache<any[]>('merchant_notifications');
    if (cached) setNotifications(cached);

    if (!token) return;
    setLoading(true);

    try {
      const [notifsRes, reqsRes, invRes] = await Promise.allSettled([
        api.get('/api/merchant/notifications', { token }),
        api.get('/api/merchant/billing-requests', { token }),
        api.get('/api/merchant/inventory', { token }),
      ]);

      let list: any[] = [];
      if (notifsRes.status === 'fulfilled' && notifsRes.value?.notifications?.length > 0) {
        list = notifsRes.value.notifications;
      } else {
        // Synthesize dynamic notifications from real business states
        const dynamicNotifs: any[] = [];

        // 1. Pending Billing Requests
        if (reqsRes.status === 'fulfilled' && reqsRes.value?.requests) {
          const pending = reqsRes.value.requests.filter((r: any) => r.status === 'pending');
          if (pending.length > 0) {
            dynamicNotifs.push({
              id: 'notif_pending_reqs',
              type: 'request',
              title: `${pending.length} Billing Request(s) Pending`,
              message: `Customer ${pending[0].customerName || 'Walk-in'} requested an invoice. Review & approve to issue GST bill.`,
              createdAt: Date.now() - 3600000,
              read: false,
            });
          }
        }

        // 2. Low Stock Alerts
        if (invRes.status === 'fulfilled' && invRes.value?.items) {
          const low = invRes.value.items.filter((i: any) => (i.stock_quantity ?? i.stock ?? 0) <= 3);
          if (low.length > 0) {
            dynamicNotifs.push({
              id: 'notif_low_stock',
              type: 'stock',
              title: 'Low Inventory Stock Alert',
              message: `${low[0].product_name || low[0].name} has only ${low[0].stock_quantity ?? low[0].stock ?? 0} units left in warehouse.`,
              createdAt: Date.now() - 7200000,
              read: false,
            });
          }
        }

        // 3. GST Return Reminder
        const currentDay = new Date().getDate();
        if (currentDay <= 11) {
          dynamicNotifs.push({
            id: 'notif_gstr1_due',
            type: 'gst',
            title: 'GSTR-1 Monthly Return Filing Due',
            message: 'Outward supplies register for this month is due on the 11th. Review tax register in Return Center.',
            createdAt: Date.now() - 86400000,
            read: false,
          });
        }

        list = dynamicNotifs;
      }

      setNotifications(list);
      await setCache('merchant_notifications', list);
    } catch (err) {
      console.warn('Notifications fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [token]);

  const markAllRead = async () => {
    const updated = notifications.map((n) => ({ ...n, read: true }));
    setNotifications(updated);
    await setCache('merchant_notifications', updated);
  };

  const clearAll = async () => {
    setNotifications([]);
    await setCache('merchant_notifications', []);
  };

  const filteredNotifs = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === 'unread') return !n.read;
      if (filter === 'requests') return n.type === 'request' || n.type === 'approved';
      if (filter === 'gst') return n.type === 'gst' || n.type === 'payment';
      return true;
    });
  }, [notifications, filter]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const renderNotification = ({ item }: { item: any }) => {
    const cfg = iconMap[item.type] || iconMap.system;
    const timeStr = item.createdAt
      ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Recent';

    return (
      <Pressable
        style={({ pressed }) => [
          st.notifItem,
          !item.read && st.notifUnread,
          pressed && { backgroundColor: Theme.surface3 },
        ]}
        onPress={async () => {
          const updated = notifications.map((n) => (n.id === item.id ? { ...n, read: true } : n));
          setNotifications(updated);
          await setCache('merchant_notifications', updated);
        }}
      >
        <View style={[st.notifIcon, { backgroundColor: cfg.color + '18' }]}>
          <MaterialIcons name={cfg.icon as any} size={22} color={cfg.color} />
        </View>
        <View style={st.notifContent}>
          <View style={st.notifHeader}>
            <Text style={st.notifTitle} numberOfLines={1}>{item.title}</Text>
            {!item.read && <View style={st.unreadDot} />}
          </View>
          <Text style={st.notifMessage} numberOfLines={2}>{item.body || item.message}</Text>
          <Text style={st.notifTime}>{timeStr}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={st.container}>
      <TopAppBar title="Notification Center" onBack={() => navigation?.goBack?.()} />

      {/* Filter Tabs */}
      <View style={st.filterRow}>
        {[
          { id: 'all', label: `All (${notifications.length})` },
          { id: 'unread', label: `Unread (${unreadCount})` },
          { id: 'requests', label: 'Billing Requests' },
          { id: 'gst', label: 'GST & Compliance' },
        ].map((f) => (
          <FilterChip
            key={f.id}
            label={f.label}
            selected={filter === f.id}
            onPress={() => setFilter(f.id as any)}
          />
        ))}
      </View>

      {/* Action Header */}
      {notifications.length > 0 && (
        <View style={st.actionHeader}>
          {unreadCount > 0 ? (
            <Pressable onPress={markAllRead} style={st.actionBtn}>
              <MaterialIcons name="done-all" size={16} color={Theme.primary} />
              <Text style={st.actionText}>Mark all as read</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable onPress={clearAll} style={st.actionBtn}>
            <MaterialIcons name="delete-sweep" size={16} color={Theme.error} />
            <Text style={[st.actionText, { color: Theme.error }]}>Clear all</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={filteredNotifs}
        renderItem={renderNotification}
        keyExtractor={(item) => String(item.id || Math.random())}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadNotifications} tintColor={Theme.primary} />}
        ItemSeparatorComponent={() => <View style={st.sep} />}
        ListEmptyComponent={
          <View style={{ padding: 48, alignItems: 'center' }}>
            <MaterialIcons name="notifications-none" size={48} color={Theme.onSurfaceDisabled} />
            <Text style={{ color: Theme.onSurface, fontSize: 16, fontWeight: '700', marginTop: 12 }}>All Caught Up!</Text>
            <Text style={{ color: Theme.onSurfaceDisabled, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
              You will receive instant alerts for customer requests, low stock warnings, and GST filing deadlines.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  actionHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { color: Theme.primary, fontSize: 12, fontWeight: '600' },
  notifItem: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14, minHeight: 72 },
  notifUnread: { backgroundColor: Theme.surface1 },
  notifIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  notifContent: { flex: 1 },
  notifHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notifTitle: { color: Theme.onSurface, fontSize: 13.5, fontWeight: '700', flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Theme.primary },
  notifMessage: { color: Theme.onSurfaceVariant, fontSize: 12, marginTop: 3, lineHeight: 17 },
  notifTime: { color: Theme.onSurfaceDisabled, fontSize: 10, marginTop: 4 },
  sep: { height: 1, backgroundColor: Theme.outlineVariant, marginLeft: 72 },
});
