// AK-LOGIC AI GST — Android Secure Session Manager
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setApiAuthToken } from './apiClient';

const TOKEN_KEY = 'ak_merchant_jwt_token';
const MERCHANT_KEY = 'ak_merchant_profile_data';

export interface SavedSession {
  token: string;
  merchant: any;
}

export async function saveSession(token: string, merchant: any): Promise<void> {
  setApiAuthToken(token);
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(MERCHANT_KEY, JSON.stringify(merchant));
  } catch {
    // Fallback for environments where SecureStore isn't available
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(MERCHANT_KEY, JSON.stringify(merchant));
  }
}

export async function loadSession(): Promise<SavedSession | null> {
  try {
    let token: string | null = null;
    let merchantStr: string | null = null;

    try {
      token = await SecureStore.getItemAsync(TOKEN_KEY);
      merchantStr = await SecureStore.getItemAsync(MERCHANT_KEY);
    } catch {
      // SecureStore error fallback
    }

    if (!token) {
      token = await AsyncStorage.getItem(TOKEN_KEY);
      merchantStr = await AsyncStorage.getItem(MERCHANT_KEY);
    }

    if (token && merchantStr) {
      const merchant = JSON.parse(merchantStr);
      setApiAuthToken(token);
      return { token, merchant };
    }
  } catch (err) {
    console.warn('Error loading session:', err);
  }
  return null;
}

export async function clearSession(): Promise<void> {
  setApiAuthToken(null);
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(MERCHANT_KEY).catch(() => {});
  } catch {}
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
  await AsyncStorage.removeItem(MERCHANT_KEY).catch(() => {});
}

export async function updateCachedMerchant(merchant: any): Promise<void> {
  try {
    await SecureStore.setItemAsync(MERCHANT_KEY, JSON.stringify(merchant));
  } catch {
    await AsyncStorage.setItem(MERCHANT_KEY, JSON.stringify(merchant));
  }
}
