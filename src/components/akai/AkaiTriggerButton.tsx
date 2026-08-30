import React from 'react';
import { Sparkles } from 'lucide-react';

interface AkaiTriggerButtonProps {
  onClick: () => void;
  variant?: 'header' | 'banner' | 'card' | 'sidebar';
  className?: string;
}

export default function AkaiTriggerButton({ onClick, variant = 'header', className = '' }: AkaiTriggerButtonProps) {
  if (variant === 'sidebar') {
    return (
      <button
        onClick={onClick}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-950 bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 hover:from-emerald-300 hover:to-teal-200 transition shadow-md shadow-emerald-500/20 active:scale-95 ${className}`}
        title="Start Live AKAI Business Controller Audit"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-base">🤖</span>
          <span>AKAI Live Audit</span>
        </div>
        <span className="w-2 h-2 rounded-full bg-emerald-800 animate-ping" />
      </button>
    );
  }

  if (variant === 'header') {
    return (
      <button
        onClick={onClick}
        className={`relative flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 hover:from-emerald-300 hover:to-teal-200 transition shadow-lg shadow-emerald-500/25 active:scale-95 shrink-0 ${className}`}
        title="Start Live AKAI Business Controller Audit"
      >
        <span className="text-sm">🤖</span>
        <span className="hidden sm:inline">AKAI Audit</span>
        <span className="w-2 h-2 rounded-full bg-emerald-700 animate-ping" />
      </button>
    );
  }

  if (variant === 'banner') {
    return (
      <div className={`p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#0a1829] via-[#091f2c] to-[#07191f] border border-emerald-500/40 shadow-xl relative overflow-hidden flex items-center justify-between gap-4 flex-wrap ${className}`}>
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 grid place-items-center text-2xl shadow-lg shadow-emerald-500/20 shrink-0">
            🤖
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white text-sm sm:text-base font-[var(--font-display)]">
                AKAI Business AI Controller
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                LIVE PRODUCTION AUDIT
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Scan, verify &amp; audit all invoices, billing requests, warehouse stocks, and double-entry books.
            </p>
          </div>
        </div>

        <button
          onClick={onClick}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 transition shadow-lg shadow-emerald-500/30 active:scale-95 shrink-0"
        >
          <Sparkles size={16} /> Run Full Live Audit
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 transition shadow-lg shadow-emerald-500/20 active:scale-95 ${className}`}
    >
      <span>🤖</span> Run AKAI Audit
    </button>
  );
}
