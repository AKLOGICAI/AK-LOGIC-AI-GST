import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';

export default function UpdateBanner() {
  const [updateWorker, setUpdateWorker] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const worker = (e as CustomEvent<{ waitingWorker: ServiceWorker }>).detail?.waitingWorker;
      if (worker) {
        setUpdateWorker(worker);
        setDismissed(false);
      }
    };

    window.addEventListener('sw:update', handleUpdate);
    return () => window.removeEventListener('sw:update', handleUpdate);
  }, []);

  if (!updateWorker || dismissed) return null;

  const handleRefresh = () => {
    // Check if user is currently filling an input or form
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      const confirmed = window.confirm(
        'Aapka form/input filhal active hai. Reload karne par unsaved changes wipe ho sakte hain. Kya aap sure hain ki reload karna hai?'
      );
      if (!confirmed) return;
    }

    try {
      updateWorker.postMessage({ type: 'SKIP_WAITING' });
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  return (
    <div
      role="status"
      className="fixed bottom-5 right-5 z-[9999] max-w-md w-[calc(100vw-2.5rem)] rounded-2xl p-4 depth-raised border border-[#2563EB] flex items-center justify-between gap-3 shadow-2xl animate-slide-up-fade"
      style={{ background: 'linear-gradient(135deg, #1E3A5F, #0b1329)', color: 'var(--color-ivory)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl grid place-items-center bg-[rgba(37,99,235,0.14)] text-[#2563EB] shrink-0">
          <Sparkles size={20} />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-xs sm:text-sm text-[var(--color-ivory)] font-[var(--font-display)]">Naya Version Available Hai</div>
          <div className="text-[11px] text-[var(--color-mist)] truncate">App update ho chuka hai. Refresh karke naye features try karein.</div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white depth-raised transition-all duration-150 hover:-translate-y-0.5 shadow-md active:translate-y-0"
          style={{ background: 'linear-gradient(135deg,#1E3A5F,#2563EB)' }}
        >
          <RefreshCw size={13} /> Refresh Now
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1.5 rounded-lg text-[var(--color-mist-2)] hover:text-[var(--color-ivory)] transition"
          aria-label="Close notification"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
