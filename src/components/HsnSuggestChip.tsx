import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, Check } from 'lucide-react';
import { suggestHsn, confidenceLabel } from '../lib/hsnAi';

interface Props {
  itemName: string;
  currentHsn: string;
  currentGstRate: number;
  merchantId?: string;
  /** Apply the suggested values — merchant action only, never automatic. */
  onApply: (hsn: string, gstRate: number) => void;
}

/**
 * AI HSN/SAC suggestion chip shown under an item's fields in the review modal.
 * It only suggests — the merchant must click "Apply" to accept. It never
 * locks or overrides any value automatically.
 */
export default function HsnSuggestChip({ itemName, currentHsn, currentGstRate, merchantId, onApply }: Props) {
  const suggestion = useMemo(() => suggestHsn(itemName, merchantId), [itemName, merchantId]);

  if (!suggestion) return null;

  const alreadyMatches = currentHsn.trim() === suggestion.hsn && currentGstRate === suggestion.gstRate;
  const conf = confidenceLabel(suggestion.confidence);
  const confColor = conf === 'High' ? 'var(--color-emerald)' : conf === 'Medium' ? 'var(--color-amber)' : 'var(--color-mist)';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="col-span-12 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs"
        style={{ background: 'rgba(124,108,245,0.08)', border: '1px solid rgba(124,108,245,0.18)' }}
      >
        <span className="flex items-center gap-1.5 font-medium text-[var(--color-violet)]">
          <Sparkles size={13} /> AI Suggestion
        </span>
        <span className="text-[var(--color-mist)]">
          HSN/SAC <strong className="text-[var(--color-ivory)] font-mono">{suggestion.hsn}</strong>
          {' · '}GST <strong className="text-[var(--color-ivory)]">{suggestion.gstRate}%</strong>
        </span>
        <span className="text-[var(--color-mist-2)] hidden sm:inline">· {suggestion.label}</span>
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', color: confColor }}>
          {conf} confidence
        </span>
        {alreadyMatches ? (
          <span className="ml-auto flex items-center gap-1 text-[var(--color-emerald)] font-medium">
            <Check size={13} /> Applied
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onApply(suggestion.hsn, suggestion.gstRate)}
            className="ml-auto px-3 py-1 rounded-lg font-semibold text-[var(--color-ink)] transition active:scale-95"
            style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}
          >
            Apply
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
