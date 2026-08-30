import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  Platform, Share, Alert, ActivityIndicator, FlatList,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Theme } from '../lib/theme';
import {
  Card, InputField, SearchBar, GradientButton, OutlineButton, FilledButton,
  Avatar, SectionHeader, formatCurrency, Divider, TopAppBar,
  PlaceOfSupplyBanner, GstRateSelector, PaymentModePicker, HsnSuggestChip,
} from '../components/DesignSystem';
import { useMerchant } from '../lib/MerchantContext';
import { api } from '../lib/apiClient';
import { computeInvoice, resolveSupply, nextInvoiceNumber, INDIAN_STATES } from '../lib/gstEngine';
import { suggestHsn } from '../lib/hsnAi';
import { getCache, setCache } from '../lib/offlineCache';
import { shareInvoicePdf, printInvoicePdf } from '../lib/invoicePdfBuilder';

export interface InvoiceCreateItem {
  id?: string;
  description: string;
  hsn: string;
  qty: number;
  rate: number;
  gstRate: number;
  inventoryItemId?: string;
}

export default function InvoiceCreateScreen({ navigation }: { navigation?: any }) {
  const { merchant, token, refreshProfile } = useMerchant();
  const [step, setStep] = useState<'customer' | 'items' | 'preview' | 'success'>('customer');
  const [loading, setLoading] = useState(false);
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [savedContacts, setSavedContacts] = useState<any[]>([]);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactSearch, setContactSearch] = useState('');

  // Customer state
  const [customer, setCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    gstin: '',
    address: '',
    state: merchant?.state || 'Maharashtra',
  });
  const [showStatePicker, setShowStatePicker] = useState(false);

  // Items state
  const [items, setItems] = useState<InvoiceCreateItem[]>([
    { id: 'it_1', description: '', hsn: '8528', qty: 1, rate: 0, gstRate: 18 },
  ]);

  // Payment & Notes
  const [payMode, setPayMode] = useState<any>('cash');
  const [payRef, setPayRef] = useState('');
  const [notes, setNotes] = useState('');

  // Generated Invoice Result
  const [generatedInvoice, setGeneratedInvoice] = useState<any | null>(null);

  // Mini calculator state
  const [calcIdx, setCalcIdx] = useState<number | null>(null);
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcPrev, setCalcPrev] = useState<number | null>(null);
  const [calcOp, setCalcOp] = useState<string | null>(null);
  const [calcWaiting, setCalcWaiting] = useState(false);
  const [calcTally, setCalcTally] = useState<{ id: string; value: number; label: string }[]>([]);

  useEffect(() => {
    async function loadData() {
      const cachedInv = await getCache<any[]>('merchant_inventory');
      const cachedContacts = await getCache<any[]>('contacts_list');
      if (cachedInv) setInventoryList(cachedInv);
      if (cachedContacts) setSavedContacts(cachedContacts);

      if (!token) return;
      try {
        const [invRes, contactsRes] = await Promise.allSettled([
          api.get('/api/merchant/inventory', { token }),
          api.get('/api/merchant/contacts', { token }),
        ]);
        if (invRes.status === 'fulfilled' && invRes.value?.items) {
          setInventoryList(invRes.value.items);
          await setCache('merchant_inventory', invRes.value.items);
        }
        if (contactsRes.status === 'fulfilled' && contactsRes.value?.contacts) {
          setSavedContacts(contactsRes.value.contacts);
          await setCache('contacts_list', contactsRes.value.contacts);
        }
      } catch (e) {}
    }
    loadData();
  }, [token]);

  // Live GST Computation
  const comp = useMemo(() => {
    const sellerState = merchant?.state || 'Maharashtra';
    const sellerGstin = merchant?.gstin || '';
    const supplyCtx = resolveSupply({
      sellerState,
      sellerGstin,
      buyerGstin: customer.gstin,
      buyerState: customer.state,
    });

    return computeInvoice(items, supplyCtx);
  }, [items, customer.state, customer.gstin, merchant?.state, merchant?.gstin]);

  const isInterState = comp.isInterState;

  // Item helpers
  const handleUpdateItem = (idx: number, patch: Partial<InvoiceCreateItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { id: `it_${Date.now()}`, description: `Item #${prev.length + 1}`, hsn: '8528', qty: 1, rate: 0, gstRate: 18 },
    ]);
  };

  const handleRemoveItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // Calculator Methods matching Master Web App
  const handleCalcNum = (num: string) => {
    if (calcWaiting) {
      setCalcDisplay(num);
      setCalcWaiting(false);
    } else {
      setCalcDisplay(calcDisplay === '0' ? num : calcDisplay + num);
    }
  };

  const handleCalcDot = () => {
    if (calcWaiting) {
      setCalcDisplay('0.');
      setCalcWaiting(false);
    } else if (!calcDisplay.includes('.')) {
      setCalcDisplay(calcDisplay + '.');
    }
  };

  const handleCalcOp = (op: string) => {
    const inputValue = parseFloat(calcDisplay);
    if (calcPrev === null) {
      setCalcPrev(inputValue);
    } else if (calcOp) {
      let result = inputValue;
      if (calcOp === '+') result = calcPrev + inputValue;
      else if (calcOp === '-') result = calcPrev - inputValue;
      else if (calcOp === '×') result = calcPrev * inputValue;
      else if (calcOp === '÷') result = inputValue === 0 ? 0 : calcPrev / inputValue;
      setCalcDisplay(String(result));
      setCalcPrev(result);
    }
    setCalcOp(op);
    setCalcWaiting(true);
  };

  const handleCalcEqual = () => {
    if (calcOp && calcPrev !== null) {
      const inputValue = parseFloat(calcDisplay);
      let result = inputValue;
      if (calcOp === '+') result = calcPrev + inputValue;
      else if (calcOp === '-') result = calcPrev - inputValue;
      else if (calcOp === '×') result = calcPrev * inputValue;
      else if (calcOp === '÷') result = inputValue === 0 ? 0 : calcPrev / inputValue;
      setCalcDisplay(String(result));
      setCalcPrev(null);
      setCalcOp(null);
      setCalcWaiting(true);
    }
  };

  const handleCalcClear = () => {
    setCalcDisplay('0');
    setCalcPrev(null);
    setCalcOp(null);
    setCalcWaiting(false);
  };

  const handleCalcAddToTally = () => {
    const val = parseFloat(calcDisplay);
    if (isNaN(val) || val === 0) return;
    setCalcTally((prev) => [...prev, { id: String(Date.now()), value: val, label: calcOp ? 'Calculated' : 'Direct' }]);
    handleCalcClear();
  };

  const handleCalcUseTotal = () => {
    if (calcIdx === null) return;
    const tallySum = calcTally.reduce((a, b) => a + b.value, 0);
    const amount = tallySum > 0 ? tallySum : parseFloat(calcDisplay) || 0;
    handleUpdateItem(calcIdx, { rate: amount });
    setCalcIdx(null);
    setCalcTally([]);
    handleCalcClear();
  };

  const handlePickProduct = (product: any, idx: number) => {
    handleUpdateItem(idx, {
      description: product.product_name || product.name || '',
      hsn: product.hsn || '8528',
      rate: Number(product.selling_price || product.rate || 0),
      gstRate: Number(product.gst_rate || product.gstRate || 18),
      inventoryItemId: product.id,
    });
  };

  const handlePickContact = (c: any) => {
    setCustomer({
      name: c.name || '',
      phone: c.phone || '',
      email: c.email || '',
      gstin: c.gstin || '',
      address: c.address || '',
      state: c.state || merchant?.state || 'Maharashtra',
    });
    setShowContactPicker(false);
  };

  const handleGenerateInvoice = async () => {
    if (!customer.name.trim()) {
      Alert.alert('Missing Customer', 'Please enter customer name.');
      setStep('customer');
      return;
    }

    const fixedItems = items.map((it, idx) => ({
      ...it,
      description: (it.description || '').trim() || `Item #${idx + 1}`,
      hsn: (it.hsn || '8528').trim(),
      qty: Number(it.qty) || 1,
      rate: Number(it.rate) || 0,
      gstRate: Number(it.gstRate) || 18,
    }));
    setItems(fixedItems);

    const hasInvalid = fixedItems.some((it) => {
      const hsnValid = /^\d+$/.test((it.hsn || '').trim()) && (it.hsn || '').trim().length >= 4;
      return !it.description.trim() || !hsnValid || it.qty <= 0 || it.rate <= 0;
    });

    if (hasInvalid) {
      Alert.alert('Invalid Items', 'Ensure all items have a valid 4+ digit numeric HSN, Quantity (>0), and Rate (>0).');
      setStep('items');
      return;
    }

    if (!token) return;
    setLoading(true);

    try {
      // 1. Create a valid backend billing request row first (matching Web App store.createRequest)
      const reqRes = await api.post('/api/billing-requests', {
        merchantId: merchant?.id,
        customerName: customer.name.trim(),
        customerPhone: customer.phone.trim() || '9999999999',
        customerEmail: customer.email.trim() || '',
        customerGstin: customer.gstin.trim() || '',
        customerAddress: customer.address.trim() || merchant?.address || 'Direct Store Request',
        customerState: customer.state || merchant?.state || 'Maharashtra',
        paymentMode: payMode,
        items: items.map((it) => ({
          description: it.description,
          hsn: it.hsn,
          qty: it.qty,
          rate: it.rate,
          gstRate: it.gstRate,
        })),
        branded: !!merchant?.customBranding,
      });

      const requestId = reqRes?.request?.id || `req_direct_${Date.now()}`;

      // 2. Generate next invoice number
      const cachedInvoices = (await getCache<any[]>('invoices_list')) || [];
      const generatedNo = nextInvoiceNumber(
        merchant?.invoicePrefix || 'INV',
        cachedInvoices.map((i) => i.invoiceNo || i.invoice_no)
      );

      // 3. Approve & create tax invoice
      const appRes = await api.post('/api/merchant/invoices', {
        requestId,
        invoiceNo: generatedNo,
        customerName: customer.name.trim(),
        customerPhone: customer.phone.trim() || '9999999999',
        customerEmail: customer.email.trim() || undefined,
        customerGstin: customer.gstin.trim() || undefined,
        customerAddress: customer.address.trim() || 'Direct Store Request',
        customerState: customer.state,
        paymentMode: payMode,
        paymentRef: payRef || undefined,
        notes: notes || undefined,
        items: items.map((it) => ({
          description: it.description,
          hsn: it.hsn,
          qty: it.qty,
          rate: it.rate,
          gstRate: it.gstRate,
          inventoryItemId: it.inventoryItemId,
        })),
        taxableValue: comp.taxableValue,
        totalCgst: comp.totalCgst,
        totalSgst: comp.totalSgst,
        totalIgst: comp.totalIgst,
        totalTax: comp.totalTax,
        grandTotal: comp.grandTotal,
        roundOff: comp.roundOff,
        isInterState: comp.isInterState,
        branded: !!merchant?.customBranding,
      }, { token });

      const newInv = (appRes && appRes.invoice) || {
        id: `inv_${Date.now()}`,
        invoiceNo: generatedNo,
        invoiceNumber: `${merchant?.merchantCode || 'AKM'}-${generatedNo}`,
        customerName: customer.name.trim(),
        customerPhone: customer.phone.trim(),
        customerEmail: customer.email.trim(),
        customerGstin: customer.gstin.trim(),
        customerAddress: customer.address.trim(),
        customerState: customer.state,
        items,
        taxableValue: comp.taxableValue,
        totalCgst: comp.totalCgst,
        totalSgst: comp.totalSgst,
        totalIgst: comp.totalIgst,
        totalTax: comp.totalTax,
        grandTotal: comp.grandTotal,
        paymentMode: payMode,
        createdAt: Date.now(),
      };

      // 3. Cache update & Stock auto-deduction
      const updatedInvList = [newInv, ...cachedInvoices];
      await setCache('invoices_list', updatedInvList);

      // Decrement inventory in local cache
      const updatedInventory = inventoryList.map((invItem) => {
        const matched = items.find((it) => it.inventoryItemId === invItem.id || it.description.toLowerCase() === (invItem.product_name || invItem.name || '').toLowerCase());
        if (matched) {
          const cur = Number(invItem.stock_quantity ?? invItem.stock ?? 0);
          return { ...invItem, stock_quantity: Math.max(0, cur - matched.qty) };
        }
        return invItem;
      });
      await setCache('merchant_inventory', updatedInventory);
      setInventoryList(updatedInventory);

      setGeneratedInvoice(newInv);
      setStep('success');
      refreshProfile();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not generate invoice.');
    } finally {
      setLoading(false);
    }
  };

  const handleSharePdf = async () => {
    if (!generatedInvoice) return;
    try {
      await shareInvoicePdf(generatedInvoice, merchant || ({} as any));
    } catch (err: any) {
      Alert.alert('PDF Error', err.message || 'Could not generate PDF.');
    }
  };

  const handlePrintPdf = async () => {
    if (!generatedInvoice) return;
    try {
      await printInvoicePdf(generatedInvoice, merchant || ({} as any));
    } catch (err: any) {
      Alert.alert('Print Error', err.message || 'Could not send to printer.');
    }
  };

  return (
    <View style={st.container}>
      <TopAppBar title="Generate New Tax Invoice" onBack={() => navigation?.goBack?.()} />

      {/* Wizard Step Indicator */}
      <View style={st.stepRow}>
        {[
          { key: 'customer', label: 'Buyer' },
          { key: 'items', label: 'Items' },
          { key: 'preview', label: 'Preview' },
          { key: 'success', label: 'Done' },
        ].map((s, idx) => {
          const isActive = step === s.key;
          const isPassed =
            (step === 'items' && idx === 0) ||
            (step === 'preview' && idx <= 1) ||
            (step === 'success' && idx <= 2);
          return (
            <React.Fragment key={s.key}>
              {idx > 0 && <View style={st.stepLine} />}
              <View style={st.stepItem}>
                <View style={[st.stepCircle, isPassed && st.stepDone, isActive && st.stepActive]}>
                  {isPassed ? (
                    <MaterialIcons name="check" size={14} color="#fff" />
                  ) : (
                    <Text style={[st.stepNum, (isActive || isPassed) && { color: '#fff' }]}>{idx + 1}</Text>
                  )}
                </View>
                <Text style={[st.stepLabel, (isActive || isPassed) && { color: Theme.onSurface }]}>{s.label}</Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {/* ── STEP 1: BUYER SELECTION ── */}
        {step === 'customer' && (
          <View style={{ paddingHorizontal: 16 }}>
            {savedContacts.length > 0 && (
              <OutlineButton
                title="Autofill from Address Book"
                icon="people-outline"
                size="sm"
                style={{ marginBottom: 12 }}
                onPress={() => setShowContactPicker(true)}
              />
            )}

            <Card style={{ marginBottom: 14 }}>
              <SectionHeader title="Buyer / Customer Details" />
              <InputField
                label="Customer Name *"
                placeholder="e.g. Rahul Sharma"
                value={customer.name}
                onChangeText={(t) => setCustomer((c) => ({ ...c, name: t }))}
                icon="person-outline"
              />
              <InputField
                label="Mobile Number"
                placeholder="10-digit number"
                value={customer.phone}
                onChangeText={(t) => setCustomer((c) => ({ ...c, phone: t }))}
                icon="call-outline"
                keyboardType="phone-pad"
              />
              <InputField
                label="Email (Optional)"
                placeholder="e.g. rahul@example.com"
                value={customer.email}
                onChangeText={(t) => setCustomer((c) => ({ ...c, email: t }))}
                icon="mail-outline"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <InputField
                label="GSTIN for B2B Invoice (Optional)"
                placeholder="e.g. 27AAPFU0939F1ZV"
                value={customer.gstin}
                onChangeText={(t) => setCustomer((c) => ({ ...c, gstin: t.toUpperCase() }))}
                icon="document-text-outline"
                autoCapitalize="characters"
              />
              <InputField
                label="Billing Address"
                placeholder="e.g. Flat 402, Sea View, Bandra West"
                value={customer.address}
                onChangeText={(t) => setCustomer((c) => ({ ...c, address: t }))}
                icon="location-outline"
              />

              <Pressable
                style={st.stateSelectBtn}
                onPress={() => setShowStatePicker(true)}
              >
                <Text style={{ color: Theme.onSurfaceDisabled, fontSize: 11 }}>Place of Supply (State) *</Text>
                <Text style={{ color: Theme.onSurface, fontSize: 14, fontWeight: '500', marginTop: 2 }}>{customer.state} ▾</Text>
              </Pressable>
            </Card>

            <GradientButton
              title="Continue to Items"
              onPress={() => {
                if (!customer.name.trim()) {
                  Alert.alert('Required', 'Please enter customer name.');
                  return;
                }
                setStep('items');
              }}
              icon="arrow-forward"
            />
          </View>
        )}

        {/* ── STEP 2: LINE ITEMS & GST SLABS ── */}
        {step === 'items' && (
          <View style={{ paddingHorizontal: 16 }}>
            {/* Quick Inventory Stock Chips */}
            {inventoryList.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ color: Theme.onSurfaceDisabled, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
                  ADD FROM STORE INVENTORY
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {inventoryList.map((p, pIdx) => (
                    <Pressable
                      key={p.id || pIdx}
                      style={st.quickProductChip}
                      onPress={() => handlePickProduct(p, items.length - 1)}
                    >
                      <Text style={{ color: Theme.onSurface, fontSize: 12, fontWeight: '600' }}>
                        + {p.product_name || p.name} (₹{p.selling_price || p.rate})
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {items.map((it, idx) => {
              const sug = suggestHsn(it.description);
              return (
                <Card key={it.id || idx} style={st.itemCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={st.itemHeadIndex}>ITEM #{idx + 1}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Pressable
                        onPress={() => {
                          setCalcIdx(idx);
                          setCalcDisplay(String(it.rate || '0'));
                          setCalcPrev(null);
                          setCalcOp(null);
                        }}
                        style={st.itemActionIconBtn}
                        hitSlop={6}
                      >
                        <MaterialIcons name="calculate" size={18} color={Theme.primary} />
                      </Pressable>
                      {items.length > 1 && (
                        <Pressable onPress={() => handleRemoveItem(idx)} hitSlop={6}>
                          <MaterialIcons name="delete-outline" size={20} color={Theme.error} />
                        </Pressable>
                      )}
                    </View>
                  </View>

                  <InputField
                    label="Description / Product Name *"
                    placeholder="e.g. Samsung 43 Inch TV"
                    value={it.description}
                    onChangeText={(t) => handleUpdateItem(idx, { description: t })}
                  />

                  {/* AI HSN Suggestion Chip */}
                  {sug && (it.hsn !== sug.hsn || it.gstRate !== sug.gstRate) ? (
                    <View style={{ marginBottom: 8 }}>
                      <HsnSuggestChip
                        suggestedHsn={sug.hsn}
                        suggestedGst={sug.gstRate}
                        onApply={() => handleUpdateItem(idx, { hsn: sug.hsn, gstRate: sug.gstRate })}
                      />
                    </View>
                  ) : null}

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1.2 }}>
                      <InputField
                        label="HSN Code *"
                        placeholder="e.g. 8528"
                        value={it.hsn}
                        onChangeText={(t) => handleUpdateItem(idx, { hsn: t })}
                        keyboardType="number-pad"
                        maxLength={8}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <InputField
                        label="Quantity *"
                        placeholder="1"
                        value={String(it.qty || '')}
                        onChangeText={(t) => handleUpdateItem(idx, { qty: parseFloat(t) || 0 })}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1.5 }}>
                      <InputField
                        label="Unit Rate (₹) *"
                        placeholder="0.00"
                        value={String(it.rate || '')}
                        onChangeText={(t) => handleUpdateItem(idx, { rate: parseFloat(t) || 0 })}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                <Text style={{ color: Theme.onSurfaceDisabled, fontSize: 11, fontWeight: '600', marginBottom: 4 }}>
                  GST Slab Rate
                </Text>
                <GstRateSelector
                  value={it.gstRate}
                  onChange={(rate) => handleUpdateItem(idx, { gstRate: rate })}
                />
              </Card>
            );
          })}

            <OutlineButton
              title="Add Another Item"
              icon="add-circle-outline"
              onPress={handleAddItem}
              style={{ marginBottom: 12 }}
            />

            {/* Live Calculation Preview */}
            <Card style={st.calcBox}>
              <View style={st.calcRow}><Text style={st.calcL}>Taxable Value</Text><Text style={st.calcV}>{formatCurrency(comp.taxableValue)}</Text></View>
              {isInterState ? (
                <View style={st.calcRow}><Text style={st.calcL}>IGST (Interstate)</Text><Text style={[st.calcV, { color: Theme.primary }]}>{formatCurrency(comp.totalIgst)}</Text></View>
              ) : (
                <>
                  <View style={st.calcRow}><Text style={st.calcL}>CGST</Text><Text style={[st.calcV, { color: Theme.primary }]}>{formatCurrency(comp.totalCgst)}</Text></View>
                  <View style={st.calcRow}><Text style={st.calcL}>SGST</Text><Text style={[st.calcV, { color: Theme.primary }]}>{formatCurrency(comp.totalSgst)}</Text></View>
                </>
              )}
              {comp.roundOff !== 0 && (
                <View style={st.calcRow}><Text style={st.calcL}>Round Off</Text><Text style={st.calcV}>₹{comp.roundOff}</Text></View>
              )}
              <Divider />
              <View style={st.calcRow}><Text style={st.grandTotalL}>Grand Total</Text><Text style={st.grandTotalV}>{formatCurrency(comp.grandTotal)}</Text></View>
            </Card>

            <View style={st.navRow}>
              <OutlineButton title="Back" onPress={() => setStep('customer')} style={{ flex: 1 }} />
              <GradientButton title="Preview Bill" onPress={() => setStep('preview')} icon="eye-outline" style={{ flex: 2 }} />
            </View>
          </View>
        )}

        {/* ── STEP 3: PREVIEW & PAYMENT ── */}
        {step === 'preview' && (
          <View style={{ paddingHorizontal: 16 }}>
            {/* Payment Method */}
            <Card style={{ marginBottom: 12 }}>
              <SectionHeader title="Payment Method *" />
              <PaymentModePicker
                value={payMode}
                onChange={(m) => setPayMode(m)}
              />
              {payMode !== 'cash' && (
                <InputField
                  label="Transaction Reference / UTR (Optional)"
                  placeholder="e.g. UPI/4892019384"
                  value={payRef}
                  onChangeText={setPayRef}
                  style={{ marginTop: 8 }}
                />
              )}
              <InputField
                label="Invoice Remarks / Notes (Optional)"
                placeholder="e.g. Warranty 1 year on invoice"
                value={notes}
                onChangeText={setNotes}
                multiline
                style={{ marginTop: 4 }}
              />
            </Card>

            {/* Official Invoice Preview */}
            <Card style={st.previewCard}>
              <View style={st.prevHeader}>
                <View>
                  <Text style={st.prevShop}>{merchant?.shopName || 'Merchant Shop'}</Text>
                  <Text style={st.prevGstin}>GSTIN: {merchant?.gstin || 'Unregistered'}</Text>
                  <Text style={st.prevMerchantCode}>Merchant Code: {merchant?.merchantCode || 'AKM-000000'}</Text>
                </View>
                <View style={st.prevBadge}>
                  <Text style={st.prevBadgeText}>TAX INVOICE</Text>
                </View>
              </View>

              <Divider />

              <Text style={st.billToLabel}>BILL TO</Text>
              <Text style={st.billToName}>{customer.name}</Text>
              <Text style={st.billToDetail}>📞 {customer.phone || 'Direct Store Request'}</Text>
              {customer.address ? <Text style={st.billToDetail}>📍 {customer.address}, {customer.state}</Text> : null}
              {customer.gstin ? <Text style={st.gstinLabel}>GSTIN: {customer.gstin}</Text> : null}
              <Text style={st.posLabel}>Place of Supply: <Text style={{ color: Theme.onSurface, fontWeight: '700' }}>{customer.state}</Text> ({isInterState ? 'IGST' : 'CGST+SGST'})</Text>

              <Divider />

              {/* Items Table */}
              <View style={st.tableHead}>
                <Text style={[st.th, { flex: 2 }]}>Item</Text>
                <Text style={st.th}>Qty</Text>
                <Text style={st.th}>GST</Text>
                <Text style={[st.th, { textAlign: 'right' }]}>Amount</Text>
              </View>

              {items.map((it, idx) => (
                <View key={idx} style={st.tableRow}>
                  <Text style={[st.td, { flex: 2 }]} numberOfLines={1}>{it.description}</Text>
                  <Text style={st.td}>{it.qty}</Text>
                  <Text style={st.td}>{it.gstRate}%</Text>
                  <Text style={[st.td, { textAlign: 'right', fontWeight: '600' }]}>{formatCurrency(it.qty * it.rate)}</Text>
                </View>
              ))}

              <Divider />

              <View style={st.calcRow}><Text style={st.calcL}>Taxable Value</Text><Text style={st.calcV}>{formatCurrency(comp.taxableValue)}</Text></View>
              {isInterState ? (
                <View style={st.calcRow}><Text style={st.calcL}>IGST</Text><Text style={[st.calcV, { color: Theme.primary }]}>{formatCurrency(comp.totalIgst)}</Text></View>
              ) : (
                <>
                  <View style={st.calcRow}><Text style={st.calcL}>CGST</Text><Text style={[st.calcV, { color: Theme.primary }]}>{formatCurrency(comp.totalCgst)}</Text></View>
                  <View style={st.calcRow}><Text style={st.calcL}>SGST</Text><Text style={[st.calcV, { color: Theme.primary }]}>{formatCurrency(comp.totalSgst)}</Text></View>
                </>
              )}
              {comp.roundOff !== 0 && (
                <View style={st.calcRow}><Text style={st.calcL}>Round Off</Text><Text style={st.calcV}>₹{comp.roundOff}</Text></View>
              )}
              <Divider />
              <View style={st.calcRow}><Text style={st.grandTotalL}>Grand Total</Text><Text style={st.grandTotalV}>{formatCurrency(comp.grandTotal)}</Text></View>
            </Card>

            <View style={st.navRow}>
              <OutlineButton title="Edit Items" onPress={() => setStep('items')} icon="create-outline" style={{ flex: 1 }} />
              <GradientButton
                title={loading ? 'Generating...' : 'Generate Invoice'}
                onPress={handleGenerateInvoice}
                disabled={loading}
                icon="checkmark-done-circle-outline"
                style={{ flex: 2 }}
              />
            </View>
          </View>
        )}

        {/* ── STEP 4: SUCCESS & NATIVE PDF ACTIONS ── */}
        {step === 'success' && generatedInvoice && (
          <View style={{ paddingHorizontal: 16, alignItems: 'center' }}>
            <View style={st.successCircle}>
              <Ionicons name="checkmark" size={36} color="#fff" />
            </View>

            <Text style={st.successHeading}>Invoice Generated!</Text>
            <Text style={st.successSub}>
              Tax Invoice <Text style={{ color: Theme.tertiary, fontWeight: '700' }}>{generatedInvoice.invoiceNo}</Text> has been created, inventory deducted, and double-entry books updated.
            </Text>

            <Card style={[st.previewCard, { width: '100%', marginVertical: 16 }]}>
              <View style={st.calcRow}><Text style={st.calcL}>Customer</Text><Text style={st.calcV}>{generatedInvoice.customerName}</Text></View>
              <View style={st.calcRow}><Text style={st.calcL}>Payment Method</Text><Text style={[st.calcV, { textTransform: 'capitalize' }]}>{generatedInvoice.paymentMode}</Text></View>
              <View style={st.calcRow}><Text style={st.calcL}>Total Tax</Text><Text style={[st.calcV, { color: Theme.primary }]}>{formatCurrency(generatedInvoice.totalTax)}</Text></View>
              <Divider />
              <View style={st.calcRow}><Text style={st.grandTotalL}>Grand Total</Text><Text style={st.grandTotalV}>{formatCurrency(generatedInvoice.grandTotal)}</Text></View>
            </Card>

            {/* Native PDF Share, WhatsApp & Print Actions */}
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginBottom: 10 }}>
              <GradientButton
                title="Share PDF"
                icon="document-text-outline"
                style={{ flex: 1 }}
                onPress={handleSharePdf}
              />
              <FilledButton
                title="WhatsApp"
                icon="logo-whatsapp"
                color="primary"
                style={{ flex: 1 }}
                onPress={async () => {
                  if (generatedInvoice && merchant) {
                    try {
                      await shareInvoicePdf(generatedInvoice, merchant as any);
                    } catch (e: any) {
                      Alert.alert('Share Error', e.message || 'Could not share to WhatsApp');
                    }
                  }
                }}
              />
            </View>

            <OutlineButton
              title="Print Invoice"
              icon="print-outline"
              style={{ width: '100%', marginBottom: 12 }}
              onPress={handlePrintPdf}
            />

            <OutlineButton
              title="Create Another Invoice"
              icon="add-circle-outline"
              style={{ width: '100%' }}
              onPress={() => {
                setStep('customer');
                setCustomer({ name: '', phone: '', email: '', gstin: '', address: '', state: merchant?.state || 'Maharashtra' });
                setItems([{ id: 'it_1', description: '', hsn: '8528', qty: 1, rate: 0, gstRate: 18 }]);
              }}
            />
          </View>
        )}
      </ScrollView>

      {/* State Picker Modal */}
      {showStatePicker && (
        <View style={st.pickerOverlay}>
          <View style={st.pickerCard}>
            <Text style={st.pickerTitle}>Select Place of Supply (State)</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              {INDIAN_STATES.map((s) => (
                <Pressable
                  key={s}
                  style={st.stateItem}
                  onPress={() => {
                    setCustomer((c) => ({ ...c, state: s }));
                    setShowStatePicker(false);
                  }}
                >
                  <Text style={{ color: Theme.onSurface, fontSize: 14 }}>{s}</Text>
                  {customer.state === s && <MaterialIcons name="check" size={18} color={Theme.primary} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Contact Picker Modal */}
      {showContactPicker && (
        <View style={st.pickerOverlay}>
          <View style={st.pickerCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={st.pickerTitle}>Select from Address Book</Text>
              <Pressable onPress={() => setShowContactPicker(false)}>
                <Ionicons name="close-circle" size={22} color={Theme.onSurfaceDisabled} />
              </Pressable>
            </View>
            <SearchBar value={contactSearch} onChangeText={setContactSearch} placeholder="Search saved contacts..." style={{ marginBottom: 10 }} />
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
              {savedContacts
                .filter((c) => !contactSearch || (c.name || '').toLowerCase().includes(contactSearch.toLowerCase()) || (c.phone || '').includes(contactSearch))
                .map((c, i) => (
                  <Pressable
                    key={c.id || i}
                    style={st.stateItem}
                    onPress={() => handlePickContact(c)}
                  >
                    <View>
                      <Text style={{ color: Theme.onSurface, fontSize: 14, fontWeight: '700' }}>{c.name}</Text>
                      <Text style={{ color: Theme.onSurfaceDisabled, fontSize: 11 }}>{c.phone} {c.gstin ? `· ${c.gstin}` : ''}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={Theme.primary} />
                  </Pressable>
                ))}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Mini Calculator Modal */}
      {calcIdx !== null && (
        <View style={st.pickerOverlay}>
          <View style={[st.pickerCard, { maxWidth: 320, padding: 16 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="calculate" size={20} color={Theme.primary} />
                <Text style={st.pickerTitle}>Rate Calculator</Text>
              </View>
              <Pressable onPress={() => setCalcIdx(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color={Theme.onSurfaceDisabled} />
              </Pressable>
            </View>

            {/* Display */}
            <View style={st.calcDisplayBox}>
              <Text style={st.calcExprText}>{calcPrev !== null && calcOp ? `${calcPrev} ${calcOp}` : ''}</Text>
              <Text style={st.calcMainText}>{calcDisplay}</Text>
            </View>

            {/* Keypad */}
            <View style={st.calcGrid}>
              <Pressable style={[st.calcKey, st.calcKeyOp, { flex: 2 }]} onPress={handleCalcClear}><Text style={[st.calcKeyText, { color: Theme.error }]}>C</Text></Pressable>
              <Pressable style={[st.calcKey, st.calcKeyOp]} onPress={() => handleCalcOp('÷')}><Text style={[st.calcKeyText, { color: Theme.primary }]}>÷</Text></Pressable>
              <Pressable style={[st.calcKey, st.calcKeyOp]} onPress={() => handleCalcOp('×')}><Text style={[st.calcKeyText, { color: Theme.primary }]}>×</Text></Pressable>
            </View>
            <View style={st.calcGrid}>
              <Pressable style={st.calcKey} onPress={() => handleCalcNum('7')}><Text style={st.calcKeyText}>7</Text></Pressable>
              <Pressable style={st.calcKey} onPress={() => handleCalcNum('8')}><Text style={st.calcKeyText}>8</Text></Pressable>
              <Pressable style={st.calcKey} onPress={() => handleCalcNum('9')}><Text style={st.calcKeyText}>9</Text></Pressable>
              <Pressable style={[st.calcKey, st.calcKeyOp]} onPress={() => handleCalcOp('-')}><Text style={[st.calcKeyText, { color: Theme.primary }]}>-</Text></Pressable>
            </View>
            <View style={st.calcGrid}>
              <Pressable style={st.calcKey} onPress={() => handleCalcNum('4')}><Text style={st.calcKeyText}>4</Text></Pressable>
              <Pressable style={st.calcKey} onPress={() => handleCalcNum('5')}><Text style={st.calcKeyText}>5</Text></Pressable>
              <Pressable style={st.calcKey} onPress={() => handleCalcNum('6')}><Text style={st.calcKeyText}>6</Text></Pressable>
              <Pressable style={[st.calcKey, st.calcKeyOp]} onPress={() => handleCalcOp('+')}><Text style={[st.calcKeyText, { color: Theme.primary }]}>+</Text></Pressable>
            </View>
            <View style={st.calcGrid}>
              <Pressable style={st.calcKey} onPress={() => handleCalcNum('1')}><Text style={st.calcKeyText}>1</Text></Pressable>
              <Pressable style={st.calcKey} onPress={() => handleCalcNum('2')}><Text style={st.calcKeyText}>2</Text></Pressable>
              <Pressable style={st.calcKey} onPress={() => handleCalcNum('3')}><Text style={st.calcKeyText}>3</Text></Pressable>
              <Pressable style={[st.calcKey, { backgroundColor: Theme.primary }]} onPress={handleCalcEqual}><Text style={[st.calcKeyText, { color: '#000', fontWeight: '800' }]}>=</Text></Pressable>
            </View>
            <View style={st.calcGrid}>
              <Pressable style={[st.calcKey, { flex: 2 }]} onPress={() => handleCalcNum('0')}><Text style={st.calcKeyText}>0</Text></Pressable>
              <Pressable style={st.calcKey} onPress={handleCalcDot}><Text style={st.calcKeyText}>.</Text></Pressable>
              <Pressable style={[st.calcKey, st.calcKeyOp]} onPress={handleCalcAddToTally}><Text style={[st.calcKeyText, { color: Theme.tertiary, fontSize: 11 }]}>+List</Text></Pressable>
            </View>

            {/* Tally list if items added */}
            {calcTally.length > 0 && (
              <View style={st.calcTallyBox}>
                <Text style={st.calcTallyTitle}>Tally ({calcTally.length}) · Total: ₹{calcTally.reduce((a, b) => a + b.value, 0).toFixed(2)}</Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <OutlineButton title="Cancel" onPress={() => setCalcIdx(null)} style={{ flex: 1 }} />
              <GradientButton title="Use Total" onPress={handleCalcUseTotal} style={{ flex: 1.5 }} />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: Theme.surface4, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  stepActive: { backgroundColor: Theme.primary },
  stepDone: { backgroundColor: Theme.success },
  stepNum: { color: Theme.onSurfaceDisabled, fontSize: 12, fontWeight: '700' },
  stepLabel: { color: Theme.onSurfaceDisabled, fontSize: 11, fontWeight: '600', marginRight: 8 },
  stepLine: { width: 24, height: 2, backgroundColor: Theme.outline, marginRight: 8 },
  stateSelectBtn: { backgroundColor: Theme.surface1, padding: 12, borderRadius: Theme.shapeSm, borderWidth: 1, borderColor: Theme.outline, marginTop: 4, marginBottom: 12 },
  itemCard: { marginBottom: 12, padding: 14 },
  itemHeadIndex: { color: Theme.primary, fontSize: 12, fontWeight: '700' },
  itemActionIconBtn: { width: 30, height: 30, borderRadius: 6, backgroundColor: Theme.surface3, alignItems: 'center', justifyContent: 'center' },
  quickProductChip: { backgroundColor: Theme.surface2, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Theme.shapeSm, marginRight: 8, borderWidth: 1, borderColor: Theme.outline },
  calcBox: { padding: 14, marginVertical: 10 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 3 },
  calcL: { color: Theme.onSurfaceVariant, fontSize: 13 },
  calcV: { color: Theme.onSurface, fontSize: 13, fontWeight: '600' },
  grandTotalL: { color: Theme.onSurface, fontSize: 16, fontWeight: '700' },
  grandTotalV: { color: Theme.tertiary, fontSize: 20, fontWeight: '800' },
  navRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  previewCard: { padding: 16, backgroundColor: Theme.surface2, borderRadius: Theme.shapeLg, borderWidth: 1, borderColor: 'rgba(0,212,170,0.25)' },
  prevHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  prevShop: { color: Theme.onSurface, fontSize: 16, fontWeight: '700' },
  prevGstin: { color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 1 },
  prevMerchantCode: { color: Theme.primary, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginTop: 2 },
  prevBadge: { backgroundColor: Theme.primaryContainer, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Theme.shapeXs },
  prevBadgeText: { color: Theme.primary, fontSize: 10, fontWeight: '700' },
  billToLabel: { color: Theme.onSurfaceDisabled, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  billToName: { color: Theme.onSurface, fontSize: 14, fontWeight: '600' },
  billToDetail: { color: Theme.onSurfaceVariant, fontSize: 12 },
  gstinLabel: { color: Theme.tertiary, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginTop: 2 },
  posLabel: { color: Theme.onSurfaceVariant, fontSize: 11, marginTop: 2 },
  tableHead: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Theme.outlineVariant },
  th: { color: Theme.onSurfaceDisabled, fontSize: 11, fontWeight: '700', flex: 1, textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Theme.outlineVariant },
  td: { color: Theme.onSurfaceVariant, fontSize: 12, flex: 1 },
  successCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: Theme.success, alignItems: 'center', justifyContent: 'center', marginTop: 20, marginBottom: 12 },
  successHeading: { color: Theme.onSurface, fontSize: 22, fontWeight: '700' },
  successSub: { color: Theme.onSurfaceVariant, fontSize: 13, marginTop: 4 },
  pickerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20, zIndex: 99 },
  pickerCard: { width: '100%', maxWidth: 380, backgroundColor: Theme.surface2, borderRadius: Theme.shapeXl, padding: 20, borderWidth: 1, borderColor: Theme.outline },
  pickerTitle: { color: Theme.onSurface, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  stateItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Theme.outlineVariant },

  // Calculator Modal Styling
  calcDisplayBox: {
    backgroundColor: Theme.surface4,
    borderRadius: 8,
    padding: 10,
    alignItems: 'flex-end',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Theme.outlineVariant,
  },
  calcExprText: { color: Theme.onSurfaceDisabled, fontSize: 11, height: 16 },
  calcMainText: { color: '#fff', fontSize: 22, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  calcGrid: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  calcKey: {
    flex: 1, height: 42, borderRadius: 8, backgroundColor: Theme.surface3,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.outlineVariant,
  },
  calcKeyOp: { backgroundColor: 'rgba(0,212,170,0.12)', borderColor: 'rgba(0,212,170,0.3)' },
  calcKeyText: { color: Theme.onSurface, fontSize: 15, fontWeight: '700' },
  calcTallyBox: {
    backgroundColor: Theme.surface3, padding: 8, borderRadius: 6, marginTop: 6,
    borderWidth: 1, borderColor: Theme.outlineVariant,
  },
  calcTallyTitle: { color: Theme.primary, fontSize: 11, fontWeight: '700' },
});

