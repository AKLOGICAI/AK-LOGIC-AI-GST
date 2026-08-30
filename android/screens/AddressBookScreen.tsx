import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal,
  Alert, Linking, ScrollView,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Theme } from '../lib/theme';
import {
  Card, TopAppBar, SearchBar, GradientButton, OutlineButton,
  InputField, Snackbar, Avatar, SectionHeader, FilterChip,
} from '../components/DesignSystem';
import { useMerchant } from '../lib/MerchantContext';
import { api } from '../lib/apiClient';
import { getCache, setCache } from '../lib/offlineCache';
import { STATE_CODES, INDIAN_STATES } from '../lib/gstEngine';

export default function AddressBookScreen({ navigation }: { navigation?: any }) {
  const { token, merchant } = useMerchant();
  const [contacts, setContacts] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [partyFilter, setPartyFilter] = useState<'all' | 'b2b' | 'retail'>('all');
  const [loading, setLoading] = useState(false);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [state, setState] = useState('Maharashtra');

  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarText, setSnackbarText] = useState('');

  const notify = (msg: string) => {
    setSnackbarText(msg);
    setShowSnackbar(true);
    setTimeout(() => setShowSnackbar(false), 3000);
  };

  const loadData = async () => {
    const cachedContacts = await getCache<any[]>('contacts_list');
    const cachedInvoices = await getCache<any[]>('invoices_list');
    if (cachedContacts) setContacts(cachedContacts);
    if (cachedInvoices) setInvoices(cachedInvoices);

    if (!token) return;
    setLoading(true);
    try {
      const invRes = await api.get('/api/merchant/invoices', { token });
      if (invRes && invRes.invoices) {
        setInvoices(invRes.invoices);
        await setCache('invoices_list', invRes.invoices);
      }
    } catch (err) {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  // GSTIN change handler with automatic state deduction
  const handleGstinChange = (text: string) => {
    const val = text.toUpperCase();
    setGstin(val);
    if (val.length >= 2) {
      const code = val.slice(0, 2);
      const matchedState = (STATE_CODES as any)[code];
      if (matchedState) {
        setState(matchedState);
      }
    }
  };

  // Merge unique invoice customers into contacts
  const handleMergeFromInvoices = async () => {
    let addedCount = 0;
    const existingPhones = new Set(contacts.map((c) => c.phone));
    const newContacts = [...contacts];

    invoices.forEach((iv: any) => {
      const p = iv.customerPhone || iv.customer_phone;
      if (p && !existingPhones.has(p)) {
        existingPhones.add(p);
        newContacts.push({
          id: `c_inv_${iv.id || Date.now()}`,
          name: iv.customerName || iv.customer_name || 'Retail Customer',
          phone: p,
          email: iv.customerEmail || iv.customer_email || '',
          gstin: (iv.customerGstin || iv.customer_gstin || '').toUpperCase(),
          address: iv.customerAddress || iv.customer_address || '',
          state: iv.customerState || iv.placeOfSupply || 'Maharashtra',
          createdAt: Date.now(),
        });
        addedCount++;
      }
    });

    if (addedCount > 0) {
      setContacts(newContacts);
      await setCache('contacts_list', newContacts);
      notify(`Merged ${addedCount} customer(s) from invoice history! 👥`);
    } else {
      notify('All invoice customers are already in your Address Book.');
    }
  };

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c: any) => {
      const isB2b = !!c.gstin;
      if (partyFilter === 'b2b' && !isB2b) return false;
      if (partyFilter === 'retail' && isB2b) return false;
      if (!q) return true;
      return (
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.gstin || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q)
      );
    });
  }, [contacts, partyFilter, search]);

  const handleOpenAdd = () => {
    setIsEditing(false);
    setEditId(null);
    setName('');
    setPhone('');
    setEmail('');
    setGstin('');
    setAddress('');
    setState(merchant?.state || 'Maharashtra');
    setShowModal(true);
  };

  const handleOpenEdit = (c: any) => {
    setIsEditing(true);
    setEditId(c.id);
    setName(c.name || '');
    setPhone(c.phone || '');
    setEmail(c.email || '');
    setGstin(c.gstin || '');
    setAddress(c.address || '');
    setState(c.state || merchant?.state || 'Maharashtra');
    setShowModal(true);
  };

  const handleDelete = (c: any) => {
    Alert.alert(
      'Delete Contact?',
      `Are you sure you want to remove "${c.name}" from your address book?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updated = contacts.filter((item) => item.id !== c.id);
            setContacts(updated);
            await setCache('contacts_list', updated);
            notify('Contact deleted.');
          },
        },
      ]
    );
  };

  const handleSaveContact = async () => {
    if (!name.trim() || !phone.trim()) {
      Alert.alert('Required', 'Please enter customer Name and Mobile Number.');
      return;
    }

    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      gstin: gstin.trim().toUpperCase(),
      address: address.trim(),
      state: state.trim(),
    };

    let updated: any[] = [];
    if (isEditing && editId) {
      updated = contacts.map((c) => (c.id === editId ? { ...c, ...payload } : c));
    } else {
      const newContact = {
        ...payload,
        id: `c_${Date.now()}`,
        createdAt: Date.now(),
      };
      updated = [newContact, ...contacts];
    }

    setContacts(updated);
    await setCache('contacts_list', updated);

    setShowModal(false);
    notify(isEditing ? 'Contact updated!' : 'Contact saved to Address Book! 👤');
  };

  const renderContactItem = ({ item }: { item: any }) => {
    const isB2B = !!item.gstin;
    return (
      <Card style={st.contactCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar name={item.name} size={42} color={isB2B ? Theme.secondary : Theme.primary} />
          <View style={{ flex: 1, minWidth: 0, paddingRight: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={st.contactName} numberOfLines={1} ellipsizeMode="tail">
                {item.name}
              </Text>
              <View style={[st.b2bBadge, { backgroundColor: isB2B ? 'rgba(233,196,106,0.15)' : 'rgba(0,212,170,0.12)' }]}>
                <Text style={[st.b2bText, { color: isB2B ? Theme.tertiary : Theme.primary }]}>
                  {isB2B ? 'B2B Registered' : 'Retail'}
                </Text>
              </View>
            </View>
            <Text style={st.contactPhone} numberOfLines={1}>
              {item.phone} · {item.state || 'State'}
            </Text>
            {!!item.gstin && (
              <Text style={st.contactGstin} numberOfLines={1}>
                GSTIN: {item.gstin}
              </Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', flexShrink: 0 }}>
            <Pressable
              style={st.callBtn}
              onPress={() => Linking.openURL(`tel:${item.phone}`)}
              hitSlop={6}
            >
              <Ionicons name="call-outline" size={15} color={Theme.primary} />
            </Pressable>
            <Pressable
              style={st.waBtn}
              onPress={() => Linking.openURL(`https://wa.me/91${item.phone.replace(/\D/g, '')}`)}
              hitSlop={6}
            >
              <Ionicons name="logo-whatsapp" size={15} color="#25D366" />
            </Pressable>
            <Pressable style={st.editBtn} onPress={() => handleOpenEdit(item)} hitSlop={6}>
              <MaterialIcons name="edit" size={15} color={Theme.onSurfaceVariant} />
            </Pressable>
            <Pressable style={st.delBtn} onPress={() => handleDelete(item)} hitSlop={6}>
              <MaterialIcons name="delete-outline" size={15} color={Theme.error} />
            </Pressable>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <View style={st.container}>
      <TopAppBar title="Address Book & Parties" onBack={() => navigation?.goBack?.()} />

      <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search Name, Mobile, or GSTIN..." />
      </View>

      {/* Filter Chips & Merge Action */}
      <View style={st.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {[
            { id: 'all', label: `All (${contacts.length})` },
            { id: 'b2b', label: 'B2B GSTIN' },
            { id: 'retail', label: 'Retail Walk-ins' },
          ].map((f) => (
            <FilterChip
              key={f.id}
              label={f.label}
              selected={partyFilter === f.id}
              onPress={() => setPartyFilter(f.id as any)}
            />
          ))}
        </ScrollView>
      </View>

      <View style={st.addHeader}>
        <OutlineButton
          title="Merge from Invoices"
          icon="git-merge-outline"
          size="sm"
          onPress={handleMergeFromInvoices}
        />
        <GradientButton
          title="+ Add Contact"
          size="sm"
          onPress={handleOpenAdd}
        />
      </View>

      <FlatList
        data={filteredContacts}
        renderItem={renderContactItem}
        keyExtractor={(i) => i.id || i.phone}
        contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={st.emptyBox}>
            <MaterialIcons name="contacts" size={48} color={Theme.onSurfaceDisabled} />
            <Text style={st.emptyTitle}>No Matching Contacts</Text>
            <Text style={st.emptySub}>Add customer parties or tap 'Merge from Invoices'.</Text>
          </View>
        }
      />

      {/* Add / Edit Contact Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={st.modalOverlay}>
          <View style={st.modalCard}>
            <Text style={st.modalTitle}>{isEditing ? 'Edit Customer Party' : 'Add Customer / Party'}</Text>
            <ScrollView
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 460 }}
            >
              <InputField label="Customer / Party Name *" placeholder="e.g. Rahul Enterprises" value={name} onChangeText={setName} icon="person-outline" />
              <InputField label="Mobile Number *" placeholder="10-digit mobile" value={phone} onChangeText={setPhone} icon="call-outline" keyboardType="phone-pad" />
              <InputField label="Email Address" placeholder="party@gmail.com" value={email} onChangeText={setEmail} icon="mail-outline" keyboardType="email-address" />
              <InputField label="GSTIN (For B2B Invoices)" placeholder="15-character GSTIN" value={gstin} onChangeText={handleGstinChange} icon="document-text-outline" autoCapitalize="characters" />
              <InputField label="Billing Street Address" placeholder="Street, Area, PIN" value={address} onChangeText={setAddress} icon="location-outline" />
              <InputField label="State / Place of Supply" value={state} onChangeText={setState} icon="map-outline" />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <OutlineButton title="Cancel" onPress={() => setShowModal(false)} style={{ flex: 1 }} />
                <GradientButton title={isEditing ? 'Update Contact' : 'Save Contact'} onPress={handleSaveContact} style={{ flex: 1.5 }} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Snackbar visible={showSnackbar} message={snackbarText} />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },
  filterBar: { marginTop: 10 },
  addHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 10, marginBottom: 4 },
  contactCard: { padding: 12, backgroundColor: Theme.surface2, borderRadius: Theme.shapeLg, marginBottom: 8 },
  contactName: { color: Theme.onSurface, fontSize: 13.5, fontWeight: '700', flexShrink: 1, maxWidth: '62%' },
  b2bBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, flexShrink: 0 },
  b2bText: { fontSize: 8.5, fontWeight: '800' },
  contactPhone: { color: Theme.onSurfaceVariant, fontSize: 11.5, marginTop: 2 },
  contactGstin: { color: Theme.tertiary, fontSize: 10, fontFamily: 'monospace', marginTop: 2 },
  callBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: Theme.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  waBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(37,211,102,0.15)', alignItems: 'center', justifyContent: 'center' },
  editBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: Theme.surface3, alignItems: 'center', justifyContent: 'center' },
  delBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.12)', alignItems: 'center', justifyContent: 'center' },
  emptyBox: { padding: 48, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: Theme.onSurface, fontSize: 15, fontWeight: '700', marginTop: 10 },
  emptySub: { color: Theme.onSurfaceDisabled, fontSize: 11, textAlign: 'center', marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: Theme.surface2, borderRadius: Theme.shapeXl, padding: 20, borderWidth: 1, borderColor: Theme.outline },
  modalTitle: { color: Theme.onSurface, fontSize: 16, fontWeight: '700', marginBottom: 12 },
});
