/**
 * Vercel Serverless Function: Bot / Crawler Meta Renderer for /store/:slug
 * 
 * Provides server-rendered Open Graph, Twitter Cards, SEO meta tags, and Schema.org
 * structured data specifically for bots and social media crawlers (WhatsApp, Facebook,
 * Twitter, Telegram, Googlebot, etc.) that do not execute client-side JavaScript.
 *
 * Enforces:
 * - Server-side published-only filtering (unpublished stores return noindex).
 * - Zero secret key exposure (calls only the public API endpoint).
 */

const BOT_UA_REGEX = /bot|crawler|spider|crawling|whatsapp|facebookexternalhit|twitterbot|linkedinbot|telegrambot|discordbot|slackbot|skypeuripreview|googlebot|bingbot|yandex|duckduckbot|applebot|baiduspider/i;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default async function handler(req, res) {
  const { slug } = req.query;
  const userAgent = req.headers['user-agent'] || '';

  if (!slug) {
    return res.status(400).send('Missing store slug');
  }

  const backendUrls = [
    process.env.VITE_API_BASE,
    process.env.BACKEND_API_URL,
    'https://ak-logic-ai-gst-production.up.railway.app',
    'http://localhost:8000'
  ].filter(Boolean);

  let storeData = null;
  let products = [];

  for (const baseUrl of backendUrls) {
    try {
      const cleanBase = baseUrl.replace(/\/+$/, '');
      const storeRes = await fetch(`${cleanBase}/api/public/store/${encodeURIComponent(slug)}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4000)
      });
      if (storeRes.ok) {
        const data = await storeRes.json();
        storeData = data.store;
        
        // Fetch products if store is published
        if (storeData && storeData.status === 'published') {
          try {
            const prodRes = await fetch(`${cleanBase}/api/public/store/${encodeURIComponent(slug)}/products?limit=10`, {
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(3000)
            });
            if (prodRes.ok) {
              const prodJson = await prodRes.json();
              products = prodJson.products || [];
            }
          } catch {
            // Non-fatal
          }
        }
        break;
      }
    } catch {
      // Try next URL
    }
  }

  // If store is not found or not published, return noindex response
  if (!storeData || storeData.status !== 'published') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Store Not Available · AK-LOGIC AI GST</title>
  <meta name="robots" content="noindex, nofollow" />
  <meta name="description" content="This merchant store is currently offline or not available." />
</head>
<body style="font-family: sans-serif; text-align: center; padding: 50px;">
  <h1>Store Not Available</h1>
  <p>This merchant store is currently offline or does not exist.</p>
  <a href="https://www.ak-logicai.in/">Return to AK-LOGIC AI GST</a>
</body>
</html>`);
  }

  // Published store metadata
  const rawTitle = storeData.seo_title || storeData.shopName || storeData.brandName || 'Merchant Store';
  const pageTitle = storeData.seo_title || `${rawTitle} | Online Store · AK-LOGIC AI GST`;
  const description = storeData.seo_description || storeData.about_description || `Shop online from ${rawTitle}. Browse verified products, order directly via WhatsApp, and receive instant GST-compliant invoices.`;
  const canonicalUrl = `https://www.ak-logicai.in/store/${encodeURIComponent(slug)}`;
  const ogImage = storeData.logoUrl || storeData.hero_image_url || 'https://www.ak-logicai.in/icon-512.png';
  const keywords = storeData.seo_keywords || `${rawTitle}, GST billing, online store, buy online, ${storeData.city || ''}, ${storeData.state || 'India'}`;

  // Structured Data (JSON-LD)
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Store",
      "name": rawTitle,
      "description": description,
      "url": canonicalUrl,
      "image": ogImage,
      "telephone": storeData.contact_show_phone ? storeData.phone : undefined,
      "email": storeData.contact_show_email ? storeData.email : undefined,
      "address": storeData.contact_show_address ? {
        "@type": "PostalAddress",
        "streetAddress": storeData.address || undefined,
        "addressLocality": storeData.city || undefined,
        "addressRegion": storeData.state || undefined,
        "postalCode": storeData.pincode || undefined,
        "addressCountry": "IN"
      } : undefined
    }
  ];

  if (products.length > 0) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "ItemList",
      "itemListElement": products.map((p, idx) => ({
        "@type": "ListItem",
        "position": idx + 1,
        "item": {
          "@type": "Product",
          "name": p.product_name,
          "description": p.website_description || p.description || p.product_name,
          "image": p.image_url || ogImage,
          "offers": {
            "@type": "Offer",
            "priceCurrency": "INR",
            "price": p.selling_price,
            "availability": p.stock_quantity > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
          }
        }
      }))
    });
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="keywords" content="${escapeHtml(keywords)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />

  <!-- Open Graph / WhatsApp / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${escapeHtml(rawTitle)}" />
  <meta property="og:title" content="${escapeHtml(pageTitle)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta property="og:locale" content="en_IN" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />

  <!-- JSON-LD Structured Data -->
  <script type="application/ld+json">
    ${JSON.stringify(jsonLd)}
  </script>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #faf9f7; color: #1a1a1a; padding: 24px; max-width: 800px; margin: 0 auto;">
  <header style="border-bottom: 1px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px;">
    <h1>${escapeHtml(storeData.tradeName || storeData.shopName)}</h1>
    <p style="color: #6b7280;">${escapeHtml(storeData.city ? `${storeData.city}, ${storeData.state}` : storeData.state)}</p>
  </header>
  <main>
    <p>${escapeHtml(description)}</p>
    ${products.length > 0 ? `
      <h2>Featured Products</h2>
      <ul>
        ${products.map(p => `<li><strong>${escapeHtml(p.product_name)}</strong> — ₹${p.selling_price}</li>`).join('\n')}
      </ul>
    ` : ''}
    <div style="margin-top: 32px;">
      <a href="${escapeHtml(canonicalUrl)}" style="display: inline-block; padding: 12px 24px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 8px;">
        Open Interactive Store
      </a>
    </div>
  </main>
</body>
</html>`;

  return res.status(200).send(html);
}
