interface Props { size?: number; showText?: boolean; className?: string; onLight?: boolean }

export default function Logo({ size = 36, showText = true, className = '', onLight = false }: Props) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="relative grid place-items-center rounded-xl"
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(150deg, #1b2942 0%, #0c1322 100%)',
          boxShadow: onLight ? '0 4px 12px -4px rgba(15,26,47,0.3)' : undefined,
        }}
      >
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 48 48" fill="none">
          <defs>
            <linearGradient id="akg" x1="0" y1="0" x2="48" y2="48">
              <stop offset="0" stopColor="#f6dd9b" />
              <stop offset="0.55" stopColor="#e9c46a" />
              <stop offset="1" stopColor="#38e0c8" />
            </linearGradient>
          </defs>
          <path d="M10 38 L20 10 L26 10 L36 38 L29 38 L27 31 L18.5 31 L16.5 38 Z M20.4 25 L25 25 L22.7 17 Z" fill="url(#akg)" />
          <path d="M30 24 L40 14 M30 24 L40 34" stroke="url(#akg)" strokeWidth="3.4" strokeLinecap="round" opacity="0.85" />
        </svg>
      </div>
      {showText && (
        <div className="leading-none">
          <div
            className="font-[var(--font-display)] font-bold tracking-tight"
            style={{ fontSize: size * 0.44, color: onLight ? '#0f1a2f' : 'var(--color-ivory)' }}
          >
            AK-LOGIC <span className="gold-text">AI</span>
          </div>
          <div className={`text-[10px] tracking-[0.3em] uppercase mt-1 ${onLight ? 'text-slate-400' : 'text-[var(--color-mist-2)]'}`}>GST Invoicing</div>
        </div>
      )}
    </div>
  );
}
