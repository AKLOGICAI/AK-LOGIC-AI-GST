import { useState, useRef, useEffect } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n, LANGUAGES, type Lang } from '../lib/i18n';

interface Props {
  /** 'compact' = icon + chevron (for headers), 'full' = labelled pill */
  variant?: 'compact' | 'full';
  align?: 'left' | 'right';
}

export default function LanguageSelector({ variant = 'compact', align = 'right' }: Props) {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((l) => l.code === lang)!;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const pick = (code: Lang) => { setLang(code); setOpen(false); };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Select language"
        className={
          variant === 'compact'
            ? 'flex items-center gap-1.5 h-10 px-3 rounded-xl depth-soft text-sm text-[var(--color-mist)] hover:text-[var(--color-ivory)] transition'
            : 'flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--color-line)] hover:border-[var(--color-aqua)] transition text-sm font-medium'
        }
      >
        <Globe size={16} />
        <span className={variant === 'compact' ? 'hidden sm:inline' : ''}>{current.native}</span>
        <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-2 w-44 z-50 depth-card rounded-2xl overflow-hidden`}
          >
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => pick(l.code)}
                className={`w-full flex items-center justify-between px-4 py-3 text-sm transition hover:bg-[rgba(255,255,255,0.04)] ${l.code === lang ? 'text-[var(--color-aqua)]' : 'text-[var(--color-ivory)]'}`}
              >
                <span>{l.native} <span className="text-[var(--color-mist-2)] text-xs">· {l.label}</span></span>
                {l.code === lang && <Check size={15} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
