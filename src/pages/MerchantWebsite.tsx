import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Globe, ShoppingBag, MessageSquare, Sparkles, ArrowRight,
  Palette, Search, ShieldCheck, CheckCircle2, Share2
} from 'lucide-react';
import Logo from '../components/Logo';

export default function MerchantWebsite() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Merchant Website Builder & Online Storefronts | AK-LOGIC AI GST';
    
    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute('content') || '';
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Launch your verified merchant online store in minutes. Product catalogue, WhatsApp ordering, custom branding, and instant GST invoices with AK-LOGIC AI GST.');
    }

    return () => {
      document.title = prevTitle;
      if (metaDesc) metaDesc.setAttribute('content', prevDesc);
    };
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-800 antialiased selection:bg-slate-900 selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/"><Logo size={30} onLight /></Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link to="/login" className="px-3 sm:px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 transition">
              Merchant Login
            </Link>
            <Link to="/register" className="px-3.5 sm:px-4 py-2 rounded-lg text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition">
              Create Your Store
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden pt-12 pb-16 sm:pt-20 sm:pb-24 border-b border-slate-100 bg-gradient-to-b from-indigo-50/40 via-white to-slate-50/50">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-medium text-indigo-600 mb-6 shadow-xs">
              <Sparkles size={14} /> Merchant Storefront Builder
            </div>
            <h1 className="font-[var(--font-display)] text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-slate-900 leading-[1.18] max-w-4xl mx-auto">
              Every Merchant Gets Their Own Fast, Mobile-Ready Online Store
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Showcase your products, accept orders directly via WhatsApp, and deliver GST-compliant invoices effortlessly. Give your local business a high-converting digital storefront.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/register" className="w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition shadow-sm flex items-center justify-center gap-2">
                Launch Your Free Store <ArrowRight size={16} />
              </Link>
              <Link to="/login" className="w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition">
                Manage Existing Store
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Store Features */}
      <section className="py-16 sm:py-20 max-w-6xl mx-auto px-5 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Key Features of Your Online Store</h2>
          <p className="mt-2 text-sm text-slate-500">Everything needed to sell products and receive inquiries online with zero coding.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 shadow-xs">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
              <ShoppingBag size={22} />
            </div>
            <h3 className="font-semibold text-slate-900 text-lg">Product Catalogue</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Add your inventory with selling price, HSN codes, GST rates, stock availability, images, and descriptions in seconds.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 shadow-xs">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
              <MessageSquare size={22} />
            </div>
            <h3 className="font-semibold text-slate-900 text-lg">WhatsApp Ordering</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Customers can browse products, add items to cart, and send pre-formatted orders directly to your official WhatsApp number.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 shadow-xs">
            <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-4">
              <Palette size={22} />
            </div>
            <h3 className="font-semibold text-slate-900 text-lg">Custom Branding</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Customize primary &amp; secondary brand colors, store banner, logo, business hours, and address to match your physical shop.
            </p>
          </div>
        </div>
      </section>

      {/* SEO & Previews Section */}
      <section className="py-16 sm:py-20 bg-slate-50/60 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold mb-4">
                <Search size={14} /> Built-in SEO &amp; Rich Social Previews
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">
                Optimized for Google Search and WhatsApp Previews
              </h2>
              <p className="mt-4 text-sm text-slate-600 leading-relaxed">
                When you share your store link on WhatsApp, Facebook, or Instagram, your store title, description, and logo image are rendered automatically.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  Custom meta title, description, and keywords
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  Structured Data (Schema.org Store &amp; Product JSON-LD)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  Fast edge-cached delivery for instant page loads
                </li>
              </ul>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Live WhatsApp Preview Card</div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="h-32 bg-slate-200 rounded-lg flex items-center justify-center text-slate-400 text-xs font-medium">
                  Store Banner &amp; Brand Logo
                </div>
                <h4 className="font-bold text-slate-900 mt-3 text-sm">Your Business Name | Online Store</h4>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">Shop verified products online. Fast delivery &amp; instant GST invoices.</p>
                <div className="text-[11px] text-blue-600 mt-2 font-mono">ak-logicai.in/store/your-shop</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-10">
          <div className="grid sm:grid-cols-3 gap-8">
            <div className="text-center sm:text-left">
              <Logo size={28} onLight />
              <p className="mt-3 text-sm text-slate-400 max-w-xs">AK-LOGIC AI GST — GST Billing, Online Stores &amp; Merchant Commerce.</p>
            </div>
            <div className="text-center sm:text-left">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Explore Solutions</h4>
              <div className="flex flex-col gap-2 text-sm">
                <Link to="/gst-billing-software" className="text-slate-500 hover:text-slate-900 transition">GST Billing Software</Link>
                <Link to="/merchant-website" className="text-slate-700 font-medium hover:text-slate-900 transition">Merchant Website Builder</Link>
                <Link to="/merchant-network" className="text-slate-500 hover:text-slate-900 transition">Verified B2B Network</Link>
              </div>
            </div>
            <div className="text-center sm:text-left">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Legal &amp; Support</h4>
              <div className="flex flex-col gap-2 text-sm">
                <Link to="/privacy" className="text-slate-500 hover:text-slate-900 transition">Privacy Policy</Link>
                <Link to="/terms" className="text-slate-500 hover:text-slate-900 transition">Terms &amp; Conditions</Link>
                <Link to="/refund-policy" className="text-slate-500 hover:text-slate-900 transition">Refund Policy</Link>
                <Link to="/contact" className="text-slate-500 hover:text-slate-900 transition">Contact Support</Link>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-slate-100 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} AK-LOGIC AI · All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
