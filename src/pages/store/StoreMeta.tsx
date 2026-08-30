import { useEffect } from 'react';
import type { PublicStoreData, PublicProduct } from '../../lib/publicStoreService';

interface StoreMetaProps {
  store: PublicStoreData;
  products?: PublicProduct[];
  slug: string;
}

/**
 * StoreMeta dynamically injects document title, standard SEO meta tags,
 * Open Graph / Twitter Card tags, and Schema.org JSON-LD structured data
 * for public merchant storefronts (/store/:slug).
 *
 * Restores original document tags on unmount.
 */
export default function StoreMeta({ store, products = [], slug }: StoreMetaProps) {
  useEffect(() => {
    // 1. Determine titles and descriptions
    const rawTitle = store.seo_title || store.shopName || store.brandName || 'Merchant Store';
    const pageTitle = store.seo_title
      ? store.seo_title
      : `${rawTitle} | Online Store · AK-LOGIC AI GST`;

    const description =
      store.seo_description ||
      store.about_description ||
      `Shop online from ${rawTitle}. Browse verified products, order directly via WhatsApp, and receive instant GST-compliant invoices.`;

    const keywords =
      store.seo_keywords ||
      `${rawTitle}, GST billing, online store, buy online, ${store.city || ''}, ${store.state || 'India'}`;

    const customDomainClean = (store.custom_domain || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const canonicalUrl = customDomainClean 
      ? `https://${customDomainClean}` 
      : `https://gst.ak-logicai.in/store/${encodeURIComponent(slug)}`;

    const ogImage =
      store.logoUrl ||
      store.hero_image_url ||
      'https://gst.ak-logicai.in/icon-512.png';

    const isPublished = store.status === 'published';
    const robotsContent = isPublished ? 'index, follow' : 'noindex, nofollow';

    // Store previous title and favicon
    const prevTitle = document.title;
    document.title = pageTitle;

    // Helper to update or create a meta tag
    const setMetaTag = (selector: string, attrName: string, attrVal: string, content: string): HTMLMetaElement => {
      let el = document.querySelector(selector) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attrName, attrVal);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
      return el;
    };

    // Helper to update or create a link tag
    const setLinkTag = (rel: string, href: string): HTMLLinkElement => {
      let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
      return el;
    };

    // 2. Set standard SEO tags & Favicon
    setMetaTag('meta[name="description"]', 'name', 'description', description);
    setMetaTag('meta[name="keywords"]', 'name', 'keywords', keywords);
    setMetaTag('meta[name="robots"]', 'name', 'robots', robotsContent);
    setLinkTag('canonical', canonicalUrl);
    if (store.logoUrl) {
      setLinkTag('icon', store.logoUrl);
      setLinkTag('apple-touch-icon', store.logoUrl);
    }

    // 3. Set Open Graph tags
    setMetaTag('meta[property="og:type"]', 'property', 'og:type', 'website');
    setMetaTag('meta[property="og:site_name"]', 'property', 'og:site_name', rawTitle);
    setMetaTag('meta[property="og:title"]', 'property', 'og:title', pageTitle);
    setMetaTag('meta[property="og:description"]', 'property', 'og:description', description);
    setMetaTag('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    setMetaTag('meta[property="og:image"]', 'property', 'og:image', ogImage);
    setMetaTag('meta[property="og:locale"]', 'property', 'og:locale', 'en_IN');

    // 4. Set Twitter Card tags
    setMetaTag('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    setMetaTag('meta[name="twitter:title"]', 'name', 'twitter:title', pageTitle);
    setMetaTag('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    setMetaTag('meta[name="twitter:image"]', 'name', 'twitter:image', ogImage);

    // 5. Build Schema.org Structured Data (JSON-LD)
    const scriptId = 'store-structured-data-jsonld';
    let scriptEl = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!scriptEl) {
      scriptEl = document.createElement('script');
      scriptEl.id = scriptId;
      scriptEl.type = 'application/ld+json';
      document.head.appendChild(scriptEl);
    }

    const structuredData: Record<string, any>[] = [
      {
        '@context': 'https://schema.org',
        '@type': 'Store',
        name: rawTitle,
        description: description,
        url: canonicalUrl,
        image: ogImage,
        telephone: store.contact_show_phone ? store.phone : undefined,
        email: store.contact_show_email ? store.email : undefined,
        address: store.contact_show_address
          ? {
              '@type': 'PostalAddress',
              streetAddress: store.address || undefined,
              addressLocality: store.city || undefined,
              addressRegion: store.state || undefined,
              postalCode: store.pincode || undefined,
              addressCountry: 'IN',
            }
          : undefined,
        geo:
          store.latitude && store.longitude
            ? {
                '@type': 'GeoCoordinates',
                latitude: store.latitude,
                longitude: store.longitude,
              }
            : undefined,
      },
    ];

    // Add ItemList of featured products if available
    if (products.length > 0) {
      const topProducts = products.slice(0, 10);
      structuredData.push({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: topProducts.map((p, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: {
            '@type': 'Product',
            name: p.product_name,
            description: p.website_description || p.description || p.product_name,
            image: p.image_url || ogImage,
            sku: p.hsn_code ? `HSN-${p.hsn_code}` : undefined,
            offers: {
              '@type': 'Offer',
              priceCurrency: 'INR',
              price: p.selling_price,
              availability:
                p.stock_quantity > 0
                  ? 'https://schema.org/InStock'
                  : 'https://schema.org/OutOfStock',
            },
          },
        })),
      });
    }

    scriptEl.textContent = JSON.stringify(structuredData);

    // Cleanup on unmount / route change
    return () => {
      document.title = prevTitle;
      const scriptToRemove = document.getElementById(scriptId);
      if (scriptToRemove) {
        scriptToRemove.remove();
      }
    };
  }, [store, products, slug]);

  return null;
}
