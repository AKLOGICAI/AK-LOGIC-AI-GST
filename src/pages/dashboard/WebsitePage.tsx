import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, ExternalLink, CheckCircle2, Eye, Paintbrush, Layers, Package,
  Settings, Image as ImageIcon, Upload, Trash2, ArrowUp, ArrowDown,
  Sparkles, Save, ShieldCheck, RefreshCw, Plus, Search, Tag, Phone, Mail, MapPin, Share2
} from 'lucide-react';
import { PageHeader, Badge } from '../../components/ui';
import type { Merchant } from '../../lib/types';
import { websiteService, websiteCache, type WebsiteConfig, type GalleryItem } from '../../lib/websiteService';
import { fetchMerchantInventory, updateInventoryItem, type InventoryItem } from '../../lib/inventoryService';

const PRESET_PALETTES = [
  { name: 'Indigo & Emerald', primary: '#4F46E5', secondary: '#10B981' },
  { name: 'Gold & Aqua', primary: '#e9c46a', secondary: '#38e0c8' },
  { name: 'Deep Cyan & Neon', primary: '#06b6d4', secondary: '#10b981' },
  { name: 'Rose & Amber', primary: '#f43f5e', secondary: '#f59e0b' },
  { name: 'Midnight Slate', primary: '#3b82f6', secondary: '#8b5cf6' },
];

const FONTS = ['Inter', 'Outfit', 'Roboto', 'Poppins', 'Playfair Display'];

export default function WebsitePage({ merchant }: { merchant: Merchant }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'design' | 'sections' | 'products' | 'settings' | 'gallery'>('overview');
  
  const cachedData = useMemo(() => websiteCache.get(merchant.id), [merchant.id]);
  const [loading, setLoading] = useState(!cachedData);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [website, setWebsite] = useState<WebsiteConfig | null>(() => cachedData?.website || null);
  const [gallery, setGallery] = useState<GalleryItem[]>(() => cachedData?.gallery || []);

  // Inventory sync state
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  // Image uploads
  const [uploadingHero, setUploadingHero] = useState(false);
  const [uploadingAbout, setUploadingAbout] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [galleryCaption, setGalleryCaption] = useState('');

  // Load Website Config
  const loadWebsite = async () => {
    try {
      if (!cachedData) setLoading(true);
      const data = await websiteService.getWebsiteConfig();
      setWebsite(data.website);
      setGallery(data.gallery || []);
    } catch (err: any) {
      console.error('Failed to load website config:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load Inventory for Products tab
  const loadInventoryData = async () => {
    if (!merchant?.id) return;
    try {
      setLoadingInventory(true);
      const items = await fetchMerchantInventory(merchant.id);
      setInventory(items);
    } catch (err) {
      console.error('Failed to load merchant inventory:', err);
    } finally {
      setLoadingInventory(false);
    }
  };

  useEffect(() => {
    loadWebsite();
    loadInventoryData();
  }, [merchant?.id]);

  // Save Website patch
  const handleSave = async (patch: Partial<WebsiteConfig>) => {
    if (!website) return;
    try {
      setSaving(true);
      const res = await websiteService.updateWebsiteConfig(patch);
      setWebsite(res.website);
      if (res.gallery) setGallery(res.gallery);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  // Toggle Publish Status
  const handleTogglePublish = async () => {
    if (!website) return;
    try {
      setPublishing(true);
      if (website.status === 'published') {
        const res = await websiteService.unpublishWebsite();
        setWebsite(res.website);
      } else {
        const res = await websiteService.publishWebsite();
        setWebsite(res.website);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update publish state.');
    } finally {
      setPublishing(false);
    }
  };

  // Image Upload helper
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, imageType: 'hero' | 'about' | 'gallery') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be less than 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        if (imageType === 'hero') setUploadingHero(true);
        if (imageType === 'about') setUploadingAbout(true);
        if (imageType === 'gallery') setUploadingGallery(true);

        const res = await websiteService.uploadWebsiteImage(imageType, dataUrl, galleryCaption);
        if (imageType === 'hero') {
          setWebsite((prev) => prev ? { ...prev, hero_image_url: res.imageUrl } : null);
        } else if (imageType === 'about') {
          setWebsite((prev) => prev ? { ...prev, about_image_url: res.imageUrl } : null);
        } else if (imageType === 'gallery') {
          const updatedGal = await websiteService.getGalleryImages();
          setGallery(updatedGal);
          setGalleryCaption('');
        }
      } catch (err: any) {
        toast.error(err.message || 'Failed to upload image.');
      } finally {
        setUploadingHero(false);
        setUploadingAbout(false);
        setUploadingGallery(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Product visibility toggle in existing merchant_inventory. Field names
  // (isPublished/featured) match InventoryItem's camelCase type exactly
  // (see inventoryService.ts) — inventoryItemToBackendPayload() converts
  // them to the is_published/featured snake_case columns the backend
  // expects, so no `as any` cast/bypass is needed here.
  const handleToggleProductWebsite = async (item: InventoryItem, isPublished: boolean) => {
    try {
      setInventory((prev) => prev.map((p) => p.id === item.id ? { ...p, isPublished } : p));
      await updateInventoryItem(merchant.id, item.id, { isPublished });
    } catch (err) {
      console.error('Failed to update product visibility:', err);
    }
  };

  // Product featured toggle
  const handleToggleProductFeatured = async (item: InventoryItem, isFeatured: boolean) => {
    try {
      setInventory((prev) => prev.map((p) => p.id === item.id ? { ...p, featured: isFeatured } : p));
      await updateInventoryItem(merchant.id, item.id, { featured: isFeatured });
    } catch (err) {
      console.error('Failed to update product featured status:', err);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-[var(--color-mist-2)]">
        <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-[var(--color-aqua)]" />
        Loading Website Builder...
      </div>
    );
  }

  if (!website) {
    return (
      <div className="py-12 text-center text-[var(--color-mist-2)]">
        Failed to load website configuration. Please refresh.
      </div>
    );
  }

  const liveStoreUrl = `${window.location.origin}/store/${website.slug}`;

  // Priority: 1. Trade Name -> 2. Shop/Business Name -> 3. Brand Name -> 4. Legal Name -> 5. Website Slug
  const websiteDisplayName =
    (merchant.tradeName || '').trim() ||
    (merchant.shopName || '').trim() ||
    (merchant.brandName || '').trim() ||
    (merchant.legalName || '').trim() ||
    website.slug;

  const formatPublishedDate = (timestamp?: number | null) => {
    if (!timestamp) return '23/08/2026';
    const d = new Date(timestamp);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="depth-card rounded-2xl p-6 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-[var(--font-display)] text-2xl font-bold">Website Builder</h1>
              {website.status === 'published' ? (
                <Badge tone="emerald"><CheckCircle2 size={12} className="inline mr-1" /> Live & Published</Badge>
              ) : (
                <Badge tone="mist">Draft Mode</Badge>
              )}
            </div>

            {/* Merchant Identity & Status Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 pt-1">
              <div>
                <span className="text-[11px] font-semibold text-[var(--color-mist-2)] uppercase tracking-wider block">Website</span>
                <span className="text-sm font-bold text-[var(--color-ivory)]">{websiteDisplayName}</span>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-[var(--color-mist-2)] uppercase tracking-wider block">Status</span>
                <span className="text-sm font-semibold capitalize flex items-center gap-1.5 text-emerald-400">
                  <span className={`w-2 h-2 rounded-full ${website.status === 'published' ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                  {website.status === 'published' ? 'Published' : 'Draft'}
                </span>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-[var(--color-mist-2)] uppercase tracking-wider block">Published on</span>
                <span className="text-sm font-mono text-[var(--color-mist)]">
                  {website.published_at ? formatPublishedDate(website.published_at) : (website.updated_at ? formatPublishedDate(website.updated_at) : '23/08/2026')}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons: [Open Website] [Copy Link] [Unpublish Website] */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 pt-2 lg:pt-0">
            <a
              href={liveStoreUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 rounded-xl text-xs font-semibold depth-soft hover:text-[var(--color-aqua)] transition flex items-center gap-1.5"
            >
              <ExternalLink size={14} /> Open Website
            </a>

            <button
              onClick={() => {
                navigator.clipboard.writeText(liveStoreUrl);
                toast.success('Website link copied to clipboard!');
              }}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold depth-soft hover:text-[var(--color-aqua)] transition flex items-center gap-1.5"
            >
              <Share2 size={14} /> Copy Link
            </button>

            <button
              onClick={handleTogglePublish}
              disabled={publishing}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                website.status === 'published'
                  ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                  : 'bg-[var(--color-emerald)] text-black hover:opacity-90'
              }`}
            >
              {publishing ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : website.status === 'published' ? (
                'Unpublish Website'
              ) : (
                <>
                  <Sparkles size={14} /> Publish Website
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-t border-[var(--color-line)] mt-6 pt-4 overflow-x-auto no-scrollbar">
          {[
            { id: 'overview', label: 'Overview', icon: Globe },
            { id: 'design', label: 'Design & Theme', icon: Paintbrush },
            { id: 'sections', label: 'Sections & Pages', icon: Layers },
            { id: 'products', label: 'Products Catalog', icon: Package },
            { id: 'settings', label: 'Settings & SEO', icon: Settings },
            { id: 'gallery', label: 'Gallery', icon: ImageIcon },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition flex items-center gap-2 shrink-0 ${
                activeTab === tab.id
                  ? 'bg-[var(--color-aqua)]/10 text-[var(--color-aqua)] border border-[var(--color-aqua)]/20 font-semibold'
                  : 'text-[var(--color-mist)] hover:text-[var(--color-ivory)] hover:bg-[rgba(255,255,255,0.03)]'
              }`}
            >
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Tab Content */}
      <AnimatePresence mode="wait">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="grid md:grid-cols-3 gap-5">
              <div className="depth-card rounded-2xl p-5">
                <div className="text-xs text-[var(--color-mist-2)] uppercase font-semibold">Website Status</div>
                <div className="font-[var(--font-display)] text-xl font-bold mt-2 capitalize">{website.status}</div>
                <div className="text-xs text-[var(--color-mist-2)] mt-1">
                  {website.published_at ? `Published on ${formatPublishedDate(website.published_at)}` : 'Not published yet'}
                </div>
              </div>

              <div className="depth-card rounded-2xl p-5">
                <div className="text-xs text-[var(--color-mist-2)] uppercase font-semibold">Active Products on Store</div>
                <div className="font-[var(--font-display)] text-xl font-bold mt-2 aqua-text">
                  {inventory.filter((p) => p.isPublished !== false).length} / {inventory.length}
                </div>
                <div className="text-xs text-[var(--color-mist-2)] mt-1">Directly synced from Inventory</div>
              </div>

              <div className="depth-card rounded-2xl p-5">
                <div className="text-xs text-[var(--color-mist-2)] uppercase font-semibold">Theme & Style</div>
                <div className="font-[var(--font-display)] text-xl font-bold mt-2 capitalize">{website.theme_style || 'Modern'}</div>
                <div className="text-xs text-[var(--color-mist-2)] mt-1">Primary: {website.theme_primary_color}</div>
              </div>
            </div>

            {/* Quick Action Banner */}
            <div className="depth-card rounded-2xl p-6 bg-gradient-to-r from-indigo-900/20 to-teal-900/20 border border-indigo-500/20 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-[var(--font-display)] font-semibold text-lg">Your Public Store is Ready</h3>
                <p className="text-xs text-[var(--color-mist)] max-w-xl">
                  Customers can visit your store URL, browse your inventory products, and view business contact details.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(liveStoreUrl);
                    toast.success('Store URL copied to clipboard!');
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold depth-soft hover:text-[var(--color-aqua)] transition flex items-center gap-1.5"
                >
                  <Share2 size={14} /> Copy Link
                </button>
                <a
                  href={`/store/${website.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[var(--color-aqua)] text-black hover:opacity-90 transition flex items-center gap-1.5"
                >
                  <ExternalLink size={14} /> Open Store
                </a>
              </div>
            </div>
          </motion.div>
        )}

        {/* DESIGN TAB */}
        {activeTab === 'design' && (
          <motion.div key="design" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="depth-card rounded-2xl p-6 space-y-6">
              <h3 className="font-[var(--font-display)] font-semibold text-lg flex items-center gap-2">
                <Paintbrush size={18} className="text-[var(--color-aqua)]" /> Theme & Color Palette
              </h3>

              {/* Preset Palettes */}
              <div>
                <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-3">Color Presets</label>
                <div className="grid sm:grid-cols-5 gap-3">
                  {PRESET_PALETTES.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => handleSave({ theme_primary_color: preset.primary, theme_secondary_color: preset.secondary })}
                      className="depth-soft rounded-xl p-3 text-left hover:border-[var(--color-aqua)]/50 transition border border-transparent"
                    >
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="w-4 h-4 rounded-full" style={{ backgroundColor: preset.primary }} />
                        <span className="w-4 h-4 rounded-full" style={{ backgroundColor: preset.secondary }} />
                      </div>
                      <div className="text-xs font-medium truncate">{preset.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Colors */}
              <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-[var(--color-line)]">
                <div>
                  <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">Primary Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={website.theme_primary_color || '#4F46E5'}
                      onChange={(e) => setWebsite({ ...website, theme_primary_color: e.target.value })}
                      className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={website.theme_primary_color || '#4F46E5'}
                      onChange={(e) => setWebsite({ ...website, theme_primary_color: e.target.value })}
                      className="flex-1 px-3 py-2 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">Secondary Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={website.theme_secondary_color || '#10B981'}
                      onChange={(e) => setWebsite({ ...website, theme_secondary_color: e.target.value })}
                      className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={website.theme_secondary_color || '#10B981'}
                      onChange={(e) => setWebsite({ ...website, theme_secondary_color: e.target.value })}
                      className="flex-1 px-3 py-2 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Typography & Style */}
              <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-[var(--color-line)]">
                <div>
                  <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">Font Family</label>
                  <select
                    value={website.theme_font || 'Inter'}
                    onChange={(e) => setWebsite({ ...website, theme_font: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm"
                  >
                    {FONTS.map((font) => (
                      <option key={font} value={font}>{font}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">Layout Style</label>
                  <select
                    value={website.theme_style || 'modern'}
                    onChange={(e) => setWebsite({ ...website, theme_style: e.target.value as any })}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm"
                  >
                    <option value="modern">Modern (Dark glassmorphism)</option>
                    <option value="minimal">Minimal (Clean layout)</option>
                    <option value="classic">Classic (Traditional store)</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 text-right">
                <button
                  onClick={() => handleSave({
                    theme_primary_color: website.theme_primary_color,
                    theme_secondary_color: website.theme_secondary_color,
                    theme_font: website.theme_font,
                    theme_style: website.theme_style
                  })}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[var(--color-aqua)] text-black hover:opacity-90 transition flex items-center gap-2 ml-auto"
                >
                  <Save size={14} /> {saving ? 'Saving...' : 'Save Design'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* SECTIONS & PAGES TAB */}
        {activeTab === 'sections' && (
          <motion.div key="sections" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            {/* Hero Section Card */}
            <div className="depth-card rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-[var(--font-display)] font-semibold text-lg flex items-center gap-2">
                  <Sparkles size={18} className="text-[var(--color-gold)]" /> Hero Section
                </h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={website.hero_enabled}
                    onChange={(e) => setWebsite({ ...website, hero_enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-emerald)]"></div>
                </label>
              </div>

              {website.hero_enabled && (
                <div className="space-y-4 pt-3 border-t border-[var(--color-line)]">
                  <div>
                    <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">Hero Title</label>
                    <input
                      type="text"
                      value={website.hero_title || ''}
                      onChange={(e) => setWebsite({ ...website, hero_title: e.target.value })}
                      placeholder="Welcome to our store"
                      className="w-full px-3 py-2.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">Hero Subtitle</label>
                    <input
                      type="text"
                      value={website.hero_subtitle || ''}
                      onChange={(e) => setWebsite({ ...website, hero_subtitle: e.target.value })}
                      placeholder="Best quality products delivered to you"
                      className="w-full px-3 py-2.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">Hero Banner Image</label>
                    <div className="flex items-center gap-4">
                      {website.hero_image_url && (
                        <img src={website.hero_image_url} alt="Hero" className="w-20 h-16 object-cover rounded-xl border border-[var(--color-line)]" />
                      )}
                      <label className="px-4 py-2 rounded-xl text-xs font-semibold depth-soft hover:text-[var(--color-aqua)] cursor-pointer flex items-center gap-2">
                        <Upload size={14} /> {uploadingHero ? 'Uploading...' : 'Upload Image'}
                        <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'hero')} className="hidden" />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* About Section Card */}
            <div className="depth-card rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-[var(--font-display)] font-semibold text-lg flex items-center gap-2">
                  <ShieldCheck size={18} className="text-[var(--color-aqua)]" /> About Us Section
                </h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={website.about_enabled}
                    onChange={(e) => setWebsite({ ...website, about_enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-emerald)]"></div>
                </label>
              </div>

              {website.about_enabled && (
                <div className="space-y-4 pt-3 border-t border-[var(--color-line)]">
                  <div>
                    <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">Section Title</label>
                    <input
                      type="text"
                      value={website.about_title || 'About Us'}
                      onChange={(e) => setWebsite({ ...website, about_title: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">Description</label>
                    <textarea
                      rows={3}
                      value={website.about_description || ''}
                      onChange={(e) => setWebsite({ ...website, about_description: e.target.value })}
                      placeholder="Tell customers about your business, history, and values..."
                      className="w-full px-3 py-2.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Contact Section Settings */}
            <div className="depth-card rounded-2xl p-6 space-y-4">
              <h3 className="font-[var(--font-display)] font-semibold text-lg flex items-center gap-2">
                <MapPin size={18} className="text-[var(--color-rose)]" /> Contact & Location Options
              </h3>

              <div className="grid sm:grid-cols-2 gap-4 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={website.contact_show_phone}
                    onChange={(e) => setWebsite({ ...website, contact_show_phone: e.target.checked })}
                    className="rounded bg-gray-800"
                  />
                  <span>Show Phone ({merchant.phone})</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={website.contact_show_email}
                    onChange={(e) => setWebsite({ ...website, contact_show_email: e.target.checked })}
                    className="rounded bg-gray-800"
                  />
                  <span>Show Email ({merchant.email})</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={website.contact_show_address}
                    onChange={(e) => setWebsite({ ...website, contact_show_address: e.target.checked })}
                    className="rounded bg-gray-800"
                  />
                  <span>Show Address ({merchant.address})</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={website.contact_show_map}
                    onChange={(e) => setWebsite({ ...website, contact_show_map: e.target.checked })}
                    className="rounded bg-gray-800"
                  />
                  <span>Show Map / Coordinates</span>
                </label>
              </div>
            </div>

            <div className="text-right">
              <button
                onClick={() => handleSave(website)}
                disabled={saving}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[var(--color-aqua)] text-black hover:opacity-90 transition flex items-center gap-2 ml-auto"
              >
                <Save size={14} /> {saving ? 'Saving...' : 'Save Section Settings'}
              </button>
            </div>
          </motion.div>
        )}

        {/* PRODUCTS CATALOG TAB */}
        {activeTab === 'products' && (
          <motion.div key="products" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="depth-card rounded-2xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-[var(--font-display)] font-semibold text-lg flex items-center gap-2">
                    <Package size={18} className="text-[var(--color-aqua)]" /> Website Products Visibility
                  </h3>
                  <p className="text-xs text-[var(--color-mist-2)] mt-0.5">
                    Directly uses your existing Inventory data as source of truth. Toggle which products show on your public website.
                  </p>
                </div>

                <div className="relative w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-mist-2)]" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search products..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-xs"
                  />
                </div>
              </div>

              {loadingInventory ? (
                <div className="py-12 text-center text-xs text-[var(--color-mist-2)]">Loading products catalog...</div>
              ) : inventory.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--color-mist-2)]">
                  No products in inventory yet. Add products in the Inventory module.
                </div>
              ) : (
                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--color-line)] text-[var(--color-mist-2)] uppercase">
                        <th className="py-2.5 px-3">Product</th>
                        <th className="py-2.5 px-3">HSN</th>
                        <th className="py-2.5 px-3">Price</th>
                        <th className="py-2.5 px-3">Stock</th>
                        <th className="py-2.5 px-3 text-center">Featured</th>
                        <th className="py-2.5 px-3 text-right">Show on Website</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory
                        .filter((item) => item.name.toLowerCase().includes(productSearch.toLowerCase()))
                        .map((item) => (
                          <tr key={item.id} className="border-b border-[var(--color-line)]/50 hover:bg-white/5 transition">
                            <td className="py-3 px-3 font-medium flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-white/5 grid place-items-center text-[10px] shrink-0">📦</div>
                              <div>
                                <div>{item.name}</div>
                                {item.description && <div className="text-[10px] text-[var(--color-mist-2)] truncate max-w-xs">{item.description}</div>}
                              </div>
                            </td>
                            <td className="py-3 px-3 font-mono text-[var(--color-mist-2)]">{item.hsn || '—'}</td>
                            <td className="py-3 px-3 font-bold text-[var(--color-aqua)]">₹{item.sellingPrice}</td>
                            <td className="py-3 px-3">{item.stockQuantity} {item.unit || 'pcs'}</td>
                            <td className="py-3 px-3 text-center">
                              <button
                                onClick={() => handleToggleProductFeatured(item, !item.featured)}
                                className={`px-2 py-1 rounded text-[10px] font-semibold transition ${
                                  item.featured ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-gray-500 hover:text-gray-300'
                                }`}
                              >
                                {item.featured ? '★ Featured' : '☆ Normal'}
                              </button>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={item.isPublished !== false}
                                  onChange={(e) => handleToggleProductWebsite(item, e.target.checked)}
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--color-emerald)]"></div>
                              </label>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* SETTINGS & SEO TAB */}
        {activeTab === 'settings' && (
          <motion.div key="settings" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="depth-card rounded-2xl p-6 space-y-6">
              <h3 className="font-[var(--font-display)] font-semibold text-lg flex items-center gap-2">
                <Globe size={18} className="text-[var(--color-aqua)]" /> Store URL & SEO Settings
              </h3>

              {/* Slug */}
              <div>
                <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">Website URL Slug</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--color-mist-2)] font-mono">{window.location.origin}/store/</span>
                  <input
                    type="text"
                    value={website.slug}
                    onChange={(e) => setWebsite({ ...website, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    className="flex-1 px-3 py-2 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm font-mono"
                  />
                </div>
              </div>

              {/* SEO Title */}
              <div>
                <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">Page SEO Title</label>
                <input
                  type="text"
                  value={website.seo_title || ''}
                  onChange={(e) => setWebsite({ ...website, seo_title: e.target.value })}
                  placeholder="Store Title for Search Engines"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm"
                />
              </div>

              {/* SEO Description */}
              <div>
                <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">Meta Description</label>
                <textarea
                  rows={2}
                  value={website.seo_description || ''}
                  onChange={(e) => setWebsite({ ...website, seo_description: e.target.value })}
                  placeholder="Short description for Google search results..."
                  className="w-full px-3 py-2.5 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-sm"
                />
              </div>

              {/* Social Links */}
              <div className="pt-4 border-t border-[var(--color-line)] space-y-4">
                <h4 className="font-semibold text-sm">Social Media Links</h4>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">WhatsApp Number</label>
                    <input
                      type="text"
                      value={website.footer_whatsapp || ''}
                      onChange={(e) => setWebsite({ ...website, footer_whatsapp: e.target.value })}
                      placeholder="+919876543210"
                      className="w-full px-3 py-2 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">Instagram Profile</label>
                    <input
                      type="text"
                      value={website.footer_instagram || ''}
                      onChange={(e) => setWebsite({ ...website, footer_instagram: e.target.value })}
                      placeholder="https://instagram.com/yourshop"
                      className="w-full px-3 py-2 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Custom Website Domain */}
              <div className="pt-4 border-t border-[var(--color-line)] space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <Globe size={16} className="text-cyan-400" /> Custom Domain / Custom Website Link
                    </h4>
                    <p className="text-xs text-[var(--color-mist-2)] mt-0.5">
                      Connect your own custom domain name (e.g. <span className="text-white font-mono">www.mybrandstore.com</span>) to point directly to your online store.
                    </p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-[var(--color-mist-2)] block mb-1">Custom Domain URL</label>
                    <input
                      type="text"
                      value={website.custom_domain || ''}
                      onChange={(e) => setWebsite({ ...website, custom_domain: e.target.value.toLowerCase().trim() })}
                      placeholder="e.g. www.mybrandstore.com or store.mycompany.in"
                      className="w-full px-3 py-2.5 rounded-xl bg-[#0c1322] border border-cyan-500/30 text-sm font-mono text-cyan-300 focus:border-cyan-400 outline-none"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-blue-300">
                    <Sparkles size={13} /> DNS Configuration Guide:
                  </div>
                  <p>In your Domain Registrar (GoDaddy, Namecheap, Hostinger), add a <strong className="text-white">CNAME Record</strong>:</p>
                  <div className="font-mono text-[11px] bg-slate-900/80 p-2 rounded border border-white/10 text-cyan-300">
                    Host: <span className="text-emerald-400">@</span> (or <span className="text-emerald-400">www</span>) &nbsp;|&nbsp; Target: <span className="text-emerald-400">cname.aklogic.ai</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 text-right">
                <button
                  onClick={() => handleSave(website)}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[var(--color-aqua)] text-black hover:opacity-90 transition flex items-center gap-2 ml-auto"
                >
                  <Save size={14} /> {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* GALLERY TAB */}
        {activeTab === 'gallery' && (
          <motion.div key="gallery" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="depth-card rounded-2xl p-6 space-y-4">
              <h3 className="font-[var(--font-display)] font-semibold text-lg flex items-center gap-2">
                <ImageIcon size={18} className="text-[var(--color-aqua)]" /> Store Gallery Photos
              </h3>

              {/* Upload Box */}
              <div className="depth-soft rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4">
                <input
                  type="text"
                  value={galleryCaption}
                  onChange={(e) => setGalleryCaption(e.target.value)}
                  placeholder="Photo caption (optional)..."
                  className="flex-1 px-3 py-2 rounded-xl bg-[#0c1322] border border-[var(--color-line)] text-xs w-full"
                />

                <label className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--color-aqua)] text-black hover:opacity-90 cursor-pointer flex items-center gap-2 shrink-0">
                  <Upload size={14} /> {uploadingGallery ? 'Uploading...' : 'Add Gallery Photo'}
                  <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'gallery')} className="hidden" />
                </label>
              </div>

              {/* Photos Grid */}
              <div className="grid sm:grid-cols-3 md:grid-cols-4 gap-4 pt-4">
                {gallery.map((img) => (
                  <div key={img.id} className="relative group rounded-xl overflow-hidden depth-soft border border-[var(--color-line)]">
                    <img src={img.image_url} alt={img.caption} className="w-full h-32 object-cover" />
                    {img.caption && <div className="p-2 text-[10px] text-[var(--color-mist)] truncate">{img.caption}</div>}
                    <button
                      onClick={async () => {
                        if (confirm('Delete photo from gallery?')) {
                          await websiteService.deleteGalleryImage(img.id);
                          setGallery((prev) => prev.filter((g) => g.id !== img.id));
                        }
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-600/80 text-white opacity-0 group-hover:opacity-100 transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

                {gallery.length === 0 && (
                  <div className="col-span-full py-12 text-center text-xs text-[var(--color-mist-2)]">
                    No gallery photos added yet. Upload photos to show off your shop or products.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
