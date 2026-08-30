/**
 * Vercel Serverless Function: Dynamic Store Sitemap (/api/sitemap-stores.xml)
 * 
 * Generates an XML sitemap of all published merchant storefronts.
 * Only stores with status === 'published' are included.
 * Zero secret keys exposed.
 */

export default async function handler(req, res) {
  const backendUrls = [
    process.env.VITE_API_BASE,
    process.env.BACKEND_API_URL,
    'https://gst-v1p5.onrender.com',
    'http://localhost:8000'
  ].filter(Boolean);

  let stores = [];

  for (const baseUrl of backendUrls) {
    try {
      const cleanBase = baseUrl.replace(/\/+$/, '');
      // Try to fetch published stores from backend
      const response = await fetch(`${cleanBase}/api/public/stores`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000)
      });
      if (response.ok) {
        const data = await response.json();
        stores = (data.stores || data || []).filter((s) => s.slug);
        break;
      }
    } catch {
      // Try next
    }
  }

  // Generate XML
  const now = new Date().toISOString().split('T')[0];
  const urls = stores.map((s) => {
    const customDomain = (s.custom_domain || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const loc = customDomain ? `https://${customDomain}` : `https://gst.ak-logicai.in/store/${encodeURIComponent(s.slug)}`;
    const lastmod = s.updated_at ? new Date(s.updated_at).toISOString().split('T')[0] : now;
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
  return res.status(200).send(xml);
}
