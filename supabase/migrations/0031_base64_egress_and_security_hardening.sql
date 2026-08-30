-- 0031_base64_egress_and_security_hardening.sql
-- 1. Redefine public.merchants_public view: remove heavy Base64 (logoDataUrl), add logoUrl, enable security_invoker
DROP VIEW IF EXISTS public.merchants_public CASCADE;

CREATE VIEW public.merchants_public
WITH (security_invoker = true)
AS
SELECT 
    id,
    "shopName",
    "tradeName",
    gstin,
    state,
    status,
    "logoUrl",
    "qrId",
    "planExpiresAt",
    "planValidityDays",
    "invoicePrefix",
    "brandColor",
    "brandName",
    "merchantCode"
FROM public.merchants;

-- 2. Redefine public.merchant_websites_public view with security_invoker = true
DROP VIEW IF EXISTS public.merchant_websites_public CASCADE;

CREATE VIEW public.merchant_websites_public
WITH (security_invoker = true)
AS
SELECT 
    w.id,
    w.merchant_id,
    w.slug,
    w.custom_domain,
    w.status,
    w.published_at,
    w.theme_primary_color,
    w.theme_secondary_color,
    w.theme_font,
    w.theme_style,
    w.seo_title,
    w.seo_description,
    w.seo_keywords,
    w.hero_enabled,
    w.hero_title,
    w.hero_subtitle,
    w.hero_image_url,
    w.hero_cta_text,
    w.hero_cta_link,
    w.about_enabled,
    w.about_title,
    w.about_description,
    w.about_image_url,
    w.products_enabled,
    w.products_title,
    w.products_layout,
    w.products_per_page,
    w.categories_enabled,
    w.gallery_enabled,
    w.gallery_title,
    w.contact_enabled,
    w.contact_show_phone,
    w.contact_show_email,
    w.contact_show_address,
    w.contact_show_map,
    w.footer_text,
    w.footer_show_social,
    w.footer_facebook,
    w.footer_instagram,
    w.footer_twitter,
    w.footer_whatsapp,
    w.business_hours,
    w.section_order,
    w.created_at,
    w.updated_at,
    m."shopName",
    m."ownerName",
    m."tradeName",
    m."legalName",
    m."brandName",
    m."brandColor",
    m."logoUrl",
    m."hasCustomLogo",
    m.email,
    m.phone,
    m.address,
    m.city,
    m.state,
    m.pincode,
    m.latitude,
    m.longitude
FROM public.merchant_websites w
JOIN public.merchants m ON m.id = w.merchant_id
WHERE w.status = 'published';

-- 3. Harden RLS policies on merchant_websites and website_gallery_images
DROP POLICY IF EXISTS "allow_all_merchant_websites" ON public.merchant_websites;
DROP POLICY IF EXISTS "allow_all_website_gallery_images" ON public.website_gallery_images;
DROP POLICY IF EXISTS "merchant_websites_all" ON public.merchant_websites;
DROP POLICY IF EXISTS "website_gallery_images_all" ON public.website_gallery_images;
DROP POLICY IF EXISTS "public_read_published_websites" ON public.merchant_websites;
DROP POLICY IF EXISTS "merchant_owner_manage_website" ON public.merchant_websites;
DROP POLICY IF EXISTS "public_read_gallery_images" ON public.website_gallery_images;
DROP POLICY IF EXISTS "merchant_owner_manage_gallery" ON public.website_gallery_images;

CREATE POLICY "public_read_published_websites"
ON public.merchant_websites
FOR SELECT
USING (status = 'published' OR auth.role() = 'service_role');

CREATE POLICY "merchant_owner_manage_website"
ON public.merchant_websites
FOR ALL
USING (auth.role() = 'service_role' OR merchant_id = (auth.jwt() ->> 'sub') OR merchant_id = (auth.jwt() ->> 'merchantId'))
WITH CHECK (auth.role() = 'service_role' OR merchant_id = (auth.jwt() ->> 'sub') OR merchant_id = (auth.jwt() ->> 'merchantId'));

CREATE POLICY "public_read_gallery_images"
ON public.website_gallery_images
FOR SELECT
USING (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM public.merchant_websites w 
    WHERE w.merchant_id = website_gallery_images.merchant_id AND w.status = 'published'
));

CREATE POLICY "merchant_owner_manage_gallery"
ON public.website_gallery_images
FOR ALL
USING (auth.role() = 'service_role' OR merchant_id = (auth.jwt() ->> 'sub') OR merchant_id = (auth.jwt() ->> 'merchantId'))
WITH CHECK (auth.role() = 'service_role' OR merchant_id = (auth.jwt() ->> 'sub') OR merchant_id = (auth.jwt() ->> 'merchantId'));
