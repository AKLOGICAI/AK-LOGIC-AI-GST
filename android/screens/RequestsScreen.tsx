import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert,
  ActivityIndicator, Share,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Theme } from '../lib/theme';
import {
  Card, StatusBadge, Avatar, SearchBar, FilterChip, GradientButton,
  FilledButton, OutlineButton, formatCurrency, BottomSheet, Divider,
  PlaceOfSupplyBanner, GstRateSelector, PaymentModePicker, HsnSuggestChip,
} from '../components/DesignSystem';
import { useMerchant } from '../lib/MerchantContext';
import { api } from '../lib/apiClient';
import { getCache, setCache } from '../lib/offlineCache';
import { shareInvoicePdf, printInvoicePdf } from '../lib/invoicePdfBuilder';
import { computeInvoice, resolveSupply, nextInvoiceNumber, INDIAN_STATES } from '../lib/gstEngine';
import { suggestHsn } from '../lib/hsnAi';

export interface RequestItem {
  id?: string;
  description: string;
  hsn: string;
  qty: number;
  rate: number;
  gstRate: number;
  inventoryItemId?: string;
}

export interface BillingRequest {
  id: string;
  merchantId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerGstin?: string;
  customerPan?: string;
  customerAddress?: string;
  customerState?: string;
  paymentMode?: string;
  paymentRef?: string;
  items: RequestItem[];
  notes?: string;
  rejectReason?: string;
  status: 'pending' | 'approved' | 'rejected';
  invoiceNo?: string;
  invoiceNumber?: string;
  invoiceId?: string;
  createdAt: number;
  resolvedAt?: number;
}

export default function RequestsScreen({ navigation }: { navigation?: any }) {
  const { merchant, token, refreshProfile } = useMerchant();
  const [requests, setRequests] = useState<BillingRequest[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<BillingRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Review & Edit state for the active request
  const [editCust, setEditCust] = useState(false);
  const [editCustomer, setEditCustomer] = useState({
    name: '', phone: '', email: '', gstin: '', address: '', state: '',
  });
  const [items, setItems] = useState<RequestItem[]>([]);
  const [payMode, setPayMode] = useState<string>('cash');
  const [payRef, setPayRef] = useState('');
  const [notes, setNotes] = useState('');
  const [validationError, setValidationError] = useState('');

  // Rejection dialog
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Inventory items for picker
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [invPickerIdx, setInvPickerIdx] = useState<number | null>(null);

  // Mini calculator state
  const [calcIdx, setCalcIdx] = useState<number | null>(null);
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcPrev, setCalcPrev] = useState<number | null>(null);
  const [calcOp, setCalcOp] = useState<string | null>(null);
  const [calcWaiting, setCalcWaiting] = useState(false);
  const [calcTally, setCalcTally] = useState<{ id: string; value: number; label: string }[]>([]);

  // AKC Verification State
  const [akcCode, setAkcCode] = useState('');
  const [akcPin, setAkcPin] = useState('');
  const [akcMsg, setAkcMsg] = useState('');
  const [akcVerifying, setAkcVerifying] = useState(false);

  // Invoice success preview
  const [createdInvoice, setCreatedInvoice] = useState<any | null>(null);

  // State selection modal
  const [showStatePicker, setShowStatePicker] = useState(false);

  useEffect(() => {
    async function loadRequests() {
      // 1. Instant local render
      const cached = await getCache<BillingRequest[]>('billing_requests');
      if (cached) setRequests(cached);

      if (!token) return;
      setLoading(true);

      // 2. Background fresh fetch
      try {
        const [reqRes, invRes] = await Promise.allSettled([
          api.get('/api/merchant/billing-requests', { token }),
          api.get('/api/merchant/inventory', { token }),
        ]);

        if (reqRes.status === 'fulfilled' && reqRes.value?.requests) {
          setRequests(reqRes.value.requests);
          await setCache('billing_requests', reqRes.value.requests);
        }

        if (invRes.status === 'fulfilled' && invRes.value?.items) {
          setInventoryList(invRes.value.items);
        }
      } catch (err) {
        console.warn('Failed to fetch billing requests:', err);
      } finally {
        setLoading(false);
      }
    }

    loadRequests();
  }, [token]);

  // Filtered requests
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      const matchesFilter = filter === 'all' ? true : r.status === filter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        (r.customerName && r.customerName.toLowerCase().includes(q)) ||
        (r.customerPhone && r.customerPhone.includes(q)) ||
        (r.customerGstin && r.customerGstin.toLowerCase().includes(q)) ||
        (r.id && r.id.toLowerCase().includes(q));
      return matchesFilter && matchesSearch;
    });
  }, [requests, filter, searchQuery]);

  const counts = useMemo(() => {
    return {
      all: requests.length,
      pending: requests.filter((r) => r.status === 'pending').length,
      approved: requests.filter((r) => r.status === 'approved').length,
      rejected: requests.filter((r) => r.status === 'rejected').length,
    };
  }, [requests]);

  // Open review sheet
  const handleOpenReview = (req: BillingRequest) => {
    setSelectedRequest(req);
    setEditCust(false);
    const cleanAddr = (req.customerAddress || '').trim();
    setEditCustomer({
      name: (req.customerName || '').trim() || 'Walk-in Customer',
      phone: (req.customerPhone || '').trim(),
      email: (req.customerEmail || '').trim(),
      gstin: (req.customerGstin || '').trim().toUpperCase(),
      address: cleanAddr.toUpperCase() === 'N' || cleanAddr === 'null' ? '' : cleanAddr,
      state: req.customerState || merchant?.state || 'Maharashtra',
    });
    const baseItems = req.items && req.items.length > 0 ? req.items : [{
      id: `it_${Date.now()}`,
      description: req.notes?.trim() || 'General Goods / Services',
      hsn: '8528',
      qty: 1,
      rate: 0,
      gstRate: 18,
    }];
    setItems(baseItems.map((it, idx) => ({
      ...it,
      description: (it.description || '').trim() || (req.notes ? req.notes.trim() : `Item #${idx + 1}`),
      hsn: (it.hsn || '8528').trim(),
      qty: Number(it.qty) || 1,
      rate: Number(it.rate) || 0,
      gstRate: Number(it.gstRate) || 18,
    })));
    setPayMode(req.paymentMode || 'cash');
    setPayRef(req.paymentRef || '');
    setNotes(req.notes || '');
    setValidationError('');
  };

  // Live GST Computation
  const comp = useMemo(() => {
    const sellerState = merchant?.state || 'Maharashtra';
    const sellerGstin = merchant?.gstin || '';
    const supplyCtx = resolveSupply({
      sellerState,
      sellerGstin,
      buyerGstin: editCustomer.gstin,
      buyerState: editCustomer.state,
    });

    return computeInvoice(items, supplyCtx);
  }, [items, editCustomer.state, editCustomer.gstin, merchant?.state, merchant?.gstin]);

  const handleUpdateItem = (idx: number, patch: Partial<RequestItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const handleAddItem = () => {
    const newItem: RequestItem = {
      id: `it_${Date.now()}`,
      description: `Item #${items.length + 1}`,
      hsn: '8528',
      qty: 1,
      rate: 0,
      gstRate: 18,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleRemoveItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // Calculator Methods matching Master Web App (src/components/MiniCalculator.tsx)
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

  // Customer PIN Verification matching Master Web App & Mobile Support
  const handleVerifyAkc = async () => {
    const rawInput = akcCode.trim();
    if (!rawInput || !akcPin || akcPin.length < 4) {
      setAkcMsg('Enter valid AKC ID / Mobile Number and 4-digit PIN.');
      return;
    }
    setAkcVerifying(true);
    setAkcMsg('');
    try {
      let verifiedCustomer: any = null;

      // 1. Try standard merchant customer-autofill with AKC ID or raw input
      try {
        const res = await api.post('/api/customer/merchant/customer-autofill', {
          customerCode: rawInput,
          pin: akcPin,
        }, { token });
        if (res && res.customer) {
          verifiedCustomer = res.customer;
        }
      } catch (e) {}

      // 2. If not found via customerCode, try direct customer login endpoint (supports phone number + PIN)
      if (!verifiedCustomer) {
        try {
          const loginRes = await api.post('/api/customer/login', {
            identifier: rawInput,
            pin: akcPin,
          });
          if (loginRes && loginRes.customer) {
            verifiedCustomer = loginRes.customer;
          }
        } catch (e) {}
      }

      if (verifiedCustomer) {
        const cust = verifiedCustomer;
        const updatedCust = {
          name: cust.name || 'AKC Customer',
          phone: cust.phone || rawInput,
          email: cust.email || '',
          gstin: cust.gstin || '',
          address: cust.billingAddress || merchant?.address || 'Address Pending',
          state: cust.state || merchant?.state || 'Maharashtra',
        };

        if (selectedRequest) {
          setEditCustomer(updatedCust);
          setAkcMsg(`✅ Verified ${cust.name || 'Customer'}! Auto-filled.`);
        } else {
          // Check if there is an existing pending request from this customer to review
          const cleanPhone = (updatedCust.phone || '').replace(/\D/g, '');
          const matchedPending = requests.find(
            (r) => r.status === 'pending' && ((r.customerPhone || '').replace(/\D/g, '').includes(cleanPhone) || (cleanPhone.length >= 10 && (r.customerPhone || '').includes(cleanPhone.slice(-10))))
          );

          if (matchedPending) {
            handleOpenReview(matchedPending);
            setAkcMsg(`✅ Verified! Opened pending request for ${updatedCust.name}.`);
          } else {
            // Start a real backend-persisted billing request for this customer immediately (matching Web App store.createRequest)
            try {
              const res = await api.post('/api/billing-requests', {
                merchantId: merchant?.id,
                customerName: updatedCust.name,
                customerPhone: updatedCust.phone,
                customerEmail: updatedCust.email || '',
                customerGstin: updatedCust.gstin || '',
                customerAddress: updatedCust.address,
                customerState: updatedCust.state,
                paymentMode: 'cash',
                items: [],
                branded: !!merchant?.customBranding,
              });
              if (res && res.request) {
                const createdReq: BillingRequest = res.request;
                setRequests((prev) => [createdReq, ...prev]);
                handleOpenReview(createdReq);
                setAkcMsg(`✅ Verified ${updatedCust.name}! Starting new invoice.`);
              } else {
                throw new Error(res?.detail || 'Failed to start billing request.');
              }
            } catch (createErr: any) {
              setAkcMsg(`Verified ${updatedCust.name}, but failed to start invoice: ${createErr.message || 'Network error'}`);
            }
          }
        }
      } else {
        setAkcMsg('Invalid AKC ID / Mobile Number or 4-digit PIN.');
      }
    } catch (err: any) {
      setAkcMsg(err.message || 'Invalid AKC ID / Mobile Number or PIN.');
    } finally {
      setAkcVerifying(false);
    }
  };

  // Real Approval Flow calling backend API
  const handleApprove = async () => {
    if (items.length === 0) {
      setValidationError('Please add at least one item before approving.');
      return;
    }

    // Auto-populate blank descriptions with clean fallbacks
    const fixedItems = items.map((it, idx) => ({
      ...it,
      description: (it.description || '').trim() || (selectedRequest?.notes ? selectedRequest.notes.trim() : `Item #${idx + 1}`),
      hsn: (it.hsn || '8528').trim(),
      qty: Number(it.qty) || 1,
      rate: Number(it.rate) || 0,
      gstRate: Number(it.gstRate) || 18,
    }));
    setItems(fixedItems);

    const hasInvalid = fixedItems.some((it) => {
      const hsnClean = (it.hsn || '').trim();
      const hsnValid = /^\d+$/.test(hsnClean) && hsnClean.length >= 4;
      return !it.description.trim() || !hsnValid || it.qty <= 0 || it.rate <= 0;
    });

    if (hasInvalid) {
      setValidationError('Make sure all items have a valid numeric HSN (min 4 digits), Quantity (>0), and Rate (>0).');
      return;
    }

    // 1. Credit Check Pre-guard matching Master Web App (Free Daily Allowance + Paid Credits)
    const lastFree = (merchant as any)?.lastFreeInvoiceAt ? Number((merchant as any).lastFreeInvoiceAt) : 0;
    const freeDailyAvailable = !lastFree || (Date.now() - lastFree >= 86400000);
    const pdfCredits = merchant?.pdfCredits ?? 0;

    if (pdfCredits <= 0 && !freeDailyAvailable) {
      Alert.alert(
        'No PDF Credits Available',
        'You have 0 PDF invoice generation credits and today\'s free daily invoice credit is on cooldown. Please recharge your plan to continue.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Recharge Plans', onPress: () => navigation?.navigate?.('Recharge') },
        ]
      );
      return;
    }

    // 2. Stock Level Validation matching Web App
    const lowStockItems: string[] = [];
    fixedItems.forEach((it) => {
      const match = inventoryList.find(
        (inv: any) => (inv.product_name || inv.name || '').toLowerCase() === (it.description || '').toLowerCase()
      );
      if (match) {
        const available = match.stock_quantity ?? match.stock ?? 0;
        if (available < it.qty) {
          lowStockItems.push(`${it.description} (Stock: ${available}, Needed: ${it.qty})`);
        }
      }
    });

    if (lowStockItems.length > 0) {
      Alert.alert(
        'Low Stock Warning',
        `The following items have insufficient stock:\n• ${lowStockItems.join('\n• ')}\n\nDo you still want to approve this invoice?`,
        [
          { text: 'Review Items', style: 'cancel' },
          { text: 'Approve Anyway', onPress: () => executeApproval(fixedItems) },
        ]
      );
      return;
    }

    await executeApproval(fixedItems);
  };

  const executeApproval = async (approvedItems?: RequestItem[]) => {
    if (!selectedRequest || !token) return;
    setActionLoading(true);
    setValidationError('');

    const targetItems = approvedItems || items;

    try {
      const existingNos = requests.map(r => r.invoiceNo || '').filter(Boolean);
      const generatedNo = nextInvoiceNumber(merchant?.invoicePrefix || 'INV', existingNos);

      const customerAddress = (editCustomer.address || '').trim() || merchant?.address || 'Address Pending';
      const customerState = (editCustomer.state || '').trim() || merchant?.state || 'Maharashtra';

      const payload = {
        requestId: selectedRequest.id,
        invoiceNo: generatedNo,
        invoiceNumber: undefined,
        customerName: editCustomer.name.trim() || 'Walk-in Customer',
        customerPhone: (editCustomer.phone || '').trim(),
        customerEmail: (editCustomer.email || '').trim() || undefined,
        customerGstin: (editCustomer.gstin || '').trim() || undefined,
        customerAddress: customerAddress,
        customerState: customerState,
        paymentMode: payMode || 'cash',
        paymentRef: (payRef || '').trim() || undefined,
        notes: (notes || '').trim() || undefined,
        items: targetItems.map((it, idx) => ({
          description: (it.description || '').trim() || (selectedRequest.notes ? selectedRequest.notes.trim() : `Item #${idx + 1}`),
          hsn: (it.hsn || '8528').trim(),
          qty: Number(it.qty) || 1,
          rate: Number(it.rate) || 0,
          gstRate: Number(it.gstRate) || 18,
          inventoryItemId: it.inventoryItemId || undefined,
        })),
        branded: !!merchant?.customBranding,
      };

      const response = await api.post('/api/merchant/invoices', payload, { token });

      if (response && response.ok && response.invoice) {
        const approvedInv = response.invoice;

        // 1. Update local requests list
        const updatedList = requests.map((r) =>
          r.id === selectedRequest.id
            ? {
                ...r,
                status: 'approved' as const,
                invoiceNo: approvedInv.invoiceNo,
                invoiceNumber: approvedInv.invoiceNumber,
                resolvedAt: Date.now(),
              }
            : r
        );
        setRequests(updatedList);
        await setCache('billing_requests', updatedList);

        // 2. Inventory Stock Auto-Deduction matching Web App
        const updatedInventory = inventoryList.map((invItem: any) => {
          const used = items.find(
            (it) => (it.description || '').toLowerCase() === (invItem.product_name || invItem.name || '').toLowerCase()
          );
          if (used) {
            const currentStock = invItem.stock_quantity ?? invItem.stock ?? 0;
            const newStock = Math.max(0, currentStock - used.qty);
            return { ...invItem, stock_quantity: newStock, stock: newStock };
          }
          return invItem;
        });
        setInventoryList(updatedInventory);
        await setCache('merchant_inventory', updatedInventory);

        // 3. Customer Party Auto-Save to Address Book
        if (editCustomer.name && editCustomer.phone) {
          const cachedContacts = (await getCache<any[]>('contacts_list')) || [];
          const existingIdx = cachedContacts.findIndex((c) => c.phone === editCustomer.phone);
          const newContact = {
            id: existingIdx >= 0 ? cachedContacts[existingIdx].id : `c_${Date.now()}`,
            name: editCustomer.name,
            phone: editCustomer.phone,
            email: editCustomer.email || '',
            gstin: editCustomer.gstin || '',
            address: editCustomer.address || '',
            state: editCustomer.state || merchant?.state || 'Maharashtra',
            createdAt: Date.now(),
          };
          const newContactsList = existingIdx >= 0
            ? cachedContacts.map((c, i) => i === existingIdx ? newContact : c)
            : [newContact, ...cachedContacts];
          await setCache('contacts_list', newContactsList);
        }

        setSelectedRequest(null);
        setCreatedInvoice(approvedInv);
        refreshProfile();
      } else {
        setValidationError(response.message || 'Approval failed.');
      }
    } catch (err: any) {
      setValidationError(err.message || 'Approval request failed.');
    } finally {
      setActionLoading(false);
    }
  };

  // Real Rejection Flow
  const handleConfirmReject = async () => {
    if (!selectedRequest || !token) return;
    setActionLoading(true);
    try {
      await api.post(`/api/merchant/billing-requests/${selectedRequest.id}/reject`, {
        reason: rejectReason.trim() || 'Request declined by merchant',
      }, { token });

      const updatedList = requests.map((r) =>
        r.id === selectedRequest.id
          ? { ...r, status: 'rejected' as const, rejectReason: rejectReason, resolvedAt: Date.now() }
          : r
      );

      setRequests(updatedList);
      await setCache('billing_requests', updatedList);
      setShowRejectModal(false);
      setSelectedRequest(null);
      setRejectReason('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not reject request.');
    } finally {
      setActionLoading(false);
    }
  };

  const renderRequestCard = ({ item }: { item: BillingRequest }) => {
    const itemCount = (item.items || []).length;
    const estTotal = (item.items || []).reduce((acc, it) => acc + (it.qty || 1) * (it.rate || 0) * (1 + (it.gstRate || 0) / 100), 0);

    return (
      <Card style={st.card}>
        <Pressable onPress={() => handleOpenReview(item)}>
          <View style={st.cardHeader}>
            <View style={st.cardHeaderLeft}>
              <Avatar name={item.customerName || 'Customer'} size={42} color={Theme.primary} />
              <View style={st.cardTitleCol}>
                <Text style={st.custName}>{item.customerName || 'Walk-in Customer'}</Text>
                <Text style={st.custPhone}>📞 {item.customerPhone || 'Direct Store Request'}</Text>
              </View>
            </View>
            <StatusBadge status={item.status as any} />
          </View>

          <View style={st.cardMetaRow}>
            <View style={st.metaItem}>
              <Ionicons name="cart-outline" size={14} color={Theme.onSurfaceVariant} />
              <Text style={st.metaText}>{itemCount} line item{itemCount !== 1 ? 's' : ''}</Text>
            </View>
            {item.customerGstin ? (
              <View style={st.gstinTag}>
                <Text style={st.gstinTagText}>B2B · {item.customerGstin.slice(0, 2)}</Text>
              </View>
            ) : (
              <View style={st.b2cTag}>
                <Text style={st.b2cTagText}>B2C Consumer</Text>
              </View>
            )}
            <View style={st.metaItem}>
              <Ionicons name="time-outline" size={14} color={Theme.onSurfaceVariant} />
              <Text style={st.metaText}>
                {new Date(item.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>

          <Divider style={{ marginVertical: 10 }} />

          <View style={st.itemsPreview}>
            {(item.items || []).slice(0, 2).map((it, idx) => (
              <View key={idx} style={st.itemPreviewRow}>
                <Text style={st.itemPreviewName} numberOfLines={1}>
                  {it.qty}x {it.description || 'Unspecified Item'}
                </Text>
                <Text style={st.itemPreviewRate}>
                  ₹{(it.rate * (1 + (it.gstRate || 0) / 100)).toFixed(0)}
                </Text>
              </View>
            ))}
            {(item.items || []).length > 2 && (
              <Text style={st.moreItemsText}>+{(item.items || []).length - 2} more items</Text>
            )}
          </View>

          <View style={st.cardFooter}>
            <View>
              <Text style={st.estLabel}>ESTIMATED TOTAL</Text>
              <Text style={st.estValue}>{estTotal > 0 ? formatCurrency(estTotal) : 'Pending Rate'}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {item.status === 'pending' ? (
                <GradientButton
                  title="Review & Invoice"
                  size="sm"
                  icon="receipt-outline"
                  onPress={() => handleOpenReview(item)}
                />
              ) : (
                <OutlineButton
                  title="View Details"
                  size="sm"
                  icon="eye-outline"
                  onPress={() => handleOpenReview(item)}
                />
              )}
            </View>
          </View>
        </Pressable>
      </Card>
    );
  };

  return (
    <View style={st.container}>
      {/* Requests List with integrated header & 4-tab responsive filter */}
      <FlatList
        data={filteredRequests}
        keyExtractor={(item) => item.id}
        renderItem={renderRequestCard}
        contentContainerStyle={st.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshing={loading}
        onRefresh={async () => {
          if (!token) return;
          try {
            const res = await api.get('/api/merchant/billing-requests', { token });
            if (res && res.requests) {
              setRequests(res.requests);
              await setCache('billing_requests', res.requests);
            }
          } catch {}
        }}
        ListHeaderComponent={
          <View>
            {/* Top Header */}
            <View style={st.topBar}>
              <View>
                <Text style={st.topBarTitle}>Billing Requests</Text>
                <Text style={{ color: Theme.onSurfaceVariant, fontSize: 11, marginTop: 1 }}>Request Center &amp; Live Invoicing</Text>
              </View>
              <View style={st.badgeRow}>
                <View style={st.pendingBadge}>
                  <Text style={st.pendingBadgeText}>{counts.pending} PENDING</Text>
                </View>
              </View>
            </View>

            {/* Nationwide Customer AKC Lookup / PIN Verify */}
            <View style={{ marginBottom: 10 }}>
              <View style={st.akcBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="key-outline" size={16} color={Theme.primary} />
                    <Text style={st.akcTitle}>Customer AKC PIN Verification</Text>
                  </View>
                  <View style={st.akcBadge}><Text style={st.akcBadgeText}>Fast Invoice</Text></View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TextInput
                    style={[st.sheetInput, { flex: 1.4, paddingVertical: 6 }]}
                    placeholder="AKC ID / Mobile (e.g. 9380617973)"
                    placeholderTextColor={Theme.onSurfaceDisabled}
                    value={akcCode}
                    onChangeText={setAkcCode}
                  />
                  <TextInput
                    style={[st.sheetInput, { flex: 1, paddingVertical: 6 }]}
                    placeholder="4-Digit PIN"
                    placeholderTextColor={Theme.onSurfaceDisabled}
                    value={akcPin}
                    onChangeText={(t) => setAkcPin(t.replace(/\D/g, ''))}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry
                  />
                  <Pressable
                    style={[st.akcBtn, akcVerifying && { opacity: 0.6 }]}
                    onPress={handleVerifyAkc}
                    disabled={akcVerifying}
                  >
                    <Text style={st.akcBtnText}>{akcVerifying ? '...' : 'Verify'}</Text>
                  </Pressable>
                </View>
                {akcMsg ? (
                  <Text style={{ color: akcMsg.includes('✅') ? Theme.success : Theme.error, fontSize: 11, marginTop: 6, fontWeight: '600' }}>
                    {akcMsg}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Search Bar */}
            <View style={{ marginBottom: 10 }}>
              <SearchBar
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by customer, phone, or GSTIN..."
              />
            </View>

            {/* 4-Tab Responsive Segmented Filter (No cut-off, fits all screen sizes) */}
            <View style={st.filterRow}>
              <Pressable
                style={[st.filterTab, filter === 'all' && st.filterTabActive]}
                onPress={() => setFilter('all')}
              >
                {filter === 'all' && <MaterialIcons name="check" size={13} color={Theme.primary} style={{ marginRight: 2 }} />}
                <Text style={[st.filterTabText, filter === 'all' && st.filterTabTextActive]}>
                  All ({counts.all})
                </Text>
              </Pressable>
              <Pressable
                style={[st.filterTab, filter === 'pending' && st.filterTabActive]}
                onPress={() => setFilter('pending')}
              >
                {filter === 'pending' && <MaterialIcons name="check" size={13} color={Theme.primary} style={{ marginRight: 2 }} />}
                <Text style={[st.filterTabText, filter === 'pending' && st.filterTabTextActive]}>
                  Pending ({counts.pending})
                </Text>
              </Pressable>
              <Pressable
                style={[st.filterTab, filter === 'approved' && st.filterTabActive]}
                onPress={() => setFilter('approved')}
              >
                {filter === 'approved' && <MaterialIcons name="check" size={13} color={Theme.primary} style={{ marginRight: 2 }} />}
                <Text style={[st.filterTabText, filter === 'approved' && st.filterTabTextActive]}>
                  Approved ({counts.approved})
                </Text>
              </Pressable>
              <Pressable
                style={[st.filterTab, filter === 'rejected' && st.filterTabActive]}
                onPress={() => setFilter('rejected')}
              >
                {filter === 'rejected' && <MaterialIcons name="check" size={13} color={Theme.primary} style={{ marginRight: 2 }} />}
                <Text style={[st.filterTabText, filter === 'rejected' && st.filterTabTextActive]}>
                  Rejected ({counts.rejected})
                </Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={st.emptyBox}>
            <MaterialIcons name="inbox" size={48} color={Theme.onSurfaceDisabled} />
            <Text style={st.emptyTitle}>No Requests Found</Text>
            <Text style={st.emptySub}>
              {filter === 'pending' ? 'No pending requests right now. Customers scan your QR to request bills.' : 'No billing requests match your search criteria.'}
            </Text>
          </View>
        }
      />

      {/* ════════════════════════════════════════════════════ */}
      {/* REVIEW & INVOICE BOTTOM SHEET                        */}
      {/* ════════════════════════════════════════════════════ */}
      <BottomSheet
        visible={!!selectedRequest}
        onDismiss={() => setSelectedRequest(null)}
        title={selectedRequest?.status === 'pending' ? 'Review & Generate Tax Invoice' : 'Invoice Request Details'}
      >
        {selectedRequest && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 580 }}
            contentContainerStyle={{ paddingBottom: 64 }}
          >
            {/* Customer Details Box */}
            <View style={st.sheetCard}>
              <View style={st.sheetCardHead}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="person-circle-outline" size={18} color={Theme.primary} />
                  <Text style={st.sheetSectionTitle}>CUSTOMER DETAILS</Text>
                </View>
                {selectedRequest.status === 'pending' && (
                  <Pressable onPress={() => setEditCust(!editCust)}>
                    <Text style={st.editLink}>{editCust ? 'Done' : 'Edit'}</Text>
                  </Pressable>
                )}
              </View>

              {!editCust ? (
                <View style={{ gap: 4 }}>
                  <Text style={st.custDetailName}>{editCustomer.name || 'Walk-in Customer'}</Text>
                  {editCustomer.phone ? (
                    <Text style={st.custDetailText}>
                      📞 {editCustomer.phone} {editCustomer.email ? `· ✉️ ${editCustomer.email}` : ''}
                    </Text>
                  ) : editCustomer.email ? (
                    <Text style={st.custDetailText}>✉️ {editCustomer.email}</Text>
                  ) : null}
                  <Text style={st.custDetailText}>
                    📍 {editCustomer.address && editCustomer.address.trim() !== 'N' ? `${editCustomer.address.trim()}, ` : ''}{editCustomer.state || 'Local State'}
                  </Text>
                  {editCustomer.gstin ? (
                    <Text style={st.gstinText}>GSTIN: {editCustomer.gstin} (B2B)</Text>
                  ) : null}
                </View>
              ) : (
                <View style={{ gap: 8, marginTop: 4 }}>
                  <TextInput
                    style={st.sheetInput}
                    placeholder="Customer Name"
                    placeholderTextColor={Theme.onSurfaceDisabled}
                    value={editCustomer.name}
                    onChangeText={(t) => setEditCustomer((c) => ({ ...c, name: t }))}
                  />
                  <TextInput
                    style={st.sheetInput}
                    placeholder="Phone Number"
                    placeholderTextColor={Theme.onSurfaceDisabled}
                    value={editCustomer.phone}
                    onChangeText={(t) => setEditCustomer((c) => ({ ...c, phone: t }))}
                    keyboardType="phone-pad"
                  />
                  <TextInput
                    style={st.sheetInput}
                    placeholder="Email (Optional)"
                    placeholderTextColor={Theme.onSurfaceDisabled}
                    value={editCustomer.email}
                    onChangeText={(t) => setEditCustomer((c) => ({ ...c, email: t }))}
                  />
                  <TextInput
                    style={st.sheetInput}
                    placeholder="GSTIN for B2B (Optional)"
                    placeholderTextColor={Theme.onSurfaceDisabled}
                    value={editCustomer.gstin}
                    onChangeText={(t) => setEditCustomer((c) => ({ ...c, gstin: t.toUpperCase() }))}
                    autoCapitalize="characters"
                  />
                  <TextInput
                    style={st.sheetInput}
                    placeholder="Billing Address"
                    placeholderTextColor={Theme.onSurfaceDisabled}
                    value={editCustomer.address}
                    onChangeText={(t) => setEditCustomer((c) => ({ ...c, address: t }))}
                  />
                  <Pressable onPress={() => setShowStatePicker(true)} style={st.stateSelectBtn}>
                    <Text style={{ color: Theme.onSurfaceDisabled, fontSize: 11 }}>State / Place of Supply</Text>
                    <Text style={{ color: Theme.onSurface, fontSize: 14, fontWeight: '500', marginTop: 2 }}>{editCustomer.state} ▾</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {/* Place of Supply Banner */}
            <PlaceOfSupplyBanner
              placeOfSupply={comp.placeOfSupply}
              isInterState={comp.isInterState}
            />

            {/* Line Items Section */}
            <View style={st.sheetCard}>
              <View style={st.sheetCardHead}>
                <Text style={st.sheetSectionTitle}>ITEMS · HSN · GST RATE</Text>
                {selectedRequest.status === 'pending' && (
                  <Pressable onPress={handleAddItem} style={st.addItemBtn}>
                    <Ionicons name="add-circle" size={16} color={Theme.primary} />
                    <Text style={st.addItemText}>Add Item</Text>
                  </Pressable>
                )}
              </View>

              {items.map((item, idx) => {
                const sug = suggestHsn(item.description);
                return (
                  <View key={item.id || idx} style={st.itemBox}>
                    <View style={st.itemBoxHead}>
                      <Text style={st.itemIdx}>#{idx + 1}</Text>
                      <TextInput
                        style={st.itemDescInput}
                        placeholder="Item Description"
                        placeholderTextColor={Theme.onSurfaceDisabled}
                        value={item.description}
                        onChangeText={(t) => handleUpdateItem(idx, { description: t })}
                        editable={selectedRequest.status === 'pending'}
                      />
                      {selectedRequest.status === 'pending' && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Pressable
                            onPress={() => setInvPickerIdx(idx)}
                            hitSlop={6}
                            style={st.itemActionIconBtn}
                          >
                            <Text style={{ fontSize: 13 }}>📦</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              setCalcIdx(idx);
                              setCalcDisplay(String(item.rate || '0'));
                              setCalcPrev(null);
                              setCalcOp(null);
                            }}
                            hitSlop={6}
                            style={st.itemActionIconBtn}
                          >
                            <MaterialIcons name="calculate" size={17} color={Theme.primary} />
                          </Pressable>
                          <Pressable onPress={() => handleRemoveItem(idx)} hitSlop={6} style={st.itemActionIconBtn}>
                            <MaterialIcons name="delete-outline" size={18} color={Theme.error} />
                          </Pressable>
                        </View>
                      )}
                    </View>

                    {/* AI HSN Suggestion Chip matching Master Web App */}
                    {selectedRequest.status === 'pending' && sug && (item.hsn !== sug.hsn || item.gstRate !== sug.gstRate) ? (
                      <View style={{ marginTop: 4 }}>
                        <HsnSuggestChip
                          suggestedHsn={sug.hsn}
                          suggestedGst={sug.gstRate}
                          onApply={() => handleUpdateItem(idx, { hsn: sug.hsn, gstRate: sug.gstRate })}
                        />
                      </View>
                    ) : null}

                    <View style={st.itemGridRow}>
                      <View style={{ flex: 1.2 }}>
                        <Text style={st.smallLabel}>HSN</Text>
                        <TextInput
                          style={st.gridInput}
                          placeholder="HSN"
                          placeholderTextColor={Theme.onSurfaceDisabled}
                          value={item.hsn}
                          onChangeText={(t) => handleUpdateItem(idx, { hsn: t })}
                          keyboardType="number-pad"
                          maxLength={8}
                          editable={selectedRequest.status === 'pending'}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={st.smallLabel}>Qty</Text>
                        <TextInput
                          style={st.gridInput}
                          placeholder="Qty"
                          placeholderTextColor={Theme.onSurfaceDisabled}
                          value={String(item.qty || '')}
                          onChangeText={(t) => handleUpdateItem(idx, { qty: parseFloat(t) || 0 })}
                          keyboardType="numeric"
                          editable={selectedRequest.status === 'pending'}
                        />
                      </View>
                      <View style={{ flex: 1.5 }}>
                        <Text style={st.smallLabel}>Rate (₹)</Text>
                        <TextInput
                          style={st.gridInput}
                          placeholder="Rate"
                          placeholderTextColor={Theme.onSurfaceDisabled}
                          value={String(item.rate || '')}
                          onChangeText={(t) => handleUpdateItem(idx, { rate: parseFloat(t) || 0 })}
                          keyboardType="numeric"
                          editable={selectedRequest.status === 'pending'}
                        />
                      </View>
                    </View>

                    {/* GST Rate Selector */}
                    {selectedRequest.status === 'pending' && (
                      <View style={{ marginTop: 10 }}>
                        <Text style={st.smallLabel}>GST Slab Rate</Text>
                        <GstRateSelector
                          value={item.gstRate}
                          onChange={(rate) => handleUpdateItem(idx, { gstRate: rate })}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Payment & Notes */}
            {selectedRequest.status === 'pending' && (
              <View style={st.sheetCard}>
                <Text style={st.sheetSectionTitle}>PAYMENT MODE & NOTES</Text>
                <PaymentModePicker value={payMode as any} onChange={setPayMode} style={{ marginTop: 8 }} />
                <TextInput
                  style={[st.sheetInput, { marginTop: 10 }]}
                  placeholder="Payment Reference (UTR / Txn ID)"
                  placeholderTextColor={Theme.onSurfaceDisabled}
                  value={payRef}
                  onChangeText={setPayRef}
                />
                <TextInput
                  style={[st.sheetInput, { marginTop: 8 }]}
                  placeholder="Notes / Instructions"
                  placeholderTextColor={Theme.onSurfaceDisabled}
                  value={notes}
                  onChangeText={setNotes}
                />
              </View>
            )}

            {/* Live GST Calculation Summary */}
            <View style={st.totalsCard}>
              <View style={st.calcRow}><Text style={st.calcLabel}>Taxable Value</Text><Text style={st.calcVal}>{formatCurrency(comp.taxableValue)}</Text></View>
              {comp.isInterState ? (
                <View style={st.calcRow}><Text style={st.calcLabel}>IGST</Text><Text style={[st.calcVal, { color: Theme.primary }]}>{formatCurrency(comp.totalIgst)}</Text></View>
              ) : (
                <>
                  <View style={st.calcRow}><Text style={st.calcLabel}>CGST</Text><Text style={[st.calcVal, { color: Theme.primary }]}>{formatCurrency(comp.totalCgst)}</Text></View>
                  <View style={st.calcRow}><Text style={st.calcLabel}>SGST</Text><Text style={[st.calcVal, { color: Theme.primary }]}>{formatCurrency(comp.totalSgst)}</Text></View>
                </>
              )}
              {comp.roundOff !== 0 && (
                <View style={st.calcRow}><Text style={st.calcLabel}>Round Off</Text><Text style={st.calcVal}>{comp.roundOff > 0 ? `+₹${comp.roundOff}` : `-₹${Math.abs(comp.roundOff)}`}</Text></View>
              )}
              <Divider />
              <View style={st.calcRow}>
                <Text style={st.grandLabel}>Grand Total</Text>
                <Text style={st.grandVal}>{formatCurrency(comp.grandTotal)}</Text>
              </View>
            </View>

            {validationError ? (
              <Text style={st.valError}>{validationError}</Text>
            ) : null}

            {/* Action Buttons */}
            {selectedRequest.status === 'pending' ? (
              <View style={st.actionButtons}>
                <OutlineButton
                  title="Reject"
                  color={Theme.error}
                  icon="close-outline"
                  style={{ flex: 1 }}
                  disabled={actionLoading}
                  onPress={() => setShowRejectModal(true)}
                />
                <GradientButton
                  title={actionLoading ? 'Creating Invoice...' : 'Approve & Generate'}
                  icon="checkmark-circle-outline"
                  style={{ flex: 2 }}
                  disabled={actionLoading}
                  onPress={handleApprove}
                />
              </View>
            ) : (
              <View style={{ marginTop: 12 }}>
                <OutlineButton
                  title="Close"
                  onPress={() => setSelectedRequest(null)}
                />
              </View>
            )}
          </ScrollView>
        )}
      </BottomSheet>

      {/* ════════════════════════════════════════════════════ */}
      {/* REJECT REASON MODAL                                 */}
      {/* ════════════════════════════════════════════════════ */}
      <Modal visible={showRejectModal} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalContainer}>
            <Text style={st.modalTitle}>Reject Billing Request?</Text>
            <Text style={st.modalSub}>Optionally enter a reason for rejecting this customer request:</Text>
            <TextInput
              style={st.rejectInput}
              placeholder="e.g. Out of stock, pricing mismatch..."
              placeholderTextColor={Theme.onSurfaceDisabled}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <OutlineButton title="Cancel" onPress={() => setShowRejectModal(false)} style={{ flex: 1 }} />
              <FilledButton title={actionLoading ? 'Rejecting...' : 'Confirm Reject'} color="error" onPress={handleConfirmReject} disabled={actionLoading} style={{ flex: 1.5 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════ */}
      {/* INVOICE SUCCESS MODAL                                */}
      {/* ════════════════════════════════════════════════════ */}
      <Modal visible={!!createdInvoice} transparent animationType="slide">
        <View style={st.modalOverlay}>
          <View style={[st.modalContainer, { maxWidth: 360, alignItems: 'center' }]}>
            <View style={st.successCircle}>
              <Ionicons name="checkmark-circle" size={54} color={Theme.success} />
            </View>
            <Text style={st.successTitle}>Invoice Generated!</Text>
            <Text style={st.successInvNo}>{createdInvoice?.invoiceNo || 'INV/2025-26/0000'}</Text>
            <Text style={st.successSub}>
              Tax Invoice of {formatCurrency(createdInvoice?.grandTotal || 0)} created and synced with double-entry ledgers.
            </Text>

            <View style={{ width: '100%', gap: 10, marginTop: 20 }}>
              <GradientButton
                title="Share PDF Invoice"
                icon="document-text-outline"
                onPress={async () => {
                  if (createdInvoice && merchant) {
                    try {
                      await shareInvoicePdf(createdInvoice, merchant as any);
                    } catch (e: any) {
                      Alert.alert('Sharing Error', e.message || 'Could not share PDF file.');
                    }
                  }
                }}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <OutlineButton
                  title="Print PDF"
                  icon="print-outline"
                  style={{ flex: 1 }}
                  onPress={async () => {
                    if (createdInvoice && merchant) {
                      try {
                        await printInvoicePdf(createdInvoice, merchant as any);
                      } catch (e: any) {}
                    }
                  }}
                />
                <OutlineButton
                  title="Done"
                  style={{ flex: 1 }}
                  onPress={() => setCreatedInvoice(null)}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════ */}
      {/* STATE PICKER MODAL                                   */}
      {/* ════════════════════════════════════════════════════ */}
      <Modal visible={showStatePicker} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={[st.modalContainer, { maxHeight: 450 }]}>
            <Text style={st.modalTitle}>Select Place of Supply (State)</Text>
            <ScrollView style={{ marginTop: 12 }}>
              {INDIAN_STATES.map((s) => (
                <Pressable
                  key={s}
                  style={[st.stateItem, editCustomer.state === s && st.stateItemActive]}
                  onPress={() => {
                    setEditCustomer((c) => ({ ...c, state: s }));
                    setShowStatePicker(false);
                  }}
                >
                  <Text style={[st.stateText, editCustomer.state === s && st.stateTextActive]}>{s}</Text>
                  {editCustomer.state === s && <Ionicons name="checkmark" size={18} color={Theme.primary} />}
                </Pressable>
              ))}
            </ScrollView>
            <OutlineButton title="Cancel" onPress={() => setShowStatePicker(false)} style={{ marginTop: 12 }} />
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════ */}
      {/* INVENTORY PICKER MODAL (matching Master Web App)     */}
      {/* ════════════════════════════════════════════════════ */}
      <Modal visible={invPickerIdx !== null} transparent animationType="slide">
        <View style={st.modalOverlay}>
          <View style={[st.modalContainer, { maxHeight: 480 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 18 }}>📦</Text>
                <Text style={st.modalTitle}>Pick Item from Inventory</Text>
              </View>
              <Pressable onPress={() => setInvPickerIdx(null)} hitSlop={10}>
                <Ionicons name="close-circle" size={22} color={Theme.onSurfaceDisabled} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 340 }}>
              {inventoryList.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: Theme.onSurfaceDisabled }}>No products saved in your inventory yet.</Text>
                </View>
              ) : (
                inventoryList.map((prod, pIdx) => {
                  const pName = prod.product_name || prod.name || 'Product';
                  const pHsn = prod.hsn_code || prod.hsn || '8528';
                  const pPrice = Number(prod.selling_price || prod.price || prod.rate || 0);
                  const pGst = Number(prod.gst_rate || prod.gstRate || 18);
                  const pStock = prod.stock_quantity ?? prod.stock ?? 0;

                  return (
                    <Pressable
                      key={prod.id || pIdx}
                      style={st.invItemRow}
                      onPress={() => {
                        if (invPickerIdx !== null) {
                          handleUpdateItem(invPickerIdx, {
                            description: pName,
                            hsn: pHsn,
                            rate: pPrice,
                            gstRate: pGst,
                            inventoryItemId: prod.id,
                          });
                          setInvPickerIdx(null);
                        }
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={st.invItemName}>{pName}</Text>
                        <Text style={st.invItemMeta}>HSN: {pHsn} · GST: {pGst}% · Stock: {pStock}</Text>
                      </View>
                      <Text style={st.invItemPrice}>{formatCurrency(pPrice)}</Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
            <OutlineButton title="Cancel" onPress={() => setInvPickerIdx(null)} style={{ marginTop: 12 }} />
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════ */}
      {/* MINI CALCULATOR MODAL (matching Master Web App)      */}
      {/* ════════════════════════════════════════════════════ */}
      <Modal visible={calcIdx !== null} transparent animationType="slide">
        <View style={st.modalOverlay}>
          <View style={[st.modalContainer, { maxWidth: 320, padding: 16 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="calculate" size={20} color={Theme.primary} />
                <Text style={st.modalTitle}>Rate Calculator</Text>
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
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 8, paddingBottom: 12,
  },
  topBarTitle: { color: Theme.onSurface, fontSize: Theme.titleLarge, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', gap: 6 },
  pendingBadge: { backgroundColor: 'rgba(245,158,11,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pendingBadgeText: { color: Theme.tertiary, fontSize: 11, fontWeight: '800' },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  filterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
    paddingHorizontal: 2,
    borderRadius: Theme.shapeSm,
    borderWidth: 1,
    borderColor: Theme.outlineVariant,
    backgroundColor: Theme.surface2,
  },
  filterTabActive: {
    backgroundColor: Theme.primaryContainer,
    borderColor: Theme.primary,
  },
  filterTabText: {
    color: Theme.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: Theme.primary,
    fontWeight: '700',
  },
  listContent: { padding: 16, paddingBottom: 96, gap: 12 },
  card: { padding: 14, backgroundColor: Theme.surface2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardHeaderLeft: { flexDirection: 'row', gap: 12, flex: 1 },
  cardTitleCol: { flex: 1 },
  custName: { color: Theme.onSurface, fontSize: 15, fontWeight: '700' },
  custPhone: { color: Theme.onSurfaceVariant, fontSize: 12, marginTop: 2 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: Theme.onSurfaceDisabled, fontSize: 11 },
  gstinTag: { backgroundColor: Theme.primaryContainer, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  gstinTagText: { color: Theme.primary, fontSize: 10, fontWeight: '700' },
  b2cTag: { backgroundColor: Theme.surface4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  b2cTagText: { color: Theme.onSurfaceDisabled, fontSize: 10, fontWeight: '600' },
  itemsPreview: { gap: 4 },
  itemPreviewRow: { flexDirection: 'row', justifyContent: 'space-between' },
  itemPreviewName: { color: Theme.onSurfaceVariant, fontSize: 12, flex: 1 },
  itemPreviewRate: { color: Theme.onSurface, fontSize: 12, fontWeight: '600' },
  moreItemsText: { color: Theme.tertiary, fontSize: 11, marginTop: 2 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Theme.outlineVariant },
  estLabel: { color: Theme.onSurfaceDisabled, fontSize: 10, fontWeight: '600' },
  estValue: { color: Theme.primary, fontSize: 16, fontWeight: '800' },
  emptyBox: { padding: 48, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: Theme.onSurface, fontSize: 16, fontWeight: '700', marginTop: 12 },
  emptySub: { color: Theme.onSurfaceDisabled, fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 },

  // AKC PIN Verification Box
  akcBox: {
    backgroundColor: 'rgba(2,132,199,0.1)',
    borderRadius: Theme.shapeMd,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(2,132,199,0.25)',
  },
  akcTitle: { color: '#38BDF8', fontSize: 12, fontWeight: '700' },
  akcBadge: { backgroundColor: 'rgba(2,132,199,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  akcBadgeText: { color: '#38BDF8', fontSize: 9, fontWeight: '700' },
  akcBtn: { backgroundColor: '#0284C7', paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', borderRadius: Theme.shapeSm },
  akcBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Sheet styling
  sheetCard: { backgroundColor: Theme.surface3, borderRadius: Theme.shapeMd, padding: 14, marginBottom: 12 },
  sheetCardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sheetSectionTitle: { color: Theme.onSurfaceDisabled, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  editLink: { color: Theme.primary, fontSize: 12, fontWeight: '700' },
  custDetailName: { color: Theme.onSurface, fontSize: 14, fontWeight: '700' },
  custDetailText: { color: Theme.onSurfaceVariant, fontSize: 12 },
  gstinText: { color: Theme.primary, fontSize: 12, fontWeight: '600' },
  sheetInput: { backgroundColor: Theme.surface4, color: Theme.onSurface, borderRadius: Theme.shapeSm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  stateSelectBtn: { backgroundColor: Theme.surface4, borderRadius: Theme.shapeSm, padding: 10 },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addItemText: { color: Theme.primary, fontSize: 12, fontWeight: '600' },
  itemBox: { backgroundColor: Theme.surface4, borderRadius: Theme.shapeSm, padding: 10, marginBottom: 10 },
  itemBoxHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemIdx: { color: Theme.primary, fontSize: 12, fontWeight: '700' },
  itemDescInput: { flex: 1, color: Theme.onSurface, fontSize: 13, paddingVertical: 4 },
  itemActionIconBtn: { width: 30, height: 30, borderRadius: 6, backgroundColor: Theme.surface3, alignItems: 'center', justifyContent: 'center' },
  itemGridRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  smallLabel: { color: Theme.onSurfaceDisabled, fontSize: 10, marginBottom: 2 },
  gridInput: { backgroundColor: Theme.surface2, color: Theme.onSurface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12 },
  totalsCard: { backgroundColor: Theme.surface2, borderRadius: Theme.shapeMd, padding: 14, marginVertical: 8, borderWidth: 1, borderColor: Theme.outlineVariant },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  calcLabel: { color: Theme.onSurfaceVariant, fontSize: 12 },
  calcVal: { color: Theme.onSurface, fontSize: 13, fontWeight: '600' },
  grandLabel: { color: Theme.onSurface, fontSize: 14, fontWeight: '700' },
  grandVal: { color: Theme.primary, fontSize: 18, fontWeight: '800' },
  valError: { color: Theme.error, fontSize: 12, marginTop: 6, textAlign: 'center' },
  actionButtons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContainer: { width: '100%', maxWidth: 420, backgroundColor: Theme.surface2, borderRadius: Theme.shapeXl, padding: 20, borderWidth: 1, borderColor: Theme.outlineVariant },
  modalTitle: { color: Theme.onSurface, fontSize: 16, fontWeight: '700' },
  modalSub: { color: Theme.onSurfaceVariant, fontSize: 12, marginTop: 4, marginBottom: 12 },
  rejectInput: { backgroundColor: Theme.surface3, color: Theme.onSurface, borderRadius: Theme.shapeSm, padding: 12, height: 80, textAlignVertical: 'top', fontSize: 13 },
  successCircle: { marginBottom: 12 },
  successTitle: { color: Theme.onSurface, fontSize: 18, fontWeight: '800' },
  successInvNo: { color: Theme.primary, fontSize: 15, fontWeight: '700', marginTop: 4 },
  successSub: { color: Theme.onSurfaceVariant, fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  stateItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Theme.outlineVariant },
  stateItemActive: { backgroundColor: Theme.surface3, paddingHorizontal: 8, borderRadius: 6 },
  stateText: { color: Theme.onSurface, fontSize: 13 },
  stateTextActive: { color: Theme.primary, fontWeight: '700' },

  // Inventory Item Row in Picker Modal
  invItemRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: Theme.outlineVariant,
    backgroundColor: Theme.surface3, borderRadius: 8, marginBottom: 6,
  },
  invItemName: { color: Theme.onSurface, fontSize: 13, fontWeight: '700' },
  invItemMeta: { color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 2 },
  invItemPrice: { color: Theme.tertiary, fontSize: 14, fontWeight: '800' },

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

