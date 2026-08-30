import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert,
  ActivityIndicator, Image, Modal, TextInput,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Theme } from '../lib/theme';
import {
  Card, GradientButton, OutlineButton, SectionHeader, Divider,
  formatCurrency, TopAppBar, Snackbar, InputField, StatusBadge,
} from '../components/DesignSystem';
import { useMerchant } from '../lib/MerchantContext';
import { api } from '../lib/apiClient';
import { getCache, setCache } from '../lib/offlineCache';

export interface PurchaseItem {
  id?: string;
  name: string;
  description?: string;
  hsn: string;
  qty: number;
  unit?: string;
  rate: number;
  gstRate: number;
  amount: number;
}

export interface PurchaseInvoice {
  id?: string;
  supplier_name?: string;
  supplierName?: string;
  supplier_gstin?: string;
  supplierGstin?: string;
  bill_number?: string;
  billNumber?: string;
  bill_date?: string;
  billDate?: string;
  total_amount?: number;
  totalAmount?: number;
  total_tax?: number;
  totalTax?: number;
  items?: PurchaseItem[];
  created_at?: number;
}

export default function PurchaseBillsScreen({ navigation }: { navigation: any }) {
  const { token, merchant } = useMerchant();
  const [ocrStep, setOcrStep] = useState<'upload' | 'manual_add' | 'review'>('upload');
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form / OCR Parsed State
  const [supplierName, setSupplierName] = useState('');
  const [supplierGstin, setSupplierGstin] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [totalTax, setTotalTax] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarText, setSnackbarText] = useState('');

  const notify = (msg: string) => {
    setSnackbarText(msg);
    setShowSnackbar(true);
    setTimeout(() => setShowSnackbar(false), 3500);
  };

  const loadPurchases = async () => {
    const cached = await getCache<PurchaseInvoice[]>('merchant_purchases');
    if (cached) setPurchases(cached);

    if (!token) return;
    setLoading(true);

    try {
      const res = await api.get('/api/merchant/purchases', { token });
      if (res && res.purchases) {
        setPurchases(res.purchases);
        await setCache('merchant_purchases', res.purchases);
      }
    } catch (err) {
      console.warn('Purchases fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPurchases();
  }, [token]);

  // Real Camera Capture & OCR
  const handleScanWithCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera permission is required to scan purchase bills.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setSelectedImageUri(asset.uri);
        if (asset.base64) {
          await runOcr(`data:image/jpeg;base64,${asset.base64}`);
        }
      }
    } catch (err: any) {
      Alert.alert('Camera Error', err.message || 'Could not open camera.');
    }
  };

  // Gallery Picker & OCR
  const handlePickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setSelectedImageUri(asset.uri);
        if (asset.base64) {
          await runOcr(`data:image/jpeg;base64,${asset.base64}`);
        }
      }
    } catch (err: any) {
      Alert.alert('Gallery Error', err.message || 'Could not pick image.');
    }
  };

  const runOcr = async (dataUrl: string) => {
    if (!token) return;
    setScanning(true);
    try {
      const res = await api.post('/api/merchant/purchases/upload-ocr', {
        dataUrl,
        filename: 'bill_scan.jpg',
      }, { token });

      if (res && res.parsed) {
        const p = res.parsed;
        setSupplierName(p.supplierName || p.supplier_name || '');
        setSupplierGstin(p.supplierGstin || p.supplier_gstin || '');
        setBillNumber(p.billNumber || p.bill_number || '');
        setBillDate(p.billDate || p.bill_date || new Date().toISOString().split('T')[0]);
        setTotalAmount(String(p.totalAmount || p.total_amount || ''));
        setTotalTax(String(p.totalTax || p.total_tax || ''));

        const parsedItems: PurchaseItem[] = (p.items || []).map((it: any) => ({
          name: it.name || it.description || 'Item',
          hsn: it.hsn || '9983',
          qty: Number(it.qty) || 1,
          unit: it.unit || 'pcs',
          rate: Number(it.rate) || 0,
          gstRate: Number(it.gstRate || it.gst_rate) || 18,
          amount: Number(it.amount) || ((Number(it.qty) || 1) * (Number(it.rate) || 0)),
        }));

        setItems(parsedItems.length > 0 ? parsedItems : [
          { name: 'Wholesale Stock Item', hsn: '9983', qty: 10, unit: 'pcs', rate: 100, gstRate: 18, amount: 1000 },
        ]);

        setOcrStep('review');
        notify('OCR Scanned Bill Successfully! Review line items below.');
      } else {
        setOcrStep('manual_add');
        notify('OCR scan finished. Please verify fields manually.');
      }
    } catch (err: any) {
      setOcrStep('manual_add');
      notify('Could not auto-extract fields. Please fill manually.');
    } finally {
      setScanning(false);
    }
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { name: '', hsn: '9983', qty: 1, unit: 'pcs', rate: 0, gstRate: 18, amount: 0 },
    ]);
  };

  const handleUpdateItem = (index: number, patch: Partial<PurchaseItem>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const updated = { ...it, ...patch };
        updated.amount = (updated.qty || 1) * (updated.rate || 0);
        return updated;
      })
    );
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Real Save & Stock Replenishment
  const handleConfirmPurchase = async () => {
    if (!supplierName.trim() || !billNumber.trim()) {
      Alert.alert('Required Fields', 'Please enter supplier name and bill number.');
      return;
    }
    if (!token) return;
    setSaving(true);

    try {
      const parsedTotal = parseFloat(totalAmount) || items.reduce((s, it) => s + it.amount * (1 + it.gstRate / 100), 0);
      const parsedTax = parseFloat(totalTax) || items.reduce((s, it) => s + (it.amount * it.gstRate) / 100, 0);

      const payload = {
        supplier_name: supplierName.trim(),
        supplierName: supplierName.trim(),
        supplier_gstin: supplierGstin.trim().toUpperCase() || undefined,
        supplierGstin: supplierGstin.trim().toUpperCase() || undefined,
        bill_number: billNumber.trim(),
        billNumber: billNumber.trim(),
        bill_date: billDate || new Date().toISOString().split('T')[0],
        billDate: billDate || new Date().toISOString().split('T')[0],
        total_amount: parsedTotal,
        totalAmount: parsedTotal,
        total_tax: parsedTax,
        totalTax: parsedTax,
        items: items.map((it) => ({
          name: it.name.trim() || 'Merchandise Item',
          description: it.name.trim() || 'Merchandise Item',
          hsn: it.hsn || '9983',
          qty: Number(it.qty) || 1,
          unit: it.unit || 'pcs',
          rate: Number(it.rate) || 0,
          gstRate: Number(it.gstRate) || 18,
          amount: Number(it.amount) || 0,
        })),
        allowDuplicate: true,
      };

      // Call Backend API
      const res = await api.post('/api/merchant/purchases', payload, { token });

      // Update Local Inventory Stock
      const cachedInventory = (await getCache<any[]>('merchant_inventory')) || [];
      const updatedInventory = [...cachedInventory];

      items.forEach((purchaseItem) => {
        const existingIdx = updatedInventory.findIndex(
          (inv) => (inv.product_name || inv.name || '').toLowerCase() === purchaseItem.name.toLowerCase()
        );
        if (existingIdx >= 0) {
          const current = updatedInventory[existingIdx].stock_quantity ?? updatedInventory[existingIdx].stock ?? 0;
          const newQty = current + purchaseItem.qty;
          updatedInventory[existingIdx] = {
            ...updatedInventory[existingIdx],
            stock_quantity: newQty,
            stock: newQty,
          };
        } else if (purchaseItem.name.trim()) {
          updatedInventory.unshift({
            id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            product_name: purchaseItem.name.trim(),
            name: purchaseItem.name.trim(),
            hsn: purchaseItem.hsn || '9983',
            selling_price: Math.round(purchaseItem.rate * 1.3),
            cost_price: purchaseItem.rate,
            stock_quantity: purchaseItem.qty,
            stock: purchaseItem.qty,
            gst_rate: purchaseItem.gstRate || 18,
            unit: purchaseItem.unit || 'pcs',
            created_at: Date.now(),
          });
        }
      });

      await setCache('merchant_inventory', updatedInventory);

      // Refresh list
      const savedPurchase = (res && res.purchase) || payload;
      const updatedPurchases = [savedPurchase, ...purchases];
      setPurchases(updatedPurchases);
      await setCache('merchant_purchases', updatedPurchases);

      setOcrStep('upload');
      setSupplierName('');
      setSupplierGstin('');
      setBillNumber('');
      setTotalAmount('');
      setTotalTax('');
      setItems([]);
      setSelectedImageUri(null);

      notify(`Purchase Bill saved! Stock of ${items.length} item(s) replenished & ITC recorded 🟢`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not confirm purchase bill.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={st.container}>
      <TopAppBar title="Purchase Bills & ITC" onBack={() => navigation?.goBack?.()} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      >
        {ocrStep === 'upload' && (
          <>
            {/* OCR Scan Upload Box */}
            <View style={st.uploadArea}>
              <View style={st.uploadIcon}>
                <MaterialIcons name="photo-camera" size={36} color={Theme.primary} />
              </View>
              <Text style={st.uploadTitle}>Scan Supplier Purchase Bill</Text>
              <Text style={st.uploadSub}>
                Capture wholesale invoice to auto-extract line items, claim Input Tax Credit (ITC) & replenish inventory stock.
              </Text>
              {scanning ? (
                <View style={{ alignItems: 'center', marginVertical: 14 }}>
                  <ActivityIndicator size="large" color={Theme.primary} />
                  <Text style={{ color: Theme.primary, marginTop: 8, fontWeight: '700' }}>
                    Google Cloud Vision OCR Extracting Bill Items...
                  </Text>
                </View>
              ) : (
                <View style={st.uploadBtns}>
                  <OutlineButton
                    title="Camera Scan"
                    icon="camera-outline"
                    size="sm"
                    onPress={handleScanWithCamera}
                  />
                  <OutlineButton
                    title="Pick Image"
                    icon="image-outline"
                    size="sm"
                    onPress={handlePickFromGallery}
                  />
                  <GradientButton
                    title="Manual Add"
                    icon="create-outline"
                    size="sm"
                    onPress={() => {
                      setItems([{ name: '', hsn: '9983', qty: 1, unit: 'pcs', rate: 0, gstRate: 18, amount: 0 }]);
                      setOcrStep('manual_add');
                    }}
                  />
                </View>
              )}
            </View>

            {/* Sync Chain Explainer Banner */}
            <View style={st.chainBanner}>
              <Text style={st.chainTitle}>🔄 Automated Stock Inward & Tax Accounting</Text>
              <Text style={st.chainSub}>
                Supplier Invoice ➔ OCR Line Items ➔ Inventory Stock Replenishment ➔ ITC GSTR-3B Offset
              </Text>
            </View>

            <SectionHeader title="Recorded Supplier Invoices" />
            {purchases.length === 0 ? (
              <View style={st.emptyCard}>
                <MaterialIcons name="receipt-long" size={40} color={Theme.onSurfaceDisabled} />
                <Text style={{ color: Theme.onSurface, fontSize: 14, fontWeight: '700', marginTop: 8 }}>
                  No Purchase Bills Recorded
                </Text>
                <Text style={{ color: Theme.onSurfaceDisabled, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                  Scan supplier bills to track your expenses and claim GST Input Tax Credit.
                </Text>
              </View>
            ) : (
              purchases.map((p: any, i: number) => {
                const sName = p.supplier_name || p.supplierName || 'Wholesale Supplier';
                const bNum = p.bill_number || p.billNumber || 'SW-0000';
                const gstin = p.supplier_gstin || p.supplierGstin || 'Unregistered';
                const amt = p.total_amount || p.totalAmount || 0;
                const itemCount = (p.items || []).length;

                return (
                  <Card key={p.id || i} style={st.billCard}>
                    <View style={st.billRow}>
                      <View style={st.billIcon}>
                        <MaterialIcons name="receipt-long" size={22} color={Theme.secondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={st.billSupplier}>{sName}</Text>
                        <Text style={st.billMeta}>
                          Bill: {bNum} · GSTIN: {gstin} {itemCount > 0 ? `· ${itemCount} items` : ''}
                        </Text>
                      </View>
                      <Text style={st.billAmt}>{formatCurrency(amt)}</Text>
                    </View>
                  </Card>
                );
              })
            )}
          </>
        )}

        {(ocrStep === 'manual_add' || ocrStep === 'review') && (
          <Card style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: Theme.onSurface, fontSize: 16, fontWeight: '700' }}>
                {ocrStep === 'review' ? 'Review Extracted Bill & Items' : 'Record Supplier Purchase Bill'}
              </Text>
              {ocrStep === 'review' && (
                <View style={{ backgroundColor: Theme.successContainer, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                  <Text style={{ color: Theme.success, fontSize: 10, fontWeight: '700' }}>OCR EXTRACTED</Text>
                </View>
              )}
            </View>

            <InputField
              label="Supplier / Vendor Name *"
              placeholder="e.g. Sharma Wholesale Pvt Ltd"
              value={supplierName}
              onChangeText={setSupplierName}
              icon="storefront-outline"
            />
            <InputField
              label="Supplier GSTIN (For ITC Claim)"
              placeholder="e.g. 27AAPFU0939F1ZV"
              value={supplierGstin}
              onChangeText={setSupplierGstin}
              icon="document-text-outline"
              autoCapitalize="characters"
            />
            <InputField
              label="Bill / Invoice Number *"
              placeholder="e.g. SW-2024-5678"
              value={billNumber}
              onChangeText={setBillNumber}
              icon="receipt-outline"
            />

            {/* Line Items Section */}
            <View style={{ marginVertical: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ color: Theme.onSurface, fontSize: 13, fontWeight: '700' }}>
                  PURCHASE LINE ITEMS (FOR INVENTORY STOCK)
                </Text>
                <Pressable onPress={handleAddItem} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="add-circle" size={16} color={Theme.primary} />
                  <Text style={{ color: Theme.primary, fontSize: 12, fontWeight: '700' }}>Add Item</Text>
                </Pressable>
              </View>

              {items.map((item, idx) => (
                <View key={idx} style={st.itemBox}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ color: Theme.primary, fontSize: 12, fontWeight: '700' }}>Item #{idx + 1}</Text>
                    <Pressable onPress={() => handleRemoveItem(idx)}>
                      <MaterialIcons name="delete-outline" size={18} color={Theme.error} />
                    </Pressable>
                  </View>
                  <TextInput
                    style={st.itemInput}
                    placeholder="Product Name (e.g. Basmati Rice 5kg)"
                    placeholderTextColor={Theme.onSurfaceDisabled}
                    value={item.name}
                    onChangeText={(t) => handleUpdateItem(idx, { name: t })}
                  />
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.fieldLabel}>HSN</Text>
                      <TextInput
                        style={st.gridInput}
                        placeholder="HSN"
                        placeholderTextColor={Theme.onSurfaceDisabled}
                        value={item.hsn}
                        onChangeText={(t) => handleUpdateItem(idx, { hsn: t })}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.fieldLabel}>Inward Qty</Text>
                      <TextInput
                        style={st.gridInput}
                        placeholder="Qty"
                        placeholderTextColor={Theme.onSurfaceDisabled}
                        value={String(item.qty || '')}
                        onChangeText={(t) => handleUpdateItem(idx, { qty: parseFloat(t) || 0 })}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.fieldLabel}>Cost Rate (₹)</Text>
                      <TextInput
                        style={st.gridInput}
                        placeholder="Rate"
                        placeholderTextColor={Theme.onSurfaceDisabled}
                        value={String(item.rate || '')}
                        onChangeText={(t) => handleUpdateItem(idx, { rate: parseFloat(t) || 0 })}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.fieldLabel}>GST %</Text>
                      <TextInput
                        style={st.gridInput}
                        placeholder="GST"
                        placeholderTextColor={Theme.onSurfaceDisabled}
                        value={String(item.gstRate || '')}
                        onChangeText={(t) => handleUpdateItem(idx, { gstRate: parseFloat(t) || 0 })}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <InputField
                  label="Total Bill Amount (₹) *"
                  placeholder="0.00"
                  value={totalAmount}
                  onChangeText={setTotalAmount}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <InputField
                  label="GST Tax Amount (₹)"
                  placeholder="0.00"
                  value={totalTax}
                  onChangeText={setTotalTax}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <OutlineButton
                title="Cancel"
                onPress={() => {
                  setOcrStep('upload');
                  setSelectedImageUri(null);
                }}
                style={{ flex: 1 }}
              />
              <GradientButton
                title={saving ? 'Replenishing Stock...' : 'Confirm & Inward Stock'}
                onPress={handleConfirmPurchase}
                disabled={saving}
                style={{ flex: 1.6 }}
              />
            </View>
          </Card>
        )}
      </ScrollView>

      <Snackbar visible={showSnackbar} message={snackbarText} />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },
  uploadArea: { backgroundColor: Theme.surface2, borderRadius: Theme.shapeLg, padding: 24, alignItems: 'center', borderWidth: 2, borderColor: 'rgba(0,212,170,0.3)', borderStyle: 'dashed' },
  uploadIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: Theme.primaryContainer, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  uploadTitle: { color: Theme.onSurface, fontSize: 16, fontWeight: '700' },
  uploadSub: { color: Theme.onSurfaceVariant, fontSize: 12, textAlign: 'center', marginTop: 4, lineHeight: 18, paddingHorizontal: 16 },
  uploadBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16, justifyContent: 'center' },
  chainBanner: { marginVertical: 16, padding: 14, backgroundColor: Theme.surface2, borderRadius: Theme.shapeMd, borderWidth: 1, borderColor: Theme.outlineVariant },
  chainTitle: { color: Theme.primary, fontSize: 13, fontWeight: '700' },
  chainSub: { color: Theme.onSurfaceVariant, fontSize: 11, marginTop: 4, lineHeight: 16 },
  emptyCard: { padding: 32, alignItems: 'center', justifyContent: 'center' },
  billCard: { marginBottom: 10, padding: 14, backgroundColor: Theme.surface2 },
  billRow: { flexDirection: 'row', alignItems: 'center' },
  billIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: Theme.secondaryContainer, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  billSupplier: { color: Theme.onSurface, fontSize: 14, fontWeight: '600' },
  billMeta: { color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 2 },
  billAmt: { color: Theme.onSurface, fontSize: 15, fontWeight: '700' },
  itemBox: { backgroundColor: Theme.surface3, borderRadius: 8, padding: 10, marginBottom: 8 },
  itemInput: { backgroundColor: Theme.surface2, color: Theme.onSurface, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, borderWidth: 1, borderColor: Theme.outlineVariant },
  fieldLabel: { color: Theme.onSurfaceDisabled, fontSize: 9, fontWeight: '700', marginBottom: 2 },
  gridInput: { backgroundColor: Theme.surface2, color: Theme.onSurface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, borderWidth: 1, borderColor: Theme.outlineVariant, textAlign: 'center' },
});
