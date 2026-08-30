/**
 * Platform settings — Super Admin controlled, applies globally.
 *
 * The default AK-LOGIC AI logo set here is automatically used for every
 * free + short-duration (validity < 30 days) merchant. Monthly+ merchants
 * with their own uploaded logo keep their custom branding.
 */
import { Singleton, subscribe } from './db';
import { useSyncExternalStore } from 'react';
import type { PlatformSettings } from './types';

const DEFAULTS: PlatformSettings = {
  defaultLogoDataUrl: undefined,
  brandName: 'AK-LOGIC AI',
  tagline: 'GST Invoicing',
  updatedAt: 0,
  updatedBy: '',
};

const settingsDoc = new Singleton<PlatformSettings>('platform_settings', DEFAULTS);

export const platformService = {
  get(): PlatformSettings { return settingsDoc.get(); },
  /** Update the default platform logo (data URL). Reflects everywhere instantly. */
  setDefaultLogo(dataUrl: string | undefined, by = 'Super Admin') {
    settingsDoc.patch({ defaultLogoDataUrl: dataUrl, updatedAt: Date.now(), updatedBy: by });
  },
  update(patch: Partial<PlatformSettings>, by = 'Super Admin') {
    settingsDoc.patch({ ...patch, updatedAt: Date.now(), updatedBy: by });
  },
  reset() { settingsDoc.set({ ...DEFAULTS, updatedAt: Date.now(), updatedBy: 'Super Admin' }); },
};

export function usePlatformSettings(): PlatformSettings {
  return useSyncExternalStore(subscribe, () => settingsDoc.get(), () => settingsDoc.get());
}
