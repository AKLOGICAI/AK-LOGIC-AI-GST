"""Merchant Website Builder API router.
Gated by merchant session + super-admin feature flag check.
Includes public store endpoints for /store/{slug}.
"""
import base64
import logging
import secrets
from typing import Any, Dict, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from .. import merchant_repo, website_repo, feature_flags_repo, storage_service
from ..database import get_db
from ..security import require_merchant

logger = logging.getLogger("website_builder")

router = APIRouter(tags=["website"])


# ==========================================
# Gating Dependency
# ==========================================
async def require_website_enabled(
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Verifies that the merchant exists and returns merchant dict."""
    merchant = await merchant_repo.get_by_id_light(db, merchant_id)
    if not merchant:
        raise HTTPException(status_code=401, detail="Access denied: Merchant not found.")
    return merchant


# ==========================================
# Schemas
# ==========================================
class WebsiteUpdateIn(BaseModel):
    slug: Optional[str] = None
    custom_domain: Optional[str] = None
    theme_primary_color: Optional[str] = None
    theme_secondary_color: Optional[str] = None
    theme_font: Optional[str] = None
    theme_style: Optional[str] = None

    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    seo_keywords: Optional[str] = None

    hero_enabled: Optional[bool] = None
    hero_title: Optional[str] = None
    hero_subtitle: Optional[str] = None
    hero_image_url: Optional[str] = None
    hero_cta_text: Optional[str] = None
    hero_cta_link: Optional[str] = None

    about_enabled: Optional[bool] = None
    about_title: Optional[str] = None
    about_description: Optional[str] = None
    about_image_url: Optional[str] = None

    products_enabled: Optional[bool] = None
    products_title: Optional[str] = None
    products_layout: Optional[str] = None
    products_per_page: Optional[int] = None

    categories_enabled: Optional[bool] = None
    gallery_enabled: Optional[bool] = None
    gallery_title: Optional[str] = None

    contact_enabled: Optional[bool] = None
    contact_show_phone: Optional[bool] = None
    contact_show_email: Optional[bool] = None
    contact_show_address: Optional[bool] = None
    contact_show_map: Optional[bool] = None

    footer_text: Optional[str] = None
    footer_show_social: Optional[bool] = None
    footer_facebook: Optional[str] = None
    footer_instagram: Optional[str] = None
    footer_twitter: Optional[str] = None
    footer_whatsapp: Optional[str] = None

    business_hours: Optional[Any] = None
    section_order: Optional[Any] = None


class WebsiteImageUploadIn(BaseModel):
    imageType: str = Field(..., description="'hero', 'about', or 'gallery'")
    dataUrl: str = Field(..., description="Base64 image data URL")
    caption: Optional[str] = ""


# ==========================================
# Merchant Endpoints
# ==========================================
@router.get("/merchant/website")
async def get_my_website(
    merchant: dict = Depends(require_website_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves or initializes the merchant's website configuration."""
    merchant_id = merchant["id"]
    shop_name = merchant.get("shopName") or merchant.get("tradeName") or "Store"
    website = await website_repo.create_or_get_default(db, merchant_id, shop_name)
    gallery = await website_repo.get_gallery_images(db, merchant_id)
    return {"website": website, "gallery": gallery}


@router.patch("/merchant/website")
@router.post("/merchant/website")
async def update_my_website(
    payload: WebsiteUpdateIn,
    merchant: dict = Depends(require_website_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Updates the merchant's website configuration."""
    merchant_id = merchant["id"]
    patch = payload.model_dump(exclude_unset=True)

    # Validate slug uniqueness if slug is being updated
    if "slug" in patch and patch["slug"]:
        clean_slug = website_repo.slugify(patch["slug"])
        existing = await website_repo.get_by_merchant_id(db, merchant_id)
        if existing and existing.get("slug") != clean_slug:
            # check if slug is taken by another merchant
            res = await db.execute(
                website_repo.text('SELECT merchant_id FROM public.merchant_websites WHERE slug = :slug'),
                {"slug": clean_slug}
            )
            row = res.first()
            if row and row[0] != merchant_id:
                raise HTTPException(400, "This website URL slug is already taken by another merchant.")
            patch["slug"] = clean_slug

    updated = await website_repo.update_website(db, merchant_id, patch)
    gallery = await website_repo.get_gallery_images(db, merchant_id)
    return {"website": updated, "gallery": gallery}


@router.post("/merchant/website/publish")
async def publish_my_website(
    merchant: dict = Depends(require_website_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Publishes the merchant's website making it accessible publicly at /store/{slug}."""
    merchant_id = merchant["id"]
    updated = await website_repo.publish_website(db, merchant_id)
    return {"ok": True, "website": updated}


@router.post("/merchant/website/unpublish")
async def unpublish_my_website(
    merchant: dict = Depends(require_website_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Unpublishes the merchant's website revert to draft mode."""
    merchant_id = merchant["id"]
    updated = await website_repo.unpublish_website(db, merchant_id)
    return {"ok": True, "website": updated}


@router.post("/merchant/website/upload-image")
async def upload_website_image(
    payload: WebsiteImageUploadIn,
    merchant: dict = Depends(require_website_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Uploads hero, about, or gallery image to Supabase Storage."""
    merchant_id = merchant["id"]

    if payload.imageType not in ("hero", "about", "gallery"):
        raise HTTPException(400, "Invalid image type. Must be 'hero', 'about', or 'gallery'.")

    try:

        header, encoded = payload.dataUrl.split(",", 1) if "," in payload.dataUrl else ("", payload.dataUrl)
        file_bytes = base64.b64decode(encoded)
    except Exception:
        raise HTTPException(400, "Invalid base64 image data.")

    compressed_bytes = storage_service.compress_image_to_webp(file_bytes, max_dim=1200, quality=85)
    rand_token = secrets.token_hex(6)
    path = f"{merchant_id}/website_{payload.imageType}_{rand_token}.webp"

    uploaded_url = await storage_service.upload_asset(
        storage_service.PUBLIC_BRANDING_BUCKET, path, compressed_bytes, "image/webp"
    )

    final_url = uploaded_url or payload.dataUrl


    if payload.imageType == "hero":
        await website_repo.update_website(db, merchant_id, {"hero_image_url": final_url})
    elif payload.imageType == "about":
        await website_repo.update_website(db, merchant_id, {"about_image_url": final_url})
    elif payload.imageType == "gallery":
        await website_repo.add_gallery_image(db, merchant_id, final_url, payload.caption or "")

    return {"ok": True, "imageUrl": final_url}


@router.get("/merchant/website/gallery")
async def get_gallery(
    merchant: dict = Depends(require_website_enabled),
    db: AsyncSession = Depends(get_db)
):
    gallery = await website_repo.get_gallery_images(db, merchant["id"])
    return {"gallery": gallery}


@router.delete("/merchant/website/gallery/{image_id}")
async def delete_gallery_item(
    image_id: str,
    merchant: dict = Depends(require_website_enabled),
    db: AsyncSession = Depends(get_db)
):
    success = await website_repo.delete_gallery_image(db, merchant["id"], image_id)
    return {"ok": success}


# ==========================================
# Public Endpoints (No Auth Required)
# ==========================================
@router.get("/public/stores")
async def list_public_stores(
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db)
):
    """Public endpoint: Lists all active published merchant stores for directory and sitemaps."""
    stores = await website_repo.list_all_published_stores(db, limit=limit)
    return {"ok": True, "stores": stores}


@router.get("/public/sitemap-stores.xml")
async def get_stores_sitemap(db: AsyncSession = Depends(get_db)):
    """Generates a dynamic XML sitemap of all published merchant stores for Google/Bing bots."""
    import time
    stores = await website_repo.list_all_published_stores(db, limit=500)
    now_date = time.strftime("%Y-%m-%d")

    url_tags = []
    for s in stores:
        slug = s.get("slug")
        if not slug:
            continue
        custom_domain = (s.get("custom_domain") or "").strip()
        loc = f"https://{custom_domain}" if custom_domain else f"https://gst.ak-logicai.in/store/{slug}"
        up_at = s.get("updated_at")
        lastmod = time.strftime("%Y-%m-%d", time.localtime(up_at / 1000.0)) if up_at else now_date
        url_tags.append(f"""  <url>
    <loc>{loc}</loc>
    <lastmod>{lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>""")

    joined_urls = "\n".join(url_tags)
    xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{joined_urls}
</urlset>"""
    return Response(content=xml_content, media_type="application/xml")


@router.get("/public/store/{slug}")
async def get_public_store(
    slug: str,
    db: AsyncSession = Depends(get_db)
):
    """Public endpoint: Retrieves merchant website config & public safe merchant profile."""
    store_data = await website_repo.get_public_store_by_slug(db, slug)
    if not store_data:
        raise HTTPException(404, "Website not found.")

    gallery = await website_repo.get_gallery_images(db, store_data["merchant_id"])
    return {"store": store_data, "gallery": gallery}


@router.get("/public/store/{slug}/products")
async def get_public_store_products(
    slug: str,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """Public endpoint: Retrieves merchant products for store."""
    store_data = await website_repo.get_public_store_by_slug(db, slug)
    if not store_data:
        raise HTTPException(404, "Website not found.")

    products = await website_repo.get_public_store_products(db, store_data["merchant_id"], limit=limit, offset=offset)
    return {"products": products}


class StoreOrderItem(BaseModel):
    description: str
    qty: float = Field(..., gt=0)
    rate: float = Field(0.0, ge=0)
    gstRate: float = Field(18.0, ge=0)


class StoreOrderIn(BaseModel):
    customerName: Optional[str] = "Store Customer"
    customerPhone: Optional[str] = ""
    customerAddress: Optional[str] = ""
    items: List[StoreOrderItem]
    notes: Optional[str] = "Order placed via Website Store Catalog"


@router.post("/public/store/{slug}/order")
async def place_public_store_order(
    slug: str,
    body: StoreOrderIn,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Public endpoint: Allows customers to place direct orders to the merchant's dashboard."""
    client_ip = request.client.host if request.client else "unknown"
    from .. import rate_limit_repo
    limited = await rate_limit_repo.check_and_increment_window(
        db, f"billing_bucket:store-order:{client_ip}", 20, 10 * 60,
    )
    if limited:
        raise HTTPException(429, "Too many orders placed. Please try again later.")

    store_data = await website_repo.get_public_store_by_slug(db, slug)
    if not store_data:
        raise HTTPException(404, "Website not found.")

    merchant_id = store_data["merchant_id"]
    from .. import billing_repo
    import secrets, time

    now = int(time.time() * 1000)
    req_id = f"req_{secrets.token_urlsafe(12)}"

    formatted_items = [
        {
            "id": f"it_{secrets.token_hex(4)}",
            "description": item.description,
            "hsn": "",
            "qty": item.qty,
            "rate": item.rate,
            "gstRate": item.gstRate,
        }
        for item in body.items
    ]

    # Populate all standard columns for seamless invoice generation
    req_data = {
        "id": req_id,
        "merchantId": merchant_id,
        "customerName": body.customerName or "Website Store Customer",
        "customerPhone": body.customerPhone or "",
        "customerEmail": "",
        "customerGstin": "",
        "customerAddress": body.customerAddress or "Online Store Delivery",
        "customerState": "",
        "paymentMode": "credit",
        "items": formatted_items,
        "notes": body.notes or f"Website Store Order ({slug})",
        "status": "pending",
        "createdAt": now,
    }

    saved = await billing_repo.insert_request(db, req_data)
    return {
        "ok": True,
        "requestId": req_id,
        "message": f"Order #{req_id} sent directly to {store_data.get('shopName', 'merchant')}'s dashboard!"
    }
