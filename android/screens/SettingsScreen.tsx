import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert,
  Image, Platform, Modal,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Circle, Path, Text as SvgText, Rect } from 'react-native-svg';
import { Theme } from '../lib/theme';
import {
  Card, TopAppBar, InputField, GradientButton, OutlineButton,
  SectionHeader, Snackbar,
} from '../components/DesignSystem';
import SignaturePad from '../components/SignaturePad';
import {
  SealStyle, SEAL_INK_COLORS, calculateArcChars,
  generateCompanySealDataUrl,
} from '../lib/companySealEngine';
import { useMerchant } from '../lib/MerchantContext';
import { api } from '../lib/apiClient';
import { INDIAN_STATES } from '../lib/gstEngine';

export default function SettingsScreen({ navigation }: { navigation?: any }) {
  const { merchant, token, refreshProfile } = useMerchant();
  const [shopName, setShopName] = useState(merchant?.shopName || '');
  const [tradeName, setTradeName] = useState(merchant?.tradeName || '');
  const [ownerName, setOwnerName] = useState(merchant?.ownerName || '');
  const [gstin, setGstin] = useState(merchant?.gstin || '');
  const [pan, setPan] = useState(merchant?.pan || '');
  const [invoicePrefix, setInvoicePrefix] = useState(merchant?.invoicePrefix || 'AKL');
  const [upiId, setUpiId] = useState(merchant?.upiId || '');
  const [address, setAddress] = useState(merchant?.address || '');
  const [state, setState] = useState(merchant?.state || 'Bihar');
  const [bankName, setBankName] = useState(merchant?.bankName || '');
  const [accountNumber, setAccountNumber] = useState(merchant?.accountNumber || '');
  const [ifsc, setIfsc] = useState(merchant?.ifsc || '');
  const [stateModal, setStateModal] = useState(false);
  const [stateSearch, setStateSearch] = useState('');

  // Branding State
  const [brandName, setBrandName] = useState((merchant as any)?.brandName || merchant?.shopName || '');
  const [logoDataUrl, setLogoDataUrl] = useState<string>((merchant as any)?.logoDataUrl || (merchant as any)?.logoUrl || '');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>((merchant as any)?.signatureDataUrl || (merchant as any)?.signatureUrl || '');
  const [companySealDataUrl, setCompanySealDataUrl] = useState<string>((merchant as any)?.companySealDataUrl || (merchant as any)?.companySealUrl || '');
  const [sealStyle, setSealStyle] = useState<SealStyle>('classic');
  const [sealColor, setSealColor] = useState<string>('#0a2a6b');
  const [establishedYear, setEstablishedYear] = useState<string>('2024');

  const [saving, setSaving] = useState(false);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarText, setSnackbarText] = useState('');

  useEffect(() => {
    if (merchant) {
      setShopName(merchant.shopName || '');
      setTradeName(merchant.tradeName || '');
      setOwnerName(merchant.ownerName || '');
      setGstin(merchant.gstin || '');
      setPan(merchant.pan || '');
      setInvoicePrefix(merchant.invoicePrefix || 'AKL');
      setUpiId(merchant.upiId || '');
      setAddress(merchant.address || '');
      setState(merchant.state || 'Maharashtra');
      setBankName(merchant.bankName || '');
      setAccountNumber(merchant.accountNumber || '');
      setIfsc(merchant.ifsc || '');
      setBrandName((merchant as any)?.brandName || merchant.shopName || '');
      setLogoDataUrl((merchant as any)?.logoDataUrl || (merchant as any)?.logoUrl || '');
      setSignatureDataUrl((merchant as any)?.signatureDataUrl || (merchant as any)?.signatureUrl || '');
      setCompanySealDataUrl((merchant as any)?.companySealDataUrl || (merchant as any)?.companySealUrl || '');
    }
  }, [merchant]);

  const notify = (msg: string) => {
    setSnackbarText(msg);
    setShowSnackbar(true);
    setTimeout(() => setShowSnackbar(false), 3000);
  };

  // Logo Image Picker
  const handlePickLogo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.base64) {
          const dataUrl = `data:image/png;base64,${asset.base64}`;
          setLogoDataUrl(dataUrl);
          notify('Business Logo uploaded! Save to apply to invoices 🖼️');
        }
      }
    } catch (e: any) {
      Alert.alert('Image Error', e.message || 'Could not pick logo.');
    }
  };

  // Seal Image Picker
  const handlePickSeal = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.base64) {
          const dataUrl = `data:image/png;base64,${asset.base64}`;
          setCompanySealDataUrl(dataUrl);
          notify('Custom Company Seal uploaded! 🛡️');
        }
      }
    } catch (e: any) {
      Alert.alert('Seal Error', e.message || 'Could not pick seal.');
    }
  };

  // Generate Digital Seal Data URL from circular math
  const handleGenerateDigitalSeal = () => {
    const sealDataUrl = generateCompanySealDataUrl({
      businessName: brandName || shopName || 'MY BUSINESS',
      gstin: gstin || 'UNREGISTERED',
      state: state || 'INDIA',
      establishedYear: establishedYear,
      style: sealStyle,
      color: sealColor,
    });
    setCompanySealDataUrl(sealDataUrl);
    notify('Official Company Seal Generated! Click Save to apply to invoices 🌟');
  };

  const handleSaveSettings = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const patch = {
        shopName: shopName.trim(),
        tradeName: tradeName.trim(),
        ownerName: ownerName.trim(),
        invoicePrefix: invoicePrefix.trim().toUpperCase(),
        upiId: upiId.trim(),
        address: address.trim(),
        state: state.trim(),
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        ifsc: ifsc.trim().toUpperCase(),
        brandName: brandName.trim(),
        logoDataUrl: logoDataUrl || undefined,
        signatureDataUrl: signatureDataUrl || undefined,
        companySealDataUrl: companySealDataUrl || undefined,
        customBranding: !!(logoDataUrl || signatureDataUrl || companySealDataUrl || merchant?.customBranding),
      };

      await api.patch('/api/merchant/me', patch, { token });

      // Save Branding Assets
      try {
        if (logoDataUrl) {
          await api.post('/api/merchant/upload-branding', { type: 'logo', dataUrl: logoDataUrl }, { token });
        }
        if (signatureDataUrl) {
          await api.post('/api/merchant/upload-branding', { type: 'signature', dataUrl: signatureDataUrl }, { token });
        }
        if (companySealDataUrl) {
          await api.post('/api/merchant/upload-branding', { type: 'seal', dataUrl: companySealDataUrl }, { token });
        }
      } catch (e) {}

      await refreshProfile();
      notify('Business Settings & Branding Studio Saved! 🏢');
    } catch (err: any) {
      notify(err.message || 'Settings updated.');
    } finally {
      setSaving(false);
    }
  };

  const customBranding = !!merchant?.customBranding;

  // Real-time Seal Vector Math calculation for Live Preview
  const sealPreviewData = useMemo(() => {
    const size = 180;
    const cx = size / 2;
    const cy = size / 2;
    const name = (brandName || shopName || 'BUSINESS NAME').toUpperCase().trim();
    const statePart = (state || 'INDIA').toUpperCase().trim();
    const gstinPart = (gstin || 'UNREGISTERED').toUpperCase().trim();
    const bottomLine = `GSTIN ${gstinPart}  •  ${statePart}`;

    const nameBaseSize = sealStyle === 'modern' ? 8 : 8.5;
    const nameFontSize = name.length > 25
      ? Math.max(5, nameBaseSize * (20 / name.length))
      : name.length > 15
        ? Math.max(6, nameBaseSize * (15 / name.length))
        : nameBaseSize;
    const nameSpread = Math.min(180, Math.max(60, name.length * 9.5));

    const bottomBaseSize = sealStyle === 'modern' ? 6 : 6.5;
    const bottomFontSize = bottomLine.length > 32
      ? Math.max(4.5, bottomBaseSize * (28 / bottomLine.length))
      : bottomBaseSize;
    const bottomSpread = Math.min(180, Math.max(80, bottomLine.length * 5.8));

    const topRadius = (sealStyle === 'classic' || sealStyle === 'badge') ? size * 0.41 : size * 0.38;
    const bottomRadius = (sealStyle === 'classic' || sealStyle === 'badge') ? size * 0.41 : size * 0.38;

    const topChars = calculateArcChars(name, topRadius, cx, cy, 0, nameSpread, false);
    const bottomChars = calculateArcChars(bottomLine, bottomRadius, cx, cy, 180, bottomSpread, true);

    return { size, cx, cy, topChars, bottomChars, nameFontSize, bottomFontSize };
  }, [brandName, shopName, state, gstin, sealStyle, sealColor]);

  return (
    <View style={st.container}>
      <TopAppBar title="Business & Branding Studio" onBack={() => navigation?.goBack?.()} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      >
        {/* Branding Status Banner */}
        <View style={[st.brandBanner, { backgroundColor: customBranding ? 'rgba(0,212,170,0.12)' : 'rgba(233,196,106,0.12)', borderColor: customBranding ? 'rgba(0,212,170,0.3)' : 'rgba(233,196,106,0.3)' }]}>
          <Ionicons name={customBranding ? 'ribbon' : 'shield-outline'} size={24} color={customBranding ? Theme.primary : Theme.tertiary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[st.brandTitle, { color: customBranding ? Theme.primary : Theme.tertiary }]}>
              {customBranding ? 'Custom Branding Active' : 'AK-LOGIC AI Standard Branding'}
            </Text>
            <Text style={st.brandSub}>
              {customBranding ? 'Your custom business logo, signature, and seal appear on all customer tax invoices.' : 'Upgrade to a 30-day plan to unlock custom logo and seal on invoices.'}
            </Text>
          </View>
        </View>

        {/* ── 1. Digital Signature Pad ── */}
        <SectionHeader title="Digital Signature (Authorised Signatory)" />
        <Card style={{ marginBottom: 16, padding: 14 }}>
          <Text style={st.fieldHint}>
            Sign below with your finger. This signature appears on every generated GST invoice PDF.
          </Text>

          <SignaturePad
            value={signatureDataUrl}
            onChange={(val) => setSignatureDataUrl(val || '')}
            height={130}
          />
        </Card>

        {/* ── 2. Business Logo & Invoice Header Preview ── */}
        <SectionHeader title="Custom Invoice Branding & Logo" />
        <Card style={{ marginBottom: 16, padding: 14 }}>
          <InputField
            label="Brand Name (Printed on Invoices)"
            value={brandName}
            onChangeText={setBrandName}
            placeholder={shopName}
          />

          <Text style={st.fieldHint}>Business Logo (PNG / JPG / Vector)</Text>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginVertical: 8 }}>
            {logoDataUrl ? (
              <Image source={{ uri: logoDataUrl }} style={st.logoPreview} resizeMode="contain" />
            ) : (
              <View style={st.logoPlaceholder}>
                <Ionicons name="image-outline" size={28} color={Theme.onSurfaceDisabled} />
              </View>
            )}
            <View style={{ flex: 1, gap: 6 }}>
              <OutlineButton
                title={logoDataUrl ? 'Change Logo' : 'Upload Logo'}
                icon="cloud-upload-outline"
                size="sm"
                onPress={handlePickLogo}
              />
              {logoDataUrl ? (
                <OutlineButton
                  title="Remove Logo"
                  icon="trash-outline"
                  size="sm"
                  color={Theme.error}
                  onPress={() => setLogoDataUrl('')}
                />
              ) : null}
            </View>
          </View>

          {/* Live Header Preview */}
          <Text style={[st.fieldHint, { marginTop: 10 }]}>Invoice Header Live Preview</Text>
          <View style={st.liveHeaderCard}>
            {logoDataUrl ? (
              <Image source={{ uri: logoDataUrl }} style={st.headerLogo} />
            ) : (
              <View style={st.headerLogoBadge}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>{(brandName || shopName || 'A').charAt(0)}</Text>
              </View>
            )}
            <View>
              <Text style={st.headerShopTitle}>{brandName || shopName || 'My Business'}</Text>
              <Text style={st.headerTaxLabel}>TAX INVOICE</Text>
            </View>
          </View>
        </Card>

        {/* ── 3. Company Seal Generator & Studio ── */}
        <SectionHeader title="Company Seal Studio" />
        <Card style={{ marginBottom: 16, padding: 14 }}>
          <Text style={st.fieldHint}>
            Circular official company seal shown beside Authorised Signatory on GST Invoices.
          </Text>

          {/* Interactive Live Seal Vector Preview */}
          <View style={st.sealPreviewWrapper}>
            <Svg width={sealPreviewData.size} height={sealPreviewData.size} viewBox={`0 0 ${sealPreviewData.size} ${sealPreviewData.size}`}>
              {/* Outer & Inner Borders */}
              {sealStyle === 'classic' ? (
                <>
                  <Circle cx={sealPreviewData.cx} cy={sealPreviewData.cy} r={sealPreviewData.size * 0.46} stroke={sealColor} strokeWidth={3} fill="none" />
                  <Circle cx={sealPreviewData.cx} cy={sealPreviewData.cy} r={sealPreviewData.size * 0.36} stroke={sealColor} strokeWidth={1.5} fill="none" />
                  <Circle cx={sealPreviewData.cx} cy={sealPreviewData.cy} r={sealPreviewData.size * 0.22} stroke={sealColor} strokeWidth={1.5} fill="none" />
                </>
              ) : sealStyle === 'modern' ? (
                <>
                  <Circle cx={sealPreviewData.cx} cy={sealPreviewData.cy} r={sealPreviewData.size * 0.46} stroke={sealColor} strokeWidth={2.5} fill="none" />
                  <Circle cx={sealPreviewData.cx} cy={sealPreviewData.cy} r={sealPreviewData.size * 0.42} stroke={sealColor} strokeWidth={1} fill="none" />
                  <Circle cx={sealPreviewData.cx} cy={sealPreviewData.cy} r={sealPreviewData.size * 0.20} stroke={sealColor} strokeWidth={1} strokeDasharray="4,3" fill="none" />
                </>
              ) : (
                <>
                  <Circle cx={sealPreviewData.cx} cy={sealPreviewData.cy} r={sealPreviewData.size * 0.46} stroke={sealColor} strokeWidth={2} fill="none" />
                  <Circle cx={sealPreviewData.cx} cy={sealPreviewData.cy} r={sealPreviewData.size * 0.43} stroke={sealColor} strokeWidth={1.5} fill="none" />
                  <Circle cx={sealPreviewData.cx} cy={sealPreviewData.cy} r={sealPreviewData.size * 0.26} stroke={sealColor} strokeWidth={1.5} fill="none" />
                </>
              )}

              {/* Top Text Characters */}
              {sealPreviewData.topChars.map((c, i) => (
                <SvgText
                  key={`top_${i}`}
                  x={c.x}
                  y={c.y}
                  transform={`rotate(${c.rotation} ${c.x} ${c.y})`}
                  textAnchor="middle"
                  fill={sealColor}
                  fontFamily="sans-serif"
                  fontWeight="bold"
                  fontSize={sealPreviewData.nameFontSize}
                >
                  {c.char}
                </SvgText>
              ))}

              {/* Bottom Text Characters */}
              {sealPreviewData.bottomChars.map((c, i) => (
                <SvgText
                  key={`bot_${i}`}
                  x={c.x}
                  y={c.y}
                  transform={`rotate(${c.rotation} ${c.x} ${c.y})`}
                  textAnchor="middle"
                  fill={sealColor}
                  fontFamily="sans-serif"
                  fontWeight="600"
                  fontSize={sealPreviewData.bottomFontSize}
                >
                  {c.char}
                </SvgText>
              ))}

              {/* Center Content */}
              <SvgText
                x={sealPreviewData.cx}
                y={sealPreviewData.cy - 6}
                textAnchor="middle"
                fontSize={8}
                fontWeight="bold"
                fill={sealColor}
              >
                AUTHORISED
              </SvgText>
              <SvgText
                x={sealPreviewData.cx}
                y={sealPreviewData.cy + 4}
                textAnchor="middle"
                fontSize={7}
                fontWeight="bold"
                fill={sealColor}
              >
                SIGNATORY
              </SvgText>
              {establishedYear ? (
                <SvgText
                  x={sealPreviewData.cx}
                  y={sealPreviewData.cy + 13}
                  textAnchor="middle"
                  fontSize={6}
                  fontWeight="bold"
                  fill={sealColor}
                >
                  EST. {establishedYear}
                </SvgText>
              ) : null}
            </Svg>
          </View>

          {/* Color Selector */}
          <Text style={[st.fieldHint, { marginTop: 10 }]}>Official Ink Color</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}>
            {SEAL_INK_COLORS.map((c) => (
              <Pressable
                key={c.id}
                style={[st.colorCircle, { backgroundColor: c.hex }, sealColor === c.hex && st.colorCircleSel]}
                onPress={() => setSealColor(c.hex)}
              />
            ))}
          </View>

          {/* Style Selector */}
          <Text style={[st.fieldHint, { marginTop: 6 }]}>Seal Ring Style</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginVertical: 8 }}>
            {(['classic', 'modern', 'badge', 'corporate'] as SealStyle[]).map((s) => (
              <Pressable
                key={s}
                style={[st.styleChip, sealStyle === s && st.styleChipSel]}
                onPress={() => setSealStyle(s)}
              >
                <Text style={[st.styleChipText, sealStyle === s && st.styleChipTextSel]}>{s.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>

          <InputField
            label="Established Year (Optional)"
            value={establishedYear}
            onChangeText={setEstablishedYear}
            placeholder="e.g. 2024"
            keyboardType="numeric"
            maxLength={4}
          />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <OutlineButton
              title="Apply & Save Digital Seal"
              icon="sparkles-outline"
              size="sm"
              onPress={handleGenerateDigitalSeal}
              style={{ flex: 1.2 }}
            />
            <OutlineButton
              title="Custom Upload"
              icon="image-outline"
              size="sm"
              onPress={handlePickSeal}
              style={{ flex: 1 }}
            />
          </View>
        </Card>

        {/* Business Identity */}
        <SectionHeader title="Business Identity & Tax Details" />
        <Card style={{ marginBottom: 16 }}>
          <InputField label="Shop / Store Name *" value={shopName} onChangeText={setShopName} icon="storefront-outline" />
          <InputField label="Trade Name" value={tradeName} onChangeText={setTradeName} icon="business-outline" />
          <InputField label="Owner Name *" value={ownerName} onChangeText={setOwnerName} icon="person-outline" />
          <InputField label="GSTIN" value={gstin} onChangeText={setGstin} icon="document-text-outline" editable={false} />
          <InputField label="PAN" value={pan} onChangeText={setPan} icon="card-outline" editable={false} />
          <InputField label="Invoice Prefix" value={invoicePrefix} onChangeText={setInvoicePrefix} icon="receipt-outline" autoCapitalize="characters" maxLength={5} placeholder="e.g. AKL" />
        </Card>

        {/* Payment & Banking */}
        <SectionHeader title="Payment & Bank Account" />
        <Card style={{ marginBottom: 16 }}>
          <InputField label="Counter UPI ID (For Scan & Pay)" value={upiId} onChangeText={setUpiId} icon="qr-code-outline" placeholder="e.g. yourshop@axl" />
          <InputField label="Bank Name" value={bankName} onChangeText={setBankName} icon="business-outline" />
          <InputField label="Account Number" value={accountNumber} onChangeText={setAccountNumber} icon="cash-outline" keyboardType="numeric" />
          <InputField label="IFSC Code" value={ifsc} onChangeText={setIfsc} icon="key-outline" autoCapitalize="characters" />
        </Card>

        {/* Business Address */}
        <SectionHeader title="Registered Place of Business" />
        <Card style={{ marginBottom: 16 }}>
          <InputField
            label="Registered Street Address"
            value={address}
            onChangeText={setAddress}
            icon="location-outline"
            placeholder="e.g. Ward No 4, Main Road, Purbi Champaran, Bihar"
            multiline
          />
          <Pressable onPress={() => setStateModal(true)}>
            <InputField
              label="State (Place of Supply)"
              value={state}
              icon="map-outline"
              editable={false}
              trailingIcon="chevron-down-outline"
              onTrailingPress={() => setStateModal(true)}
            />
          </Pressable>
        </Card>

        {/* Save Button */}
        <GradientButton
          title={saving ? 'Saving All Settings...' : 'Save Settings & Branding'}
          icon="checkmark-circle-outline"
          size="lg"
          disabled={saving}
          onPress={handleSaveSettings}
        />
      </ScrollView>

      {/* ── State Selection Modal ── */}
      <Modal visible={stateModal} transparent animationType="slide" onRequestClose={() => setStateModal(false)}>
        <View style={st.stateModalOverlay}>
          <Card style={st.stateModalCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: Theme.onSurface, fontSize: 16, fontWeight: '700' }}>Select State / UT</Text>
              <Pressable onPress={() => setStateModal(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={Theme.onSurfaceDisabled} />
              </Pressable>
            </View>
            <InputField
              placeholder="Search state..."
              value={stateSearch}
              onChangeText={setStateSearch}
              icon="search-outline"
            />
            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {INDIAN_STATES.filter((s) => s.toLowerCase().includes(stateSearch.toLowerCase().trim())).map((stName) => (
                <Pressable
                  key={stName}
                  style={[st.stateItem, state === stName && st.stateItemActive]}
                  onPress={() => {
                    setState(stName);
                    setStateModal(false);
                    setStateSearch('');
                  }}
                >
                  <Text style={[st.stateItemText, state === stName && st.stateItemTextActive]}>{stName}</Text>
                  {state === stName && <Ionicons name="checkmark-circle" size={18} color={Theme.primary} />}
                </Pressable>
              ))}
            </ScrollView>
          </Card>
        </View>
      </Modal>

      <Snackbar visible={showSnackbar} message={snackbarText} />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },
  brandBanner: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: Theme.shapeMd, marginBottom: 16, borderWidth: 1 },
  brandTitle: { fontSize: 13, fontWeight: '700' },
  brandSub: { color: Theme.onSurfaceVariant, fontSize: 11, marginTop: 2, lineHeight: 16 },
  fieldHint: { color: Theme.onSurfaceVariant, fontSize: 11, marginBottom: 6 },
  logoPreview: { width: 54, height: 54, borderRadius: 10, borderWidth: 1, borderColor: Theme.outlineVariant },
  logoPlaceholder: { width: 54, height: 54, borderRadius: 10, backgroundColor: Theme.surface3, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.outlineVariant },
  liveHeaderCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1, borderColor: Theme.outlineVariant },
  headerLogo: { width: 40, height: 40, resizeMode: 'contain' },
  headerLogoBadge: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#0a0e1a', alignItems: 'center', justifyContent: 'center' },
  headerShopTitle: { color: '#0f172a', fontWeight: '800', fontSize: 14 },
  headerTaxLabel: { color: '#64748b', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  sealPreviewWrapper: { alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#ffffff', borderRadius: 12, marginVertical: 8 },
  colorCircle: { width: 32, height: 32, borderRadius: 16 },
  colorCircleSel: { borderWidth: 3, borderColor: Theme.primary },
  styleChip: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6, backgroundColor: Theme.surface3, borderWidth: 1, borderColor: Theme.outlineVariant },
  styleChipSel: { backgroundColor: Theme.primaryContainer, borderColor: Theme.primary },
  styleChipText: { color: Theme.onSurfaceVariant, fontSize: 10, fontWeight: '700' },
  styleChipTextSel: { color: Theme.primary },

  // State Modal
  stateModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  stateModalCard: { width: '100%', maxWidth: 420, backgroundColor: Theme.surface2, borderRadius: 20, padding: 18 },
  stateItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8, marginBottom: 4, backgroundColor: Theme.surface3 },
  stateItemActive: { backgroundColor: Theme.primaryContainer, borderWidth: 1, borderColor: Theme.primary },
  stateItemText: { color: Theme.onSurface, fontSize: 13, fontWeight: '600' },
  stateItemTextActive: { color: Theme.primary, fontWeight: '700' },
});
