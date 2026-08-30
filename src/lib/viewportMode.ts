/**
 * viewportMode.ts — Controls "Desktop View" vs "Force Mobile-Compact View".
 * 
 * When Desktop View is OFF (default):
 * Forces mobile-compact layout on all devices, neutralizing Chrome's
 * "Request Desktop Site" artificial viewport expansion.
 * 
 * When Desktop View is ON:
 * Enables standard responsive behavior (Tailwind breakpoint logic).
 */
import { useState, useEffect } from 'react';

const STORAGE_KEY = 'aklogic_desktop_view';
const OVERRIDE_CLASS = 'force-mobile-view';

/**
 * Reads desktop view preference from localStorage.
 * Default is FALSE (Mobile-Compact view forced).
 */
export function getDesktopViewPreference(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    // Default is false (Mobile-compact mode active)
    return saved === 'true';
  } catch {
    return false;
  }
}

/**
 * Updates desktop view preference and toggles the CSS override class on <html>.
 */
export function setDesktopViewPreference(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore
  }

  applyViewportModeClass(enabled);
  window.dispatchEvent(new CustomEvent('viewport-mode-changed', { detail: { isDesktopView: enabled } }));
}

/**
 * Applies or removes `force-mobile-view` / `desktop-view-active` class on documentElement
 * and dynamically adjusts the <meta name="viewport"> for true mobile scaling.
 */
export function applyViewportModeClass(isDesktopView: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const viewportMeta = document.querySelector('meta[name="viewport"]');

  if (!isDesktopView) {
    root.classList.add('force-mobile-view');
    root.classList.remove('desktop-view-active');
    if (viewportMeta) {
      viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    }
  } else {
    root.classList.remove('force-mobile-view');
    root.classList.add('desktop-view-active');
    if (viewportMeta) {
      viewportMeta.setAttribute('content', 'width=1180, initial-scale=0.35, user-scalable=yes');
    }
  }
}

/**
 * React hook to read and toggle Desktop View preference reactively.
 */
export function useDesktopView(): [boolean, (enabled: boolean) => void] {
  const [isDesktopView, setIsDesktopView] = useState<boolean>(getDesktopViewPreference);

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<{ isDesktopView: boolean }>;
      if (custom.detail && typeof custom.detail.isDesktopView === 'boolean') {
        setIsDesktopView(custom.detail.isDesktopView);
      } else {
        setIsDesktopView(getDesktopViewPreference());
      }
    };

    window.addEventListener('viewport-mode-changed', handler);
    return () => window.removeEventListener('viewport-mode-changed', handler);
  }, []);

  const toggle = (enabled: boolean) => {
    setIsDesktopView(enabled);
    setDesktopViewPreference(enabled);
  };

  return [isDesktopView, toggle];
}
