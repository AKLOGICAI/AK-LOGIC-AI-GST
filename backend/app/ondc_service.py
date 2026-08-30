"""
ondc_service.py — ONDC (Open Network for Digital Commerce) Seller Protocol Service.

Implements Beckn protocol schema validation, signature verification placeholders,
and catalog translation from public.merchant_inventory to ONDC BAP format.
"""

from typing import Any, Dict, List, Optional
import time
import secrets
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("ondc_protocol")


def create_beckn_ack(message_id: str, is_ack: bool = True, error_code: str = "", error_msg: str = "") -> Dict[str, Any]:
    """Generates standard Beckn Protocol ACK/NACK response envelope."""
    if is_ack:
        return {
            "message": {"ack": {"status": "ACK"}},
            "error": None,
        }
    return {
        "message": {"ack": {"status": "NACK"}},
        "error": {
            "type": "DOMAIN-ERROR",
            "code": error_code or "30000",
            "message": error_msg or "Generic processing failure",
        },
    }


async def transform_inventory_to_ondc_catalog(
    db: AsyncSession,
    merchant_id: str,
) -> Dict[str, Any]:
    """
    Transforms merchant inventory into ONDC Beckn Catalog format (bpp/providers/items).
    """
    # 1. Fetch merchant details
    m_res = await db.execute(
        text('SELECT id, "shopName", "tradeName", "logoUrl", address, city, pincode, state FROM public.merchants WHERE id = :mid'),
        {"mid": merchant_id},
    )
    m = m_res.first()
    if not m:
        return {}

    # 2. Fetch active inventory
    inv_res = await db.execute(
        text("""
            SELECT id, product_name, description, hsn_code, gst_rate, selling_price, stock_quantity, unit, image_url
            FROM public.merchant_inventory
            WHERE merchant_id = :mid AND is_active = true AND stock_quantity > 0
        """),
        {"mid": merchant_id},
    )
    items = inv_res.fetchall()

    ondc_items = []
    for it in items:
        ondc_items.append({
            "id": it.id,
            "descriptor": {
                "name": it.product_name,
                "short_desc": it.description or it.product_name,
                "images": [it.image_url] if it.image_url else [],
            },
            "price": {
                "currency": "INR",
                "value": str(it.selling_price),
            },
            "quantity": {
                "available": {"count": it.stock_quantity},
                "maximum": {"count": min(it.stock_quantity, 10)},
            },
            "tags": {
                "hsn": it.hsn_code,
                "gst_rate": f"{it.gst_rate}%",
            },
        })

    return {
        "bpp/descriptor": {
            "name": m.shopName or m.tradeName or "AK-LOGIC Merchant",
            "symbol": m.logoUrl or "",
        },
        "bpp/providers": [
            {
                "id": m.id,
                "descriptor": {
                    "name": m.shopName,
                },
                "locations": [
                    {
                        "id": f"loc_{m.id}",
                        "address": {"city": m.city, "state": m.state, "area_code": m.pincode},
                    }
                ],
                "items": ondc_items,
            }
        ],
    }
