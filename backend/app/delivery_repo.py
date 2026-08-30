"""
delivery_repo.py — Direct-Postgres repository for public.deliveries & status events.

Enables 1-click order fulfillment and tracking directly linked to canonical invoices.
Follows established AsyncSession + text() SQL pattern.
"""

from typing import Any, Dict, List, Optional
import time
import secrets
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def _row_to_dict(row: Any) -> dict[str, Any]:
    if not row:
        return {}
    return dict(row._mapping)


async def ensure_schema(db: AsyncSession) -> None:
    """Creates deliveries and delivery_status_events tables with RLS."""
    statements = [
        """
        CREATE TABLE IF NOT EXISTS public.deliveries (
            id text PRIMARY KEY,
            merchant_id text NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
            invoice_id text REFERENCES public.invoices(id) ON DELETE SET NULL,
            order_ref text DEFAULT '',
            status text NOT NULL DEFAULT 'pending', -- 'pending' | 'picked' | 'in_transit' | 'delivered' | 'failed'
            address text NOT NULL,
            recipient_name text NOT NULL,
            recipient_phone text NOT NULL,
            courier_name text DEFAULT '',
            tracking_ref text DEFAULT '',
            pickup_time bigint,
            delivered_at bigint,
            created_at bigint NOT NULL,
            updated_at bigint NOT NULL
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_deliv_merchant ON public.deliveries(merchant_id, created_at DESC);",
        "CREATE INDEX IF NOT EXISTS idx_deliv_invoice ON public.deliveries(invoice_id);",
        "ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE public.deliveries FORCE ROW LEVEL SECURITY;",
        "REVOKE ALL ON public.deliveries FROM anon;",
        "REVOKE ALL ON public.deliveries FROM authenticated;",

        """
        CREATE TABLE IF NOT EXISTS public.delivery_status_events (
            id text PRIMARY KEY,
            delivery_id text NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
            status text NOT NULL,
            notes text DEFAULT '',
            updated_by text DEFAULT '',
            created_at bigint NOT NULL
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_deliv_events ON public.delivery_status_events(delivery_id, created_at ASC);",
        "ALTER TABLE public.delivery_status_events ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE public.delivery_status_events FORCE ROW LEVEL SECURITY;",
        "REVOKE ALL ON public.delivery_status_events FROM anon;",
        "REVOKE ALL ON public.delivery_status_events FROM authenticated;",
    ]

    for stmt in statements:
        try:
            await db.execute(text(stmt))
            await db.commit()
        except Exception:
            pass


async def create_delivery_from_invoice(
    db: AsyncSession,
    merchant_id: str,
    invoice_id: str,
    courier_name: str = "",
    tracking_ref: str = "",
) -> Optional[Dict[str, Any]]:
    """Creates a new delivery dispatch record linked to an existing invoice with 1 click."""
    await ensure_schema(db)
    now = int(time.time() * 1000)

    # 1. Fetch invoice details
    inv_res = await db.execute(
        text('SELECT * FROM public.invoices WHERE id = :id AND "merchantId" = :mid'),
        {"id": invoice_id, "mid": merchant_id},
    )
    inv = inv_res.first()
    if not inv:
        return None

    deliv_id = f"del_{secrets.token_hex(8)}"
    inv_dict = _row_to_dict(inv)

    # 2. Insert Delivery row
    await db.execute(
        text("""
            INSERT INTO public.deliveries
            (id, merchant_id, invoice_id, order_ref, status, address, recipient_name, recipient_phone, courier_name, tracking_ref, created_at, updated_at)
            VALUES (:id, :mid, :invid, :oref, 'picked', :addr, :rname, :rphone, :cname, :tref, :now, :now)
        """),
        {
            "id": deliv_id,
            "mid": merchant_id,
            "invid": invoice_id,
            "oref": inv_dict.get("invoiceNo") or inv_dict.get("invoiceNumber") or "INV",
            "addr": inv_dict.get("customerAddress") or "Customer Address",
            "rname": inv_dict.get("customerName") or "Customer",
            "rphone": inv_dict.get("customerPhone") or "",
            "cname": courier_name or "Self Dispatch",
            "tref": tracking_ref or f"TRK-{secrets.token_hex(4).upper()}",
            "now": now,
        },
    )

    # 3. Log initial status event
    event_id = f"dev_{secrets.token_hex(6)}"
    await db.execute(
        text("""
            INSERT INTO public.delivery_status_events
            (id, delivery_id, status, notes, updated_by, created_at)
            VALUES (:id, :did, 'picked', 'Parcel packed & dispatched from merchant warehouse', 'merchant', :now)
        """),
        {"id": event_id, "did": deliv_id, "now": now},
    )

    await db.commit()
    res = await db.execute(text("SELECT * FROM public.deliveries WHERE id = :id"), {"id": deliv_id})
    return _row_to_dict(res.first())


async def update_delivery_status(
    db: AsyncSession,
    merchant_id: str,
    delivery_id: str,
    status_val: str,
    notes: str = "",
) -> Optional[Dict[str, Any]]:
    """Updates shipment status and logs status event."""
    await ensure_schema(db)
    now = int(time.time() * 1000)

    # Update delivery
    delivered_at_sql = ", delivered_at = :now" if status_val == "delivered" else ""
    await db.execute(
        text(f"""
            UPDATE public.deliveries
            SET status = :status, updated_at = :now {delivered_at_sql}
            WHERE id = :id AND merchant_id = :mid
        """),
        {"id": delivery_id, "mid": merchant_id, "status": status_val, "now": now},
    )

    # Log event
    event_id = f"dev_{secrets.token_hex(6)}"
    await db.execute(
        text("""
            INSERT INTO public.delivery_status_events
            (id, delivery_id, status, notes, updated_by, created_at)
            VALUES (:id, :did, :status, :notes, 'merchant', :now)
        """),
        {"id": event_id, "did": delivery_id, "status": status_val, "notes": notes or f"Status changed to {status_val}", "now": now},
    )

    await db.commit()
    res = await db.execute(text("SELECT * FROM public.deliveries WHERE id = :id"), {"id": delivery_id})
    return _row_to_dict(res.first())


async def list_merchant_deliveries(db: AsyncSession, merchant_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Lists all active and past deliveries for a merchant."""
    await ensure_schema(db)
    res = await db.execute(
        text("SELECT * FROM public.deliveries WHERE merchant_id = :mid ORDER BY created_at DESC LIMIT :limit"),
        {"mid": merchant_id, "limit": limit},
    )
    return [_row_to_dict(r) for r in res.fetchall()]


async def get_delivery_tracking_info(db: AsyncSession, delivery_id: str) -> Optional[Dict[str, Any]]:
    """Fetches public tracking timeline for a shipment."""
    await ensure_schema(db)
    d_res = await db.execute(
        text("SELECT * FROM public.deliveries WHERE id = :id"),
        {"id": delivery_id},
    )
    delivery = d_res.first()
    if not delivery:
        return None

    events_res = await db.execute(
        text("SELECT * FROM public.delivery_status_events WHERE delivery_id = :did ORDER BY created_at ASC"),
        {"did": delivery_id},
    )

    return {
        "delivery": _row_to_dict(delivery),
        "timeline": [_row_to_dict(e) for e in events_res.fetchall()],
    }
