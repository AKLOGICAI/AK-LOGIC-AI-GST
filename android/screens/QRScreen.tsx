import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Share, Alert, Clipboard } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Theme } from '../lib/theme';
import { Card, GradientButton, OutlineButton, TopAppBar, Snackbar, Divider } from '../components/DesignSystem';
import { useMerchant } from '../lib/MerchantContext';
import { QRCodeSvg, getQrDataUrl, getQrSvgString } from '../lib/qrSvg';

export default function QRScreen({ navigation }: { navigation?: any }) {
  const { merchant } = useMerchant();
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarText, setSnackbarText] = useState('');
  const [printing, setPrinting] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  const [exportingSvg, setExportingSvg] = useState(false);

  const notify = (msg: string) => {
    setSnackbarText(msg);
    setShowSnackbar(true);
    setTimeout(() => setShowSnackbar(false), 3000);
  };

  const qrId = merchant?.qrId || merchant?.merchantCode || 'AKM-000001';
  const merchantCode = merchant?.merchantCode || 'AKM-000001';
  const shopName = merchant?.tradeName || merchant?.shopName || 'AK-LOGIC Store';
  const gstin = merchant?.gstin || '27AAPFU0939F1ZV';
  const upiId = merchant?.upiId || `${merchant?.phone || '9380617973'}@axl`;
  const payUrl = `https://gst.ak-logicai.in/pay/${qrId}`;

  const handleCopyLink = () => {
    Clipboard.setString(payUrl);
    notify('Billing Link Copied to Clipboard! 📋');
  };

  const handleShare = async () => {
    try {
      await Share.share({
        title: `${shopName} — Scan to Bill`,
        message: `Scan to create instant GST invoice at ${shopName}:\n${payUrl}\n\nMerchant ID: ${merchantCode}`,
        url: payUrl,
      });
    } catch (err) {}
  };

  // High-Resolution PNG Export (1024px)
  // High-Resolution Export
  const handleDownloadPng = async () => {
    setExportingPng(true);
    try {
      const svgString = await getQrSvgString(payUrl, '#0c1322', '#ffffff', merchantCode, 600);
      const html = `<!doctype html>
<html>
<head><meta charset="utf-8"/><style>body{margin:0;padding:24px;background:#ffffff;display:flex;justify-content:center;align-items:center;text-align:center;}</style></head>
<body>
  <div style="display:inline-block;padding:16px;border-radius:16px;background:#ffffff;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
    ${svgString}
  </div>
</body>
</html>`;
      const file = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${shopName} High-Res QR`,
        });
        notify('High-Res QR ready to save/share! 🖼️');
      } else {
        notify('High-Res QR generated successfully!');
      }
    } catch (e: any) {
      Alert.alert('Download Error', e.message || 'Could not export QR.');
    } finally {
      setExportingPng(false);
    }
  };

  // Vector SVG File Export
  const handleDownloadSvg = async () => {
    setExportingSvg(true);
    try {
      const svgString = await getQrSvgString(payUrl, '#0c1322', '#ffffff', merchantCode, 480);
      const fileUri = `${FileSystem.cacheDirectory}${qrId}_QR.svg`;
      await FileSystem.writeAsStringAsync(fileUri, svgString, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'image/svg+xml',
          dialogTitle: `${shopName} Vector QR SVG`,
        });
        notify('Vector SVG ready to save/share! 📐');
      } else {
        notify('Vector SVG generated successfully!');
      }
    } catch (e: any) {
      Alert.alert('Download Error', e.message || 'Could not export SVG.');
    } finally {
      setExportingSvg(false);
    }
  };

  // Print A4 Standee PDF
  const handlePrintStandee = async () => {
    setPrinting(true);
    try {
      const svgString = await getQrSvgString(payUrl, '#0c1322', '#ffffff', merchantCode, 360);
      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Counter Standee — ${shopName}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #ffffff; color: #0f172a; margin: 0; padding: 15px; text-align: center; }
    .standee-frame {
      max-width: 480px;
      margin: 0 auto;
      border: 3px solid #00D4AA;
      border-radius: 24px;
      padding: 32px 24px;
      background: linear-gradient(180deg, #16203a 0%, #0c1322 100%);
      color: #ffffff;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
    .brand-tag { font-size: 11px; font-weight: 800; color: #00D4AA; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
    .store-name { font-size: 26px; font-weight: 800; color: #ffffff; margin: 6px 0 2px; }
    .gstin { font-size: 12px; color: #94a3b8; margin-bottom: 20px; }
    .qr-container {
      background: #ffffff;
      padding: 18px;
      border-radius: 20px;
      display: inline-block;
      margin: 10px 0;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    }
    .instructions { font-size: 15px; font-weight: 700; color: #e9c46a; margin: 16px 0 6px; letter-spacing: 0.5px; }
    .sub-inst { font-size: 12px; color: #cbd5e1; line-height: 1.5; margin-bottom: 18px; }
    .footer-bar {
      border-top: 1px solid rgba(255,255,255,0.15);
      padding-top: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
    }
    .code-label { font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; }
    .code-val { color: #00D4AA; font-weight: 800; font-family: monospace; font-size: 13px; }
  </style>
</head>
<body>
  <div class="standee-frame">
    <div class="brand-tag">⚡ Instant Self-Billing Counter</div>
    <h1 class="store-name">${shopName}</h1>
    <div class="gstin">GSTIN: ${gstin}</div>

    <div class="qr-container">
      ${svgString}
    </div>

    <div class="instructions">SCAN WITH SMARTPHONE CAMERA</div>
    <div class="sub-inst">Scan from your phone camera or QR app to submit an instant GST invoice request. No app install needed.</div>

    <div class="footer-bar">
      <div style="text-align:left;">
        <div class="code-label">Merchant Code</div>
        <div class="code-val">${merchantCode}</div>
      </div>
      ${upiId ? `
      <div style="text-align:right;">
        <div class="code-label">UPI Accepted</div>
        <div class="code-val">${upiId}</div>
      </div>` : ''}
    </div>
  </div>
</body>
</html>`;

      const pdf = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdf.uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${shopName} Counter QR Standee`,
        });
      } else {
        await Print.printAsync({ html });
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not export standee PDF.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <View style={st.container}>
      <TopAppBar title="My QR Code" onBack={() => navigation?.goBack?.()} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      >
        {/* Header note */}
        <Text style={st.pageDesc}>
          Show this QR code at your shop counter. Customers scan with any smartphone camera to submit instant billing requests.
        </Text>

        {/* Counter QR Standee Card */}
        <View style={st.qrWrapper}>
          <LinearGradient
            colors={['#16203a', '#0c1322']}
            style={st.standeeCard}
          >
            {/* Header Badge */}
            <View style={st.brandRow}>
              <View style={st.brandIcon}>
                <Ionicons name="shield-checkmark" size={18} color={Theme.primary} />
              </View>
              <View>
                <Text style={st.brandTitle}>AK-LOGIC AI GST</Text>
                <Text style={st.brandSub}>Instant Self-Billing Counter</Text>
              </View>
            </View>

            {/* Real Scannable QR Matrix */}
            <View style={st.qrBox}>
              <QRCodeSvg
                value={payUrl}
                size={210}
                dark="#0c1322"
                light="#ffffff"
                label={merchantCode}
              />
            </View>

            {/* Merchant Details */}
            <View style={st.metaBox}>
              <Text style={st.shopNameText} numberOfLines={1}>{shopName}</Text>
              <Text style={st.gstinText}>GSTIN: {gstin}</Text>
              <Text style={st.qrIdText}>{qrId}</Text>

              <View style={st.dividerLine} />

              <View style={st.footerRow}>
                <View>
                  <Text style={st.codeLabel}>MERCHANT ID</Text>
                  <Text style={st.codeVal}>{merchantCode}</Text>
                </View>
                {!!upiId && (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={st.codeLabel}>UPI ACCEPTED</Text>
                    <Text style={st.codeVal}>{upiId}</Text>
                  </View>
                )}
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Primary Action Buttons */}
        <View style={st.actionGrid}>
          <GradientButton
            title="Share Billing QR Link"
            icon="share-social-outline"
            onPress={handleShare}
            style={{ marginBottom: 10 }}
          />

          {/* Quick Copy & Print Row */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <OutlineButton
              title="Copy Pay URL"
              icon="copy-outline"
              onPress={handleCopyLink}
              style={{ flex: 1 }}
            />
            <OutlineButton
              title={printing ? 'Generating...' : 'Print Standee PDF'}
              icon="print-outline"
              disabled={printing}
              onPress={handlePrintStandee}
              style={{ flex: 1.2 }}
            />
          </View>

          {/* PNG & SVG Export Buttons (Web Master Parity) */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <OutlineButton
              title={exportingPng ? 'Saving...' : 'Download PNG'}
              icon="image-outline"
              disabled={exportingPng}
              onPress={handleDownloadPng}
              style={{ flex: 1 }}
            />
            <OutlineButton
              title={exportingSvg ? 'Saving...' : 'Vector SVG'}
              icon="code-slash-outline"
              disabled={exportingSvg}
              onPress={handleDownloadSvg}
              style={{ flex: 1 }}
            />
          </View>
        </View>

        {/* How it works */}
        <Card style={st.guideCard}>
          <Text style={st.guideTitle}>⚡ How Instant QR Billing Works</Text>
          <View style={st.stepRow}>
            <View style={st.stepNum}><Text style={st.stepNumText}>1</Text></View>
            <Text style={st.stepText}>Customer scans your counter QR code from any smartphone camera.</Text>
          </View>
          <View style={st.stepRow}>
            <View style={st.stepNum}><Text style={st.stepNumText}>2</Text></View>
            <Text style={st.stepText}>They enter purchased items / notes and submit billing request (no app install needed).</Text>
          </View>
          <View style={st.stepRow}>
            <View style={st.stepNum}><Text style={st.stepNumText}>3</Text></View>
            <Text style={st.stepText}>Request pops up in your **Requests** screen. You review, verify GST & approve in 1 tap.</Text>
          </View>
        </Card>
      </ScrollView>

      <Snackbar visible={showSnackbar} message={snackbarText} />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },
  pageDesc: { color: Theme.onSurfaceVariant, fontSize: 13, lineHeight: 18, marginBottom: 16 },
  qrWrapper: { alignItems: 'center', marginBottom: 20 },
  standeeCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,212,170,0.3)',
    elevation: 8,
    shadowColor: '#00D4AA',
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  brandIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: Theme.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  brandTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  brandSub: { color: Theme.primary, fontSize: 10, fontWeight: '600' },
  qrBox: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  metaBox: { width: '100%', alignItems: 'center', marginTop: 14 },
  shopNameText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  gstinText: { color: Theme.onSurfaceVariant, fontSize: 11, marginTop: 2 },
  qrIdText: { color: Theme.tertiary, fontSize: 11, fontFamily: 'monospace', fontWeight: '700', marginTop: 4 },
  dividerLine: { width: '100%', height: 1, backgroundColor: Theme.outlineVariant, marginVertical: 12 },
  footerRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between' },
  codeLabel: { color: Theme.onSurfaceDisabled, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  codeVal: { color: Theme.primary, fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
  actionGrid: { marginBottom: 20 },
  guideCard: { padding: 16, backgroundColor: Theme.surface2 },
  guideTitle: { color: Theme.onSurface, fontSize: 14, fontWeight: '700', marginBottom: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: Theme.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: Theme.primary, fontSize: 11, fontWeight: '800' },
  stepText: { flex: 1, color: Theme.onSurfaceVariant, fontSize: 12, lineHeight: 17 },
});

