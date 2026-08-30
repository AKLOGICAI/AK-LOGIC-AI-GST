import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Globe, Phone, Mail, MapPin, ShoppingBag, ArrowRight, CheckCircle2,
  X, Search, MessageSquare, Send, Loader2, PackageSearch,
  ShieldCheck, Zap, Star, Truck, Tag, ThumbsUp, ChevronRight, Eye, ChevronUp
} from 'lucide-react';
import { publicStoreService, type PublicStoreData, type PublicProduct } from '../../lib/publicStoreService';
import StoreMeta from './StoreMeta';

// ── Skeleton Loader Card for Spatial Stability ────────────────────────────────
function ProductCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden flex flex-col animate-pulse">
      <div className="h-44 bg-slate-100" />
      <div className="p-3.5 space-y-2.5">
        <div className="h-3 w-1/4 bg-slate-100 rounded-full" />
        <div className="h-4 w-3/4 bg-slate-100 rounded-full" />
        <div className="h-3 w-full bg-slate-100 rounded-full" />
        <div className="pt-2 flex justify-between items-center">
          <div className="h-5 w-16 bg-slate-100 rounded-md" />
          <div className="h-7 w-20 bg-slate-100 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

interface PublicStoreProps {
  customDomainHost?: string;
}

export default function PublicStore({ customDomainHost }: PublicStoreProps = {}) {
  const { slug: paramSlug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<PublicStoreData | null>(null);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [gallery, setGallery] = useState<any[]>([]);

  // Resolve effective slug or custom domain hostname
  const effectiveSlug = useMemo(() => {
    if (paramSlug) return paramSlug.trim().toLowerCase();
    if (customDomainHost) return customDomainHost.trim().toLowerCase();
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      const isPlatformHost = 
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === 'gst.ak-logicai.in' ||
        host === 'ak-logicai.in' ||
        host === 'www.ak-logicai.in' ||
        host.endsWith('.vercel.app') ||
        host.endsWith('.onrender.com');
      if (!isPlatformHost) {
        return host;
      }
    }
    return '';
  }, [paramSlug, customDomainHost]);

  // Alias for backward compatibility with existing internal handlers
  const slug = effectiveSlug;

  // Search & Filtering State
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'featured' | 'price_low' | 'price_high' | 'bestseller'>('featured');
  const [inStockOnly, setInStockOnly] = useState(false);

  // Cart & Modals
  const [cart, setCart] = useState<{ product: PublicProduct; qty: number }[]>([]);
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<PublicProduct | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Direct Order to Merchant State
  const [showDirectOrderForm, setShowDirectOrderForm] = useState(false);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderSuccessMsg, setOrderSuccessMsg] = useState('');

  useEffect(() => {
    if (!effectiveSlug) {
      setLoading(false);
      setError('Please provide a valid store slug.');
      return;
    }
    const fetchStore = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await publicStoreService.getPublicStore(effectiveSlug);
        setStore(data.store);
        setGallery(data.gallery || []);

        const prodData = await publicStoreService.getPublicStoreProducts(effectiveSlug);
        setProducts(prodData || []);
      } catch (err: any) {
        setError(err.message || 'Website not found or is currently offline.');
      } finally {
        setLoading(false);
      }
    };
    fetchStore();
  }, [effectiveSlug]);

  // Extract unique categories from products
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.hsn_code) cats.add(`HSN ${p.hsn_code}`);
    });
    return Array.from(cats);
  }, [products]);

  // Filtered and Sorted Products
  const processedProducts = useMemo(() => {
    let list = products.filter((p) => {
      const matchSearch =
        p.product_name.toLowerCase().includes(search.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(search.toLowerCase())) ||
        (p.hsn_code && p.hsn_code.includes(search));

      const matchCat =
        selectedCategory === 'all' ||
        (selectedCategory === 'deals' && ((p as any).is_bestseller || p.featured)) ||
        (selectedCategory.startsWith('HSN') && p.hsn_code === selectedCategory.replace('HSN ', ''));

      const matchStock = !inStockOnly || p.stock_quantity > 0;

      return matchSearch && matchCat && matchStock;
    });

    if (sortBy === 'price_low') {
      list.sort((a, b) => a.selling_price - b.selling_price);
    } else if (sortBy === 'price_high') {
      list.sort((a, b) => b.selling_price - a.selling_price);
    } else if (sortBy === 'bestseller') {
      list.sort((a, b) => ((b as any).total_sold || 0) - ((a as any).total_sold || 0));
    } else {
      list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }

    return list;
  }, [products, search, selectedCategory, inStockOnly, sortBy]);

  // Bestsellers / Deals of the day sample
  const dealProducts = useMemo(() => {
    return products.filter((p) => p.featured || (p as any).is_bestseller).slice(0, 6);
  }, [products]);

  // Cart operations
  const addToCart = (product: PublicProduct, e?: React.MouseEvent, quantity: number = 1) => {
    if (e) e.stopPropagation();
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, qty: item.qty + quantity } : item
        );
      }
      return [...prev, { product, qty: quantity }];
    });
    toast.success(`Added ${product.product_name} to cart`);
  };

  const updateCartQty = (productId: string, delta: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCart((prev) =>
      prev
        .map((item) => (item.product.id === productId ? { ...item, qty: item.qty + delta } : item))
        .filter((item) => item.qty > 0)
    );
  };

  const totalCartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const totalCartPrice = cart.reduce((sum, item) => sum + item.product.selling_price * item.qty, 0);
  const totalEstimatedTax = cart.reduce(
    (sum, item) => sum + ((item.product.selling_price * (item.product.gst_rate || 18)) / 100) * item.qty,
    0
  );

  // Direct Order
  const handleSendDirectOrder = async () => {
    if (!slug || cart.length === 0 || submittingOrder) return;
    if (!custName.trim() || !custPhone.trim()) {
      toast.error('Please enter your name and phone number.');
      return;
    }

    setSubmittingOrder(true);
    setOrderSuccessMsg('');

    try {
      const itemsPayload = cart.map((c) => ({
        description: c.product.product_name,
        qty: c.qty,
        rate: c.product.selling_price,
        gstRate: c.product.gst_rate || 18,
      }));

      const res = await publicStoreService.placeStoreOrder(slug, {
        customerName: custName.trim(),
        customerPhone: custPhone.trim(),
        items: itemsPayload,
        notes: `Address: ${custAddress.trim() || 'Store Pickup'} | Placed via Storefront (${slug})`,
      });

      if (res.ok) {
        setOrderSuccessMsg(`Order placed successfully with ${store?.shopName}! The merchant will confirm shortly.`);
        setCart([]);
        setShowDirectOrderForm(false);
        setShowCartDrawer(false);
        toast.success('Order delivered to merchant dashboard!');
      }
    } catch (e: any) {
      toast.error(e.message || 'Error placing order directly.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  // WhatsApp formatted link
  const whatsappHref = store?.phone
    ? `https://wa.me/${store.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
        `🛍️ *NEW STORE ORDER — ${store.shopName}*\n\n` +
          cart
            .map(
              (c, i) =>
                `${i + 1}. *${c.product.product_name}*\n   Qty: ${c.qty} × ₹${c.product.selling_price} = ₹${c.product.selling_price * c.qty}`
            )
            .join('\n\n') +
          `\n\n━━━━━━━━━━━━━━━━━━━━\n` +
          `💰 *Total Payable: ₹${totalCartPrice}*\n` +
          `📍 *Customer:* ${custName || 'Online Buyer'} ${custPhone ? `(${custPhone})` : ''}\n` +
          (custAddress ? `🏠 *Address:* ${custAddress}\n` : '') +
          `\nPlease send invoice & delivery confirmation.`
      )}`
    : null;

  const primaryColor = store?.theme_primary_color || '#2874F0'; // Default Flipkart Blue
  const secondaryColor = store?.theme_secondary_color || '#FB641B'; // Default Flipkart Orange

  // ── Loading Skeleton ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans">
        <div className="h-14 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between">
          <div className="w-28 h-6 bg-slate-200 animate-pulse rounded-md" />
          <div className="w-60 h-8 bg-slate-200 animate-pulse rounded-lg" />
          <div className="w-20 h-7 bg-slate-200 animate-pulse rounded-md" />
        </div>
        <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          <div className="h-44 bg-slate-200 animate-pulse rounded-2xl" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        </main>
      </div>
    );
  }

  // ── Offline / Error state ───────────────────────────────────────────────────
  if (error || !store) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 mb-4 shadow-xs">
          <Globe size={28} />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Storefront Offline</h1>
        <p className="text-xs text-slate-500 max-w-md mb-6">{error || 'This store is temporarily unavailable.'}</p>
        <Link to="/" className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-medium text-xs hover:bg-slate-800 shadow-xs transition">
          Return to Platform Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F1F3F6] text-slate-900 font-sans selection:bg-indigo-600 selection:text-white pb-16">
      <StoreMeta store={store} products={products} slug={slug || ''} />

      {/* ── 1. TOP ANNOUNCEMENT RIBBON ───────────────────────────────────────── */}
      <div
        className="text-white text-[11px] font-semibold py-1.5 px-4 text-center tracking-wide flex items-center justify-center gap-1.5 shadow-inner"
        style={{ backgroundColor: primaryColor }}
      >
        <Zap size={12} className="text-amber-300 fill-amber-300 animate-bounce" />
        <span>
          {store.hero_subtitle || '⚡ Official Storefront | 100% Genuine Products | GST ITC Compliant Invoices'}
        </span>
      </div>

      {/* ── 2. COMPACT SUPER HEADER (Clean Proportional Logo) ───────────────── */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200/90 shadow-2xs backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-3 sm:gap-6">
          {/* Logo & Store Branding — Sleek & Compact */}
          <div className="flex items-center gap-2.5 shrink-0">
            {store.logoUrl ? (
              <img
                src={store.logoUrl}
                alt={store.shopName}
                className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-lg bg-white border border-slate-200 p-0.5 shadow-2xs shrink-0"
              />
            ) : (
              <div
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg grid place-items-center font-bold text-sm text-white shadow-2xs shrink-0"
                style={{ backgroundColor: primaryColor }}
              >
                {store.shopName.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <h1 className="font-extrabold text-sm sm:text-base leading-none truncate text-slate-900">
                  {store.tradeName || store.shopName}
                </h1>
                <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  <ShieldCheck size={9} className="text-amber-700 fill-amber-500" /> Assured
                </span>
              </div>
              <div className="text-[10px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                <MapPin size={10} className="text-rose-500 shrink-0" />
                <span>{store.city ? `${store.city}, ${store.state}` : store.state}</span>
              </div>
            </div>
          </div>

          {/* Omnipresent Search Bar */}
          <div className="hidden md:flex flex-1 max-w-lg relative">
            <div className="w-full flex items-center rounded-lg bg-slate-100 border border-slate-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all overflow-hidden">
              <div className="px-2.5 py-1.5 text-slate-400">
                <Search size={15} />
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products by name, description, HSN..."
                className="w-full py-1.5 text-xs bg-transparent text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')} className="p-1.5 text-slate-400 hover:text-slate-600">
                  <X size={13} />
                </button>
              )}
              <button
                className="px-3.5 py-1.5 text-xs font-bold text-white shrink-0 transition hover:opacity-90"
                style={{ backgroundColor: primaryColor }}
              >
                Search
              </button>
            </div>
          </div>

          {/* Header Quick Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {store.phone && (
              <a
                href={`tel:${store.phone}`}
                className="hidden lg:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition"
              >
                <Phone size={12} className="text-emerald-600" />
                <span>Call Store</span>
              </a>
            )}

            {/* Cart Button */}
            <button
              onClick={() => setShowCartDrawer(true)}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white font-bold text-xs sm:text-sm transition-all active:scale-95 shadow-xs"
              style={{ backgroundColor: secondaryColor }}
            >
              <ShoppingBag size={15} />
              <span className="hidden sm:inline">Cart</span>
              {totalCartCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-white text-slate-900 text-[10px] font-black grid place-items-center shadow-2xs">
                  {totalCartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Search Bar */}
        <div className="px-3 pb-2 md:hidden">
          <div className="w-full flex items-center rounded-lg bg-slate-100 border border-slate-300 px-2.5 py-1.5">
            <Search size={14} className="text-slate-400 shrink-0 mr-1.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products in this store..."
              className="w-full text-xs bg-transparent text-slate-800 placeholder:text-slate-400 focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="p-0.5 text-slate-400">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* ── 3. HORIZONTAL CATEGORY STRIP ─────────────────────────────────── */}
        <div className="border-t border-slate-100 bg-white px-3 sm:px-6 py-1.5 overflow-x-auto no-scrollbar flex items-center gap-1.5 text-xs font-medium">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 rounded-full whitespace-nowrap text-xs transition-all ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white font-bold shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Products ({products.length})
          </button>

          {dealProducts.length > 0 && (
            <button
              onClick={() => setSelectedCategory('deals')}
              className={`px-3 py-1 rounded-full whitespace-nowrap flex items-center gap-1 text-xs transition-all ${
                selectedCategory === 'deals'
                  ? 'bg-amber-500 text-white font-bold shadow-2xs'
                  : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <Zap size={11} className="fill-current" /> Deals & Bestsellers
            </button>
          )}

          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full whitespace-nowrap text-xs transition-all ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white font-bold shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      {/* ── 4. SUCCESS ORDER BANNER ─────────────────────────────────────────── */}
      <AnimatePresence>
        {orderSuccessMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="max-w-7xl mx-auto px-4 sm:px-6 pt-3"
          >
            <div className="p-3.5 rounded-xl bg-emerald-500 text-white text-xs sm:text-sm font-bold flex items-center justify-between shadow-xs">
              <span className="flex items-center gap-2">
                <CheckCircle2 size={16} /> {orderSuccessMsg}
              </span>
              <button onClick={() => setOrderSuccessMsg('')} className="text-white/80 hover:text-white underline text-xs">
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 5. MAIN CONTENT ─────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-5">
        {/* HERO PROMOTIONAL BANNER */}
        {store.hero_enabled && (
          <section className="rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-2xs relative">
            <div className="grid md:grid-cols-12 gap-5 items-center p-5 sm:p-8 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white">
              <div className="md:col-span-7 space-y-2.5 sm:space-y-3">
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950 shadow-2xs">
                  <Star size={11} className="fill-current" /> Verified Local Merchant Store
                </div>
                <h2 className="text-xl sm:text-3xl font-extrabold tracking-tight leading-tight">
                  {store.hero_title || `Welcome to ${store.shopName}`}
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
                  {store.hero_subtitle || 'Direct inventory pricing with instant GST input tax credit invoice. Fast local pickup and doorstep delivery.'}
                </p>

                <div className="pt-1.5 flex flex-wrap items-center gap-2.5">
                  <a
                    href="#catalog"
                    className="px-4 py-2 rounded-lg text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 transition flex items-center gap-1 shadow-xs"
                  >
                    {store.hero_cta_text || 'Shop All Deals'} <ChevronRight size={14} />
                  </a>
                  {store.phone && (
                    <a
                      href={`https://wa.me/${store.phone.replace(/[^0-9]/g, '')}?text=Hello%20${encodeURIComponent(store.shopName)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition flex items-center gap-1 shadow-xs"
                    >
                      <MessageSquare size={14} /> WhatsApp
                    </a>
                  )}
                </div>
              </div>

              {store.hero_image_url && (
                <div className="md:col-span-5 relative flex items-center justify-center">
                  <img
                    src={store.hero_image_url}
                    alt="Featured Store Banner"
                    className="max-h-48 sm:max-h-56 w-auto object-contain rounded-xl border border-white/10 shadow-lg"
                  />
                </div>
              )}
            </div>

            {/* Trust Badges Strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-100 bg-white text-slate-700 text-xs py-2.5 px-3 sm:px-6">
              <div className="flex items-center gap-2 p-1.5">
                <ShieldCheck size={16} className="text-indigo-600 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">100% Genuine Items</div>
                  <div className="text-[9px] text-slate-400">Direct from store shelves</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-1.5">
                <Tag size={16} className="text-emerald-600 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">GST Invoice with ITC</div>
                  <div className="text-[9px] text-slate-400">Claim 100% Input Tax Credit</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-1.5">
                <Truck size={16} className="text-amber-600 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">Fast Local Dispatch</div>
                  <div className="text-[9px] text-slate-400">Pickup or Doorstep</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-1.5">
                <ThumbsUp size={16} className="text-rose-600 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">Direct Merchant Chat</div>
                  <div className="text-[9px] text-slate-400">Instant WhatsApp support</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── 6. DEALS OF THE DAY / BESTSELLERS ROW ─────────────────────────── */}
        {dealProducts.length > 0 && selectedCategory === 'all' && !search && (
          <section className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
                  <Zap size={16} className="fill-current" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">Top Deals & Bestsellers</h3>
                  <p className="text-[10px] text-slate-500">Frequently ordered items with verified discounts</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCategory('deals')}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
              >
                View All <ChevronRight size={13} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
              {dealProducts.map((p) => {
                const originalPrice = Math.round(p.selling_price * 1.25);
                const discountPct = Math.round(((originalPrice - p.selling_price) / originalPrice) * 100);
                return (
                  <div
                    key={`deal-${p.id}`}
                    onClick={() => setQuickViewProduct(p)}
                    className="group bg-slate-50 hover:bg-white rounded-xl p-2.5 border border-slate-200/80 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="relative h-24 sm:h-28 rounded-lg bg-white overflow-hidden mb-1.5 border border-slate-100 p-1 flex items-center justify-center">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.product_name}
                            className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-200"
                          />
                        ) : (
                          <div className="text-2xl opacity-20">📦</div>
                        )}
                        <span className="absolute top-1 left-1 px-1 py-0.2 rounded text-[8px] font-black bg-emerald-600 text-white">
                          {discountPct}% OFF
                        </span>
                      </div>
                      <h4 className="font-semibold text-xs text-slate-900 line-clamp-2 leading-tight">
                        {p.product_name}
                      </h4>
                    </div>

                    <div className="mt-2 pt-1.5 border-t border-slate-200/60 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-extrabold text-slate-900 leading-none">₹{p.selling_price}</div>
                        <div className="text-[9px] text-slate-400 line-through">₹{originalPrice}</div>
                      </div>
                      <button
                        onClick={(e) => addToCart(p, e)}
                        className="p-1 rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white transition"
                        title="Add to Cart"
                      >
                        <ShoppingBag size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── 7. MAIN CATALOG GRID ─────────────────────────────────────────── */}
        <section id="catalog" className="space-y-3.5">
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5">
                <span>{selectedCategory === 'all' ? 'All Products' : selectedCategory}</span>
                <span className="text-xs font-normal text-slate-500">({processedProducts.length} items)</span>
              </h3>
            </div>

            <div className="flex items-center gap-2.5 text-xs">
              <label className="flex items-center gap-1 cursor-pointer text-slate-600">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => setInStockOnly(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>In Stock Only</span>
              </label>

              <div className="flex items-center gap-1 pl-2.5 border-l border-slate-200">
                <span className="text-slate-400">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5 text-slate-800 font-semibold focus:outline-none text-xs"
                >
                  <option value="featured">Featured</option>
                  <option value="bestseller">Top Selling</option>
                  <option value="price_low">Price: Low to High</option>
                  <option value="price_high">Price: High to Low</option>
                </select>
              </div>
            </div>
          </div>

          {/* Products Grid */}
          {processedProducts.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2.5 rounded-2xl bg-white border border-slate-200 text-center">
              <PackageSearch size={36} className="text-slate-300" />
              <h4 className="font-bold text-slate-800 text-sm">No matching products found</h4>
              <p className="text-xs text-slate-500 max-w-sm">
                {search ? `No products match "${search}". Try clearing your search.` : 'No products available in this category.'}
              </p>
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-slate-900 shadow-xs"
                >
                  Clear Search Filter
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
              {processedProducts.map((product) => {
                const originalPrice = Math.round(product.selling_price * 1.25);
                const discountPct = Math.round(((originalPrice - product.selling_price) / originalPrice) * 100);
                const isOutOfStock = product.stock_quantity <= 0;
                const isLowStock = product.stock_quantity > 0 && product.stock_quantity <= 5;
                const inCartItem = cart.find((c) => c.product.id === product.id);

                return (
                  <div
                    key={product.id}
                    className="group rounded-xl bg-white border border-slate-200/80 overflow-hidden flex flex-col justify-between shadow-2xs hover:shadow-lg hover:border-slate-300 transition-all duration-200"
                  >
                    <div onClick={() => setQuickViewProduct(product)} className="cursor-pointer">
                      {/* Product Image Box */}
                      <div className="relative h-36 sm:h-44 bg-slate-50 overflow-hidden p-2 flex items-center justify-center">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.product_name}
                            className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-200"
                          />
                        ) : (
                          <div className="text-3xl opacity-20">📦</div>
                        )}

                        {/* Top Badges */}
                        <div className="absolute top-2 left-2 flex flex-col gap-1">
                          {product.featured && (
                            <span className="px-1.5 py-0.2 rounded text-[8px] font-black bg-amber-400 text-slate-950 shadow-2xs">
                              ★ FEATURED
                            </span>
                          )}
                          {(product as any).is_bestseller && (
                            <span className="px-1.5 py-0.2 rounded text-[8px] font-black bg-rose-600 text-white shadow-2xs">
                              BESTSELLER
                            </span>
                          )}
                        </div>

                        {/* Quick View overlay */}
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <span className="px-2.5 py-1 rounded-md bg-white/90 text-slate-900 text-[10px] font-bold flex items-center gap-1 shadow-sm">
                            <Eye size={11} /> Quick View
                          </span>
                        </div>
                      </div>

                      {/* Product Details */}
                      <div className="p-3 space-y-1">
                        <div className="flex items-center justify-between text-[9px] text-slate-400 font-medium">
                          <span>HSN: {product.hsn_code || '9983'}</span>
                          <span className="flex items-center gap-0.5 text-amber-500 font-bold">
                            <Star size={9} className="fill-current" /> 4.8
                          </span>
                        </div>

                        <h4 className="font-bold text-xs text-slate-900 line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">
                          {product.product_name}
                        </h4>

                        {product.description && (
                          <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">
                            {product.description}
                          </p>
                        )}

                        {/* Stock Urgency */}
                        <div className="pt-0.5">
                          {isOutOfStock ? (
                            <span className="text-[9px] font-bold text-rose-600">⚠️ Out of Stock</span>
                          ) : isLowStock ? (
                            <span className="text-[9px] font-bold text-amber-600">⚡ Only {product.stock_quantity} left</span>
                          ) : (
                            <span className="text-[9px] font-semibold text-emerald-600">✓ In Stock ({product.unit || 'pcs'})</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Price & Action Button Footer */}
                    <div className="px-3 pb-3 pt-1.5 border-t border-slate-100 flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between">
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm sm:text-base font-black text-slate-900">₹{product.selling_price}</span>
                          <span className="text-[10px] text-slate-400 line-through">₹{originalPrice}</span>
                          <span className="text-[9px] font-bold text-emerald-600">{discountPct}% off</span>
                        </div>
                        <span className="text-[8px] text-slate-400">GST {product.gst_rate || 18}%</span>
                      </div>

                      {/* Cart / Stepper Buttons */}
                      {inCartItem ? (
                        <div className="flex items-center justify-between bg-slate-100 rounded-lg p-0.5 text-xs font-bold">
                          <button
                            onClick={(e) => updateCartQty(product.id, -1, e)}
                            className="w-7 h-6 rounded bg-white shadow-2xs hover:bg-slate-200 grid place-items-center text-slate-800"
                          >
                            −
                          </button>
                          <span className="px-1 text-[11px] text-slate-900">{inCartItem.qty} in Cart</span>
                          <button
                            onClick={(e) => updateCartQty(product.id, 1, e)}
                            className="w-7 h-6 rounded bg-white shadow-2xs hover:bg-slate-200 grid place-items-center text-slate-800"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={(e) => addToCart(product, e)}
                            disabled={isOutOfStock}
                            className="w-full py-1.5 px-1 rounded-lg text-[11px] font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 transition active:scale-95 disabled:opacity-40"
                          >
                            Add
                          </button>
                          <button
                            onClick={(e) => {
                              addToCart(product, e);
                              setShowCartDrawer(true);
                            }}
                            disabled={isOutOfStock}
                            className="w-full py-1.5 px-1 rounded-lg text-[11px] font-bold text-white transition active:scale-95 shadow-2xs disabled:opacity-40"
                            style={{ backgroundColor: secondaryColor }}
                          >
                            Buy Now
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ABOUT & GALLERY SECTIONS */}
        {store.about_enabled && store.about_description && (
          <section className="rounded-2xl bg-white border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-2">
            <h3 className="text-base font-bold text-slate-900">{store.about_title || 'About Our Business'}</h3>
            <p className="text-xs text-slate-600 leading-relaxed max-w-4xl whitespace-pre-line">
              {store.about_description}
            </p>
          </section>
        )}

        {store.gallery_enabled && gallery.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-3">
            <h3 className="text-base font-bold text-slate-900">{store.gallery_title || 'Store Gallery & Facility'}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              {gallery.map((img: any) => (
                <div
                  key={img.id}
                  onClick={() => setSelectedImage(img.image_url)}
                  className="relative h-32 sm:h-36 rounded-lg overflow-hidden border border-slate-200 cursor-pointer group shadow-2xs"
                >
                  <img
                    src={img.image_url}
                    alt={img.caption || 'Gallery photo'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {img.caption && (
                    <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent text-[9px] text-white font-medium truncate">
                      {img.caption}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* ── 8. SLIDE-OVER CART DRAWER ───────────────────────────────────────── */}
      <AnimatePresence>
        {showCartDrawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-2xs z-50"
              onClick={() => setShowCartDrawer(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 w-full sm:max-w-md bg-white border-l border-slate-200 z-50 p-4 sm:p-5 flex flex-col justify-between shadow-2xl overflow-y-auto"
            >
              <div>
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <ShoppingBag size={17} style={{ color: primaryColor }} />
                    <h3 className="font-bold text-sm sm:text-base text-slate-900">Your Shopping Cart ({totalCartCount})</h3>
                  </div>
                  <button onClick={() => setShowCartDrawer(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700">
                    <X size={17} />
                  </button>
                </div>

                {/* Free Delivery Milestone Progress */}
                <div className="my-2.5 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                  <Truck size={15} className="text-emerald-600 shrink-0" />
                  <span>
                    {totalCartPrice >= 500
                      ? '✓ You unlocked FREE Store Delivery!'
                      : `Add ₹${500 - totalCartPrice} more for Free Delivery!`}
                  </span>
                </div>

                {/* Cart Items List */}
                <div className="space-y-2 py-2">
                  {cart.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 space-y-2">
                      <ShoppingBag size={28} className="mx-auto text-slate-300" />
                      <p className="text-xs font-medium">Your cart is empty.</p>
                      <button
                        onClick={() => setShowCartDrawer(false)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-slate-900 mt-1"
                      >
                        Explore Products
                      </button>
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div
                        key={item.product.id}
                        className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {item.product.image_url ? (
                            <img
                              src={item.product.image_url}
                              alt={item.product.product_name}
                              className="w-10 h-10 rounded-md object-contain bg-white border border-slate-200 p-0.5 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-md bg-slate-200 grid place-items-center text-lg shrink-0">📦</div>
                          )}
                          <div className="min-w-0">
                            <h4 className="font-bold text-slate-900 truncate text-xs">{item.product.product_name}</h4>
                            <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                              ₹{item.product.selling_price} × {item.qty} = <strong>₹{item.product.selling_price * item.qty}</strong>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => updateCartQty(item.product.id, -1, e)}
                            className="w-6 h-6 rounded bg-white border border-slate-200 hover:bg-slate-100 font-bold text-slate-800 grid place-items-center"
                          >
                            −
                          </button>
                          <span className="w-3.5 text-center font-black text-slate-900 text-xs">{item.qty}</span>
                          <button
                            onClick={(e) => updateCartQty(item.product.id, 1, e)}
                            className="w-6 h-6 rounded bg-white border border-slate-200 hover:bg-slate-100 font-bold text-slate-800 grid place-items-center"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Cart Footer */}
              {cart.length > 0 && (
                <div className="pt-3 border-t border-slate-200 space-y-2.5">
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Items Subtotal:</span>
                      <span className="font-semibold text-slate-900">₹{totalCartPrice}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Estimated GST (ITC Claimable):</span>
                      <span className="font-semibold text-emerald-600">₹{Math.round(totalEstimatedTax)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Delivery:</span>
                      <span className="font-semibold text-emerald-600">{totalCartPrice >= 500 ? 'FREE' : '₹40'}</span>
                    </div>
                    <div className="pt-1 border-t border-slate-200 flex justify-between text-xs sm:text-sm font-black text-slate-900">
                      <span>Grand Total:</span>
                      <span style={{ color: primaryColor }}>₹{totalCartPrice + (totalCartPrice >= 500 ? 0 : 40)}</span>
                    </div>
                  </div>

                  {!showDirectOrderForm ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {whatsappHref && (
                        <a
                          href={whatsappHref}
                          target="_blank"
                          rel="noreferrer"
                          className="py-2.5 px-2 rounded-lg font-bold text-center text-white text-xs flex items-center justify-center gap-1 shadow-xs transition hover:opacity-90"
                          style={{ backgroundColor: '#25D366' }}
                        >
                          <MessageSquare size={14} /> WhatsApp Order
                        </a>
                      )}
                      <button
                        onClick={() => setShowDirectOrderForm(true)}
                        className="py-2.5 px-2 rounded-lg font-bold text-center text-white text-xs flex items-center justify-center gap-1 shadow-xs transition hover:opacity-90"
                        style={{ backgroundColor: secondaryColor }}
                      >
                        <Send size={13} /> Instant Order
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-slate-100 border border-slate-300 space-y-2 text-xs">
                      <div className="flex justify-between items-center font-bold text-slate-900">
                        <span>Customer Delivery Details</span>
                        <button onClick={() => setShowDirectOrderForm(false)} className="text-[10px] text-slate-400 hover:text-slate-600">
                          Cancel
                        </button>
                      </div>
                      <input
                        type="text"
                        value={custName}
                        onChange={(e) => setCustName(e.target.value)}
                        placeholder="Your Full Name *"
                        className="w-full px-2.5 py-1.5 rounded-md bg-white border border-slate-300 text-xs focus:outline-none"
                      />
                      <input
                        type="tel"
                        value={custPhone}
                        onChange={(e) => setCustPhone(e.target.value)}
                        placeholder="Your 10-digit Mobile Number *"
                        className="w-full px-2.5 py-1.5 rounded-md bg-white border border-slate-300 text-xs focus:outline-none"
                      />
                      <textarea
                        value={custAddress}
                        onChange={(e) => setCustAddress(e.target.value)}
                        placeholder="Delivery Address / Landmark (Optional)"
                        rows={2}
                        className="w-full px-2.5 py-1.5 rounded-md bg-white border border-slate-300 text-xs focus:outline-none"
                      />
                      <button
                        onClick={handleSendDirectOrder}
                        disabled={submittingOrder}
                        className="w-full py-2 rounded-lg font-bold text-xs text-white shadow-xs flex items-center justify-center gap-1 transition disabled:opacity-50"
                        style={{ backgroundColor: secondaryColor }}
                      >
                        {submittingOrder ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Confirm Order
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── 9. PRODUCT QUICK VIEW MODAL ─────────────────────────────────────── */}
      <AnimatePresence>
        {quickViewProduct && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-2xs z-50 flex items-center justify-center p-3 sm:p-4"
              onClick={() => setQuickViewProduct(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl max-w-xl w-full max-h-[85vh] overflow-y-auto p-4 sm:p-6 shadow-2xl relative"
              >
                <button
                  onClick={() => setQuickViewProduct(null)}
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  <X size={16} />
                </button>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="h-52 rounded-xl bg-slate-50 border border-slate-200 p-3 flex items-center justify-center">
                    {quickViewProduct.image_url ? (
                      <img
                        src={quickViewProduct.image_url}
                        alt={quickViewProduct.product_name}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <div className="text-4xl opacity-20">📦</div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="inline-flex items-center gap-1 text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full mb-1">
                        HSN {quickViewProduct.hsn_code || '9983'} • GST {quickViewProduct.gst_rate || 18}%
                      </div>
                      <h3 className="text-base font-bold text-slate-900">{quickViewProduct.product_name}</h3>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="text-xl font-black text-slate-900">₹{quickViewProduct.selling_price}</span>
                        <span className="text-xs text-slate-400 line-through">₹{Math.round(quickViewProduct.selling_price * 1.25)}</span>
                        <span className="text-[10px] font-bold text-emerald-600">20% OFF</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {quickViewProduct.description || 'Verified product from official merchant inventory catalogue.'}
                    </p>

                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Stock Status:</span>
                        <span className="font-bold text-emerald-600">
                          {quickViewProduct.stock_quantity > 0 ? `In Stock (${quickViewProduct.stock_quantity} available)` : 'Out of Stock'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Seller:</span>
                        <span className="font-bold text-slate-800">{store.shopName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">GST Invoice:</span>
                        <span className="font-bold text-indigo-600">Eligible (ITC Claimable)</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          addToCart(quickViewProduct, e);
                          setQuickViewProduct(null);
                        }}
                        className="flex-1 py-2 rounded-lg font-bold text-xs text-slate-900 bg-slate-100 hover:bg-slate-200 transition"
                      >
                        Add to Cart
                      </button>
                      <button
                        onClick={(e) => {
                          addToCart(quickViewProduct, e);
                          setQuickViewProduct(null);
                          setShowCartDrawer(true);
                        }}
                        className="flex-1 py-2 rounded-lg font-bold text-xs text-white transition shadow-xs"
                        style={{ backgroundColor: secondaryColor }}
                      >
                        Buy Now
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── 10. IMAGE LIGHTBOX ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-3"
            onClick={() => setSelectedImage(null)}
          >
            <img
              src={selectedImage}
              alt="Preview"
              className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
            />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white grid place-items-center"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 11. MEGA FOOTER ─────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-300 mt-12 text-xs">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs text-center transition flex items-center justify-center gap-1"
        >
          <ChevronUp size={13} /> Back to Top
        </button>

        <div className="max-w-7xl mx-auto px-5 py-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          <div className="space-y-2">
            <div className="text-sm font-extrabold text-white">{store.tradeName || store.shopName}</div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Official online storefront powered by AK-LOGIC AI GST platform. Direct merchant commerce with 100% compliant GST billing.
            </p>
            <div className="flex items-center gap-1 text-[10px] text-amber-400 font-bold">
              <ShieldCheck size={12} /> Verified Platform Merchant
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="font-bold text-white uppercase text-[10px] tracking-wider">Store Contact</div>
            {store.phone && (
              <div className="flex items-center gap-1.5 text-slate-400">
                <Phone size={11} className="text-emerald-400" />
                <a href={`tel:${store.phone}`} className="hover:text-white">{store.phone}</a>
              </div>
            )}
            {store.email && (
              <div className="flex items-center gap-1.5 text-slate-400">
                <Mail size={11} className="text-indigo-400" />
                <a href={`mailto:${store.email}`} className="hover:text-white truncate">{store.email}</a>
              </div>
            )}
            {store.address && (
              <div className="flex items-start gap-1.5 text-slate-400">
                <MapPin size={11} className="text-rose-400 shrink-0 mt-0.5" />
                <span>{store.address}, {store.city ? `${store.city}, ` : ''}{store.state}</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="font-bold text-white uppercase text-[10px] tracking-wider">GST Compliance & ITC</div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Every order placed on this store generates a verified GST Tax invoice allowing businesses to claim full Input Tax Credit (ITC).
            </p>
            <div className="text-[10px] text-emerald-400 font-semibold">
              ✓ HSN & Tax Rate Compliant
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="font-bold text-white uppercase text-[10px] tracking-wider">Quick Orders</div>
            <div className="space-y-1 text-[10px] text-slate-400">
              <div>• WhatsApp 1-Click Order</div>
              <div>• Instant Direct Merchant Invoice</div>
              <div>• In-Store Pickup & Local Delivery</div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800 py-4 text-center text-[10px] text-slate-500">
          {store.footer_text || `© ${new Date().getFullYear()} ${store.shopName}. Powered by AK-LOGIC AI GST Platform.`}
        </div>
      </footer>
    </div>
  );
}
