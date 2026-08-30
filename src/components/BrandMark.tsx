import type { Merchant } from '../lib/types';
import { resolveBrand } from '../lib/branding';
import { usePlatformSettings } from '../lib/platform';
import { useStore, db } from '../lib/store';

interface Props {
  merchant: Merchant;
  size?: number;
  showName?: boolean;
  className?: string;
}

/**
 * Renders the correct branding for a merchant:
 *  - custom merchant logo (monthly+ with logo)
 *  - admin-managed platform default logo (free / <30-day plans)
 *  - built-in AK SVG mark if no platform logo set
 * Reactive: re-renders when admin updates the platform default logo,
 * or when the merchant record changes.
 */
export default function BrandMark({ merchant, size = 40, showName = true, className = '' }: Props) {
  usePlatformSettings(); // subscribe to platform-default-logo changes
  // subscribe to merchant table so plan/logo changes reflect live
  const live = useStore(() => db.merchants.byId(merchant.id) || merchant);
  const brand = resolveBrand(live);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="relative grid place-items-center rounded-xl overflow-hidden shrink-0"
        style={{ width: size, height: size, background: brand.logoDataUrl ? '#fff' : 'linear-gradient(150deg, #1b2942 0%, #0c1322 100%)' }}
      >
        {brand.logoDataUrl ? (
          <img src={brand.logoDataUrl} alt={brand.name} className="w-full h-full object-contain" />
        ) : (
          <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 48 48" fill="none">
            <defs>
              <linearGradient id="bmk" x1="0" y1="0" x2="48" y2="48">
                <stop offset="0" stopColor="#f6dd9b" />
                <stop offset="0.55" stopColor="#e9c46a" />
                <stop offset="1" stopColor="#38e0c8" />
              </linearGradient>
            </defs>
            <path d="M10 38 L20 10 L26 10 L36 38 L29 38 L27 31 L18.5 31 L16.5 38 Z M20.4 25 L25 25 L22.7 17 Z" fill="url(#bmk)" />
            <path d="M30 24 L40 14 M30 24 L40 34" stroke="url(#bmk)" strokeWidth="3.4" strokeLinecap="round" opacity="0.85" />
          </svg>
        )}
      </div>
      {showName && (
        <div className="leading-none min-w-0">
          <div className="font-[var(--font-display)] font-bold tracking-tight truncate" style={{ fontSize: size * 0.4, color: 'var(--color-ivory)' }}>
            {brand.name}
          </div>
          <div className="text-[10px] tracking-[0.25em] uppercase mt-1 text-[var(--color-mist-2)] truncate">{brand.tagline}</div>
        </div>
      )}
    </div>
  );
}
