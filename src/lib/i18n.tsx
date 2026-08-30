/**
 * Lightweight i18n system.
 * - English is the default for every new user.
 * - Preference persists in localStorage and applies on future visits.
 * - Designed to add more languages by extending the `dictionaries` map.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en } from './locales/en';
import { hi } from './locales/hi';

export type Lang = 'en' | 'hi';
export type Dict = Record<string, string>;

export const LANGUAGES: { code: Lang; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
];

const dictionaries: Record<Lang, Dict> = { en, hi };

const STORAGE_KEY = 'aklogic_lang';

function readLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'hi') return v;
  } catch { /* ignore */ }
  return 'en'; // English default for every new user
}

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = dictionaries[lang];
      let str = dict[key] ?? dictionaries.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return str;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Safe fallback so components never crash if rendered outside provider.
    return { lang: 'en', setLang: () => {}, t: (k) => en[k] ?? k };
  }
  return ctx;
}

/** Convenience hook returning only the translate function. */
export function useT() {
  return useI18n().t;
}
