import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Activity, Database, Server, Cpu, CheckCircle2, Cloud, Lock, Layers, Tag, ShieldCheck,
  Clock, ToggleLeft, ToggleRight, Sliders, Search, Trash2, Plus,
  AlertCircle, RefreshCw, Sparkles, Check
} from 'lucide-react';
import { useMerchants, useRequests, useInvoices, useNotifications } from '../../lib/store';
import { PLANS, VALIDITY_ADDON, CUSTOM_BRANDING_MIN_DAYS, CARRY_FORWARD_WINDOW_DAYS } from '../../lib/plans';
import { PageHeader, Badge } from '../../components/ui';
import { adminService } from '../../lib/services';

interface FlagData {
  global_flags: Array<{ id: string; flag_key: string; enabled: boolean; updated_by_admin_id?: string; updated_at: number }>;
  merchant_overrides: Array<{
    id: string;
    flag_key: string;
    enabled: boolean;
    merchant_id: string;
    shopName: string;
    tradeName?: string;
    ownerName?: string;
    phone: string;
    email: string;
    merchantCode?: string;
    updated_by_admin_id?: string;
    updated_at: number;
  }>;
  supported_flags: Array<{ key: string; label: string; default: boolean }>;
}

export default function AdminSystem() {
  const merchants = useMerchants();
  const requests = useRequests();
  const invoices = useInvoices();
  const notifs = useNotifications();

  const [flagsData, setFlagsData] = useState<FlagData | null>(null);
  const [loadingFlags, setLoadingFlags] = useState(true);

  // Override Builder Form State
  const [merchantSearch, setMerchantSearch] = useState('');
  const [selectedMerchantId, setSelectedMerchantId] = useState('');
  const [selectedFlagKey, setSelectedFlagKey] = useState('deep_accounting_enabled');
  const [overrideEnabled, setOverrideEnabled] = useState(true);
  const [savingOverride, setSavingOverride] = useState(false);

  const loadFlags = async () => {
    try {
      setLoadingFlags(true);
      const res = await adminService.getAllFeatureFlags();
      setFlagsData(res);
    } catch (err: any) {
      console.error('Failed to load feature flags:', err);
    } finally {
      setLoadingFlags(false);
    }
  };

  useEffect(() => {
    loadFlags();
  }, []);

  // Filter merchants for search picker
  const filteredMerchants = useMemo(() => {
    if (!merchantSearch.trim()) return merchants.slice(0, 15);
    const q = merchantSearch.toLowerCase();
    return merchants.filter((m) =>
      (m.shopName && m.shopName.toLowerCase().includes(q)) ||
      (m.tradeName && m.tradeName.toLowerCase().includes(q)) ||
      (m.phone && m.phone.includes(q)) ||
      (m.merchantCode && m.merchantCode.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [merchants, merchantSearch]);

  const selectedMerchant = merchants.find((m) => m.id === selectedMerchantId);

  // Handle Global Flag Toggle
  const handleToggleGlobalFlag = async (flagKey: string, currentEnabled: boolean) => {
    try {
      const nextVal = !currentEnabled;
      await adminService.setGlobalFeatureFlag(flagKey, nextVal);
      toast.success(`Global flag '${flagKey}' set to ${nextVal ? 'ENABLED' : 'DISABLED'}`);
      await loadFlags();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update global flag.');
    }
  };

  // Handle Apply Merchant Override
  const handleApplyOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMerchantId) {
      toast.error('Please select a merchant.');
      return;
    }
    try {
      setSavingOverride(true);
      const res = await adminService.setMerchantFeatureFlagOverride(
        selectedMerchantId,
        selectedFlagKey,
        overrideEnabled
      );
      toast.success(res.message || 'Merchant override applied successfully!');
      setSelectedMerchantId('');
      setMerchantSearch('');
      await loadFlags();
    } catch (err: any) {
      toast.error(err.message || 'Failed to apply merchant override.');
    } finally {
      setSavingOverride(false);
    }
  };

  // Handle Remove Override
  const handleRemoveOverride = async (merchantId: string, flagKey: string, shopName: string) => {
    if (!confirm(`Remove override for "${shopName}"? They will revert to the global default.`)) return;
    try {
      await adminService.removeMerchantFeatureFlagOverride(merchantId, flagKey);
      toast.success(`Override removed for ${shopName}.`);
      await loadFlags();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove override.');
    }
  };

  const services = [
    { name: 'API Gateway (FastAPI)', latency: '42ms', icon: Server },
    { name: 'PostgreSQL Primary', latency: '8ms', icon: Database },
    { name: 'PDF Render Worker', latency: '120ms', icon: Cpu },
    { name: 'QR Service', latency: '11ms', icon: Cloud },
    { name: 'Auth / OTP Service', latency: '64ms', icon: Lock },
  ];

  const tables = [
    { name: 'merchants', rows: merchants.length },
    { name: 'billing_requests', rows: requests.length },
    { name: 'invoices', rows: invoices.length },
    { name: 'notifications', rows: notifs.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Settings & Feature Flags"
        subtitle="Global platform toggles, per-merchant overrides, plan catalog & service health."
      />

      {/* status strip */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="depth-card rounded-2xl p-5"><Activity size={20} className="text-[var(--color-emerald)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">99.98%</div><div className="text-sm text-[var(--color-mist)]">Uptime (30d)</div></div>
        <div className="depth-card rounded-2xl p-5"><Server size={20} className="text-[var(--color-aqua)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">5/5</div><div className="text-sm text-[var(--color-mist)]">Services Online</div></div>
        <div className="depth-card rounded-2xl p-5"><Database size={20} className="text-[var(--color-violet)]" /><div className="font-[var(--font-display)] text-xl font-bold mt-3">{tables.reduce((s, t) => s + t.rows, 0)}</div><div className="text-sm text-[var(--color-mist)]">Total Records</div></div>
      </div>

      {/* ========================================================================= */}
      {/* 🚀 FEATURE FLAGS & PER-MERCHANT OVERRIDE CONTROL PANEL */}
      {/* ========================================================================= */}
      <div className="depth-card rounded-2xl p-6 space-y-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--color-line)] pb-4">
          <div>
            <h3 className="font-[var(--font-display)] font-semibold text-lg flex items-center gap-2">
              <Sliders size={20} className="text-[var(--color-aqua)]" /> Feature Flags & Per-Merchant Control
            </h3>
            <p className="text-xs text-[var(--color-mist-2)] mt-0.5">
              Control rollout of new modules. Override flags for specific test merchants without changing global defaults.
            </p>
          </div>
          <button
            onClick={loadFlags}
            disabled={loadingFlags}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold depth-soft hover:text-[var(--color-aqua)] transition flex items-center gap-1.5 self-start"
          >
            <RefreshCw size={13} className={loadingFlags ? 'animate-spin' : ''} /> Refresh Flags
          </button>
        </div>

        {/* 1. Global Default Toggles */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-mist-2)] mb-3">
            1. Global Module Defaults (Affects all merchants without overrides)
          </h4>
          {loadingFlags ? (
            <div className="py-6 text-center text-xs text-[var(--color-mist-2)]">Loading system flags...</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {(flagsData?.supported_flags || []).map((sf) => {
                const gFlag = flagsData?.global_flags.find((gf) => gf.flag_key === sf.key);
                const isEnabled = gFlag ? gFlag.enabled : sf.default;
                return (
                  <div
                    key={sf.key}
                    className="flex items-center justify-between p-3.5 rounded-xl depth-soft border border-[var(--color-line)]/50"
                  >
                    <div className="pr-3">
                      <div className="text-xs font-semibold text-[var(--color-ivory)]">{sf.label}</div>
                      <div className="text-[10px] font-mono text-[var(--color-mist-2)] mt-0.5">{sf.key}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleGlobalFlag(sf.key, isEnabled)}
                      className="cursor-pointer transition hover:scale-105 shrink-0"
                    >
                      {isEnabled ? (
                        <div className="flex items-center gap-1.5">
                          <Badge tone="emerald">Global ON</Badge>
                          <ToggleRight size={28} className="text-[var(--color-emerald)]" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Badge tone="mist">Global OFF</Badge>
                          <ToggleLeft size={28} className="text-[var(--color-mist-2)]" />
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Per-Merchant Override Builder Form */}
        <div className="pt-4 border-t border-[var(--color-line)]">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-mist-2)] mb-3 flex items-center gap-2">
            <Plus size={14} className="text-[var(--color-aqua)]" /> 2. Set Per-Merchant Override (Targeted Enable/Disable)
          </h4>

          <form onSubmit={handleApplyOverride} className="p-4 rounded-xl depth-soft border border-[var(--color-line)] space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              {/* Merchant Picker */}
              <div className="sm:col-span-1 space-y-1">
                <label className="text-xs font-semibold text-[var(--color-mist-2)] block">
                  Select Target Merchant:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={merchantSearch}
                    onChange={(e) => {
                      setMerchantSearch(e.target.value);
                      if (selectedMerchantId) setSelectedMerchantId('');
                    }}
                    placeholder="Search name, phone, code..."
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-xs text-white"
                  />
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-mist-2)]" />
                </div>

                {/* Dropdown list if not selected */}
                {!selectedMerchantId && (
                  <div className="max-h-36 overflow-y-auto rounded-xl bg-[#0c1322] border border-[var(--color-line)] divide-y divide-white/5 text-xs mt-1">
                    {filteredMerchants.length === 0 ? (
                      <div className="p-2.5 text-[11px] text-[var(--color-mist-2)] text-center">No matching merchants</div>
                    ) : (
                      filteredMerchants.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedMerchantId(m.id);
                            setMerchantSearch(`${m.tradeName || m.shopName} (${m.phone})`);
                          }}
                          className="w-full p-2 text-left hover:bg-white/5 transition flex items-center justify-between"
                        >
                          <div>
                            <div className="font-semibold text-white">{m.tradeName || m.shopName}</div>
                            <div className="text-[10px] text-[var(--color-mist-2)]">{m.phone} · {m.merchantCode || m.id.slice(0, 8)}</div>
                          </div>
                          <Badge tone="aqua">{m.city || m.state || 'IN'}</Badge>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {selectedMerchant && (
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] flex items-center justify-between mt-1">
                    <span>Selected: <strong>{selectedMerchant.tradeName || selectedMerchant.shopName}</strong></span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMerchantId('');
                        setMerchantSearch('');
                      }}
                      className="text-emerald-400 hover:underline font-bold"
                    >
                      Change
                    </button>
                  </div>
                )}
              </div>

              {/* Feature Flag Picker */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--color-mist-2)] block">
                  Select Feature Module:
                </label>
                <select
                  value={selectedFlagKey}
                  onChange={(e) => setSelectedFlagKey(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-xs text-white"
                >
                  {(flagsData?.supported_flags || []).map((sf) => (
                    <option key={sf.key} value={sf.key}>
                      {sf.label}
                    </option>
                  ))}
                </select>
                <div className="text-[10px] font-mono text-[var(--color-mist-2)]">{selectedFlagKey}</div>
              </div>

              {/* Override Value & Submit */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--color-mist-2)] block">
                  Override State:
                </label>
                <div className="flex items-center gap-3 pt-1">
                  <label className="flex items-center gap-1.5 text-xs text-emerald-400 cursor-pointer">
                    <input
                      type="radio"
                      name="overrideState"
                      checked={overrideEnabled === true}
                      onChange={() => setOverrideEnabled(true)}
                    />
                    <span>Force ON (Enabled)</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-red-400 cursor-pointer">
                    <input
                      type="radio"
                      name="overrideState"
                      checked={overrideEnabled === false}
                      onChange={() => setOverrideEnabled(false)}
                    />
                    <span>Force OFF (Disabled)</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={savingOverride || !selectedMerchantId}
                  className="w-full mt-3 px-4 py-2 rounded-xl text-xs font-bold bg-[var(--color-aqua)] text-black hover:opacity-90 transition disabled:opacity-40 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {savingOverride ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  Apply Merchant Override
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* 3. Active Per-Merchant Overrides Table */}
        <div className="pt-4 border-t border-[var(--color-line)]">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-mist-2)] mb-3 flex items-center justify-between">
            <span>3. Active Per-Merchant Overrides ({flagsData?.merchant_overrides.length || 0})</span>
          </h4>

          {loadingFlags ? (
            <div className="py-6 text-center text-xs text-[var(--color-mist-2)]">Loading overrides...</div>
          ) : (flagsData?.merchant_overrides || []).length === 0 ? (
            <div className="py-6 text-center text-xs text-[var(--color-mist-2)] depth-soft rounded-xl border border-dashed border-[var(--color-line)]">
              No merchant overrides configured. All merchants currently use the global defaults above.
            </div>
          ) : (
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-line)] text-[var(--color-mist-2)] uppercase">
                    <th className="py-2.5 px-3">Merchant</th>
                    <th className="py-2.5 px-3">Feature Flag</th>
                    <th className="py-2.5 px-3">Override Status</th>
                    <th className="py-2.5 px-3">Updated By</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(flagsData?.merchant_overrides || []).map((ov) => (
                    <tr key={ov.id} className="border-b border-[var(--color-line)]/50 hover:bg-white/5 transition">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-white">{ov.tradeName || ov.shopName}</div>
                        <div className="text-[10px] text-[var(--color-mist-2)] font-mono">{ov.merchantCode || ov.phone} · {ov.merchant_id.slice(0, 10)}...</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[var(--color-aqua)]">{ov.flag_key}</td>
                      <td className="py-3 px-3">
                        {ov.enabled ? (
                          <Badge tone="emerald"><Check size={11} className="inline mr-1" /> Forced ON</Badge>
                        ) : (
                          <Badge tone="rose"><AlertCircle size={11} className="inline mr-1" /> Forced OFF</Badge>
                        )}
                      </td>
                      <td className="py-3 px-3 text-[var(--color-mist-2)]">
                        {(ov as any).updated_by_admin_id || 'Admin'}
                        <div className="text-[10px]">{new Date(ov.updated_at).toLocaleDateString()}</div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleRemoveOverride(ov.merchant_id, ov.flag_key, ov.tradeName || ov.shopName)}
                          className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition border border-red-500/20 text-[11px] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 size={11} /> Revert to Default
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* plan catalog (single source of truth) */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="depth-card rounded-2xl p-6 mb-5">
        <h3 className="font-[var(--font-display)] font-semibold flex items-center gap-2 mb-4"><Tag size={18} className="text-[var(--color-violet)]" /> Recharge Plan Catalog</h3>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-[var(--color-mist-2)] border-b border-[var(--color-line)]">
                <th className="text-left py-2.5 font-medium">Plan</th>
                <th className="text-right py-2.5 font-medium">Price</th>
                <th className="text-right py-2.5 font-medium">Validity</th>
                <th className="text-right py-2.5 font-medium">Credits</th>
                <th className="text-right py-2.5 font-medium">Branding</th>
              </tr>
            </thead>
            <tbody>
              {PLANS.map((p) => (
                <tr key={p.id} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="py-3 font-medium">{p.name}{p.popular && <span className="ml-2"><Badge tone="amber">Popular</Badge></span>}{p.best && <span className="ml-2"><Badge tone="aqua">Best</Badge></span>}</td>
                  <td className="py-3 text-right">₹{p.price}</td>
                  <td className="py-3 text-right">{p.validityDays} day{p.validityDays > 1 ? 's' : ''}</td>
                  <td className="py-3 text-right font-semibold">{p.credits}</td>
                  <td className="py-3 text-right">{p.validityDays >= CUSTOM_BRANDING_MIN_DAYS ? <Badge tone="emerald">Custom</Badge> : <Badge tone="mist">AK-LOGIC</Badge>}</td>
                </tr>
              ))}
              <tr>
                <td className="py-3 font-medium">{VALIDITY_ADDON.name} <span className="text-[var(--color-mist-2)]">(add-on)</span></td>
                <td className="py-3 text-right">₹{VALIDITY_ADDON.price}</td>
                <td className="py-3 text-right">+{VALIDITY_ADDON.extendDays} days</td>
                <td className="py-3 text-right text-[var(--color-mist-2)]">0 (no new)</td>
                <td className="py-3 text-right text-[var(--color-mist-2)]">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* policy cards */}
      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold flex items-center gap-2 mb-3"><ShieldCheck size={18} className="text-[var(--color-aqua)]" /> Branding Policy</h3>
          <ul className="space-y-2.5 text-sm text-[var(--color-mist)]">
            <li className="flex items-start gap-2"><span className="mt-1 w-1.5 h-1.5 rounded-full bg-[var(--color-rose)] shrink-0" /> Validity <strong className="text-[var(--color-ivory)]">&lt; {CUSTOM_BRANDING_MIN_DAYS} days</strong> → AK-LOGIC AI branding only. Custom logo locked.</li>
            <li className="flex items-start gap-2"><span className="mt-1 w-1.5 h-1.5 rounded-full bg-[var(--color-emerald)] shrink-0" /> Validity <strong className="text-[var(--color-ivory)]">≥ {CUSTOM_BRANDING_MIN_DAYS} days</strong> → custom logo, brand name & invoice branding unlocked.</li>
            <li className="flex items-start gap-2"><span className="mt-1 w-1.5 h-1.5 rounded-full bg-[var(--color-violet)] shrink-0" /> Decision is based on <strong className="text-[var(--color-ivory)]">duration, not price</strong>.</li>
          </ul>
        </div>
        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold flex items-center gap-2 mb-3"><Clock size={18} className="text-[var(--color-gold)]" /> Credit & Renewal Rules</h3>
          <ul className="space-y-2.5 text-sm text-[var(--color-mist)]">
            <li className="flex items-start gap-2"><span className="mt-1 w-1.5 h-1.5 rounded-full bg-[var(--color-aqua)] shrink-0" /> 1 approved invoice = <strong className="text-[var(--color-ivory)]">1 PDF credit</strong>. Rejections consume nothing.</li>
            <li className="flex items-start gap-2"><span className="mt-1 w-1.5 h-1.5 rounded-full bg-[var(--color-aqua)] shrink-0" /> Renewal within last <strong className="text-[var(--color-ivory)]">{CARRY_FORWARD_WINDOW_DAYS} days</strong> → unused credits carry forward.</li>
            <li className="flex items-start gap-2"><span className="mt-1 w-1.5 h-1.5 rounded-full bg-[var(--color-aqua)] shrink-0" /> ₹{VALIDITY_ADDON.price} add-on extends validity by {VALIDITY_ADDON.extendDays}d, <strong className="text-[var(--color-ivory)]">no new credits</strong>.</li>
            <li className="flex items-start gap-2"><span className="mt-1 w-1.5 h-1.5 rounded-full bg-[var(--color-aqua)] shrink-0" /> ₹20 Trial is <strong className="text-[var(--color-ivory)]">repurchasable</strong> after expiry (10 credits, 1 day).</li>
          </ul>
        </div>
      </div>

      {/* services + data layer */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold mb-4 flex items-center gap-2"><Activity size={18} className="text-[var(--color-emerald)]" /> Service Status</h3>
          <div className="space-y-2">
            {services.map((s, i) => (
              <motion.div key={s.name} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center justify-between depth-soft rounded-xl px-4 py-3">
                <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg grid place-items-center depth-raised" style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}><s.icon size={15} className="text-[var(--color-aqua)]" /></div><span className="text-sm">{s.name}</span></div>
                <div className="flex items-center gap-3"><span className="text-[11px] text-[var(--color-mist-2)] font-mono">{s.latency}</span><Badge tone="emerald"><CheckCircle2 size={11} className="inline mr-1" />OK</Badge></div>
              </motion.div>
            ))}
          </div>
        </div>
        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold mb-4 flex items-center gap-2"><Layers size={18} className="text-[var(--color-violet)]" /> Data Layer (PostgreSQL)</h3>
          <div className="space-y-2">
            {tables.map((t) => (
              <div key={t.name} className="flex items-center justify-between depth-soft rounded-xl px-4 py-3"><span className="text-sm font-mono text-[var(--color-aqua)]">{t.name}</span><span className="text-sm font-semibold">{t.rows} rows</span></div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--color-mist-2)] mt-4">Repository pattern abstracts persistence — ready for FastAPI + PostgreSQL swap-in.</p>
        </div>
      </div>
    </div>
  );
}
