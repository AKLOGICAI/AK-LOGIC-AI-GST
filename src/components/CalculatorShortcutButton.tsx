import { useState, useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';

export function CalculatorIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 filter drop-shadow-sm select-none"
    >
      {/* Outer Calculator Casing */}
      <rect x="3" y="2" width="18" height="20" rx="4" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="0.75" />
      <rect x="3.5" y="2.5" width="17" height="19" rx="3.5" fill="url(#calc-body-grad)" />

      {/* LCD Screen Display */}
      <rect x="5" y="4" width="14" height="5" rx="1.5" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="0.5" />
      <text x="17" y="7.8" fontSize="3.8" fontFamily="monospace" fontWeight="bold" fill="#0F172A" textAnchor="end">123</text>

      {/* Button 1: Top-Left (+) Purple */}
      <rect x="5" y="10.25" width="6.25" height="4.25" rx="1.2" fill="#8B5CF6" />
      <path d="M8.125 11.35v2.05M7.1 12.375h2.05" stroke="#FFFFFF" strokeWidth="0.9" strokeLinecap="round" />

      {/* Button 2: Top-Right (-) Blue */}
      <rect x="12.75" y="10.25" width="6.25" height="4.25" rx="1.2" fill="#3B82F6" />
      <path d="M14.85 12.375h2.05" stroke="#FFFFFF" strokeWidth="0.9" strokeLinecap="round" />

      {/* Button 3: Bottom-Left (×) Dark Slate */}
      <rect x="5" y="15.5" width="6.25" height="4.25" rx="1.2" fill="#334155" />
      <path d="M7.3 16.85l1.65 1.55M8.95 16.85l-1.65 1.55" stroke="#FFFFFF" strokeWidth="0.85" strokeLinecap="round" />

      {/* Button 4: Bottom-Right (=) Orange */}
      <rect x="12.75" y="15.5" width="6.25" height="4.25" rx="1.2" fill="#F97316" />
      <path d="M14.85 17h2.05M14.85 18.25h2.05" stroke="#FFFFFF" strokeWidth="0.85" strokeLinecap="round" />

      <defs>
        <linearGradient id="calc-body-grad" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E2E8F0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

interface CalculatorShortcutButtonProps {
  onClick: () => void;
  showTooltipOnce?: boolean;
}

export function CalculatorShortcutButton({ onClick, showTooltipOnce = true }: CalculatorShortcutButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (!showTooltipOnce) return;
    try {
      const dismissed = localStorage.getItem('quick_calc_tooltip_dismissed');
      if (!dismissed) {
        setShowTooltip(true);
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, [showTooltipOnce]);

  const dismissTooltip = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setShowTooltip(false);
    try {
      localStorage.setItem('quick_calc_tooltip_dismissed', 'true');
    } catch {
      // Ignore storage errors
    }
  };

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={onClick}
        title="Quick Calculator"
        aria-label="Quick Calculator"
        className="relative group grid place-items-center w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-xl bg-[#0F172A] border border-[#007AFF]/40 hover:border-[#007AFF] shadow-[0_0_10px_rgba(0,122,255,0.2)] hover:shadow-[0_0_16px_rgba(0,122,255,0.5)] active:scale-95 hover:scale-105 transition-all duration-150 cursor-pointer overflow-visible"
      >
        <CalculatorIcon size={20} />

        {/* Little spark rays on hover */}
        <span className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none text-amber-300">
          <Sparkles size={10} />
        </span>
      </button>

      {/* First-Time Onboarding Tooltip Popover */}
      {showTooltip && (
        <div className="absolute right-0 top-full mt-2.5 z-40 w-64 p-3.5 rounded-2xl bg-[#0C1322] border border-[#007AFF]/50 shadow-[0_10px_25px_-5px_rgba(0,122,255,0.3),0_8px_10px_-6px_rgba(0,0,0,0.5)] text-left animate-fadeIn">
          {/* Arrow */}
          <div className="absolute -top-1.5 right-3 w-3 h-3 bg-[#0C1322] border-t border-l border-[#007AFF]/50 rotate-45" />

          <div className="flex items-start justify-between gap-2 relative z-10">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-[#0F172A] border border-[#007AFF]/30 grid place-items-center shrink-0">
                <CalculatorIcon size={14} />
              </div>
              <h4 className="text-xs font-bold text-white tracking-tight">Quick Calculator</h4>
            </div>
            <button
              type="button"
              onClick={dismissTooltip}
              className="text-slate-400 hover:text-white p-0.5 rounded-md hover:bg-white/10 transition"
              title="Close"
            >
              <X size={13} />
            </button>
          </div>

          <p className="text-[11px] text-slate-300 mt-1.5 leading-snug relative z-10">
            Calculate amount instantly without leaving the billing screen.
          </p>

          <button
            type="button"
            onClick={dismissTooltip}
            className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg bg-[#007AFF]/15 hover:bg-[#007AFF]/25 border border-[#007AFF]/30 text-[11px] font-semibold text-[#60A5FA] transition cursor-pointer relative z-10"
          >
            <Sparkles size={11} /> This tip will not show again
          </button>
        </div>
      )}
    </div>
  );
}
