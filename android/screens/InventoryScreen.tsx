import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView,
  Modal, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Theme } from '../lib/theme';
import {
  SearchBar, FilterChip, Card, GradientButton,
  OutlineButton, formatCurrency, BottomSheet, TopAppBar, FAB,
  InputField, GstRateSelector, HsnSuggestChip,
} from '../components/DesignSystem';
import { useMerchant } from '../lib/MerchantContext';
import { api } from '../lib/apiClient';
import { getCache, setCache } from '../lib/offlineCache';
import { suggestHsn } from '../lib/hsnAi';

const UNITS = ['pcs', 'kg', 'ltrs', 'box', 'set', 'mtr', 'pkts'];

export default function InventoryScreen({ navigation }: { navigation?: any }) {
  const { token } = useMerchant();
  const [items, setItems] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Add / Edit Item Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [addName, setAddName] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [addHsn, setAddHsn] = useState('8528');
  const [addSellingPrice, setAddSellingPrice] = useState('');
  const [addCostPrice, setAddCostPrice] = useState('');
  const [addStock, setAddStock] = useState('10');
  const [addGstRate, setAddGstRate] = useState(18);
  const [addUnit, setAddUnit] = useState('pcs');
  const [addLoading, setAddLoading] = useState(false);

  const filters = ['all', 'In Stock', 'Low Stock', 'Reorder Soon', 'Out of Stock'];

  const loadData = async () => {
    const cachedInv = await getCache<any[]>('merchant_inventory');
    if (cachedInv) setItems(cachedInv);

    const cachedInvoices = await getCache<any[]>('invoices_list');
    if (cachedInvoices) setInvoices(cachedInvoices);

    if (!token) return;
    setLoading(true);

    try {
      const [invRes, invoicesRes] = await Promise.allSettled([
        api.get('/api/merchant/inventory', { token }),
        api.get('/api/merchant/invoices', { token }),
      ]);

      if (invRes.status === 'fulfilled' && invRes.value?.items) {
        setItems(invRes.value.items);
        await setCache('merchant_inventory', invRes.value.items);
      }
      if (invoicesRes.status === 'fulfilled' && invoicesRes.value?.invoices) {
        setInvoices(invoicesRes.value.invoices);
        await setCache('invoices_list', invoicesRes.value.invoices);
      }
    } catch (err) {
      console.warn('Inventory fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const getProductMetrics = useMemo(() => {
    const soldMap: Record<string, number> = {};
    invoices.forEach((inv) => {
      (inv.items || []).forEach((it: any) => {
        const key = (it.description || it.name || '').toLowerCase().trim();
        if (key) {
          soldMap[key] = (soldMap[key] || 0) + Number(it.qty || 1);
        }
      });
    });

    return (productName: string) => {
      const key = (productName || '').toLowerCase().trim();
      const totalSold = soldMap[key] || 0;
      return {
        totalSold,
        isTopSelling: totalSold >= 5,
      };
    };
  }, [invoices]);

  const filtered = useMemo(() => {
    return items.filter((p) => {
      const stock = Number(p.stock_quantity ?? p.stock ?? 0);
      const isOut = stock <= 0;
      const isReorder = stock > 0 && stock <= 9;
      const isLow = stock > 9 && stock <= 39;
      const isInStock = stock >= 40;

      const matchesFilter =
        filter === 'all' ? true :
        filter === 'In Stock' ? isInStock :
        filter === 'Low Stock' ? isLow :
        filter === 'Reorder Soon' ? isReorder :
        filter === 'Out of Stock' ? isOut :
        true;

      const q = searchQuery.toLowerCase().trim();
      const pName = (p.product_name || p.name || '').toLowerCase();
      const pHsn = (p.hsn || '').toLowerCase();
      const matchesSearch = !q || pName.includes(q) || pHsn.includes(q);

      return matchesFilter && matchesSearch;
    });
  }, [items, filter, searchQuery]);

  const counts = useMemo(() => {
    return {
      total: items.length,
      inStock: items.filter((p) => Number(p.stock_quantity ?? p.stock ?? 0) >= 40).length,
      lowStock: items.filter((p) => {
        const s = Number(p.stock_quantity ?? p.stock ?? 0);
        return s > 0 && s <= 39;
      }).length,
      outOfStock: items.filter((p) => Number(p.stock_quantity ?? p.stock ?? 0) <= 0).length,
    };
  }, [items]);

  const handleOpenAdd = () => {
    setIsEditing(false);
    setEditId(null);
    setAddName('');
    setAddDescription('');
    setAddHsn('8528');
    setAddSellingPrice('');
    setAddCostPrice('');
    setAddStock('10');
    setAddGstRate(18);
    setAddUnit('pcs');
    setShowAddModal(true);
  };

  const handleOpenEdit = (item: any) => {
    setSelected(null);
    setIsEditing(true);
    setEditId(item.id);
    setAddName(item.product_name || item.name || '');
    setAddDescription(item.description || '');
    setAddHsn(item.hsn || '8528');
    setAddSellingPrice(String(item.selling_price || item.sellingPrice || item.rate || ''));
    setAddCostPrice(String(item.cost_price || item.costPrice || ''));
    setAddStock(String(item.stock_quantity ?? item.stock ?? '0'));
    setAddGstRate(Number(item.gst_rate ?? item.gstRate ?? 18));
    setAddUnit(item.unit || 'pcs');
    setShowAddModal(true);
  };

  const handleDeleteItem = async (item: any) => {
    Alert.alert(
      'Delete Product?',
      `Are you sure you want to delete "${item.product_name || item.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updated = items.filter((i) => i.id !== item.id);
            setItems(updated);
            await setCache('merchant_inventory', updated);
            setSelected(null);
            if (token && item.id) {
              try {
                await api.delete(`/api/merchant/inventory/${item.id}`, { token });
              } catch (e) {}
            }
          },
        },
      ]
    );
  };

  const handleSaveItem = async () => {
    if (!addName.trim()) {
      Alert.alert('Required', 'Please enter item name.');
      return;
    }
    const sp = parseFloat(addSellingPrice) || 0;
    if (sp <= 0) {
      Alert.alert('Required', 'Please enter a valid selling price (> 0).');
      return;
    }
    if (!token) return;
    setAddLoading(true);

    try {
      const payload = {
        product_name: addName.trim(),
        name: addName.trim(),
        description: addDescription.trim(),
        hsn: addHsn.trim() || '8528',
        selling_price: sp,
        cost_price: parseFloat(addCostPrice) || 0,
        stock_quantity: parseFloat(addStock) || 0,
        stock: parseFloat(addStock) || 0,
        gst_rate: addGstRate,
        unit: addUnit,
      };

      if (isEditing && editId) {
        const updated = items.map((i) => (i.id === editId ? { ...i, ...payload } : i));
        setItems(updated);
        await setCache('merchant_inventory', updated);
        try {
          await api.patch(`/api/merchant/inventory/${editId}`, payload, { token });
        } catch (e) {}
      } else {
        const res = await api.post('/api/merchant/inventory', payload, { token });
        const newItem = (res && res.item) || { ...payload, id: `inv_${Date.now()}` };
        const updated = [newItem, ...items];
        setItems(updated);
        await setCache('merchant_inventory', updated);
      }
      setShowAddModal(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save item.');
    } finally {
      setAddLoading(false);
    }
  };

  const renderProduct = ({ item }: { item: any }) => {
    const stock = Number(item.stock_quantity ?? item.stock ?? 0);
    const isOut = stock <= 0;
    const isReorder = stock > 0 && stock <= 9;
    const isLow = stock > 9 && stock <= 39;
    const pName = item.product_name || item.name || 'Unnamed Product';
    const sellingPrice = Number(item.selling_price ?? item.sellingPrice ?? item.rate ?? 0);
    const costPrice = Number(item.cost_price ?? item.costPrice ?? 0);
    const gst = Number(item.gst_rate ?? item.gstRate ?? 18);
    const metrics = getProductMetrics(pName);

    const getBadgeInfo = () => {
      if (isOut) return { text: 'OUT OF STOCK', bg: 'rgba(239,68,68,0.15)', border: '#ef4444', color: '#f87171', dot: '#ef4444' };
      if (isReorder) return { text: `REORDER (${stock})`, bg: 'rgba(244,63,94,0.15)', border: '#f43f5e', color: '#fb7185', dot: '#f43f5e' };
      if (isLow) return { text: `LOW STOCK (${stock})`, bg: 'rgba(251,146,60,0.15)', border: '#fb923c', color: '#fdba74', dot: '#fb923c' };
      return { text: `IN STOCK (${stock})`, bg: 'rgba(34,197,94,0.15)', border: '#22c55e', color: '#4ade80', dot: '#22c55e' };
    };

    const badge = getBadgeInfo();

    return (
      <Card style={st.prodCard} onPress={() => setSelected(item)}>
        <View style={st.prodHeader}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={st.prodName} numberOfLines={1}>{pName}</Text>
              {metrics.isTopSelling && (
                <View style={st.topSellingBadge}>
                  <MaterialIcons name="stars" size={12} color="#f59e0b" />
                  <Text style={st.topSellingText}>Top Seller</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
              <View style={st.hsnChip}>
                <Text style={st.hsnText}>HSN: {item.hsn || '8528'}</Text>
              </View>
              <View style={st.gstChip}>
                <Text style={st.gstText}>GST {gst}%</Text>
              </View>
            </View>
          </View>
          <View style={[st.stockBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
            <View style={[st.stockDot, { backgroundColor: badge.dot }]} />
            <Text style={[st.stockBadgeText, { color: badge.color }]}>{badge.text}</Text>
          </View>
        </View>

        <View style={st.infoBox}>
          <View style={st.infoCol}>
            <Text style={st.infoLabel}>SELLING PRICE</Text>
            <Text style={st.infoPriceVal}>{formatCurrency(sellingPrice)}</Text>
          </View>
          <View style={st.infoCol}>
            <Text style={st.infoLabel}>STOCK QUANTITY</Text>
            <Text style={[st.infoStockVal, (isLow || isReorder || isOut) && { color: badge.color }]}>
              {stock} <Text style={{ fontSize: 12, fontWeight: '500', color: Theme.onSurfaceDisabled }}>{item.unit || 'pcs'}</Text>
            </Text>
          </View>
        </View>

        <View style={st.prodFooter}>
          <View style={st.prodStat}>
            <Text style={st.prodStatL}>Cost Price</Text>
            <Text style={st.prodStatV}>{costPrice > 0 ? formatCurrency(costPrice) : '₹0'}</Text>
          </View>
          <View style={st.prodStat}>
            <Text style={st.prodStatL}>Total Sold</Text>
            <Text style={[st.prodStatV, { color: Theme.primary }]}>{metrics.totalSold} {item.unit || 'pcs'}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable style={st.iconActionBtn} onPress={() => handleOpenEdit(item)} hitSlop={8}>
              <MaterialIcons name="edit" size={17} color={Theme.primary} />
            </Pressable>
            <Pressable style={[st.iconActionBtn, { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)' }]} onPress={() => handleDeleteItem(item)} hitSlop={8}>
              <MaterialIcons name="delete-outline" size={17} color={Theme.error} />
            </Pressable>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <View style={st.container}>
      <TopAppBar
        title="Inventory Stock"
        onBack={() => navigation?.goBack?.()}
        actions={
          <Pressable onPress={loadData} hitSlop={8} style={{ padding: 8, marginRight: 4 }}>
            <Ionicons name="refresh" size={20} color={Theme.primary} />
          </Pressable>
        }
      />

      {/* 4 Summary KPI Tiles in a responsive 2x2 Grid */}
      <View style={st.kpiGrid}>
        <View style={st.kpiCard}>
          <View style={[st.kpiIconBox, { backgroundColor: 'rgba(56,224,200,0.12)' }]}>
            <Ionicons name="cube-outline" size={18} color={Theme.primary} />
          </View>
          <View>
            <Text style={st.kpiVal}>{counts.total}</Text>
            <Text style={st.kpiLabel}>Total Products</Text>
          </View>
        </View>

        <View style={st.kpiCard}>
          <View style={[st.kpiIconBox, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color={Theme.success} />
          </View>
          <View>
            <Text style={[st.kpiVal, { color: Theme.success }]}>{counts.inStock}</Text>
            <Text style={st.kpiLabel}>In Stock (≥40)</Text>
          </View>
        </View>

        <View style={st.kpiCard}>
          <View style={[st.kpiIconBox, { backgroundColor: 'rgba(251,146,60,0.12)' }]}>
            <Ionicons name="alert-circle-outline" size={18} color="#fb923c" />
          </View>
          <View>
            <Text style={[st.kpiVal, { color: '#fb923c' }]}>{counts.lowStock}</Text>
            <Text style={st.kpiLabel}>Low Stock (≤39)</Text>
          </View>
        </View>

        <View style={st.kpiCard}>
          <View style={[st.kpiIconBox, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
            <Ionicons name="close-circle-outline" size={18} color={Theme.error} />
          </View>
          <View>
            <Text style={[st.kpiVal, { color: Theme.error }]}>{counts.outOfStock}</Text>
            <Text style={st.kpiLabel}>Out of Stock</Text>
          </View>
        </View>
      </View>

      {/* Search Bar */}
      <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search inventory by name, HSN..."
        />
      </View>

      {/* Filter Horizontal Scroll */}
      <View style={{ marginBottom: 8 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {filters.map((f) => (
            <FilterChip
              key={f}
              label={f === 'all' ? 'All Products' : f}
              selected={filter === f}
              onPress={() => setFilter(f)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Products FlatList */}
      <FlatList
        data={filtered}
        renderItem={renderProduct}
        keyExtractor={(i) => String(i.id || Math.random())}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={loadData}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={
          <View style={st.emptyBox}>
            <MaterialIcons name="inventory" size={48} color={Theme.onSurfaceDisabled} />
            <Text style={st.emptyTitle}>No Products Found</Text>
            <Text style={st.emptySub}>Add products to track warehouse stock and sell online.</Text>
          </View>
        }
      />

      {/* FAB (Single clean label) */}
      <View style={st.fabContainer}>
        <FAB icon="add" extended label="Add Product" onPress={handleOpenAdd} />
      </View>

      {/* Detail Bottom Sheet */}
      <BottomSheet visible={!!selected} onDismiss={() => setSelected(null)} title="Product Stock Details">
        {selected && (
          <View>
            <View style={st.detailTop}>
              <View style={[st.detailIcon, { backgroundColor: Theme.primaryContainer }]}>
                <MaterialIcons name="inventory-2" size={32} color={Theme.primary} />
              </View>
              <Text style={st.detailName}>{selected.product_name || selected.name}</Text>
              <Text style={st.detailSku}>HSN: {selected.hsn || '-'} · GST: {selected.gst_rate || selected.gstRate || 18}%</Text>
              {selected.description ? (
                <Text style={{ color: Theme.onSurfaceVariant, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                  {selected.description}
                </Text>
              ) : null}
            </View>

            <View style={st.detailGrid}>
              <View style={st.detailCell}>
                <Text style={st.cellL}>Selling Price</Text>
                <Text style={[st.cellV, { color: Theme.tertiary }]}>{formatCurrency(selected.selling_price || selected.sellingPrice || selected.rate || 0)}</Text>
              </View>
              <View style={st.detailCell}>
                <Text style={st.cellL}>Cost Price</Text>
                <Text style={st.cellV}>{formatCurrency(selected.cost_price || selected.costPrice || 0)}</Text>
              </View>
              <View style={st.detailCell}>
                <Text style={st.cellL}>Current Stock</Text>
                <Text style={st.cellV}>{selected.stock_quantity ?? selected.stock ?? 0} {selected.unit || 'pcs'}</Text>
              </View>
              <View style={st.detailCell}>
                <Text style={st.cellL}>GST Slab</Text>
                <Text style={st.cellV}>{selected.gst_rate || selected.gstRate || 18}%</Text>
              </View>
            </View>
          </View>
        )}
      </BottomSheet>

      {/* Add / Edit Modal */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={st.modalOverlay}
        >
          <View style={st.modalCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={st.modalTitle}>{isEditing ? 'Edit Product Details' : 'Add Store Inventory Item'}</Text>
              <Pressable onPress={() => setShowAddModal(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={Theme.onSurfaceDisabled} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 480 }}
            >
              <InputField label="Product / Item Name *" placeholder="e.g. Samsung 43 Inch TV" value={addName} onChangeText={setAddName} />
              {(() => {
                const sug = suggestHsn(addName);
                if (!sug || (addHsn === sug.hsn && addGstRate === sug.gstRate)) return null;
                return (
                  <View style={{ marginBottom: 10, marginTop: -4 }}>
                    <HsnSuggestChip suggestedHsn={sug.hsn} suggestedGst={sug.gstRate} onApply={() => { setAddHsn(sug.hsn); setAddGstRate(sug.gstRate); }} />
                  </View>
                );
              })()}
              <InputField label="Description / Category" placeholder="Short item details..." value={addDescription} onChangeText={setAddDescription} />
              <InputField label="HSN Code *" placeholder="e.g. 8528" value={addHsn} onChangeText={setAddHsn} keyboardType="number-pad" />
              <Text style={{ color: Theme.onSurfaceDisabled, fontSize: 11, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' }}>Unit of Measure</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {UNITS.map((u) => (
                  <Pressable key={u} onPress={() => setAddUnit(u)} style={[st.unitChip, addUnit === u && st.unitChipActive]}>
                    <Text style={[st.unitChipText, addUnit === u && st.unitChipTextActive]}>{u.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <InputField label="Selling Price (₹) *" placeholder="0.00" value={addSellingPrice} onChangeText={setAddSellingPrice} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <InputField label="Cost Price (₹)" placeholder="0.00" value={addCostPrice} onChangeText={setAddCostPrice} keyboardType="numeric" />
                </View>
              </View>
              <InputField label="Stock Quantity *" placeholder="10" value={addStock} onChangeText={setAddStock} keyboardType="numeric" />
              <Text style={{ color: Theme.onSurfaceDisabled, fontSize: 11, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' }}>GST Slab Rate</Text>
              <GstRateSelector value={addGstRate} onChange={setAddGstRate} />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, marginBottom: 10 }}>
                <OutlineButton title="Cancel" onPress={() => setShowAddModal(false)} style={{ flex: 1 }} />
                <GradientButton title={addLoading ? 'Saving...' : isEditing ? 'Update Product' : 'Add Product'} onPress={handleSaveItem} disabled={addLoading} style={{ flex: 1.5 }} />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },

  // KPI Grid (2x2)
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  kpiCard: { width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Theme.surface2, borderRadius: Theme.shapeMd, padding: 10, borderWidth: 1, borderColor: Theme.outlineVariant },
  kpiIconBox: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  kpiVal: { color: Theme.onSurface, fontSize: 15, fontWeight: '800' },
  kpiLabel: { color: Theme.onSurfaceDisabled, fontSize: 10, fontWeight: '600', marginTop: 1 },

  // Product Card
  prodCard: { padding: 14, backgroundColor: Theme.surface2, borderRadius: Theme.shapeLg, borderWidth: 1, borderColor: Theme.outlineVariant },
  prodHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  prodName: { color: '#fff', fontSize: 15, fontWeight: '800' },
  topSellingBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  topSellingText: { color: '#f59e0b', fontSize: 9, fontWeight: '700' },
  hsnChip: { backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  hsnText: { color: Theme.onSurfaceVariant, fontSize: 10, fontFamily: 'monospace' },
  gstChip: { backgroundColor: 'rgba(2,132,199,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(2,132,199,0.3)' },
  gstText: { color: '#38bdf8', fontSize: 10, fontWeight: '700' },
  stockBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  stockDot: { width: 6, height: 6, borderRadius: 3 },
  stockBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  infoBox: { flexDirection: 'row', backgroundColor: Theme.surface3, borderRadius: 10, padding: 10, marginTop: 10, borderWidth: 1, borderColor: Theme.outlineVariant },
  infoCol: { flex: 1 },
  infoLabel: { color: Theme.onSurfaceDisabled, fontSize: 9, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  infoPriceVal: { color: Theme.tertiary, fontSize: 17, fontWeight: '800' },
  infoStockVal: { color: '#fff', fontSize: 17, fontWeight: '800' },
  prodFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: Theme.outlineVariant },
  prodStat: { alignItems: 'flex-start' },
  prodStatL: { color: Theme.onSurfaceDisabled, fontSize: 9, fontWeight: '600' },
  prodStatV: { color: Theme.onSurface, fontSize: 12, fontWeight: '700', marginTop: 1 },
  iconActionBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: Theme.surface3, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.outlineVariant },

  unitChip: { backgroundColor: Theme.surface3, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginRight: 6, borderWidth: 1, borderColor: Theme.outlineVariant },
  unitChipActive: { backgroundColor: 'rgba(0,212,170,0.15)', borderColor: Theme.primary },
  unitChipText: { color: Theme.onSurfaceVariant, fontSize: 11, fontWeight: '600' },
  unitChipTextActive: { color: Theme.primary, fontWeight: '800' },

  fabContainer: { position: 'absolute', bottom: 16, right: 16 },
  emptyBox: { padding: 48, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: Theme.onSurface, fontSize: 16, fontWeight: '700', marginTop: 12 },
  emptySub: { color: Theme.onSurfaceDisabled, fontSize: 12, textAlign: 'center', marginTop: 6 },

  detailTop: { alignItems: 'center', marginBottom: 16 },
  detailIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  detailName: { color: Theme.onSurface, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  detailSku: { color: Theme.onSurfaceDisabled, fontSize: 12, marginTop: 2 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailCell: { width: '48%', backgroundColor: Theme.surface3, padding: 12, borderRadius: Theme.shapeSm },
  cellL: { color: Theme.onSurfaceDisabled, fontSize: 11 },
  cellV: { color: Theme.onSurface, fontSize: 14, fontWeight: '700', marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: Theme.surface2, borderRadius: Theme.shapeXl, padding: 20, borderWidth: 1, borderColor: Theme.outline },
  modalTitle: { color: Theme.onSurface, fontSize: 16, fontWeight: '700' },
});

