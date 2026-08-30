import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform,
  Alert, Linking, TextInput, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Theme } from '../lib/theme';
import {
  Card, TopAppBar, InputField, GradientButton, OutlineButton,
  SectionHeader, Divider, Snackbar, StatusBadge,
} from '../components/DesignSystem';
import { useMerchant } from '../lib/MerchantContext';
import { api } from '../lib/apiClient';
import { getCache, setCache } from '../lib/offlineCache';

const CATEGORIES = ['Account', 'Billing', 'Branding', 'GST/Invoice', 'Technical', 'Other'];

const FAQS = [
  {
    q: 'How is an invoice generated in AK-LOGIC AI?',
    a: 'Customer scans your counter QR code from their camera and submits an instant billing request. You review and approve in 1 tap — tax invoice PDF is generated automatically.',
  },
  {
    q: 'How do I show my business logo and seal on invoices?',
    a: 'Subscribe to any 30-day plan, then upload your logo, draw your digital signature, and customize your circular company seal from Business Settings & Branding Studio.',
  },
  {
    q: 'How does GST calculation handle inter-state sales?',
    a: 'AK-LOGIC AI automatically compares your merchant state with the buyer’s state. Intra-state applies CGST + SGST (50/50 split), while inter-state applies IGST automatically.',
  },
  {
    q: 'How do I claim Input Tax Credit (ITC) on wholesale purchases?',
    a: 'Scan your wholesale vendor invoice in Purchase Bills. Google Cloud Vision OCR extracts line items, replenishes warehouse stock, and logs ITC into your GSTR-3B offset ledger.',
  },
];

export default function SupportScreen({ navigation }: { navigation?: any }) {
  const { merchant, token } = useMerchant();
  const [tickets, setTickets] = useState<any[]>([]);
  const [openNewTicket, setOpenNewTicket] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('Account');
  const [message, setMessage] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');

  const notify = (msg: string) => {
    setSnackbarMsg(msg);
    setShowSnackbar(true);
    setTimeout(() => setShowSnackbar(false), 3000);
  };

  const loadTickets = async () => {
    const cached = await getCache<any[]>('support_tickets');
    if (cached) setTickets(cached);

    if (!token) return;
    setLoading(true);
    try {
      const res = await api.get('/api/merchant/tickets', { token });
      if (res && res.tickets) {
        setTickets(res.tickets);
        await setCache('support_tickets', res.tickets);
      }
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [token]);

  const handleSubmitTicket = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert('Required', 'Please enter ticket subject and detailed message.');
      return;
    }
    if (!token) return;
    setSubmitting(true);

    try {
      const fullMessage = `[Category: ${category}]\n\n${message.trim()}\n\n[Diagnostics: Merchant=${merchant?.shopName || 'N/A'}, Plan=${merchant?.planName || 'Standard'}, Credits=${merchant?.pdfCredits ?? 0}]`;

      const payload = {
        subject: subject.trim(),
        message: fullMessage,
      };

      const res = await api.post('/api/merchant/tickets', payload, { token });
      const newTicket = (res && res.ticket) || {
        id: `tkt_${Date.now()}`,
        subject: subject.trim(),
        category,
        message: message.trim(),
        status: 'open',
        createdAt: Date.now(),
      };

      const updated = [newTicket, ...tickets];
      setTickets(updated);
      await setCache('support_tickets', updated);

      setSubject('');
      setMessage('');
      setOpenNewTicket(false);
      notify('🎉 Support ticket raised! Our team will respond shortly.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not submit support ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={st.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TopAppBar
        title="Helpline & Support"
        onBack={() => navigation?.goBack?.()}
        actions={
          <Pressable onPress={loadTickets} hitSlop={8} style={{ padding: 8, marginRight: 4 }}>
            <Ionicons name="refresh" size={20} color={Theme.primary} />
          </Pressable>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      >
        {/* Contact Us Card */}
        <Card style={st.contactCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={st.contactIcon}>
              <Ionicons name="headset-outline" size={26} color={Theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.contactTitle}>24/7 Merchant Support Helpdesk</Text>
              <Text style={st.contactSub}>For billing inquiries, GST compliance queries, or app assistance</Text>
            </View>
          </View>
          <Divider style={{ marginVertical: 12 }} />
          <View style={{ gap: 8 }}>
            <Pressable
              style={st.contactRow}
              onPress={() => Linking.openURL('mailto:aklogicaihelp@gmail.com')}
            >
              <Ionicons name="mail-outline" size={18} color={Theme.primary} />
              <Text style={st.contactLinkText}>aklogicaihelp@gmail.com</Text>
            </Pressable>
            <Pressable
              style={st.contactRow}
              onPress={() => Linking.openURL('https://www.ak-logicai.in')}
            >
              <Ionicons name="globe-outline" size={18} color={Theme.tertiary} />
              <Text style={[st.contactLinkText, { color: Theme.tertiary }]}>www.ak-logicai.in</Text>
            </Pressable>
          </View>
        </Card>

        {/* Raise Ticket Action Banner */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 14 }}>
          <Text style={{ color: Theme.onSurface, fontSize: 16, fontWeight: '700' }}>
            My Support Tickets ({tickets.length})
          </Text>
          <GradientButton
            title={openNewTicket ? 'Cancel' : '+ New Ticket'}
            size="sm"
            onPress={() => setOpenNewTicket(!openNewTicket)}
          />
        </View>

        {/* New Ticket Form */}
        {openNewTicket && (
          <Card style={st.formCard}>
            <Text style={st.formTitle}>
              Raise a Support Request
            </Text>

            <InputField
              label="Subject *"
              placeholder="e.g. Assistance with GSTR-1 return filing"
              value={subject}
              onChangeText={setSubject}
              icon="document-text-outline"
            />

            <Text style={st.catLabel}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
              {CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  style={[st.catChip, category === c && st.catChipActive]}
                  onPress={() => setCategory(c)}
                >
                  <Text style={[st.catChipText, category === c && st.catChipTextActive]}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Detailed Message Text Area (Spacious and responsive) */}
            <View style={{ marginBottom: 14 }}>
              <Text style={st.inputMiniLabel}>Detailed Message *</Text>
              <View style={st.textAreaContainer}>
                <TextInput
                  style={st.textAreaInput}
                  placeholder="Describe your issue or query in detail..."
                  placeholderTextColor={Theme.onSurfaceDisabled}
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>
            </View>

            <GradientButton
              title={submitting ? 'Submitting...' : 'Submit Support Ticket'}
              icon="send-outline"
              disabled={submitting}
              onPress={handleSubmitTicket}
            />
          </Card>
        )}

        {/* Tickets List */}
        {tickets.map((t, idx) => (
          <Card key={t.id || idx} style={st.ticketCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={st.ticketSubject}>{t.subject}</Text>
                <Text style={st.ticketMeta}>{t.category || 'General'} · {t.createdAt ? new Date(t.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short' }) : 'Recent'}</Text>
              </View>
              <View style={[st.statusBadge, { backgroundColor: t.status === 'resolved' ? 'rgba(0,212,170,0.15)' : 'rgba(233,196,106,0.15)' }]}>
                <Text style={[st.statusBadgeText, { color: t.status === 'resolved' ? Theme.primary : Theme.tertiary }]}>
                  {(t.status || 'OPEN').toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={st.ticketMsg}>{t.message?.split('\n\n[Diagnostics')[0] || t.message}</Text>
            {t.reply && (
              <View style={st.replyBox}>
                <Text style={st.replyTitle}>Support Response:</Text>
                <Text style={st.replyText}>{t.reply}</Text>
              </View>
            )}
          </Card>
        ))}

        {/* Interactive FAQs Accordion */}
        <SectionHeader title="Frequently Asked Questions (FAQ)" style={{ marginTop: 20 }} />
        {FAQS.map((faq, i) => {
          const isOpen = openFaq === i;
          return (
            <Card key={i} style={st.faqCard} onPress={() => setOpenFaq(isOpen ? null : i)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={st.faqQ}>{faq.q}</Text>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={Theme.onSurfaceDisabled} />
              </View>
              {isOpen && (
                <>
                  <Divider style={{ marginVertical: 8 }} />
                  <Text style={st.faqA}>{faq.a}</Text>
                </>
              )}
            </Card>
          );
        })}
      </ScrollView>

      <Snackbar visible={showSnackbar} message={snackbarMsg} />
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },
  contactCard: { padding: 16, backgroundColor: Theme.surface2, borderRadius: Theme.shapeLg, borderWidth: 1, borderColor: 'rgba(0,212,170,0.2)' },
  contactIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: Theme.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  contactTitle: { color: Theme.onSurface, fontSize: 14, fontWeight: '700' },
  contactSub: { color: Theme.onSurfaceVariant, fontSize: 11, marginTop: 2 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contactLinkText: { color: Theme.primary, fontSize: 13, fontWeight: '600' },

  formCard: { marginBottom: 16, padding: 16, backgroundColor: Theme.surface2 },
  formTitle: { color: Theme.onSurface, fontSize: 15, fontWeight: '700', marginBottom: 12 },
  catLabel: { color: Theme.onSurfaceDisabled, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Theme.shapeSm, backgroundColor: Theme.surface3, borderWidth: 1, borderColor: Theme.outlineVariant },
  catChipActive: { backgroundColor: Theme.primaryContainer, borderColor: Theme.primary },
  catChipText: { color: Theme.onSurfaceVariant, fontSize: 11, fontWeight: '600' },
  catChipTextActive: { color: Theme.primary, fontWeight: '700' },

  inputMiniLabel: { color: Theme.onSurfaceVariant, fontSize: 12, fontWeight: '600', marginBottom: 6, marginLeft: 2 },
  textAreaContainer: {
    backgroundColor: Theme.surface1,
    borderRadius: Theme.shapeSm,
    borderWidth: 1,
    borderColor: Theme.outline,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 100,
  },
  textAreaInput: {
    color: Theme.onSurface,
    fontSize: 13,
    minHeight: 84,
    lineHeight: 18,
  },

  ticketCard: { marginBottom: 10, padding: 14, backgroundColor: Theme.surface2 },
  ticketSubject: { color: Theme.onSurface, fontSize: 14, fontWeight: '700' },
  ticketMeta: { color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 2 },
  ticketMsg: { color: Theme.onSurfaceVariant, fontSize: 12.5, marginTop: 6, lineHeight: 17 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  replyBox: { backgroundColor: 'rgba(0,212,170,0.08)', borderRadius: 8, padding: 10, marginTop: 10, borderWidth: 1, borderColor: 'rgba(0,212,170,0.2)' },
  replyTitle: { color: Theme.primary, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  replyText: { color: Theme.onSurface, fontSize: 12 },
  faqCard: { marginBottom: 8, padding: 14, backgroundColor: Theme.surface2 },
  faqQ: { color: Theme.onSurface, fontSize: 13, fontWeight: '600', flex: 1, marginRight: 8 },
  faqA: { color: Theme.onSurfaceVariant, fontSize: 12, lineHeight: 18 },
});

