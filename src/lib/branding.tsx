/**
 * Centralised branding resolver.
 *
 * Decides which logo + name to show for a given merchant, honouring:
 *  - Monthly+ merchants (validity >= 30 days) with an uploaded logo -> own brand
 *  - Everyone else (free / <30-day plans) -> platform default logo (admin-managed)
 *
 * The platform default logo is controlled by the Super Admin's Logo Management
 * section and updates instantly across dashboards, QR pages and invoices.
 */
import type { Merchant } from './types';
import { platformService } from './platform';
import { credits } from './services';

export interface ResolvedBrand {
  /** true => merchant's own custom logo/name is used */
  custom: boolean;
  logoDataUrl?: string;     // image data URL (custom merchant OR custom platform default)
  builtInDefault: boolean;  // true => no image, render the built-in AK SVG mark
  name: string;             // display name
  tagline: string;
}

/** Pure resolver (no React) — usable in PDF generation & services. */
export function resolveBrand(m: Merchant): ResolvedBrand {
  const platform = platformService.get();
  const merchantLogo = m.logoUrl || m.logoDataUrl;
  const merchantBrandingUnlocked = credits.brandingEnabled(m) && !!merchantLogo;

  if (merchantBrandingUnlocked) {
    return {
      custom: true,
      logoDataUrl: merchantLogo,
      builtInDefault: false,
      name: m.brandName || m.shopName,
      tagline: 'GST Invoice',
    };
  }

  // Free / short-duration plan -> platform default (admin managed)
  return {
    custom: false,
    logoDataUrl: platform.defaultLogoDataUrl,
    builtInDefault: !platform.defaultLogoDataUrl,
    name: platform.brandName || 'AK-LOGIC AI',
    tagline: platform.tagline || 'GST Invoicing',
  };
}

/** The built-in AK SVG mark as a string (used in invoice PDFs). */
export const AK_SVG_MARK = `<svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="akg" x1="0" y1="0" x2="48" y2="48"><stop offset="0" stop-color="#c9963b"/><stop offset="0.55" stop-color="#e9c46a"/><stop offset="1" stop-color="#11a892"/></linearGradient></defs><path d="M10 38 L20 10 L26 10 L36 38 L29 38 L27 31 L18.5 31 L16.5 38 Z M20.4 25 L25 25 L22.7 17 Z" fill="url(#akg)"/><path d="M30 24 L40 14 M30 24 L40 34" stroke="url(#akg)" stroke-width="3.4" stroke-linecap="round"/></svg>`;
