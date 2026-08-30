"""Backend Supabase Storage Gateway & Image Processing Service.

Handles:
1. Uploading assets to public ('merchant-branding') or private ('merchant-signatures') buckets.
2. WebP image compression/resizing server-side.
3. Generating 1-hour presigned URLs for private signature and seal assets.
"""

import base64
import logging
import io
import os
import secrets
from typing import Optional, Tuple
import httpx

from .config import settings

logger = logging.getLogger("storage_service")

# Storage Buckets
PUBLIC_BRANDING_BUCKET = "merchant-branding"
PRIVATE_SIGNATURES_BUCKET = "merchant-signatures"


def _get_supabase_config() -> Tuple[str, str]:
    """Retrieve Supabase URL and Service Role Key from config or environment."""
    url = getattr(settings, "supabase_url", "") or os.getenv("SUPABASE_URL", "")
    service_key = getattr(settings, "supabase_service_key", "") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "") or getattr(settings, "supabase_anon_key", "")
    return url.rstrip("/"), service_key


async def upload_asset(
    bucket: str,
    path: str,
    file_bytes: bytes,
    mime_type: str = "image/webp"
) -> Optional[str]:
    """Upload binary file bytes to specified Supabase Storage bucket."""
    supabase_url, service_key = _get_supabase_config()
    if not supabase_url or not service_key:
        logger.warning("Supabase URL or Service Key not configured for storage upload.")
        return None

    target_url = f"{supabase_url}/storage/v1/object/{bucket}/{path}"
    headers = {
        "Authorization": f"Bearer {service_key}",
        "Content-Type": mime_type,
        "x-upsert": "true",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(target_url, content=file_bytes, headers=headers)
            if resp.status_code in (200, 201):
                # For public bucket, return direct CDN URL
                if bucket == PUBLIC_BRANDING_BUCKET:
                    return f"{supabase_url}/storage/v1/object/public/{bucket}/{path}"
                # For private bucket, return internal bucket path reference
                return f"{supabase_url}/storage/v1/object/{bucket}/{path}"
            else:
                logger.error(f"Storage upload failed HTTP {resp.status_code}: {resp.text}")
                return None
    except Exception as e:
        logger.error(f"Exception during storage upload to {bucket}/{path}: {e}")
        return None


async def generate_signed_url(
    bucket: str,
    path: str,
    expires_in_seconds: int = 3600
) -> Optional[str]:
    """Generate a short-lived presigned URL for private storage objects."""
    supabase_url, service_key = _get_supabase_config()
    if not supabase_url or not service_key:
        return None

    # Strip full domain if full URL was passed
    clean_path = path
    prefix = f"{supabase_url}/storage/v1/object/{bucket}/"
    if clean_path.startswith(prefix):
        clean_path = clean_path[len(prefix):]
    public_prefix = f"{supabase_url}/storage/v1/object/public/{bucket}/"
    if clean_path.startswith(public_prefix):
        clean_path = clean_path[len(public_prefix):]

    target_url = f"{supabase_url}/storage/v1/object/sign/{bucket}/{clean_path}"
    headers = {
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                target_url,
                json={"expiresIn": expires_in_seconds},
                headers=headers
            )
            if resp.status_code == 200:
                data = resp.json()
                signed_path = data.get("signedURL") or data.get("signedUrl")
                if signed_path:
                    if signed_path.startswith("http"):
                        return signed_path
                    return f"{supabase_url}{signed_path}"
            logger.warning(f"Signed URL generation failed HTTP {resp.status_code}: {resp.text}")
            return None
    except Exception as e:
        logger.error(f"Exception generating signed URL for {bucket}/{clean_path}: {e}")
        return None


def compress_image_to_webp(file_bytes: bytes, max_dim: int = 800, quality: int = 80) -> bytes:
    """Convert PNG/JPEG bytes to WebP and resize if larger than max_dim."""
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(file_bytes))
        
        # Convert non-standard image modes to RGBA/RGB for WebP compatibility
        if img.mode in ("CMYK", "YCbCr", "I", "F", "1"):
            img = img.convert("RGB")
        elif img.mode in ("P", "LA"):
            img = img.convert("RGBA")
            
        w, h = img.size
        if w > max_dim or h > max_dim:
            if w > h:
                h = int((h * max_dim) / w)
                w = max_dim
            else:
                w = int((w * max_dim) / h)
                h = max_dim
            img = img.resize((w, h), Image.Resampling.LANCZOS)
            
        out = io.BytesIO()
        img.save(out, format="WEBP", quality=quality, optimize=True)
        return out.getvalue()
    except Exception as e:
        logger.warning(f"Pillow image compression failed (falling back to raw bytes): {e}")
        return file_bytes
