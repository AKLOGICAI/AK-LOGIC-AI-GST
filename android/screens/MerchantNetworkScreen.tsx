import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView,
  Modal, Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Theme } from '../lib/theme';
import {
  SearchBar, Card, Avatar, GradientButton, OutlineButton,
  TopAppBar, InputField, Snackbar, SectionHeader, Divider,
} from '../components/DesignSystem';
import { useMerchant } from '../lib/MerchantContext';
import { api } from '../lib/apiClient';
import { getCache, setCache } from '../lib/offlineCache';

type NetworkTab = 'feed' | 'deals' | 'directory';

export default function MerchantNetworkScreen({ navigation }: { navigation?: any }) {
  const { token, merchant } = useMerchant();
  const [tab, setTab] = useState<NetworkTab>('feed');
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState<boolean>(true);
  const [networkRequests, setNetworkRequests] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [directory, setDirectory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Broadcast Modal State
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [productName, setProductName] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('pcs');
  const [targetPrice, setTargetPrice] = useState('');
  const [urgency, setUrgency] = useState<'normal' | 'urgent'>('urgent');
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  // Chat / Message Modal State
  const [activeChatMerchant, setActiveChatMerchant] = useState<any | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  // Snackbar
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarText, setSnackbarText] = useState('');

  const notify = (msg: string) => {
    setSnackbarText(msg);
    setShowSnackbar(true);
    setTimeout(() => setShowSnackbar(false), 3000);
  };

  const checkTermsAndLoad = async () => {
    const terms = await getCache<boolean>('network_terms_accepted');
    if (terms === false) {
      setHasAcceptedTerms(false);
    } else {
      setHasAcceptedTerms(true);
    }

    const cachedReqs = await getCache<any[]>('network_requests');
    const cachedDeals = await getCache<any[]>('network_deals');
    const cachedDir = await getCache<any[]>('network_directory');
    if (cachedReqs) setNetworkRequests(cachedReqs);
    if (cachedDeals) setDeals(cachedDeals);
    if (cachedDir) setDirectory(cachedDir);

    if (!token) return;
    setLoading(true);

    try {
      const [reqsRes, dealsRes, dirRes] = await Promise.allSettled([
        api.get('/api/merchant/merchant-network/nearby-requests', { token }),
        api.get('/api/merchant/merchant-network/deals', { token }),
        api.get('/api/merchant/merchant-network/directory', { token }),
      ]);

      if (reqsRes.status === 'fulfilled' && reqsRes.value?.requests) {
        setNetworkRequests(reqsRes.value.requests);
        await setCache('network_requests', reqsRes.value.requests);
      }
      if (dealsRes.status === 'fulfilled' && dealsRes.value?.deals) {
        setDeals(dealsRes.value.deals);
        await setCache('network_deals', dealsRes.value.deals);
      }
      if (dirRes.status === 'fulfilled' && dirRes.value?.merchants) {
        setDirectory(dirRes.value.merchants);
        await setCache('network_directory', dirRes.value.merchants);
      }
    } catch (err) {
      console.warn('Network data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkTermsAndLoad();
  }, [token]);

  const handleAcceptTerms = async () => {
    setHasAcceptedTerms(true);
    await setCache('network_terms_accepted', true);
    notify('Welcome to AK-LOGIC Verified Merchant B2B Network! 🤝');
  };

  const handlePostBroadcast = async () => {
    if (!productName.trim()) {
      Alert.alert('Required', 'Please enter required product name.');
      return;
    }
    if (!token) return;
    setBroadcastLoading(true);

    try {
      const payload = {
        product_name: productName.trim(),
        quantity: parseFloat(qty) || 1,
        unit: unit.trim() || 'pcs',
        target_price: parseFloat(targetPrice) || undefined,
        urgency: urgency,
        city: merchant?.city || 'Mumbai',
        state: merchant?.state || 'Maharashtra',
        origin: 'direct',
      };

      const res = await api.post('/api/merchant/merchant-network/post-request', payload, { token });
      const newReq = (res && res.request) || {
        id: `req_${Date.now()}`,
        shopName: merchant?.shopName || 'My Store',
        product_name: productName.trim(),
        quantity: parseFloat(qty) || 1,
        unit,
        urgency,
        city: merchant?.city || 'Local',
        createdAt: Date.now(),
      };

      const updated = [newReq, ...networkRequests];
      setNetworkRequests(updated);
      await setCache('network_requests', updated);

      setShowBroadcastModal(false);
      setProductName('');
      setTargetPrice('');
      notify('B2B Stock demand broadcasted to nearby verified merchants! 📡');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not broadcast request.');
    } finally {
      setBroadcastLoading(false);
    }
  };

  const handleOpenChat = (partner: any) => {
    setActiveChatMerchant(partner);
    setChatMessages([
      { id: '1', sender: partner.shopName || 'Merchant', text: `Hi! We noticed your demand for ${partner.product_name || 'stock'}. We have ready inventory.`, time: 'Just now' },
    ]);
  };

  const handleSendMessage = async () => {
    if (!newMessageText.trim() || !activeChatMerchant) return;
    setSendingMsg(true);

    const msgObj = {
      id: `msg_${Date.now()}`,
      sender: 'You',
      text: newMessageText.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, msgObj]);
    setNewMessageText('');

    if (token) {
      try {
        await api.post('/api/merchant/merchant-network/messages', {
          recipientId: activeChatMerchant.id || activeChatMerchant.merchantCode,
          text: msgObj.text,
        }, { token });
      } catch (e) {}
    }
    setSendingMsg(false);
  };

  const handleAcceptDeal = async (deal: any) => {
    const updated = deals.map((d) => (d.id === deal.id ? { ...d, status: 'accepted' } : d));
    setDeals(updated);
    await setCache('network_deals', updated);
    notify(`Deal #${deal.id?.slice(0, 6) || '101'} accepted! Moving to dispatch.`);
  };

  return (
    <View style={st.container}>
      <TopAppBar title="Merchant B2B Network" onBack={() => navigation?.goBack?.()} />

      {/* Tabs */}
      <View style={st.tabs}>
        {[
          { key: 'feed', label: 'B2B Demands', icon: 'campaign' },
          { key: 'deals', label: 'Trade Deals', icon: 'handshake' },
          { key: 'directory', label: 'Directory', icon: 'store' },
        ].map((t) => (
          <Pressable
            key={t.key}
            style={[st.tab, tab === t.key && st.tabActive]}
            onPress={() => setTab(t.key as any)}
          >
            <MaterialIcons name={t.icon as any} size={16} color={tab === t.key ? Theme.primary : Theme.onSurfaceDisabled} />
            <Text style={[st.tabText, tab === t.key && st.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* ── TAB 1: B2B STOCK DEMANDS FEED ── */}
        {tab === 'feed' && (
          <>
            {/* Broadcast Action Banner */}
            <Pressable style={st.b2bBanner} onPress={() => setShowBroadcastModal(true)}>
              <View style={st.b2bIcon}>
                <MaterialIcons name="add-business" size={26} color={Theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.b2bTitle}>Broadcast Stock Need</Text>
                <Text style={st.b2bSub}>Alert verified merchants in your city for instant wholesale stock</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={Theme.onSurfaceDisabled} />
            </Pressable>

            <SectionHeader title="Live Merchant Stock Demands" style={{ marginTop: 16 }} />
            {networkRequests.length === 0 ? (
              <View style={st.emptyBox}>
                <MaterialIcons name="hub" size={48} color={Theme.onSurfaceDisabled} />
                <Text style={st.emptyTitle}>No Open Demands</Text>
                <Text style={st.emptySub}>Broadcast your requirements or check back later for trade demands.</Text>
              </View>
            ) : (
              networkRequests.map((item: any, idx: number) => (
                <Card key={item.id || idx} style={st.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={st.reqShop}>{item.shopName || item.shop_name || 'Verified Merchant'}</Text>
                        <View style={[st.urgencyBadge, { backgroundColor: item.urgency === 'urgent' ? 'rgba(239,68,68,0.15)' : 'rgba(0,212,170,0.15)' }]}>
                          <Text style={[st.urgencyText, { color: item.urgency === 'urgent' ? Theme.error : Theme.primary }]}>
                            {(item.urgency || 'NORMAL').toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <Text style={st.reqProduct}>{item.product_name || item.productName}</Text>
                      <Text style={st.reqQty}>
                        Required: <Text style={{ color: Theme.onSurface, fontWeight: '700' }}>{item.quantity || 1} {item.unit || 'pcs'}</Text> · {item.city || merchant?.city || 'Local Area'}
                      </Text>
                    </View>
                  </View>
                  <View style={st.actions}>
                    <OutlineButton
                      title="Direct Chat"
                      icon="chatbubble-outline"
                      size="sm"
                      style={{ flex: 1 }}
                      onPress={() => handleOpenChat(item)}
                    />
                    <GradientButton
                      title="Fulfill Demand"
                      icon="cube-outline"
                      size="sm"
                      style={{ flex: 1.4 }}
                      onPress={() => {
                        handleOpenChat(item);
                        notify('Offer initiated! Negotiate deal in direct trade chat.');
                      }}
                    />
                  </View>
                </Card>
              ))
            )}
          </>
        )}

        {/* ── TAB 2: ACTIVE TRADE DEALS ── */}
        {tab === 'deals' && (
          <>
            <SectionHeader title="Active Wholesale Orders & Deals" />
            {deals.length === 0 ? (
              <View style={st.emptyBox}>
                <MaterialIcons name="handshake" size={48} color={Theme.onSurfaceDisabled} />
                <Text style={st.emptyTitle}>No Active Trade Deals</Text>
                <Text style={st.emptySub}>Fulfill a stock demand from the feed to initiate a trade deal.</Text>
              </View>
            ) : (
              deals.map((deal: any, i: number) => (
                <Card key={deal.id || i} style={st.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <Text style={st.reqShop}>{deal.title || 'B2B Trade Deal'}</Text>
                      <Text style={st.reqQty}>Partner: {deal.partnerShop || 'Verified Partner'} · ₹{deal.amount || '0'}</Text>
                    </View>
                    <View style={[st.urgencyBadge, { backgroundColor: Theme.primaryContainer }]}>
                      <Text style={[st.urgencyText, { color: Theme.primary }]}>{(deal.status || 'PENDING').toUpperCase()}</Text>
                    </View>
                  </View>
                  <View style={st.actions}>
                    <OutlineButton title="View Details" size="sm" style={{ flex: 1 }} onPress={() => handleOpenChat(deal)} />
                    {deal.status === 'pending' && (
                      <GradientButton title="Accept Deal" size="sm" style={{ flex: 1 }} onPress={() => handleAcceptDeal(deal)} />
                    )}
                  </View>
                </Card>
              ))
            )}
          </>
        )}

        {/* ── TAB 3: VERIFIED MERCHANT DIRECTORY ── */}
        {tab === 'directory' && (
          <>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search verified merchants by name, city..." style={{ marginBottom: 12 }} />
            {(directory.length > 0 ? directory : [
              { id: '1', shopName: 'Sharma Electronics & Electricals', city: 'Mumbai', gstin: '27AAPFU0939F1ZV', rating: 4.9, deals: 42 },
              { id: '2', shopName: 'Patel Wholesale FMCG Traders', city: 'Pune', gstin: '27ABCDE1234F1Z5', rating: 4.8, deals: 89 },
              { id: '3', shopName: 'Apex Hardware & Tools Mart', city: 'Thane', gstin: '27AABCT4321A1Z9', rating: 4.7, deals: 31 },
            ]).map((item: any) => (
              <Card key={item.id} style={st.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar name={item.shopName} size={42} color={Theme.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.reqShop}>{item.shopName}</Text>
                    <Text style={st.reqQty}>GSTIN: {item.gstin} · {item.city}</Text>
                    <Text style={{ color: Theme.tertiary, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                      ★ {item.rating} ({item.deals} verified deals completed)
                    </Text>
                  </View>
                  <OutlineButton
                    title="Chat"
                    icon="chatbubble-outline"
                    size="sm"
                    onPress={() => handleOpenChat(item)}
                  />
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>

      {/* Broadcast Stock Modal */}
      <Modal visible={showBroadcastModal} transparent animationType="slide">
        <View style={st.modalOverlay}>
          <View style={st.modalCard}>
            <Text style={st.modalTitle}>Broadcast Stock Need (B2B)</Text>
            <Text style={st.modalSub}>Local verified merchants in your city will be alerted instantly.</Text>

            <InputField label="Product Required *" placeholder="e.g. Havells 1.5 Sqmm Copper Wire" value={productName} onChangeText={setProductName} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <InputField label="Quantity *" placeholder="10" value={qty} onChangeText={setQty} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <InputField label="Unit" placeholder="coils / pcs" value={unit} onChangeText={setUnit} />
              </View>
            </View>
            <InputField label="Target Buying Price (₹ / Optional)" placeholder="e.g. 1450" value={targetPrice} onChangeText={setTargetPrice} keyboardType="numeric" />

            <View style={{ flexDirection: 'row', gap: 10, marginVertical: 8 }}>
              <Pressable
                style={[st.urgencyBtn, urgency === 'urgent' && st.urgencyBtnActive]}
                onPress={() => setUrgency('urgent')}
              >
                <Text style={[st.urgencyBtnText, urgency === 'urgent' && { color: Theme.error, fontWeight: '700' }]}>🔥 Urgent Demand</Text>
              </Pressable>
              <Pressable
                style={[st.urgencyBtn, urgency === 'normal' && st.urgencyBtnActive]}
                onPress={() => setUrgency('normal')}
              >
                <Text style={[st.urgencyBtnText, urgency === 'normal' && { color: Theme.primary, fontWeight: '700' }]}>📦 Normal (24h)</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <OutlineButton title="Cancel" onPress={() => setShowBroadcastModal(false)} style={{ flex: 1 }} />
              <GradientButton title={broadcastLoading ? 'Broadcasting...' : 'Post Broadcast'} onPress={handlePostBroadcast} disabled={broadcastLoading} style={{ flex: 1.5 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* 1-on-1 Merchant Trade Chat Modal */}
      <Modal visible={!!activeChatMerchant} transparent animationType="slide">
        <View style={st.modalOverlay}>
          <View style={[st.modalCard, { maxHeight: 520 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <View>
                <Text style={st.modalTitle}>{activeChatMerchant?.shopName || 'Merchant Trade Chat'}</Text>
                <Text style={{ color: Theme.primary, fontSize: 11, fontWeight: '600' }}>🔒 Verified B2B Channel</Text>
              </View>
              <Pressable onPress={() => setActiveChatMerchant(null)} hitSlop={10}>
                <Ionicons name="close-circle" size={24} color={Theme.onSurfaceDisabled} />
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1, marginVertical: 10 }}>
              {chatMessages.map((m) => (
                <View
                  key={m.id}
                  style={[
                    st.chatBubble,
                    m.sender === 'You' ? st.chatBubbleMe : st.chatBubblePartner,
                  ]}
                >
                  <Text style={st.chatSender}>{m.sender}</Text>
                  <Text style={st.chatText}>{m.text}</Text>
                  <Text style={st.chatTime}>{m.time}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: Theme.outlineVariant }}>
              <TextInput
                style={st.chatInput}
                placeholder="Type offer / negotiation message..."
                placeholderTextColor={Theme.onSurfaceDisabled}
                value={newMessageText}
                onChangeText={setNewMessageText}
              />
              <GradientButton
                title=""
                icon="send"
                size="sm"
                onPress={handleSendMessage}
                disabled={sendingMsg}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Terms of Participation Acceptance Gate */}
      <Modal visible={!hasAcceptedTerms} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalCard}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View style={st.termsIcon}>
                <Ionicons name="shield-checkmark" size={32} color={Theme.primary} />
              </View>
              <Text style={[st.modalTitle, { textAlign: 'center', marginTop: 8 }]}>Merchant B2B Network Terms</Text>
            </View>
            <Text style={st.termsBody}>
              AK-LOGIC AI Verified B2B Network connects authentic GST-registered merchants for wholesale inventory procurement and deal fulfillment.{'\n\n'}
              • All orders are governed by genuine GST invoices.{'\n'}
              • Fraudulent requests or price gouging will result in instant account revocation.{'\n'}
              • Direct payments between merchants are settled securely.
            </Text>
            <GradientButton
              title="I Agree & Join Network"
              icon="checkmark-circle-outline"
              onPress={handleAcceptTerms}
              style={{ marginTop: 16 }}
            />
          </View>
        </View>
      </Modal>

      <Snackbar visible={showSnackbar} message={snackbarText} />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },
  tabs: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: Theme.surface2, borderRadius: Theme.shapeSm, padding: 4, marginVertical: 8 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Theme.shapeXs },
  tabActive: { backgroundColor: Theme.primaryContainer },
  tabText: { color: Theme.onSurfaceDisabled, fontSize: 12, fontWeight: '500' },
  tabTextActive: { color: Theme.primary, fontWeight: '700' },
  b2bBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: Theme.surface2, borderRadius: Theme.shapeLg, padding: 14, borderWidth: 1, borderColor: 'rgba(0,212,170,0.2)' },
  b2bIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: Theme.primaryContainer, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  b2bTitle: { color: Theme.onSurface, fontSize: 14, fontWeight: '700' },
  b2bSub: { color: Theme.onSurfaceVariant, fontSize: 11, marginTop: 2 },
  card: { padding: 14, backgroundColor: Theme.surface2, borderRadius: Theme.shapeLg, borderWidth: 1, borderColor: Theme.outlineVariant, marginBottom: 10 },
  reqShop: { color: Theme.onSurface, fontSize: 14, fontWeight: '700' },
  urgencyBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  urgencyText: { fontSize: 10, fontWeight: '700' },
  reqProduct: { color: Theme.onSurface, fontSize: 15, fontWeight: '600', marginTop: 4 },
  reqQty: { color: Theme.onSurfaceVariant, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Theme.outlineVariant },
  emptyBox: { padding: 48, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: Theme.onSurface, fontSize: 16, fontWeight: '700', marginTop: 12 },
  emptySub: { color: Theme.onSurfaceDisabled, fontSize: 12, textAlign: 'center', marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 440, backgroundColor: Theme.surface2, borderRadius: Theme.shapeXl, padding: 20, borderWidth: 1, borderColor: Theme.outline },
  modalTitle: { color: Theme.onSurface, fontSize: 16, fontWeight: '700' },
  modalSub: { color: Theme.onSurfaceVariant, fontSize: 12, marginTop: 4, marginBottom: 12 },
  urgencyBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: Theme.surface3, borderRadius: Theme.shapeSm, borderWidth: 1, borderColor: Theme.outlineVariant },
  urgencyBtnActive: { backgroundColor: Theme.surface4, borderColor: Theme.primary },
  urgencyBtnText: { color: Theme.onSurfaceVariant, fontSize: 12 },
  termsIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: Theme.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  termsBody: { color: Theme.onSurfaceVariant, fontSize: 12.5, lineHeight: 18 },
  chatBubble: { padding: 10, borderRadius: 10, marginVertical: 4, maxWidth: '85%' },
  chatBubbleMe: { backgroundColor: Theme.primaryContainer, alignSelf: 'flex-end' },
  chatBubblePartner: { backgroundColor: Theme.surface3, alignSelf: 'flex-start' },
  chatSender: { color: Theme.primary, fontSize: 10, fontWeight: '700', marginBottom: 2 },
  chatText: { color: Theme.onSurface, fontSize: 13 },
  chatTime: { color: Theme.onSurfaceDisabled, fontSize: 9, marginTop: 4, alignSelf: 'flex-end' },
  chatInput: { flex: 1, backgroundColor: Theme.surface3, color: Theme.onSurface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13 },
});
