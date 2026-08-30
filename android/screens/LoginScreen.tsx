import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Theme } from '../lib/theme';
import { GradientButton, InputField, ShieldLogo, OutlineButton, AlertDialog } from '../components/DesignSystem';
import { api, ApiError } from '../lib/apiClient';
import { useMerchant } from '../lib/MerchantContext';

export default function LoginScreen({ onLogin }: { onLogin?: () => void }) {
  const { login } = useMerchant();
  const [step, setStep] = useState<'phone' | 'mpin' | 'register'>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [mpin, setMpin] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Register Form State
  const [regShopName, setRegShopName] = useState('');
  const [regOwnerName, setRegOwnerName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regGstin, setRegGstin] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regState, setRegState] = useState('Maharashtra');
  const [regBankName, setRegBankName] = useState('');
  const [regAccNo, setRegAccNo] = useState('');
  const [regIfsc, setRegIfsc] = useState('');
  const [regMpin, setRegMpin] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtp, setShowOtp] = useState(false);

  // Forgot MPIN dialog
  const [showForgotDialog, setShowForgotDialog] = useState(false);

  const handlePhoneContinue = () => {
    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setErrorMessage('Please enter a valid 10-digit mobile number.');
      return;
    }
    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      setErrorMessage('Please enter a valid registered email address.');
      return;
    }
    setErrorMessage('');
    setStep('mpin');
  };

  const handleMpinSubmit = async (pinValue: string) => {
    if (loading) return;
    setLoading(true);
    setErrorMessage('');

    try {
      const cleanPhone = phone.trim().replace(/\D/g, '');
      const cleanEmail = email.trim();
      const response = await api.post('/api/merchant/login', {
        phone: cleanPhone,
        email: cleanEmail,
        mpin: pinValue,
      });

      if (response && response.token && response.merchant) {
        await login(response.token, response.merchant);
        if (onLogin) onLogin();
      } else {
        setErrorMessage(response?.message || 'Login failed. Please check credentials.');
        setMpin('');
      }
    } catch (err: any) {
      const msg = err?.message || 'Incorrect mobile number, email, or MPIN.';
      setErrorMessage(msg);
      setMpin('');
    } finally {
      setLoading(false);
    }
  };

  const handleSendRegisterOtp = async () => {
    const cleanPhone = regPhone.trim().replace(/\D/g, '');
    if (!regShopName || !regOwnerName || cleanPhone.length < 10 || !regMpin) {
      setErrorMessage('Please fill in Shop Name, Owner Name, 10-digit Mobile, and MPIN.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      await api.post('/send-otp', {
        phone: cleanPhone,
        email: regEmail.trim(),
      });
      setShowOtp(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndRegister = async () => {
    if (!otp || otp.length < 6) {
      setErrorMessage('Please enter the 6-digit OTP.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const cleanPhone = regPhone.trim().replace(/\D/g, '');
      // Verify OTP
      await api.post('/verify-otp', {
        phone: cleanPhone,
        otp: otp.trim(),
      });

      // Submit registration
      const pan = regGstin ? regGstin.substring(2, 12).toUpperCase() : 'AAPFU0939F';
      const regResponse = await api.post('/api/merchant/register', {
        shopName: regShopName.trim(),
        ownerName: regOwnerName.trim(),
        phone: cleanPhone,
        email: regEmail.trim() || undefined,
        mpin: regMpin.trim(),
        gstin: regGstin.trim() || '27AAPFU0939F1ZV',
        pan: pan,
        address: regAddress.trim() || 'Shop Address',
        state: regState,
        bankName: regBankName.trim() || 'HDFC Bank',
        accountNumber: regAccNo.trim() || '0000000000',
        ifsc: regIfsc.trim() || 'HDFC0000001',
      });

      if (regResponse && regResponse.token && regResponse.merchant) {
        await login(regResponse.token, regResponse.merchant);
        if (onLogin) onLogin();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const renderPhoneStep = () => (
    <>
      <Text style={st.headline}>Welcome Back</Text>
      <Text style={st.supporting}>Enter your registered business mobile & email</Text>

      {!!errorMessage && (
        <View style={st.errorBanner}>
          <MaterialIcons name="error-outline" size={16} color={Theme.error} />
          <Text style={st.errorText}>{errorMessage}</Text>
        </View>
      )}

      <InputField
        label="Mobile Number"
        placeholder="Enter 10-digit number"
        value={phone}
        onChangeText={(t: string) => { setPhone(t); setErrorMessage(''); }}
        icon="call-outline"
        keyboardType="phone-pad"
      />

      <InputField
        label="Email Address *"
        placeholder="Enter registered email address"
        value={email}
        onChangeText={(t: string) => { setEmail(t); setErrorMessage(''); }}
        icon="mail-outline"
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <GradientButton
        title="Continue"
        onPress={handlePhoneContinue}
        size="lg"
        icon="arrow-forward"
        style={{ marginTop: 8 }}
      />

      <View style={st.dividerRow}>
        <View style={st.dividerLine} />
        <Text style={st.dividerText}>or</Text>
        <View style={st.dividerLine} />
      </View>

      <OutlineButton
        title="Register New Business"
        onPress={() => { setStep('register'); setErrorMessage(''); }}
        icon="storefront-outline"
      />
    </>
  );

  const renderMpinStep = () => (
    <>
      <Pressable onPress={() => { setStep('phone'); setErrorMessage(''); }} style={st.inlineBack}>
        <MaterialIcons name="arrow-back" size={24} color={Theme.onSurfaceVariant} />
      </Pressable>

      <Text style={st.headline}>Enter MPIN</Text>
      <Text style={st.supporting}>Signing in to {phone}</Text>

      {!!errorMessage && (
        <View style={st.errorBanner}>
          <MaterialIcons name="error-outline" size={16} color={Theme.error} />
          <Text style={st.errorText}>{errorMessage}</Text>
        </View>
      )}

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Theme.primary} />
          <Text style={{ color: Theme.onSurfaceVariant, marginTop: 12 }}>Verifying credentials...</Text>
        </View>
      ) : (
        <>
          {/* MPIN dots */}
          <View style={st.mpinRow}>
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={[st.mpinDot, mpin.length > i && st.mpinFilled]} />
            ))}
          </View>

          {/* Numeric keypad */}
          <View style={st.numpad}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'].map((key, idx) => (
              <Pressable
                key={idx}
                style={({ pressed }) => [
                  st.numKey,
                  key === null && { opacity: 0 },
                  pressed && key !== null && { backgroundColor: Theme.surface4 },
                ]}
                onPress={() => {
                  if (key === 'del') {
                    setMpin(p => p.slice(0, -1));
                  } else if (key !== null && mpin.length < 4) {
                    const np = mpin + key;
                    setMpin(np);
                    if (np.length === 4) {
                      handleMpinSubmit(np);
                    }
                  }
                }}
                disabled={key === null || loading}
              >
                {key === 'del' ? (
                  <MaterialIcons name="backspace" size={22} color={Theme.onSurface} />
                ) : (
                  <Text style={st.numKeyText}>{key}</Text>
                )}
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Pressable onPress={() => setShowForgotDialog(true)} style={st.forgotBtn}>
        <Text style={st.forgotText}>Forgot MPIN?</Text>
      </Pressable>

      <AlertDialog
        visible={showForgotDialog}
        onDismiss={() => setShowForgotDialog(false)}
        icon="key-outline"
        title="Reset MPIN"
        message={`An OTP will be sent to your registered mobile number (${phone}) to reset your MPIN.`}
        confirmLabel="Send OTP"
        cancelLabel="Cancel"
        onConfirm={async () => {
          setShowForgotDialog(false);
          try {
            await api.post('/send-otp', { phone: phone.trim().replace(/\D/g, '') });
            Alert.alert('OTP Sent', 'Please check your SMS for the verification code.');
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Could not send OTP.');
          }
        }}
        onCancel={() => setShowForgotDialog(false)}
      />
    </>
  );

  const renderRegisterStep = () => (
    <>
      <Pressable onPress={() => { setStep('phone'); setErrorMessage(''); }} style={st.inlineBack}>
        <MaterialIcons name="arrow-back" size={24} color={Theme.onSurfaceVariant} />
      </Pressable>

      <Text style={st.headline}>Register Business</Text>
      <Text style={st.supporting}>Set up your account on AK-LOGIC AI GST</Text>

      {!!errorMessage && (
        <View style={st.errorBanner}>
          <MaterialIcons name="error-outline" size={16} color={Theme.error} />
          <Text style={st.errorText}>{errorMessage}</Text>
        </View>
      )}

      <InputField
        label="Shop / Business Name"
        placeholder="e.g. Kumar Electronics"
        icon="storefront-outline"
        value={regShopName}
        onChangeText={setRegShopName}
      />
      <InputField
        label="Owner Name"
        placeholder="Full name"
        icon="person-outline"
        value={regOwnerName}
        onChangeText={setRegOwnerName}
      />
      <InputField
        label="Mobile Number"
        placeholder="10-digit number"
        icon="call-outline"
        keyboardType="phone-pad"
        value={regPhone}
        onChangeText={setRegPhone}
      />
      <InputField
        label="Email Address"
        placeholder="e.g. shop@example.com"
        icon="mail-outline"
        keyboardType="email-address"
        autoCapitalize="none"
        value={regEmail}
        onChangeText={setRegEmail}
      />
      <InputField
        label="Set 4-Digit MPIN"
        placeholder="4-digit security PIN"
        icon="lock-closed-outline"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={4}
        value={regMpin}
        onChangeText={setRegMpin}
      />
      <InputField
        label="GSTIN (Optional)"
        placeholder="e.g. 27AAPFU0939F1ZV"
        icon="document-text-outline"
        autoCapitalize="characters"
        value={regGstin}
        onChangeText={setRegGstin}
      />
      <InputField
        label="Business Address"
        placeholder="Shop address"
        icon="location-outline"
        value={regAddress}
        onChangeText={setRegAddress}
      />

      {showOtp ? (
        <View style={{ marginTop: 8 }}>
          <InputField
            label="Enter 6-Digit OTP"
            placeholder="6-digit OTP"
            icon="key-outline"
            keyboardType="number-pad"
            value={otp}
            onChangeText={setOtp}
          />
          <GradientButton
            title={loading ? 'Registering...' : 'Verify & Register'}
            onPress={handleVerifyAndRegister}
            disabled={loading}
            size="lg"
            icon="checkmark-circle-outline"
          />
        </View>
      ) : (
        <GradientButton
          title={loading ? 'Sending OTP...' : 'Send Verification OTP'}
          onPress={handleSendRegisterOtp}
          disabled={loading}
          size="lg"
          icon="send-outline"
          style={{ marginTop: 8 }}
        />
      )}

      <Pressable onPress={() => { setStep('phone'); setErrorMessage(''); }} style={st.forgotBtn}>
        <Text style={st.forgotText}>Already registered? Login</Text>
      </Pressable>
    </>
  );

  return (
    <View style={st.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={st.logoSection}>
            <ShieldLogo size={64} />
            <Text style={st.brandName}>AK-LOGIC <Text style={{ color: Theme.primary }}>AI GST</Text></Text>
          </View>

          <View style={st.formSurface}>
            {step === 'phone' && renderPhoneStep()}
            {step === 'mpin' && renderMpinStep()}
            {step === 'register' && renderRegisterStep()}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 48, paddingBottom: 32 },
  logoSection: { alignItems: 'center', marginBottom: 32 },
  brandName: { fontSize: 20, fontWeight: '600', color: Theme.onSurface, marginTop: 12, letterSpacing: 0.5 },
  formSurface: {
    backgroundColor: Theme.surface2, borderRadius: Theme.shapeXl,
    padding: 24, ...Theme.elevation2,
  },
  headline: { fontSize: Theme.headlineSmall, fontWeight: '600', color: Theme.onSurface, marginBottom: 4 },
  supporting: { fontSize: Theme.bodyMedium, color: Theme.onSurfaceVariant, marginBottom: 20 },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Theme.errorContainer,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: Theme.shapeSm, marginBottom: 16, gap: 8,
  },
  errorText: { color: Theme.error, fontSize: Theme.bodySmall, flex: 1, fontWeight: '500' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Theme.outlineVariant },
  dividerText: { color: Theme.onSurfaceDisabled, fontSize: Theme.bodySmall, marginHorizontal: 16 },
  inlineBack: { marginBottom: 12, width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginLeft: -12 },
  mpinRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginVertical: 28 },
  mpinDot: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: Theme.outline, backgroundColor: 'transparent',
  },
  mpinFilled: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  numpad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  numKey: {
    width: 72, height: 52, borderRadius: Theme.shapeLg,
    backgroundColor: Theme.surface3, alignItems: 'center', justifyContent: 'center',
  },
  numKeyText: { color: Theme.onSurface, fontSize: 22, fontWeight: '500' },
  forgotBtn: { marginTop: 20, alignSelf: 'center', paddingVertical: 8 },
  forgotText: { color: Theme.primary, fontSize: Theme.labelLarge, fontWeight: '600' },
});
