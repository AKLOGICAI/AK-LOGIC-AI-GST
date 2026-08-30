import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Share2, Check, Building2, FileImage, FileCode } from 'lucide-react';
import type { Merchant } from '../../lib/types';
import QRCode, { qrToPngDataUrl, qrToSvgString } from '../../components/QRCode';
import BrandMark from '../../components/BrandMark';

export default function QRPage({ merchant }: { merchant: Merchant }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const payUrl = `${window.location.origin}/pay/${merchant.qrId}`;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Download a high-res PNG (best for mobile/printing). The permanent
  // Merchant ID is baked into the image itself (below the QR) so anyone
  // who saves/prints/forwards this file still sees it, not just the
  // on-screen card.
  const downloadPng = async () => {
    const dataUrl = await qrToPngDataUrl(payUrl, 1024, undefined, undefined, merchant.merchantCode);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${merchant.qrId}.png`;
    a.click();
  };

  // Download a vector SVG (real QR paths — opens correctly anywhere).
  const downloadSvg = async () => {
    const svg = await qrToSvgString(payUrl, undefined, undefined, merchant.merchantCode);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${merchant.qrId}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const share = async () => {
    const text = `Scan to bill ${merchant.tradeName || merchant.shopName} on AK-LOGIC AI:\n${payUrl}`;
    if (navigator.share) {
      try { await navigator.share({ title: merchant.shopName, text, url: payUrl }); return; } catch { /* cancelled */ }
    }
    copy(payUrl);
  };

  return (
    <div className="space-y-5 sm:space-y-6 w-full max-w-full min-w-0 pb-10 sm:pb-0">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl sm:text-3xl font-bold">My QR Code</h1>
        <p className="text-xs sm:text-sm text-[var(--color-mist)] mt-1">Show this QR to customers — they scan it to send you an invoice request. No app needed.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 sm:gap-6 w-full min-w-0">
        {/* QR Code Card - Centered on Mobile */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="depth-card rounded-[28px] p-4 sm:p-8 w-full flex flex-col items-center justify-center min-w-0"
        >
          <div ref={cardRef} className="relative w-full max-w-[280px] sm:max-w-xs mx-auto flex flex-col items-center justify-center">
            {/* Glow effect contained inside card boundaries */}
            <div className="absolute inset-0 rounded-[28px] blur-xl opacity-25" style={{ background: 'conic-gradient(from 90deg, #e9c46a, #38e0c8, #7c6cf5, #e9c46a)' }} />
            <div className="relative depth-raised rounded-[24px] p-4 sm:p-6 w-full flex flex-col items-center text-center" style={{ background: 'linear-gradient(160deg,#16203a,#0c1322)' }}>
              <div className="flex items-center justify-center mb-3">
                <BrandMark merchant={merchant} size={28} />
              </div>

              {/* QR Image Container - Centered */}
              <div className="p-3 sm:p-4 rounded-2xl bg-white flex items-center justify-center shadow-md max-w-full">
                <QRCode value={payUrl} size={180} />
              </div>

              <div className="text-center mt-3.5 w-full min-w-0">
                <div className="font-semibold text-sm sm:text-base truncate px-1">{merchant.tradeName || merchant.shopName}</div>
                <div className="text-[11px] text-[var(--color-mist-2)] truncate px-1">GSTIN: {merchant.gstin}</div>
                <div className="font-mono text-xs sm:text-sm text-[var(--color-gold)] mt-1 tracking-wider truncate px-1">{merchant.qrId}</div>
                {merchant.merchantCode && (
                  <div className="mt-2 pt-2 border-t border-[var(--color-line)] w-full">
                    <div className="text-[10px] text-[var(--color-mist-2)] uppercase tracking-wider">Merchant ID</div>
                    <div className="font-mono text-xs sm:text-sm text-[var(--color-aqua)] tracking-wider truncate">{merchant.merchantCode}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Details & Actions Column */}
        <div className="space-y-4 w-full min-w-0">
          <div className="depth-card rounded-2xl p-4 sm:p-6 w-full min-w-0">
            <h3 className="font-[var(--font-display)] font-semibold mb-3 text-sm sm:text-base">QR Details</h3>
            <div className="space-y-2.5">
              {merchant.merchantCode && (
                <div className="flex items-center justify-between gap-2 depth-soft rounded-xl px-3.5 py-2.5 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-[var(--color-mist-2)] uppercase tracking-wider">Merchant ID</div>
                    <div className="font-mono text-xs sm:text-sm text-[var(--color-aqua)] truncate">{merchant.merchantCode}</div>
                  </div>
                  <button onClick={() => copy(merchant.merchantCode!)} className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs depth-raised font-medium">
                    {copied ? <Check size={14} className="text-[var(--color-emerald)]" /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 depth-soft rounded-xl px-3.5 py-2.5 min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] text-[var(--color-mist-2)] uppercase tracking-wider">QR ID</div>
                  <div className="font-mono text-xs sm:text-sm text-[var(--color-gold)] truncate">{merchant.qrId}</div>
                </div>
                <button onClick={() => copy(merchant.qrId)} className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs depth-raised font-medium">
                  {copied ? <Check size={14} className="text-[var(--color-emerald)]" /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 depth-soft rounded-xl px-3.5 py-2.5 min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] text-[var(--color-mist-2)] uppercase tracking-wider">Pay Link</div>
                  <div className="text-xs sm:text-sm text-[var(--color-aqua)] truncate">{payUrl}</div>
                </div>
                <button onClick={() => copy(payUrl)} className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs depth-raised">
                  <Copy size={14} />
                </button>
              </div>
            </div>
          </div>

          <div className="depth-card rounded-2xl p-4 sm:p-6 w-full min-w-0">
            <h3 className="font-[var(--font-display)] font-semibold mb-3 text-sm sm:text-base flex items-center gap-2">
              <Building2 size={16} className="text-[var(--color-gold)] shrink-0" /> Linked GST Record
            </h3>
            <div className="space-y-2 text-xs sm:text-sm">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-[var(--color-mist-2)] shrink-0">Trade Name</span>
                <span className="font-medium truncate text-right">{merchant.tradeName || merchant.shopName}</span>
              </div>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-[var(--color-mist-2)] shrink-0">Legal Name</span>
                <span className="font-medium truncate text-right">{merchant.legalName || merchant.ownerName}</span>
              </div>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-[var(--color-mist-2)] shrink-0">GSTIN</span>
                <span className="font-mono text-right">{merchant.gstin}</span>
              </div>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-[var(--color-mist-2)] shrink-0">State</span>
                <span className="font-medium truncate text-right">{merchant.state}{merchant.pincode ? ` - ${merchant.pincode}` : ''}</span>
              </div>
            </div>
          </div>

          <div className="depth-card rounded-2xl p-4 sm:p-6 w-full min-w-0">
            <h3 className="font-[var(--font-display)] font-semibold mb-3 text-sm sm:text-base">Actions</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <button onClick={downloadPng} className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs sm:text-sm font-medium text-[var(--color-ink)] depth-raised" style={{ background: 'linear-gradient(135deg,#f6dd9b,#e9c46a)' }}>
                <FileImage size={15} className="shrink-0" /> Download PNG
              </button>
              <button onClick={downloadSvg} className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs sm:text-sm font-medium border border-[var(--color-line)] hover:border-[var(--color-aqua)] transition">
                <FileCode size={15} className="shrink-0" /> Download SVG
              </button>
            </div>
            <button onClick={share} className="mt-2.5 w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-medium border border-[var(--color-line)] hover:border-[var(--color-aqua)] transition">
              <Share2 size={15} className="shrink-0" /> Share Pay Link
            </button>
            <p className="text-[11px] text-[var(--color-mist-2)] mt-3 leading-relaxed">
              PNG is best for printing & WhatsApp. Scanning the QR opens the customer billing form for your shop automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
