import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, X, Sparkles, Scale, ShieldCheck } from 'lucide-react';
import type { Merchant } from '../../lib/types';
import { AUDIT_STEPS, runDeterministicAudit } from '../../lib/akaiAuditEngine';
import type { AkaiAuditReport } from '../../lib/akaiAuditStorage';

interface AkaiAuditOverlayProps {
  active: boolean;
  merchant: Merchant;
  onComplete: (report: AkaiAuditReport) => void;
  onCancel: () => void;
}

export default function AkaiAuditOverlay({ active, merchant, onComplete, onCancel }: AkaiAuditOverlayProps) {
  const nav = useNavigate();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [verifiedSteps, setVerifiedSteps] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState('Starting AKAI Real-Time Audit...');

  // Use refs for callbacks and merchant to prevent route-change re-renders from restarting the audit loop!
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const merchantRef = useRef(merchant);
  merchantRef.current = merchant;
  const navRef = useRef(nav);
  navRef.current = nav;

  useEffect(() => {
    if (!active) {
      setCurrentStepIndex(0);
      setVerifiedSteps([]);
      return;
    }

    let isCancelled = false;

    async function runOrchestratedAudit() {
      // 1. Prefetch calculation in background
      const auditPromise = runDeterministicAudit(merchantRef.current).catch((e) => {
        console.error('Audit calculation error:', e);
        return null;
      });

      // 2. Step-by-step clear visual navigation across all 6 real modules (2.5s per step)
      for (let i = 0; i < AUDIT_STEPS.length; i++) {
        if (isCancelled) return;

        const step = AUDIT_STEPS[i];
        setCurrentStepIndex(i);
        setStatusMessage(step.actionDescription);

        // Visually navigate to the real page route
        try {
          navRef.current(step.route);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch {
          // ignore
        }

        // Dwell time so the page visibly loads and user sees real tables & scan
        await new Promise((resolve) => setTimeout(resolve, 2500));

        if (isCancelled) return;
        setVerifiedSteps((prev) => Array.from(new Set([...prev, step.id])));
      }

      setStatusMessage('🟢 All Modules Verified! Compiling final business audit report...');
      await new Promise((resolve) => setTimeout(resolve, 600));

      if (isCancelled) return;

      const report = await auditPromise;
      if (report && !isCancelled) {
        onCompleteRef.current(report);
      } else if (!isCancelled) {
        const fallback = await runDeterministicAudit(merchantRef.current);
        onCompleteRef.current(fallback);
      }
    }

    runOrchestratedAudit();

    return () => {
      isCancelled = true;
    };
  }, [active]); // CRITICAL: depend ONLY on `active` so route changes do NOT reset the loop!

  if (!active) return null;

  const currentStep = AUDIT_STEPS[currentStepIndex] || AUDIT_STEPS[0];
  const progressPercent = Math.round(((verifiedSteps.length) / AUDIT_STEPS.length) * 100);

  const jumpToStep = (index: number) => {
    setCurrentStepIndex(index);
    const step = AUDIT_STEPS[index];
    if (step) {
      setStatusMessage(step.actionDescription);
      navRef.current(step.route);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <AnimatePresence>
      {/* 
        CRITICAL: ZERO BACKGROUND BLUR / ZERO DARK OVERLAY.
        100% sharp view of the real page with hardware-accelerated laser sweep.
      */}
      <div className="fixed inset-0 z-40 pointer-events-none overflow-hidden select-none">
        {/* Fullscreen Cyber HUD Border Glow */}
        <div className="absolute inset-0 akai-scan-border-glow rounded-none" />

        {/* High-Precision 60FPS GPU Laser Sweep Line */}
        <div className="akai-laser-line" />

        {/* 4 Glowing Green Corner Brackets */}
        <div className="akai-hud-corner tl" />
        <div className="akai-hud-corner tr" />
        <div className="akai-hud-corner bl" />
        <div className="akai-hud-corner br" />

        {/* Sleek Floating Top HUD Capsule */}
        <div className="absolute top-2 sm:top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto max-w-[96vw] w-auto">
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="flex flex-col gap-1.5 p-2.5 sm:p-3.5 rounded-2xl bg-[#091326]/95 border border-emerald-500/80 shadow-2xl shadow-emerald-500/40 backdrop-blur-sm"
          >
            <div className="flex items-center gap-2.5 sm:gap-3">
              {/* Robot Badge */}
              <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 grid place-items-center text-base sm:text-lg shadow-md shadow-emerald-500/30 shrink-0">
                🤖
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              </div>

              {/* Step Status Text */}
              <div className="min-w-0 pr-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-xs sm:text-sm font-bold text-white tracking-wide">
                    AKAI Auditing: <span className="text-emerald-400 font-extrabold underline">{currentStep.name}</span>
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    Step {currentStepIndex + 1}/{AUDIT_STEPS.length}
                  </span>
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-300 truncate max-w-[240px] sm:max-w-md mt-0.5 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span>{statusMessage}</span>
                </div>
              </div>

              {/* Cancel Button */}
              <button
                onClick={onCancel}
                className="ml-auto w-7 h-7 rounded-xl grid place-items-center bg-white/10 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/10 transition shrink-0"
                title="Stop Audit"
              >
                <X size={15} />
              </button>
            </div>

            {/* Clickable Step Pills */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-1 border-t border-emerald-500/20">
              {AUDIT_STEPS.map((s, idx) => {
                const isCurrent = idx === currentStepIndex;
                const isDone = verifiedSteps.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => jumpToStep(idx)}
                    className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase transition shrink-0 flex items-center gap-1 ${
                      isCurrent
                        ? 'bg-emerald-400 text-slate-950 shadow-sm'
                        : isDone
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    {isDone && <CheckCircle2 size={9} className="text-emerald-400" />}
                    <span>{s.name.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Progress Indicator */}
          <div className="w-full h-1 bg-slate-800/90 rounded-full mt-1 overflow-hidden border border-emerald-500/40">
            <motion.div
              className="h-full bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400"
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      </div>
    </AnimatePresence>
  );
}
