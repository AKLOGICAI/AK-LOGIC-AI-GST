"""Direct-Postgres repository for public.merchant_websites and website_gallery_images.
Strict tenant isolation and safe public queries.
"""
from typing import Any, Optional, List
import time
import secrets
import re
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def _row_to_dict(row: Any) -> dict[str, Any]:
    if not row:
        return {}
    return dict(row._mapping)


def slugify(text_val: str) -> str:
    s = text_val.lower().strip()
    s = re.sub(r'[^\w\s-]', '', s)
    s = re.sub(r'[\s_-]+', '-', s)
    s = s.strip('-')
    return s or 'merchant-store'


_schema_ensured = False


async def ensure_schema(db: AsyncSession) -> None:
    """Ensures tables exist and schema columns are present."""
    global _schema_ensured
    if _schema_ensured:
        return
    statements = [
        """
        CREATE TABLE IF NOT EXISTS public.merchant_websites (
          id text PRIMARY KEY,
          merchant_id text UNIQUE NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
          slug text UNIQUE NOT NULL,
          status text NOT NULL DEFAULT 'draft',
          published_at bigint,
          theme_primary_color text DEFAULT '#4F46E5',
          theme_secondary_color text DEFAULT '#10B981',
          theme_font text DEFAULT 'Inter',
          theme_style text DEFAULT 'modern',
          seo_title text,
          seo_description text,
          seo_keywords text,
          hero_enabled boolean DEFAULT true,
          hero_title text,
          hero_subtitle text,
          hero_image_url text DEFAULT '',
          hero_cta_text text DEFAULT 'Browse Products',
          hero_cta_link text DEFAULT '#products',
          about_enabled boolean DEFAULT true,
          about_title text DEFAULT 'About Us',
          about_description text,
          about_image_url text DEFAULT '',
          products_enabled boolean DEFAULT true,
          products_title text DEFAULT 'Our Products',
          products_layout text DEFAULT 'grid',
          products_per_page integer DEFAULT 12,
          categories_enabled boolean DEFAULT false,
          gallery_enabled boolean DEFAULT false,
          gallery_title text DEFAULT 'Gallery',
          contact_enabled boolean DEFAULT true,
          contact_show_phone boolean DEFAULT true,
          contact_show_email boolean DEFAULT true,
          contact_show_address boolean DEFAULT true,
          contact_show_map boolean DEFAULT true,
          footer_text text,
          footer_show_social boolean DEFAULT false,
          footer_facebook text DEFAULT '',
          footer_instagram text DEFAULT '',
          footer_twitter text DEFAULT '',
          footer_whatsapp text DEFAULT '',
          business_hours jsonb DEFAULT '[]'::jsonb,
          section_order jsonb DEFAULT '["hero","about","products","gallery","contact"]'::jsonb,
          created_at bigint NOT NULL,
          updated_at bigint NOT NULL
        );
        """,
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_website_merchant ON public.merchant_websites(merchant_id);",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_website_slug ON public.merchant_websites(slug);",
        "ALTER TABLE public.merchant_websites ADD COLUMN IF NOT EXISTS custom_domain text DEFAULT '';",
        "ALTER TABLE public.merchant_websites ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE public.merchant_websites FORCE ROW LEVEL SECURITY;",
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='merchant_websites' AND policyname='allow_all_merchant_websites') THEN CREATE POLICY allow_all_merchant_websites ON public.merchant_websites FOR ALL USING (true) WITH CHECK (true); END IF; END $$;",
        """
        CREATE TABLE IF NOT EXISTS public.website_gallery_images (
          id text PRIMARY KEY,
          merchant_id text NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
          image_url text NOT NULL,
          caption text DEFAULT '',
          display_order integer DEFAULT 0,
          created_at bigint NOT NULL
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_gallery_merchant ON public.website_gallery_images(merchant_id);",
        "ALTER TABLE public.website_gallery_images ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE public.website_gallery_images FORCE ROW LEVEL SECURITY;",
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='website_gallery_images' AND policyname='allow_all_gallery') THEN CREATE POLICY allow_all_gallery ON public.website_gallery_images FOR ALL USING (true) WITH CHECK (true); END IF; END $$;",
        """
        ALTER TABLE public.merchant_inventory
          ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT true,
          ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0,
          ADD COLUMN IF NOT EXISTS featured boolean DEFAULT false,
          ADD COLUMN IF NOT EXISTS website_description text DEFAULT '';
        """,
    ]
    for stmt in statements:
        try:
            await db.execute(text(stmt))
        except Exception:
            pass
    await db.commit()
    _schema_ensured = True


async def get_by_merchant_id(db: AsyncSession, merchant_id: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text('SELECT * FROM public.merchant_websites WHERE merchant_id = :mid'),
        {"mid": merchant_id}
    )
    row = res.first()
    return _row_to_dict(row) if row else None


async def create_or_get_default(db: AsyncSession, merchant_id: str, shop_name: str) -> dict[str, Any]:
    existing = await get_by_merchant_id(db, merchant_id)
    if existing:
        return existing

    now = int(time.time() * 1000)
    base_slug = slugify(shop_name or "store")

    # Ensure unique slug
    candidate_slug = base_slug
    idx = 1
    while True:
        res = await db.execute(
            text('SELECT 1 FROM public.merchant_websites WHERE slug = :slug'),
            {"slug": candidate_slug}
        )
        if not res.first():
            break
        candidate_slug = f"{base_slug}-{idx}"
        idx += 1

    website_id = f"web_{secrets.token_hex(8)}"
    data = {
        "id": website_id,
        "merchant_id": merchant_id,
        "slug": candidate_slug,
        "status": "published",
        "published_at": int(time.time() * 1000),
        "theme_primary_color": "#4F46E5",
        "theme_secondary_color": "#10B981",
        "theme_font": "Inter",
        "theme_style": "modern",
        "seo_title": shop_name,
        "seo_description": f"Official online store of {shop_name}",
        "seo_keywords": "store, products, online shopping",
        "hero_enabled": True,
        "hero_title": f"Welcome to {shop_name}",
        "hero_subtitle": "Discover our quality products & services.",
        "hero_image_url": "",
        "hero_cta_text": "Browse Products",
        "hero_cta_link": "#products",
        "about_enabled": True,
        "about_title": "About Us",
        "about_description": f"{shop_name} offers premium products with customer satisfaction guaranteed.",
        "about_image_url": "",
        "products_enabled": True,
        "products_title": "Our Products",
        "products_layout": "grid",
        "products_per_page": 12,
        "categories_enabled": False,
        "gallery_enabled": False,
        "gallery_title": "Gallery",
        "contact_enabled": True,
        "contact_show_phone": True,
        "contact_show_email": True,
        "contact_show_address": True,
        "contact_show_map": True,
        "footer_text": f"© {time.strftime('%Y')} {shop_name}. All rights reserved.",
        "footer_show_social": False,
        "footer_facebook": "",
        "footer_instagram": "",
        "footer_twitter": "",
        "footer_whatsapp": "",
        "business_hours": '[]',
        "section_order": '["hero","about","products","gallery","contact"]',
        "created_at": now,
        "updated_at": now
    }

    cols = list(data.keys())
    col_sql = ", ".join(cols)
    val_sql = ", ".join(f":{c}" for c in cols)

    res = await db.execute(
        text(f'INSERT INTO public.merchant_websites ({col_sql}) VALUES ({val_sql}) RETURNING *'),
        data
    )
    saved = res.first()
    await db.commit()
    return _row_to_dict(saved)


async def update_website(db: AsyncSession, merchant_id: str, patch: dict[str, Any]) -> Optional[dict[str, Any]]:
    import json
    cols_to_update = []
    params = {"mid": merchant_id, "updated_at": int(time.time() * 1000)}

    allowed_cols = {
        "slug", "custom_domain", "theme_primary_color", "theme_secondary_color", "theme_font", "theme_style",
        "seo_title", "seo_description", "seo_keywords",
        "hero_enabled", "hero_title", "hero_subtitle", "hero_image_url", "hero_cta_text", "hero_cta_link",
        "about_enabled", "about_title", "about_description", "about_image_url",
        "products_enabled", "products_title", "products_layout", "products_per_page",
        "categories_enabled", "gallery_enabled", "gallery_title",
        "contact_enabled", "contact_show_phone", "contact_show_email", "contact_show_address", "contact_show_map",
        "footer_text", "footer_show_social", "footer_facebook", "footer_instagram", "footer_twitter", "footer_whatsapp",
        "business_hours", "section_order"
    }

    for key, val in patch.items():
        if key in allowed_cols:
            cols_to_update.append(f"{key} = :{key}")
            if isinstance(val, (dict, list)):
                params[key] = json.dumps(val)
            else:
                params[key] = val

    if not cols_to_update:
        return await get_by_merchant_id(db, merchant_id)

    cols_to_update.append("updated_at = :updated_at")
    set_sql = ", ".join(cols_to_update)

    res = await db.execute(
        text(f'UPDATE public.merchant_websites SET {set_sql} WHERE merchant_id = :mid RETURNING *'),
        params
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row) if row else None


async def publish_website(db: AsyncSession, merchant_id: str) -> Optional[dict[str, Any]]:
    now = int(time.time() * 1000)
    res = await db.execute(
        text('''
            UPDATE public.merchant_websites
            SET status = 'published', published_at = :now, updated_at = :now
            WHERE merchant_id = :mid
            RETURNING *
        '''),
        {"mid": merchant_id, "now": now}
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row) if row else None


async def unpublish_website(db: AsyncSession, merchant_id: str) -> Optional[dict[str, Any]]:
    now = int(time.time() * 1000)
    res = await db.execute(
        text('''
            UPDATE public.merchant_websites
            SET status = 'draft', updated_at = :now
            WHERE merchant_id = :mid
            RETURNING *
        '''),
        {"mid": merchant_id, "now": now}
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row) if row else None


async def get_gallery_images(db: AsyncSession, merchant_id: str) -> List[dict[str, Any]]:
    res = await db.execute(
        text('SELECT * FROM public.website_gallery_images WHERE merchant_id = :mid ORDER BY display_order ASC, created_at DESC'),
        {"mid": merchant_id}
    )
    return [_row_to_dict(r) for r in res.fetchall()]


async def add_gallery_image(db: AsyncSession, merchant_id: str, image_url: str, caption: str = "") -> dict[str, Any]:
    now = int(time.time() * 1000)
    img_id = f"gal_{secrets.token_hex(8)}"
    data = {
        "id": img_id,
        "merchant_id": merchant_id,
        "image_url": image_url,
        "caption": caption,
        "display_order": 0,
        "created_at": now
    }
    res = await db.execute(
        text('INSERT INTO public.website_gallery_images (id, merchant_id, image_url, caption, display_order, created_at) VALUES (:id, :merchant_id, :image_url, :caption, :display_order, :created_at) RETURNING *'),
        data
    )
    saved = res.first()
    await db.commit()
    return _row_to_dict(saved)


async def delete_gallery_image(db: AsyncSession, merchant_id: str, image_id: str) -> bool:
    res = await db.execute(
        text('DELETE FROM public.website_gallery_images WHERE id = :id AND merchant_id = :mid RETURNING id'),
        {"id": image_id, "mid": merchant_id}
    )
    deleted = res.first()
    await db.commit()
    return bool(deleted)


async def get_public_store_by_slug(db: AsyncSession, slug: str) -> Optional[dict[str, Any]]:
    await ensure_schema(db)
    raw_slug = (slug or "").strip().lower()
    raw_slug = re.sub(r"^https?://", "", raw_slug).strip("/")
    
    slug_variations = {raw_slug}
    if raw_slug.startswith("www."):
        slug_variations.add(raw_slug[4:])
    else:
        slug_variations.add(f"www.{raw_slug}")

    query = """
        SELECT
            w.slug, w.custom_domain, w.status, w.theme_primary_color, w.theme_secondary_color, w.theme_font, w.theme_style,
            w.seo_title, w.seo_description, w.seo_keywords,
            w.hero_enabled, w.hero_title, w.hero_subtitle, w.hero_image_url, w.hero_cta_text, w.hero_cta_link,
            w.about_enabled, w.about_title, w.about_description, w.about_image_url,
            w.products_enabled, w.products_title, w.products_layout, w.products_per_page,
            w.categories_enabled, w.gallery_enabled, w.gallery_title,
            w.contact_enabled, w.contact_show_phone, w.contact_show_email, w.contact_show_address, w.contact_show_map,
            w.footer_text, w.footer_show_social, w.footer_facebook, w.footer_instagram, w.footer_twitter, w.footer_whatsapp,
            w.business_hours, w.section_order,
            m.id as merchant_id, m."shopName", m."ownerName", m."tradeName", m."legalName", m."brandName", m."brandColor",
            m."logoUrl", m."hasCustomLogo", m.email, m.phone, m.address, m.city, m.state, m.pincode, m.latitude, m.longitude
        FROM public.merchant_websites w
        JOIN public.merchants m ON m.id = w.merchant_id
        WHERE (
            lower(w.slug) = ANY(:slugs)
            OR lower(w.custom_domain) = ANY(:slugs)
            OR lower(replace(replace(coalesce(w.custom_domain, ''), 'https://', ''), 'http://', '')) = ANY(:slugs)
        )
        AND (m.status IS NULL OR m.status NOT IN ('suspended', 'disabled'))
        AND w.status = 'published'
        LIMIT 1
    """
    res = await db.execute(text(query), {"slugs": list(slug_variations)})
    row = res.first()
    return _row_to_dict(row) if row else None


async def list_all_published_stores(db: AsyncSession, limit: int = 500) -> List[dict[str, Any]]:
    """Returns list of published stores for sitemaps and search indexing."""
    await ensure_schema(db)
    query = """
        SELECT
            w.slug, w.custom_domain, w.seo_title, w.seo_description, w.updated_at,
            m."shopName", m."brandName", m.city, m.state
        FROM public.merchant_websites w
        JOIN public.merchants m ON m.id = w.merchant_id
        WHERE w.status = 'published'
          AND (m.status IS NULL OR m.status NOT IN ('suspended', 'disabled'))
        ORDER BY w.updated_at DESC
        LIMIT :limit
    """
    res = await db.execute(text(query), {"limit": limit})
    return [_row_to_dict(r) for r in res.fetchall()]


async def get_public_store_products(db: AsyncSession, merchant_id: str, limit: int = 50, offset: int = 0) -> List[dict[str, Any]]:
    res = await db.execute(
        text('''
            SELECT
                id, product_name, description, hsn_code, gst_rate, selling_price,
                stock_quantity, unit, image_url, featured, website_description, display_order
            FROM public.merchant_inventory
            WHERE merchant_id = :mid AND is_active = true AND (is_published = true OR is_published IS NULL)
            ORDER BY featured DESC, display_order ASC, product_name ASC
            LIMIT :limit OFFSET :offset
        '''),
        {"mid": merchant_id, "limit": limit, "offset": offset}
    )
    products = [_row_to_dict(r) for r in res.fetchall()]

    # Inject Smart Product Intelligence if available
    try:
        from . import billing_repo
        intel_list = await billing_repo.get_product_intelligence(db, merchant_id)
        intel_map = {item["name"].strip().lower(): item for item in intel_list if item.get("name")}

        for p in products:
            p_name = (p.get("product_name") or "").strip().lower()
            if p_name in intel_map:
                info = intel_map[p_name]
                p["sales_frequency"] = info.get("frequency", 0)
                p["total_sold"] = info.get("total_qty_sold", 0)
                p["is_bestseller"] = info.get("total_qty_sold", 0) > 5 or info.get("frequency", 0) > 2
            else:
                p["sales_frequency"] = 0
                p["total_sold"] = 0
                p["is_bestseller"] = False

        # Sort bestsellers first if featured is equal
        products.sort(key=lambda x: (not x.get("featured", False), not x.get("is_bestseller", False), x.get("display_order", 0)))
    except Exception:
        pass

    return products
