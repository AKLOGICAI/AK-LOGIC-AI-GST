// AK-LOGIC AI GST — Global Merchant Authentication Context
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { loadSession, saveSession, clearSession, updateCachedMerchant } from './session';
import { api, setApiAuthToken } from './apiClient';

export interface MerchantProfile {
  id: string;
  merchantCode?: string;
  shopName: string;
  ownerName: string;
  legalName?: string;
  tradeName?: string;
  businessType?: string;
  phone: string;
  email: string;
  gstin?: string;
  pan?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  bankName?: string;
  accountType?: string;
  accountNumber?: string;
  ifsc?: string;
  pdfCredits?: number;
  planId?: string;
  planName?: string;
  planValidityDays?: number;
  planExpiresAt?: number;
  customBranding?: boolean;
  qrId?: string;
  kyc?: string;
  status?: string;
  invoicePrefix?: string;
  logoUrl?: string;
  signatureUrl?: string;
  companySealUrl?: string;
  hasCustomLogo?: boolean;
  hasSignature?: boolean;
  hasCompanySeal?: boolean;
  upiId?: string;
}

interface MerchantContextType {
  merchant: MerchantProfile | null;
  token: string | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (token: string, merchant: MerchantProfile) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateMerchantLocally: (patch: Partial<MerchantProfile>) => void;
}

const MerchantContext = createContext<MerchantContextType | undefined>(undefined);

export function MerchantProvider({ children }: { children: ReactNode }) {
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkSavedSession() {
      try {
        const saved = await loadSession();
        if (saved && saved.token && saved.merchant) {
          setToken(saved.token);
          setMerchant(saved.merchant);
          setApiAuthToken(saved.token);

          // Refresh live profile in background silently
          api.get('/api/merchant/me', { token: saved.token })
            .then((freshMerchant: any) => {
              if (freshMerchant) {
                setMerchant(freshMerchant);
                updateCachedMerchant(freshMerchant);
              }
            })
            .catch(() => {});
        }
      } catch (err) {
        console.warn('Session restoration failed:', err);
      } finally {
        setIsLoading(false);
      }
    }
    checkSavedSession();
  }, []);

  const login = async (newToken: string, newMerchant: MerchantProfile) => {
    setToken(newToken);
    setMerchant(newMerchant);
    setApiAuthToken(newToken);
    await saveSession(newToken, newMerchant);
  };

  const logout = async () => {
    setToken(null);
    setMerchant(null);
    setApiAuthToken(null);
    await clearSession();
  };

  const refreshProfile = async () => {
    if (!token) return;
    try {
      const fresh = await api.get('/api/merchant/me', { token });
      if (fresh) {
        setMerchant(fresh);
        await updateCachedMerchant(fresh);
      }
    } catch (err) {
      console.warn('Profile refresh error:', err);
    }
  };

  const updateMerchantLocally = (patch: Partial<MerchantProfile>) => {
    setMerchant(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...patch };
      updateCachedMerchant(updated);
      return updated;
    });
  };

  return (
    <MerchantContext.Provider
      value={{
        merchant,
        token,
        isLoggedIn: !!token && !!merchant,
        isLoading,
        login,
        logout,
        refreshProfile,
        updateMerchantLocally,
      }}
    >
      {children}
    </MerchantContext.Provider>
  );
}

export function useMerchant(): MerchantContextType {
  const context = useContext(MerchantContext);
  if (!context) {
    throw new Error('useMerchant must be used within a MerchantProvider');
  }
  return context;
}
