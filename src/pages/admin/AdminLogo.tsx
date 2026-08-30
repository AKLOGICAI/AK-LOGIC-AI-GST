import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ImagePlus, Trash2, Check, Info, Store, FileText, QrCode, Sparkles, RotateCcw } from 'lucide-react';
import { platformService, usePlatformSettings } from '../../lib/platform';
import { useMerchants } from '../../lib/store';
import { credits } from '../../lib/services';
import { PageHeader, Badge } from '../../components/ui';
import { AK_SVG_MARK } from '../../lib/branding';

export default function AdminLogo() {
  const settings = usePlatformSettings();
  const merchants = useMerchants();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);
  const [brandName, setBrandName] = useState(settings.brandName);
  const [tagline, setTagline] = useState(settings.tagline);

  // who is affected by the default logo: free + <30-day merchants
  const freeMerchants = merchants.filter((m) => !(credits.brandingEnabled(m) && !!m.logoDataUrl));
  const customMerchants = merchants.filter((m) => credits.brandingEnabled(m) && !!m.logoDataUrl);

  const onPick = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      platformService.setDefaultLogo(reader.result as string);
      flash();
    };
    reader.readAsDataURL(file);
  };

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1800); };
  const saveText = () => { platformService.update({ brandName: brandName.trim() || 'AK-LOGIC AI', tagline: tagline.trim() || 'GST Invoicing' }); flash(); };

  return (
    <div>
      <PageHeader
        title="Logo Management"
        subtitle="Set the default AK-LOGIC AI logo used for all free & short-duration (<30 day) merchants."
      />

      {saved && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 flex items-center gap-2 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(47,208,122,0.12)', color: 'var(--color-emerald)' }}>
          <Check size={16} /> Saved — changes are live across all free merchant dashboards, QR pages and invoice PDFs.
        </motion.div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        {/* uploader */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-2 depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold flex items-center gap-2 mb-4"><ImagePlus size={18} className="text-[var(--color-violet)]" /> Default Platform Logo</h3>

          <div className="flex flex-col sm:flex-row gap-6 items-center">
            <div className="w-40 h-40 rounded-2xl grid place-items-center shrink-0 overflow-hidden" style={{ background: settings.defaultLogoDataUrl ? '#fff' : 'linear-gradient(150deg,#1b2942,#0c1322)' }}>
              {settings.defaultLogoDataUrl ? (
                <img src={settings.defaultLogoDataUrl} alt="Default logo" className="w-full h-full object-contain p-3" />
              ) : (
                <div className="grid place-items-center" dangerouslySetInnerHTML={{ __html: AK_SVG_MARK.replace('width="40" height="40"', 'width="92" height="92"') }} />
              )}
            </div>

            <div className="flex-1 w-full">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
              <button onClick={() => fileRef.current?.click()} className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-white" style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}>
                <ImagePlus size={17} /> {settings.defaultLogoDataUrl ? 'Replace Logo' : 'Upload Logo'}
              </button>
              <div className="flex gap-2 mt-2">
                {settings.defaultLogoDataUrl && (
                  <button onClick={() => { platformService.setDefaultLogo(undefined); flash(); }} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm border border-[var(--color-line)] text-[var(--color-rose)] hover:bg-[rgba(255,107,136,0.08)]">
                    <Trash2 size={15} /> Remove
                  </button>
                )}
                <button onClick={() => { platformService.reset(); setBrandName('AK-LOGIC AI'); setTagline('GST Invoicing'); flash(); }} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm border border-[var(--color-line)] text-[var(--color-mist)] hover:text-[var(--color-ivory)]">
                  <RotateCcw size={15} /> Reset to Built-in
                </button>
              </div>
              <p className="text-[11px] text-[var(--color-mist-2)] mt-3">PNG, JPG, SVG or WebP. Transparent PNG recommended. Square images look best.</p>
            </div>
          </div>

          {/* brand text */}
          <div className="grid sm:grid-cols-2 gap-4 mt-6 pt-6 border-t border-[var(--color-line)]">
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-[var(--color-mist-2)]">Brand Name</span>
              <input value={brandName} onChange={(e) => setBrandName(e.target.value)} className="mt-1.5 w-full px-4 py-2.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-violet)]" placeholder="AK-LOGIC AI" />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-[var(--color-mist-2)]">Tagline</span>
              <input value={tagline} onChange={(e) => setTagline(e.target.value)} className="mt-1.5 w-full px-4 py-2.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm outline-none focus:border-[var(--color-violet)]" placeholder="GST Invoicing" />
            </label>
          </div>
          <button onClick={saveText} className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}>
            <Check size={16} /> Save Brand Text
          </button>
        </motion.div>

        {/* applies-to + preview */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="space-y-5">
          <div className="depth-card rounded-2xl p-6">
            <h3 className="font-[var(--font-display)] font-semibold flex items-center gap-2 mb-3"><Sparkles size={18} className="text-[var(--color-gold)]" /> Applies To</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between depth-soft rounded-xl px-4 py-3">
                <div className="text-sm">Free / &lt;30-day merchants</div>
                <Badge tone="violet">{freeMerchants.length} affected</Badge>
              </div>
              <div className="flex items-center justify-between depth-soft rounded-xl px-4 py-3">
                <div className="text-sm">Monthly+ (own branding)</div>
                <Badge tone="emerald">{customMerchants.length} excluded</Badge>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-xs text-[var(--color-mist)]">
              <p className="flex items-center gap-2"><Store size={13} className="text-[var(--color-aqua)]" /> Free merchant dashboards</p>
              <p className="flex items-center gap-2"><QrCode size={13} className="text-[var(--color-aqua)]" /> Public QR / pay pages</p>
              <p className="flex items-center gap-2"><FileText size={13} className="text-[var(--color-aqua)]" /> Generated invoice PDFs</p>
            </div>
          </div>

          <div className="depth-card rounded-2xl p-5 flex items-start gap-3" style={{ borderColor: 'rgba(124,108,245,0.2)' }}>
            <Info size={16} className="text-[var(--color-violet)] shrink-0 mt-0.5" />
            <p className="text-xs text-[var(--color-mist)]">Free merchants <strong className="text-[var(--color-ivory)]">never</strong> see a logo-upload option. Monthly+ merchants ({'>='}30 days) keep their own custom logos and are not affected by this default.</p>
          </div>

          {settings.updatedAt > 0 && (
            <p className="text-[11px] text-[var(--color-mist-2)] text-center">Last updated {new Date(settings.updatedAt).toLocaleString('en-IN')} by {settings.updatedBy}</p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
