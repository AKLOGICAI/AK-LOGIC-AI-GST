from typing import Any, Optional
import time

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def _row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row._mapping)

async def ensure_schema(db: AsyncSession) -> None:
    statements = [
        """
        create table if not exists public.merchant_inventory (
          id text primary key,
          merchant_id text not null references public.merchants(id) on delete cascade,
          product_name text not null,
          description text default '',
          hsn_code text default '',
          gst_rate numeric not null default 18,
          selling_price numeric not null default 0,
          cost_price numeric default 0,
          stock_quantity numeric not null default 0,
          unit text default 'pcs',
          image_url text default '',
          is_active boolean default true,
          created_at bigint not null,
          updated_at bigint not null
        );
        """,
        'create index if not exists idx_inventory_merchant on public.merchant_inventory(merchant_id);',
    ]
    for stmt in statements:
        await db.execute(text(stmt))
    await db.commit()

async def list_items(db: AsyncSession, merchant_id: str) -> list[dict[str, Any]]:
    res = await db.execute(
        text('''
            select * from public.merchant_inventory
            where merchant_id = :mid and is_active = true
            order by product_name asc
        '''),
        {"mid": merchant_id},
    )
    return [_row_to_dict(r) for r in res.fetchall()]

async def get_item(db: AsyncSession, item_id: str, merchant_id: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text('''
            select * from public.merchant_inventory
            where id = :id and merchant_id = :mid and is_active = true
        '''),
        {"id": item_id, "mid": merchant_id},
    )
    row = res.first()
    return _row_to_dict(row) if row else None

async def create_item(db: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    cols = list(data.keys())
    col_sql = ", ".join(cols)
    val_sql = ", ".join(f":{c}" for c in cols)
    
    res = await db.execute(
        text(
            f'insert into public.merchant_inventory ({col_sql}) values ({val_sql}) '
            'returning *'
        ),
        data,
    )
    saved = res.first()
    await db.commit()
    return _row_to_dict(saved)

async def update_item(db: AsyncSession, item_id: str, merchant_id: str, data: dict[str, Any]) -> Optional[dict[str, Any]]:
    if not data:
        return await get_item(db, item_id, merchant_id)
        
    cols = list(data.keys())
    set_sql = ", ".join(f"{c} = :{c}" for c in cols)
    params = dict(data)
    params["id"] = item_id
    params["mid"] = merchant_id
    
    res = await db.execute(
        text(
            f'update public.merchant_inventory set {set_sql} '
            'where id = :id and merchant_id = :mid and is_active = true '
            'returning *'
        ),
        params,
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row) if row else None

async def delete_item(db: AsyncSession, item_id: str, merchant_id: str) -> bool:
    res = await db.execute(
        text('''
            update public.merchant_inventory set is_active = false
            where id = :id and merchant_id = :mid and is_active = true
            returning id
        '''),
        {"id": item_id, "mid": merchant_id},
    )
    row = res.first()
    await db.commit()
    return bool(row)

async def deduct_stock(db: AsyncSession, item_id: str, merchant_id: str, quantity: float) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text('''
            update public.merchant_inventory 
            set stock_quantity = GREATEST(0, stock_quantity - :qty), updated_at = :now
            where id = :id and merchant_id = :mid and is_active = true
            returning *
        '''),
        {"id": item_id, "mid": merchant_id, "qty": float(quantity), "now": int(time.time() * 1000)},
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row) if row else None

