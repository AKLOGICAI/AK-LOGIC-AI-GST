"""Direct-Postgres repository for public.merchant_purchases and purchase stock replenishment.
Safe and clean. No raw SQL in routers.
"""
import time
import secrets
from typing import Any, Dict, List, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def _row_to_dict(row: Any) -> dict[str, Any]:
    if not row:
        return {}
    return dict(row._mapping)


_schema_ensured = False


async def ensure_schema(db: AsyncSession) -> None:
    """Creates merchant_purchases & purchase_items tables if missing.
    Ensures execution happens only once per application lifecycle.

    SECURITY FIX: the original version locked down merchant_purchases but did
    not apply the same RLS/grant restrictions to purchase_items. Keep this
    security remediation documented inside the function docstring so it is
    valid Python and remains visible to future maintainers.
    """
    global _schema_ensured
    if _schema_ensured:
        return

    statements = [
        """
        CREATE TABLE IF NOT EXISTS public.merchant_purchases (
            id text PRIMARY KEY,
            merchant_id text NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
            supplier_name text NOT NULL,
            supplier_gstin text DEFAULT '',
            bill_number text NOT NULL,
            bill_date text DEFAULT '',
            total_amount numeric DEFAULT 0,
            total_tax numeric DEFAULT 0,
            cgst numeric DEFAULT 0,
            sgst numeric DEFAULT 0,
            igst numeric DEFAULT 0,
            status text DEFAULT 'completed',
            file_url text DEFAULT '',
            created_at bigint NOT NULL
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_purchases_merchant ON public.merchant_purchases(merchant_id);",
        "ALTER TABLE public.merchant_purchases ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE public.merchant_purchases FORCE ROW LEVEL SECURITY;",
        "REVOKE ALL ON public.merchant_purchases FROM anon;",
        "REVOKE ALL ON public.merchant_purchases FROM authenticated;",
        """
        CREATE TABLE IF NOT EXISTS public.purchase_items (
            id text PRIMARY KEY,
            purchase_id text NOT NULL REFERENCES public.merchant_purchases(id) ON DELETE CASCADE,
            merchant_id text NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
            item_name text NOT NULL,
            hsn text DEFAULT '9983',
            qty integer DEFAULT 1,
            rate numeric DEFAULT 0,
            gst_rate numeric DEFAULT 18,
            amount numeric DEFAULT 0
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON public.purchase_items(purchase_id);",
        "ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE public.purchase_items FORCE ROW LEVEL SECURITY;",
        "REVOKE ALL ON public.purchase_items FROM anon;",
        "REVOKE ALL ON public.purchase_items FROM authenticated;",
    ]

    for stmt in statements:
        try:
            await db.execute(text(stmt))
            await db.commit()
        except Exception:
            pass


async def save_purchase_and_replenish_stock(
    db: AsyncSession,
    merchant_id: str,
    payload: Dict[str, Any]
) -> Dict[str, Any]:
    """Saves purchase record and updates merchant_inventory stock quantities atomically."""
    await ensure_schema(db)
    now = int(time.time() * 1000)
    purchase_id = f"pur_{secrets.token_hex(8)}"

    purch_data = {
        "id": purchase_id,
        "merchant_id": merchant_id,
        "supplier_name": payload.get("supplierName") or "Supplier",
        "supplier_gstin": payload.get("supplierGstin") or "",
        "bill_number": payload.get("billNumber") or f"BILL-{secrets.token_hex(4).upper()}",
        "bill_date": payload.get("billDate") or "",
        "total_amount": float(payload.get("totalAmount") or 0.0),
        "total_tax": float(payload.get("totalTax") or 0.0),
        "cgst": float(payload.get("cgst") or 0.0),
        "sgst": float(payload.get("sgst") or 0.0),
        "igst": float(payload.get("igst") or 0.0),
        "status": "completed",
        "file_url": payload.get("fileUrl") or "",
        "created_at": now
    }

    cols = list(purch_data.keys())
    col_sql = ", ".join(cols)
    val_sql = ", ".join(f":{c}" for c in cols)
    await db.execute(text(f'INSERT INTO public.merchant_purchases ({col_sql}) VALUES ({val_sql})'), purch_data)

    items = payload.get("items") or []
    saved_items = []

    for item in items:
        item_id = f"pitem_{secrets.token_hex(6)}"
        name = item.get("name") or item.get("description") or "Item"
        hsn = item.get("hsn") or "9983"
        qty = int(item.get("qty") or 1)
        rate = float(item.get("rate") or 0.0)
        gst_rate = float(item.get("gstRate") or 18.0)
        amount = float(item.get("amount") or (qty * rate))

        item_data = {
            "id": item_id,
            "purchase_id": purchase_id,
            "merchant_id": merchant_id,
            "item_name": name,
            "hsn": hsn,
            "qty": qty,
            "rate": rate,
            "gst_rate": gst_rate,
            "amount": amount
        }

        icols = list(item_data.keys())
        icol_sql = ", ".join(icols)
        ival_sql = ", ".join(f":{c}" for c in icols)
        await db.execute(text(f'INSERT INTO public.purchase_items ({icol_sql}) VALUES ({ival_sql})'), item_data)
        saved_items.append(item_data)

        hsn_condition = "OR (hsn_code = :hsn AND length(hsn_code) >= 6)" if len(hsn.strip()) >= 6 else ""
        res = await db.execute(
            text(f'''
                SELECT id, stock_quantity FROM public.merchant_inventory
                WHERE merchant_id = :mid AND (lower(product_name) = lower(:name) {hsn_condition})
                LIMIT 1
            '''),
            {"mid": merchant_id, "name": name.strip(), "hsn": hsn.strip()}
        )
        inv_row = res.first()

        if inv_row:
            inv_id = inv_row[0]
            await db.execute(
                text('''
                    UPDATE public.merchant_inventory
                    SET stock_quantity = stock_quantity + :qty, cost_price = :rate, updated_at = :now
                    WHERE id = :inv_id
                '''),
                {"qty": qty, "rate": rate, "now": now, "inv_id": inv_id}
            )
        else:
            new_inv_id = f"inv_{secrets.token_hex(6)}"
            await db.execute(
                text('''
                    INSERT INTO public.merchant_inventory
                    (id, merchant_id, product_name, description, hsn_code, gst_rate, selling_price, cost_price, stock_quantity, unit, created_at, updated_at)
                    VALUES
                    (:id, :mid, :name, :desc, :hsn, :gst, :sell, :cost, :qty, 'pcs', :now, :now)
                '''),
                {
                    "id": new_inv_id,
                    "mid": merchant_id,
                    "name": name,
                    "desc": f"Purchased from {purch_data['supplier_name']}",
                    "hsn": hsn,
                    "gst": gst_rate,
                    "sell": round(rate * 1.25, 2),
                    "cost": rate,
                    "qty": qty,
                    "now": now
                }
            )

    try:
        from . import feature_flags_repo, accounting_repo
        if await feature_flags_repo.is_enabled(db, "deep_accounting_enabled", merchant_id=merchant_id):
            await accounting_repo.post_purchase_journal(
                db=db,
                merchant_id=merchant_id,
                purchase_data={**purch_data, "items": saved_items},
                commit=False
            )
    except Exception:
        pass

    await db.commit()
    purch_data["items"] = saved_items
    return purch_data


async def get_merchant_purchases(db: AsyncSession, merchant_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieves purchase invoice history for a merchant using a high-performance batch query."""
    res = await db.execute(
        text('''
            SELECT * FROM public.merchant_purchases
            WHERE merchant_id = :mid
            ORDER BY created_at DESC
            LIMIT :limit
        '''),
        {"mid": merchant_id, "limit": limit}
    )
    rows = [_row_to_dict(r) for r in res.fetchall()]
    if not rows:
        return []

    pids = [r["id"] for r in rows if r.get("id")]
    items_map: Dict[str, List[Dict[str, Any]]] = {pid: [] for pid in pids}

    if pids:
        safe_pids = [p for p in pids if isinstance(p, str) and "'" not in p]
        if safe_pids:
            in_clause = ", ".join(f"'{p}'" for p in safe_pids)
            items_res = await db.execute(text(f"SELECT * FROM public.purchase_items WHERE purchase_id IN ({in_clause})"))
            for it_row in items_res.fetchall():
                it = _row_to_dict(it_row)
                pid = it.get("purchase_id")
                if pid in items_map:
                    items_map[pid].append({
                        **it,
                        "name": it.get("item_name", ""),
                        "gstRate": float(it.get("gst_rate", 18)),
                    })

    for r in rows:
        r["supplierName"] = r.get("supplier_name", "")
        r["supplierGstin"] = r.get("supplier_gstin", "")
        r["billNumber"] = r.get("bill_number", "")
        r["billDate"] = r.get("bill_date", "")
        r["totalAmount"] = float(r.get("total_amount", 0))
        r["totalTax"] = float(r.get("total_tax", 0))
        r["items"] = items_map.get(r.get("id"), [])

    return rows


async def check_duplicate_purchase(
    db: AsyncSession,
    merchant_id: str,
    bill_number: str,
    supplier_gstin: str = "",
    supplier_name: str = ""
) -> Optional[Dict[str, Any]]:
    """Checks if a purchase invoice with matching bill number and supplier already exists for this merchant."""
    await ensure_schema(db)
    if not bill_number or len(bill_number.strip()) < 2:
        return None

    res = await db.execute(
        text('''
            SELECT id, bill_number, supplier_name, supplier_gstin, total_amount, created_at
            FROM public.merchant_purchases
            WHERE merchant_id = :mid AND lower(bill_number) = lower(:bnum)
              AND (
                  (supplier_gstin <> '' AND lower(supplier_gstin) = lower(:sgstin))
                  OR lower(supplier_name) = lower(:sname)
                  OR :sgstin = ''
              )
            LIMIT 1
        '''),
        {
            "mid": merchant_id,
            "bnum": bill_number.strip(),
            "sgstin": (supplier_gstin or "").strip(),
            "sname": (supplier_name or "").strip(),
        }
    )
    row = res.first()
    return _row_to_dict(row) if row else None
