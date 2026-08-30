import { useState, useRef, useEffect } from 'react';
import { Save, Upload, Check, Store, Landmark, PenTool, Image as ImageIcon, Trash2, RefreshCw, Lock, ShieldCheck, Stamp, Sparkles, Monitor, Smartphone } from 'lucide-react';
import type { Merchant } from '../../lib/types';
import { store, credits } from '../../lib/store';
import { merchantService } from '../../lib/services';
import { useDesktopView } from '../../lib/viewportMode';
import { Link } from 'react-router-dom';
import { Field, Area } from '../../components/Field';
import SignaturePad from '../../components/SignaturePad';
import { generateCompanySeal } from '../../lib/companySeal';

const MAX_IMG_BYTES = 1.5 * 1024 * 1024; // 1.5MB

export default function SettingsPage({ merchant }: { merchant: Merchant }) {
  const [form, setForm] = useState(merchant);
  const [isDesktopView, setDesktopView] = useDesktopView();

  const [saved, setSaved] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const sealRef = useRef<HTMLInputElement>(null);
  const [sealMode, setSealMode] = useState<'upload' | 'generate'>('upload');
  const [sealYear, setSealYear] = useState('');
  const [sealStyle, setSealStyle] = useState<'classic' | 'modern' | 'badge' | 'corporate'>('classic');
  const [sealColor, setSealColor] = useState('#0a2a6b');
  const set = (k: keyof Merchant, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const readFile = (f: File, cb: (d: string) => void) => {
    const r = new FileReader();
    r.onload = () => cb(r.result as string);
    r.readAsDataURL(f);
  };

  const resizeLogo = (dataUrl: string, maxDim: number, cb: (resized: string) => void) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          h = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, w, h);
        cb(canvas.toDataURL('image/png'));
      } else {
        cb(dataUrl);
      }
    };
    img.onerror = () => cb(dataUrl);
    img.src = dataUrl;
  };

  const removeSignature = () => {
    set('signatureDataUrl', '');
    set('signatureUrl', '');
    set('hasSignature', false);
    store.updateMerchant(merchant.id, { signatureDataUrl: '', signatureUrl: '', hasSignature: false });
  };

  const onLogoFile = (file?: File) => {
    if (!file || !file.type.startsWith('image/') || file.size > MAX_IMG_BYTES) return;
    readFile(file, (d) => {
      resizeLogo(d, 400, (resized) => {
        set('logoDataUrl', resized);
        set('hasCustomLogo', true);
        merchantService.uploadBrandingAsset('logo', resized).then((updated) => {
          if (updated) setForm((prev) => ({ ...prev, ...updated }));
        });
      });
    });
  };

  // ---- Company Seal (additive, UI-only feature — see companySealDataUrl) ----
  const onSealFile = (file?: File) => {
    const okType = file && ['image/png', 'image/jpeg', 'image/jpg'].includes(file.type);
    if (!file || !okType || file.size > MAX_IMG_BYTES) return;
    readFile(file, (d) => {
      resizeLogo(d, 500, (resized) => {
        set('companySealDataUrl', resized);
        set('hasCompanySeal', true);
        merchantService.uploadBrandingAsset('companySeal', resized).then((updated) => {
          if (updated) setForm((prev) => ({ ...prev, ...updated }));
        });
      });
    });
  };

  const onGenerateSeal = () => {
    const businessName = form.brandName || form.tradeName || form.shopName;
    if (!businessName || !form.gstin || !form.state) return;
    const dataUrl = generateCompanySeal({
      businessName,
      gstin: form.gstin,
      state: form.state,
      establishedYear: sealYear.trim() || undefined,
      style: sealStyle,
      color: sealColor,
    });
    if (!dataUrl) return;
    set('companySealDataUrl', dataUrl);
    set('hasCompanySeal', true);
    merchantService.uploadBrandingAsset('companySeal', dataUrl).then((updated) => {
      if (updated) setForm((prev) => ({ ...prev, ...updated }));
    });
  };

  const removeSeal = () => {
    set('companySealDataUrl', '');
    set('companySealUrl', '');
    set('hasCompanySeal', false);
    store.updateMerchant(merchant.id, { companySealDataUrl: '', companySealUrl: '', hasCompanySeal: false });
  };

  const [saveErr, setSaveErr] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);

  const save = async () => {
    setSaveErr('');
    setSaveBusy(true);
    try {
      // Strip massive base64 image strings so text updates do not transmit heavy images
      const { logoDataUrl, signatureDataUrl, companySealDataUrl, ...cleanForm } = form;
      await store.updateMerchant(merchant.id, cleanForm);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setSaveErr(e?.message || 'Failed to update settings.');
    } finally {
      setSaveBusy(false);
    }
  };

  const businessNameForSeal = form.brandName || form.tradeName || form.shopName || '';
  const previewDataUrl = (businessNameForSeal && form.gstin && form.state)
    ? generateCompanySeal({
        businessName: businessNameForSeal,
        gstin: form.gstin,
        state: form.state,
        establishedYear: sealYear.trim() || undefined,
        style: sealStyle,
        color: sealColor,
      })
    : '';

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-[var(--font-display)] text-3xl font-bold">Settings</h1>
          <p className="text-[var(--color-mist)] mt-1">Manage your business, GST, bank, and branding details.</p>
        </div>
        <button disabled={saveBusy} onClick={save} className="flex items-center gap-2 px-5 py-3 rounded-2xl font-semibold text-[var(--color-ink)] depth-raised disabled:opacity-60" style={{ background: saved ? 'linear-gradient(135deg,#6ff2dc,#38e0c8)' : 'linear-gradient(135deg,#f6dd9b,#e9c46a)' }}>
          {saveBusy ? <RefreshCw size={18} className="animate-spin" /> : saved ? <><Check size={18} strokeWidth={3} /> Saved</> : <><Save size={18} /> Save Changes</>}
        </button>
      </div>

      {saveErr && (
        <div className="p-4 rounded-2xl bg-[rgba(255,107,136,0.1)] border border-[rgba(255,107,136,0.3)] text-xs text-[var(--color-rose)] font-semibold">
          {saveErr}
        </div>
      )}

      <div className="depth-card rounded-2xl p-6">
        <h3 className="font-[var(--font-display)] font-semibold flex items-center gap-2 mb-4"><Store size={18} className="text-[var(--color-gold)]" /> Shop & GST</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Trade Name" value={form.tradeName || ''} onChange={(e) => set('tradeName', e.target.value)} placeholder={form.shopName} />
          <Field label="Legal Name" value={form.legalName || ''} onChange={(e) => set('legalName', e.target.value)} placeholder={form.ownerName} />
          <Field label="Shop / Display Name" value={form.shopName} onChange={(e) => set('shopName', e.target.value)} />
          <Field label="Owner Name" value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} />
          <Field label="Business Type" value={form.businessType || ''} onChange={(e) => set('businessType', e.target.value)} placeholder="Proprietorship" />
          <Field label="Email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <Field label="Phone" value={form.phone} maxLength={10} onChange={(e) => set('phone', e.target.value.replace(/\D/g, ''))} />
          <Field label="GSTIN" value={form.gstin} maxLength={15} onChange={(e) => set('gstin', e.target.value.toUpperCase())} />
          <Field label="PAN" value={form.pan} maxLength={10} onChange={(e) => set('pan', e.target.value.toUpperCase())} />
          <Field label="State" value={form.state} onChange={(e) => set('state', e.target.value)} />
          <Field label="City / District" value={form.city || ''} onChange={(e) => set('city', e.target.value)} />
          <Field label="Pincode" value={form.pincode || ''} maxLength={6} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))} />
          <div className="sm:col-span-2"><Area label="Address" rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
        </div>
      </div>

      <div className="depth-card rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h3 className="font-[var(--font-display)] font-semibold flex items-center gap-2"><Landmark size={18} className="text-[var(--color-aqua)]" /> Bank Details</h3>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-emerald)] bg-[var(--color-emerald)]/10 px-2.5 py-1 rounded-full" title="Bank name, account number, IFSC and UPI ID are stored AES-256-GCM encrypted at rest.">
            <Lock size={12} /> AES-256 Encrypted
          </span>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Bank Name" value={form.bankName} onChange={(e) => set('bankName', e.target.value)} />
          <label className="block">
            <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase">Account Type</span>
            <select value={form.accountType || 'current'} onChange={(e) => set('accountType', e.target.value)} className="mt-1.5 w-full rounded-xl bg-[#0c1322] border border-[var(--color-line)] px-4 py-3 text-[var(--color-ivory)] outline-none focus:border-[var(--color-aqua)]">
              <option value="current">Current Account</option>
              <option value="savings">Savings Account</option>
            </select>
          </label>
          <Field label="Account Number" value={form.accountNumber} onChange={(e) => set('accountNumber', e.target.value.replace(/\D/g, ''))} />
          <Field label="IFSC" value={form.ifsc} maxLength={11} onChange={(e) => set('ifsc', e.target.value.toUpperCase())} />
          <div className="sm:col-span-2"><Field label="UPI ID (Optional)" value={form.upiId || ''} onChange={(e) => set('upiId', e.target.value.trim())} placeholder="yourname@upi" /></div>
        </div>
        <p className="mt-3 text-xs text-[var(--color-mist)] flex items-center gap-1.5">
          <ShieldCheck size={13} className="text-[var(--color-emerald)]" /> Bank name, account number, IFSC and UPI ID are encrypted (AES-256-GCM) before being stored. Your MPIN is one-way hashed and never stored in plain text.
        </p>
      </div>

      {/* App Display & Viewport Mode */}
      <div className="depth-card rounded-2xl p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl grid place-items-center depth-soft text-[var(--color-aqua)]">
              {isDesktopView ? <Monitor size={20} /> : <Smartphone size={20} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-[var(--font-display)] font-semibold">Desktop View</h3>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isDesktopView ? 'bg-[var(--color-aqua)]/20 text-[var(--color-aqua)]' : 'bg-emerald-500/20 text-emerald-400'}`}>
                  {isDesktopView ? 'ON (Widescreen)' : 'OFF (Mobile-Compact)'}
                </span>
              </div>
              <p className="text-xs text-[var(--color-mist-2)] mt-0.5">
                {isDesktopView
                  ? 'Standard responsive behavior enabled based on screen width.'
                  : 'Forces clean mobile-compact layout on all devices (neutralizes Chrome "Desktop Site" sidebar issues).'}
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isDesktopView}
              onChange={(e) => setDesktopView(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-12 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-aqua)] border border-slate-700"></div>
          </label>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Digital Signature — in-app pad only, transparent background (auto-saved) */}
        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold flex items-center gap-2 mb-1"><PenTool size={18} className="text-[var(--color-gold)]" /> Digital Signature</h3>
          <p className="text-xs text-[var(--color-mist-2)] mb-4">Sign below — it appears as the Authorised Signatory on every GST invoice PDF.</p>

          {form.signatureUrl || form.signatureDataUrl ? (
            <div className="space-y-3">
              {/* preview on a dark surface to prove transparency */}
              <div className="rounded-xl p-4 grid place-items-center border border-[var(--color-line)]" style={{ background: 'linear-gradient(160deg,#16203a,#0e1626)' }}>
                <img src={form.signatureUrl || form.signatureDataUrl} alt="Signature preview" className="h-20 object-contain" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--color-emerald)] flex items-center gap-1.5"><Check size={14} /> Signature saved · transparent</span>
                <button onClick={removeSignature} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg depth-soft hover:text-[var(--color-rose)] transition"><RefreshCw size={13} /> Re-sign</button>
              </div>
            </div>
          ) : (
            <SignaturePad
              value={form.signatureUrl || form.signatureDataUrl}
              onChange={(d) => {
                set('signatureDataUrl', d || '');
                set('hasSignature', !!d);
                if (d) {
                  merchantService.uploadBrandingAsset('signature', d).then((updated) => {
                    if (updated) setForm((prev) => ({ ...prev, ...updated }));
                  });
                }
              }}
            />
          )}
        </div>

        {/* Custom Invoice Branding — premium (validity >= 30 days) only */}
        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold flex items-center gap-2 mb-1">
            <ImageIcon size={18} className="text-[var(--color-aqua)]" /> Custom Invoice Branding
            {credits.brandingEnabled(merchant)
              ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-aqua)]/15 text-[var(--color-aqua)]">PREMIUM</span>
              : <Lock size={13} className="text-[var(--color-amber)]" />}
          </h3>
          <p className="text-xs text-[var(--color-mist-2)] mb-4">Replace the AK-LOGIC AI logo with your own business name & logo on every invoice.</p>
          {credits.brandingEnabled(merchant) ? (
            <div className="space-y-4">
              <Field label="Brand Name (printed on invoice)" value={form.brandName || ''} onChange={(e) => set('brandName', e.target.value)} placeholder={form.shopName} />
              <div>
                <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase">Business Logo</span>
                <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => onLogoFile(e.target.files?.[0] || undefined)} />
                {form.logoUrl || form.logoDataUrl ? (
                  <div className="mt-1.5 space-y-2">
                    <div className="rounded-xl bg-white p-3 grid place-items-center border border-[var(--color-line)]"><img src={form.logoUrl || form.logoDataUrl} alt="logo" className="h-16 object-contain" /></div>
                    <div className="flex gap-2">
                      <button onClick={() => logoRef.current?.click()} className="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg depth-soft hover:text-[var(--color-gold)] transition"><RefreshCw size={13} /> Update Logo</button>
                      <button onClick={() => { set('logoDataUrl', ''); set('logoUrl', ''); }} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg depth-soft hover:text-[var(--color-rose)] transition"><Trash2 size={13} /></button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => logoRef.current?.click()} className="mt-1.5 w-full py-7 rounded-xl border-2 border-dashed border-[var(--color-line)] hover:border-[var(--color-gold)] transition grid place-items-center">
                    <span className="text-sm text-[var(--color-mist)]"><Upload size={18} className="inline mr-2" />Upload logo (PNG/JPG, max 1.5MB)</span>
                  </button>
                )}
              </div>
              {/* live invoice-header preview */}
              <div>
                <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase">Invoice Header Preview</span>
                <div className="mt-1.5 rounded-xl bg-white p-4 flex items-center gap-3 border border-[var(--color-line)]">
                  {form.logoUrl || form.logoDataUrl
                    ? <img src={form.logoUrl || form.logoDataUrl} alt="logo" className="h-10 object-contain" />
                    : <div className="h-10 w-10 rounded-lg grid place-items-center text-white text-sm font-bold" style={{ background: '#0a0e1a' }}>{(form.brandName || form.shopName).charAt(0)}</div>}
                  <div className="leading-tight">
                    <div className="text-[#0a0e1a] font-extrabold text-sm">{form.brandName || form.shopName}</div>
                    <div className="text-[#888] text-[9px] tracking-[0.2em] uppercase">Tax Invoice</div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-[var(--color-aqua)]">✓ Your logo & brand name appear on every generated invoice. AK-LOGIC AI logo is removed. (Remember to Save Changes.)</p>
            </div>
          ) : (
            <div className="rounded-xl px-4 py-7 text-center border-2 border-dashed border-[var(--color-line)]">
              <Lock size={26} className="text-[var(--color-amber)] mx-auto mb-3" />
              <p className="text-sm font-semibold text-[var(--color-ivory)]">Upgrade to Premium to add your own brand name & logo on invoices</p>
              <p className="text-xs text-[var(--color-mist)] mt-2 max-w-xs mx-auto">You're on a short-term plan, so invoices use the default <strong className="text-[var(--color-gold)]">AK-LOGIC AI</strong> branding. Monthly plans (30 days+) unlock your own logo, brand name & custom invoice branding.</p>
              {/* disabled controls so a free user can still "touch" the option and see the prompt */}
              <div className="mt-4 grid gap-2 opacity-60 pointer-events-none select-none">
                <div className="rounded-lg bg-[#0c1322] border border-[var(--color-line)] px-3 py-2.5 text-left text-xs text-[var(--color-mist-2)]">Brand Name (locked)</div>
                <div className="rounded-lg border-2 border-dashed border-[var(--color-line)] px-3 py-3 text-xs text-[var(--color-mist-2)]"><Upload size={14} className="inline mr-1.5" />Upload logo (locked)</div>
              </div>
              <Link to="/dashboard/recharge" className="mt-4 inline-block px-5 py-2.5 rounded-lg text-sm font-semibold text-[var(--color-ink)]" style={{ background: 'linear-gradient(135deg,#6ff2dc,#38e0c8)' }}>Upgrade to Premium</Link>
            </div>
          )}
        </div>
      </div>

      {/* Company Seal — additive UI feature. Upload an existing seal, or
          generate a professional circular seal from business details.
          Hidden gracefully everywhere else on the invoice when not set. */}
      <div className="depth-card rounded-2xl p-6">
        <h3 className="font-[var(--font-display)] font-semibold flex items-center gap-2 mb-1"><Stamp size={18} className="text-[var(--color-gold)]" /> Company Seal</h3>
        <p className="text-xs text-[var(--color-mist-2)] mb-4">Shown beside the Authorised Signature on every invoice. Optional — upload your own, or generate one instantly.</p>

        {form.companySealUrl || form.companySealDataUrl ? (
          <div className="space-y-3">
            <div className="rounded-xl p-4 grid place-items-center border border-[var(--color-line)]" style={{ background: 'linear-gradient(160deg,#16203a,#0e1626)' }}>
              <img src={form.companySealUrl || form.companySealDataUrl} alt="Company seal preview" className="h-24 w-24 object-contain" />
            </div>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs text-[var(--color-emerald)] flex items-center gap-1.5"><Check size={14} /> Seal saved</span>
              <div className="flex gap-2">
                <button onClick={() => sealRef.current?.click()} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg depth-soft hover:text-[var(--color-gold)] transition"><RefreshCw size={13} /> Replace</button>
                <button onClick={removeSeal} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg depth-soft hover:text-[var(--color-rose)] transition"><Trash2 size={13} /> Remove</button>
              </div>
            </div>
            <input ref={sealRef} type="file" accept="image/png,image/jpeg,image/jpg" hidden onChange={(e) => onSealFile(e.target.files?.[0] || undefined)} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button onClick={() => setSealMode('upload')} className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${sealMode === 'upload' ? 'border-[var(--color-gold)] text-[var(--color-ivory)] bg-[rgba(233,196,106,0.08)]' : 'border-[var(--color-line)] text-[var(--color-mist)]'}`}>Upload Existing Seal</button>
              <button onClick={() => setSealMode('generate')} className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${sealMode === 'generate' ? 'border-[var(--color-gold)] text-[var(--color-ivory)] bg-[rgba(233,196,106,0.08)]' : 'border-[var(--color-line)] text-[var(--color-mist)]'}`}>Create Digital Seal</button>
            </div>

            {sealMode === 'upload' ? (
              <div>
                <input ref={sealRef} type="file" accept="image/png,image/jpeg,image/jpg" hidden onChange={(e) => onSealFile(e.target.files?.[0] || undefined)} />
                <button onClick={() => sealRef.current?.click()} className="w-full py-7 rounded-xl border-2 border-dashed border-[var(--color-line)] hover:border-[var(--color-gold)] transition grid place-items-center">
                  <span className="text-sm text-[var(--color-mist)]"><Upload size={18} className="inline mr-2" />Upload seal (PNG/JPG/JPEG, transparent PNG recommended, max 1.5MB)</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-[var(--color-mist-2)]">Generated automatically from your Business Name, GSTIN &amp; State (already on this page above).</p>
                
                {/* Style Selector */}
                <div>
                  <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase block mb-2">Seal Style</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(['classic', 'modern', 'badge', 'corporate'] as const).map((style) => (
                      <button
                        key={style}
                        type="button"
                        onClick={() => setSealStyle(style)}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold capitalize border transition ${
                          sealStyle === style
                            ? 'border-[var(--color-gold)] text-[var(--color-ivory)] bg-[rgba(233,196,106,0.08)]'
                            : 'border-[var(--color-line)] text-[var(--color-mist)] hover:border-[var(--color-mist)]'
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color Selector */}
                <div>
                  <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase block mb-2">Ink Color</span>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { name: 'Navy', value: '#0a2a6b' },
                      { name: 'Crimson', value: '#b81d24' },
                      { name: 'Charcoal', value: '#2d3748' },
                      { name: 'Emerald', value: '#065f46' },
                      { name: 'Bronze', value: '#b45309' },
                      { name: 'Steel', value: '#1e3a8a' },
                    ].map((col) => (
                      <button
                        key={col.value}
                        type="button"
                        onClick={() => setSealColor(col.value)}
                        className="w-8 h-8 rounded-full border border-white/10 relative transition hover:scale-110 active:scale-95 flex items-center justify-center"
                        style={{ backgroundColor: col.value }}
                        title={col.name}
                      >
                        {sealColor === col.value && <Check size={14} className="text-white drop-shadow-md" strokeWidth={3} />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Establishment Year (optional)" value={sealYear} maxLength={4} onChange={(e) => setSealYear(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 2015" />
                  
                  {/* Live Preview within the Creation Panel */}
                  <div className="flex flex-col justify-end">
                    <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase block mb-1.5">Live Preview</span>
                    {previewDataUrl ? (
                      <div className="rounded-xl p-2 flex items-center justify-center border border-[var(--color-line)] bg-[#0c1322] h-[52px]">
                        <img src={previewDataUrl} alt="Seal Live Preview" className="h-10 w-10 object-contain" />
                        <span className="text-xs text-[var(--color-mist)] ml-3 font-medium">Preview Ready</span>
                      </div>
                    ) : (
                      <div className="rounded-xl flex items-center justify-center border border-dashed border-[var(--color-line)] text-xs text-[var(--color-mist-2)] h-[52px]">
                        Fill brand name, GSTIN &amp; state above
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  onClick={onGenerateSeal} 
                  disabled={!previewDataUrl}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-[var(--color-ink)] depth-raised transition disabled:opacity-50 disabled:cursor-not-allowed" 
                  style={{ background: 'linear-gradient(135deg,#f6dd9b,#e9c46a)' }}
                >
                  <Sparkles size={16} /> Save & Apply Digital Seal
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
