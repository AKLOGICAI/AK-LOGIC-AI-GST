import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-[var(--color-mist)] mt-1 text-sm">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = '', soft = false }: { children: ReactNode; className?: string; soft?: boolean }) {
  return <div className={`${soft ? 'depth-soft' : 'depth-card'} rounded-2xl ${className}`}>{children}</div>;
}

export function StatPill({ label, value, color = 'var(--color-aqua)' }: { label: string; value: string; color?: string }) {
  return (
    <div className="depth-soft rounded-xl px-4 py-3 text-center">
      <div className="text-[11px] text-[var(--color-mist-2)] uppercase tracking-wider">{label}</div>
      <div className="font-[var(--font-display)] text-lg font-bold mt-0.5" style={{ color }}>{value}</div>
    </div>
  );
}

export function Badge({ children, tone = 'mist' }: { children: ReactNode; tone?: 'gold' | 'aqua' | 'emerald' | 'amber' | 'rose' | 'violet' | 'mist' }) {
  const map: Record<string, string> = {
    gold: 'bg-[rgba(233,196,106,0.14)] text-[var(--color-gold)]',
    aqua: 'bg-[rgba(56,224,200,0.14)] text-[var(--color-aqua)]',
    emerald: 'bg-[rgba(47,208,122,0.14)] text-[var(--color-emerald)]',
    amber: 'bg-[rgba(255,180,84,0.14)] text-[var(--color-amber)]',
    rose: 'bg-[rgba(255,107,136,0.14)] text-[var(--color-rose)]',
    violet: 'bg-[rgba(124,108,245,0.14)] text-[var(--color-violet)]',
    mist: 'bg-[rgba(138,153,184,0.12)] text-[var(--color-mist)]',
  };
  return <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${map[tone]}`}>{children}</span>;
}

/** Small inline spinner used by button loading states. Sized via font-size/em so it drops into any button without layout shift. */
function Spinner() {
  return (
    <svg className="animate-spin h-[1em] w-[1em]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function GoldButton({ children, onClick, className = '', disabled, aqua = false, loading = false }: { children: ReactNode; onClick?: () => void; className?: string; disabled?: boolean; aqua?: boolean; loading?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`flex items-center justify-center gap-2 px-5 py-3 rounded-2xl font-semibold text-[var(--color-ink)] depth-raised disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-[0.98] ${className}`}
      style={{ background: aqua ? 'linear-gradient(135deg,#6ff2dc,#38e0c8)' : 'linear-gradient(135deg,#f6dd9b,#e9c46a)' }}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, className = '', disabled, loading = false }: { children: ReactNode; onClick?: () => void; className?: string; disabled?: boolean; loading?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`flex items-center justify-center gap-2 px-5 py-3 rounded-2xl font-medium border border-[var(--color-line)] hover:border-[var(--color-aqua)] disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-[0.98] ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="depth-card rounded-2xl p-16 text-center">
      <div className="w-16 h-16 rounded-2xl grid place-items-center mx-auto depth-soft mb-4 text-[var(--color-mist-2)]">{icon}</div>
      <h3 className="font-[var(--font-display)] font-semibold text-lg">{title}</h3>
      <p className="text-sm text-[var(--color-mist)] mt-1 max-w-sm mx-auto">{body}</p>
    </div>
  );
}

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
