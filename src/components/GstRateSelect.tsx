import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

const GST_RATES = [0, 5, 12, 18, 28];

interface GstRateSelectProps {
  value: number;
  onChange: (rate: number) => void;
  className?: string;
}

export default function GstRateSelect({ value, onChange, className = '' }: GstRateSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-0.5 rounded-lg bg-[#0c1322] border border-[var(--color-line)] hover:border-[var(--color-aqua)] focus:border-[var(--color-aqua)] px-2 py-2 text-xs font-medium text-[var(--color-ivory)] outline-none transition-all duration-150 cursor-pointer"
        title="Select GST Rate"
      >
        <span className="font-mono text-xs font-semibold">{value}%</span>
        <ChevronDown size={12} className={`text-[var(--color-mist)] transition-transform duration-200 shrink-0 ${open ? 'rotate-180 text-[var(--color-aqua)]' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[95px] rounded-xl bg-[#0c1322] border border-[var(--color-line)] shadow-[0_10px_30px_rgba(0,0,0,0.8)] p-1.5 space-y-1">
          {GST_RATES.map((r) => {
            const isSelected = r === value;
            return (
              <button
                key={r}
                type="button"
                onClick={() => {
                  onChange(r);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                  isSelected
                    ? 'bg-[var(--color-aqua)]/15 text-[var(--color-aqua)] font-bold'
                    : 'text-[var(--color-mist)] hover:text-[var(--color-ivory)] hover:bg-white/5'
                }`}
              >
                <span>{r}%</span>
                {isSelected && <Check size={12} className="text-[var(--color-aqua)] shrink-0 ml-1" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
