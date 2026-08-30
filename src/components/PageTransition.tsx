import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Lightweight page transition. A short opacity + small translate fade.
 * Intentionally minimal (no layout animations, no heavy springs) so it stays
 * smooth on low-end phones.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  // Honors the OS "reduce motion" setting: skip the translate/fade and swap
  // pages instantly instead of ignoring an explicit accessibility choice.
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
      style={{ willChange: 'opacity, transform' }}
    >
      {children}
    </motion.div>
  );
}
