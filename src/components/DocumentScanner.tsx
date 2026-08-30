import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Check, X, Loader2, RotateCcw, PencilLine } from 'lucide-react';
import { apiRequest, ApiError, ApiUnavailableError } from '../lib/apiClient';

export type ScanDocumentType = 'gst' | 'bank';

/** Order fields should progressively reveal in — matches the approved
 * scan sequence. Only fields the backend actually returned are shown;
 * nothing here is ever faked/placeholder — see onComplete. */
const FIELD_ORDER: Record<ScanDocumentType, { key: string; label: string }[]> = {
  gst: [
    { key: 'gstin', label: 'GSTIN' },
    { key: 'legalName', label: 'Legal Name' },
    { key: 'tradeName', label: 'Trade Name' },
    { key: 'address', label: 'Registered Address' },
    { key: 'state', label: 'State' },
    { key: 'pan', label: 'PAN' },
  ],
  bank: [
    { key: 'bankName', label: 'Bank Name' },
    { key: 'accountHolderName', label: 'Account Holder Name' },
    { key: 'accountNumber', label: 'Account Number' },
    { key: 'ifsc', label: 'IFSC' },
    { key: 'accountType', label: 'Account Type' },
    { key: 'upiId', label: 'UPI ID' },
  ],
};

interface DocumentScannerProps {
  documentType: ScanDocumentType;
  /** OTP-verified phone from Step 0 — used only as the rate-limit key
   * server-side (no merchant record exists yet during registration). */
  phone: string;
  onComplete: (fields: Record<string, string>) => void;
  onClose: () => void;
}

type Phase = 'capture' | 'scanning' | 'error';

export default function DocumentScanner({ documentType, phone, onComplete, onClose }: DocumentScannerProps) {
  const [phase, setPhase] = useState<Phase>('capture');
  const [photo, setPhoto] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [errMsg, setErrMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const order = FIELD_ORDER[documentType];
  const docLabel = documentType === 'gst' ? 'GST Certificate' : 'Bank Passbook / Proof';

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setPhoto(dataUrl);
    setPhase('scanning');
    setRevealed({});
    runScan(dataUrl);
  }

  async function runScan(dataUrl: string) {
    try {
      const res = await apiRequest<{ ok: boolean; fields: Record<string, string> }>('/api/merchant/ocr-scan', {
        method: 'POST',
        body: { documentType, imageBase64: dataUrl, phone },
      });
      const fields = res.fields || {};
      // Reveal only the real, returned fields — one at a time, in the
      // approved order, each gated on the actual result already being
      // in hand (no timer-based fake reveal of placeholder data).
      for (const { key } of order) {
        if (fields[key]) {
          await new Promise((r) => setTimeout(r, 420));
          setRevealed((prev) => ({ ...prev, [key]: fields[key] }));
        }
      }
      await new Promise((r) => setTimeout(r, 300));
      onComplete(fields);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message :
        err instanceof ApiUnavailableError ? err.message :
        'Could not scan this document.';
      setErrMsg(message);
      setPhase('error');
    }
  }

  function retake() {
    setPhoto(null);
    setRevealed({});
    setErrMsg('');
    setPhase('capture');
    fileRef.current?.click();
  }

  return (
    <div className="fixed inset-0 z-50 bg-[var(--color-ink)]/95 backdrop-blur-sm grid place-items-center p-4">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      <div className="w-full max-w-md depth-card rounded-[28px] p-6 sm:p-8 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-full grid place-items-center text-[var(--color-mist)] hover:text-[var(--color-ivory)] hover:bg-white/5 transition"
          aria-label="Close scanner"
        >
          <X size={18} />
        </button>

        <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--color-ivory)] mb-1">
          Scan {docLabel}
        </h3>
        <p className="text-xs text-[var(--color-mist)] mb-6">
          {phase === 'capture' && 'Take one clear photo — we\'ll auto-fill the form below.'}
          {phase === 'scanning' && !photo && 'Preparing…'}
          {phase === 'error' && 'Something went wrong.'}
        </p>

        {phase === 'capture' && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-2xl border-2 border-dashed border-[var(--color-line)] hover:border-[var(--color-aqua)] transition py-10 grid place-items-center gap-3 text-[var(--color-mist)] hover:text-[var(--color-ivory)]"
          >
            <div className="w-14 h-14 rounded-xl grid place-items-center depth-raised" style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}>
              <Camera size={22} className="text-[var(--color-gold)]" />
            </div>
            <span className="text-sm font-medium">Take or Upload Photo</span>
          </button>
        )}

        {phase === 'scanning' && photo && (
          <div>
            <div className="relative rounded-2xl overflow-hidden border border-[var(--color-line)]">
              <img src={photo} alt="Captured document" className="w-full max-h-64 object-cover block" />
              {/* Real captured photo shown as the scan background — the
                  green line below is a visual effect only; the fields
                  that reveal underneath come from the actual API result. */}
              <motion.div
                className="absolute left-0 right-0 h-[2px]"
                style={{ background: 'var(--color-emerald)', boxShadow: '0 0 12px 2px var(--color-emerald)' }}
                initial={{ top: '0%' }}
                animate={{ top: ['0%', '100%', '0%'] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--color-ink)]/40" />
            </div>

            <div className="mt-5 space-y-2 min-h-[8px]">
              <AnimatePresence>
                {order
                  .filter(({ key }) => revealed[key])
                  .map(({ key, label }) => (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] border border-[var(--color-line)] px-3.5 py-2.5"
                    >
                      <span className="text-xs text-[var(--color-mist)]">{label}</span>
                      <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-ivory)] truncate max-w-[60%]">
                        <span className="truncate">{revealed[key]}</span>
                        <Check size={14} className="shrink-0" style={{ color: 'var(--color-emerald)' }} />
                      </span>
                    </motion.div>
                  ))}
              </AnimatePresence>
              {Object.keys(revealed).length < order.length && (
                <div className="flex items-center gap-2 text-xs text-[var(--color-mist-2)] px-1 pt-1">
                  <Loader2 size={13} className="animate-spin" /> Scanning…
                </div>
              )}
              {Object.keys(revealed).length === order.length && Object.keys(revealed).length > 0 && (
                <div className="flex items-center gap-2 text-xs font-medium pt-1 px-1" style={{ color: 'var(--color-emerald)' }}>
                  <Check size={14} /> Document Scan Complete
                </div>
              )}
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-rose)] bg-[var(--color-rose)]/10 border border-[var(--color-rose)]/25 rounded-xl px-4 py-3">
              {errMsg}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={retake}
                className="flex items-center justify-center gap-2 rounded-xl border border-[var(--color-line)] text-[var(--color-mist)] hover:text-[var(--color-ivory)] hover:border-[var(--color-mist)] py-2.5 text-sm transition"
              >
                <RotateCcw size={14} /> Retry
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex items-center justify-center gap-2 rounded-xl bg-[var(--color-aqua)] text-white hover:bg-[var(--color-aqua-deep)] py-2.5 text-sm font-medium transition"
              >
                <PencilLine size={14} /> Enter Manually
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
