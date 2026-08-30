import { useEffect, useState, type ReactNode } from 'react';
import { X, Download, Share, CheckCircle2 } from 'lucide-react';

interface InstallAppModalProps {
  open: boolean;
  onClose: () => void;
  appName?: string;
}

function detectPlatform() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  const isAndroid = /Android/i.test(ua);
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return { isIOS, isAndroid, isStandalone };
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="w-6 h-6 shrink-0 rounded-full grid place-items-center text-xs font-bold text-white"
        style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}
      >
        {n}
      </span>
      <p className="pt-0.5 leading-relaxed">{children}</p>
    </div>
  );
}

/**
 * Manual "how to install" fallback. The browser's native beforeinstallprompt
 * event is shared/global across the whole origin (see main.tsx) and can
 * only ever be consumed once — so on pages like the Admin panel it's very
 * often unavailable even though the app is perfectly installable. Rather
 * than leaving the admin with no way to install at all, this modal gives
 * explicit, platform-aware manual steps so installation is always possible.
 */
export default function InstallAppModal({ open, onClose, appName = 'AK-LOGIC AI Admin' }: InstallAppModalProps) {
  const [platform, setPlatform] = useState(detectPlatform());

  useEffect(() => {
    if (open) setPlatform(detectPlatform());
  }, [open]);

  if (!open) return null;

  const { isIOS, isAndroid, isStandalone } = platform;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="depth-card rounded-[24px] w-full max-w-md p-6 space-y-5"
        style={{ borderColor: 'rgba(124,108,245,0.25)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-10 h-10 rounded-xl grid place-items-center"
              style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}
            >
              <Download size={18} className="text-white" />
            </div>
            <div>
              <h3 className="font-[var(--font-display)] font-bold text-base">Install {appName}</h3>
              <p className="text-xs text-[var(--color-mist)]">Add this dashboard to your device</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 rounded-lg grid place-items-center depth-soft shrink-0">
            <X size={16} />
          </button>
        </div>

        {isStandalone ? (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-300">
            <CheckCircle2 size={16} /> This app is already installed on this device.
          </div>
        ) : isIOS ? (
          <div className="space-y-3 text-sm text-[var(--color-mist)]">
            <Step n={1}>
              Tap the <strong className="text-white">Share</strong> icon <Share size={13} className="inline -mt-0.5" /> in
              Safari's toolbar.
            </Step>
            <Step n={2}>
              Scroll down and tap <strong className="text-white">"Add to Home Screen"</strong>.
            </Step>
            <Step n={3}>
              Tap <strong className="text-white">Add</strong> in the top-right corner.
            </Step>
          </div>
        ) : isAndroid ? (
          <div className="space-y-3 text-sm text-[var(--color-mist)]">
            <Step n={1}>
              Tap the <strong className="text-white">⋮ menu</strong> in the top-right of your browser.
            </Step>
            <Step n={2}>
              Tap <strong className="text-white">"Add to Home screen"</strong> or <strong className="text-white">"Install app"</strong>.
            </Step>
            <Step n={3}>
              Confirm by tapping <strong className="text-white">Install</strong>.
            </Step>
          </div>
        ) : (
          <div className="space-y-3 text-sm text-[var(--color-mist)]">
            <Step n={1}>
              Look for the <strong className="text-white">install icon</strong> (⊕ or a small screen icon) in your browser's
              address bar.
            </Step>
            <Step n={2}>
              Or open the browser menu and choose <strong className="text-white">"Install {appName}"</strong>.
            </Step>
            <Step n={3}>Confirm the install prompt.</Step>
          </div>
        )}

        <p className="text-xs text-[var(--color-mist)] text-center">
          Once installed, this admin panel opens like a native app — full screen, no browser address bar.
        </p>
      </div>
    </div>
  );
}
