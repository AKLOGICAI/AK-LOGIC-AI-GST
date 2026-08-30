import secrets
import time
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from ..database import get_db
from .. import security, inventory_repo

router = APIRouter(tags=["inventory"])

class CreateInventoryItem(BaseModel):
    product_name: str
    description: str = ""
    hsn_code: str = ""
    gst_rate: float = 18.0
    selling_price: float = 0.0
    cost_price: float = 0.0
    stock_quantity: float = 0.0
    unit: str = "pcs"
    image_url: str = ""
    # Merchant Website Builder fields (see supabase migration adding these
    # 4 columns to merchant_inventory) — optional so every existing caller
    # that only ever set the fields above keeps working unchanged.
    is_published: Optional[bool] = None
    featured: Optional[bool] = None
    website_description: Optional[str] = None
    display_order: Optional[int] = None

class UpdateInventoryItem(BaseModel):
    product_name: Optional[str] = None
    description: Optional[str] = None
    hsn_code: Optional[str] = None
    gst_rate: Optional[float] = None
    selling_price: Optional[float] = None
    cost_price: Optional[float] = None
    stock_quantity: Optional[float] = None
    unit: Optional[str] = None
    image_url: Optional[str] = None
    # Merchant Website Builder fields — lets WebsitePage.tsx's "Featured" /
    # "Show on Website" toggles actually persist (previously silently
    # dropped here since Pydantic strips any field not declared on the
    # model, even though inventory_repo.update_item itself is fully
    # dynamic and would have written them fine).
    is_published: Optional[bool] = None
    featured: Optional[bool] = None
    website_description: Optional[str] = None
    display_order: Optional[int] = None

@router.get("/inventory")
async def list_inventory(
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db)
):
    return await inventory_repo.list_items(db, merchant_id)

@router.post("/inventory")
async def create_inventory(
    item: CreateInventoryItem,
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db)
):
    now = int(time.time() * 1000)
    data = item.model_dump(exclude_none=True)
    data.update({
        "id": secrets.token_urlsafe(16),
        "merchant_id": merchant_id,
        "is_active": True,
        "created_at": now,
        "updated_at": now
    })
    return await inventory_repo.create_item(db, data)

@router.patch("/inventory/{item_id}")
async def update_inventory(
    item_id: str,
    item: UpdateInventoryItem,
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db)
):
    data = item.model_dump(exclude_unset=True)
    if not data:
        return await inventory_repo.get_item(db, item_id, merchant_id)
        
    data["updated_at"] = int(time.time() * 1000)
    updated = await inventory_repo.update_item(db, item_id, merchant_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Item not found")
    return updated

@router.delete("/inventory/{item_id}")
async def delete_inventory(
    item_id: str,
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db)
):
    deleted = await inventory_repo.delete_item(db, item_id, merchant_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True}
