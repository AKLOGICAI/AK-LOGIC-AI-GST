"""sync_repo.py — Backend Idempotent Sync Repository for Offline-First Operations.

Handles batch reconciliation, atomic Postgres transactions, and double-entry validation.
"""
from typing import Any, Dict, List, Optional
import time
import json
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from . import accounting_repo, inventory_repo, billing_repo, merchant_repo

logger = logging.getLogger("sync")

_schema_ensured = False

async def ensure_schema(db: AsyncSession) -> None:
    """Creates sync idempotency table if missing."""
    global _schema_ensured
    if _schema_ensured:
        return

    try:
        await db.execute(text("""
            CREATE TABLE IF NOT EXISTS public.sync_idempotency_log (
                idempotency_key text PRIMARY KEY,
                merchant_id text NOT NULL,
                entity_type text NOT NULL,
                entity_id text NOT NULL,
                response_payload text NOT NULL,
                created_at bigint NOT NULL
            )
        """))
        await db.commit()
        _schema_ensured = True
    except Exception as e:
        logger.warning(f"[Sync] ensure_schema non-fatal: {e}")
        await db.rollback()


async def get_cached_idempotent_response(db: AsyncSession, idempotency_key: str) -> Optional[Dict[str, Any]]:
    """Checks if operation was already processed to guarantee 100% idempotency."""
    await ensure_schema(db)
    try:
        res = await db.execute(
            text('SELECT response_payload FROM public.sync_idempotency_log WHERE idempotency_key = :k LIMIT 1'),
            {"k": idempotency_key}
        )
        row = res.first()
        if row and row[0]:
            val = row[0]
            return json.loads(val) if isinstance(val, str) else val
    except Exception as e:
        logger.warning(f"[Sync] Idempotency lookup fallback: {e}")
        await db.rollback()
    return None


async def save_idempotency_record(
    db: AsyncSession,
    idempotency_key: str,
    merchant_id: str,
    entity_type: str,
    entity_id: str,
    response_payload: Dict[str, Any],
    commit: bool = True
) -> None:
    """Stores the response payload for idempotent replays."""
    await ensure_schema(db)
    now = int(time.time() * 1000)
    await db.execute(
        text('''
            INSERT INTO public.sync_idempotency_log (idempotency_key, merchant_id, entity_type, entity_id, response_payload, created_at)
            VALUES (:k, :mid, :etype, :eid, :resp, :now)
            ON CONFLICT (idempotency_key) DO UPDATE SET response_payload = :resp
        '''),
        {
            "k": idempotency_key,
            "mid": merchant_id,
            "etype": entity_type,
            "eid": entity_id,
            "resp": json.dumps(response_payload),
            "now": now
        }
    )
    if commit:
        await db.commit()


async def process_sync_invoice(
    db: AsyncSession,
    merchant_id: str,
    invoice_payload: Dict[str, Any],
    stock_deltas: List[Dict[str, Any]],
    journal_entry: Optional[Dict[str, Any]] = None,
    journal_lines: Optional[List[Dict[str, Any]]] = None,
    idempotency_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Atomically ingests an offline-created invoice into PostgreSQL:
    1. Collision-checked canonical invoice numbering
    2. Inserts into public.invoices via billing_repo (commit=False)
    3. Applies atomic stock deltas / inventory decrements
    4. Reconciles linked billing request status to 'approved'
    5. Posts double-entry journal entry (commit=False)
    6. Saves idempotency log record (commit=False)
    7. Single atomic db.commit() at the transaction boundary
    """
    now = int(time.time() * 1000)
    inv_id = invoice_payload.get("id") or f"inv_sync_{now}"

    try:
        # 1. Collision & Canonical Invoice Number Resolution
        existing_inv_no = invoice_payload.get("invoiceNo")
        canonical_no = None

        if existing_inv_no and not str(existing_inv_no).startswith("OFF-"):
            # Check if this invoice number is already assigned to a DIFFERENT invoice for this merchant
            chk = await db.execute(
                text('SELECT id FROM public.invoices WHERE "merchantId" = :mid AND "invoiceNo" = :inv_no AND id != :inv_id LIMIT 1'),
                {"mid": merchant_id, "inv_no": existing_inv_no, "inv_id": inv_id}
            )
            collision = chk.first()
            if not collision:
                canonical_no = existing_inv_no

        if not canonical_no:
            # Allocate next canonical sequential number from merchant sequence counter
            seq_res = await db.execute(
                text('''
                    UPDATE public.merchants
                    SET "invoiceSeq" = COALESCE("invoiceSeq", 0) + 1
                    WHERE id = :mid
                    RETURNING "invoiceSeq", "invoicePrefix"
                '''),
                {"mid": merchant_id}
            )
            seq_row = seq_res.first()
            if seq_row:
                seq, prefix = seq_row
                prefix_val = prefix or "INV"
                canonical_no = f"{prefix_val}-{seq:04d}"
            else:
                canonical_no = existing_inv_no or f"INV-{now}"

        # 2. Build DB invoice row
        items_raw = invoice_payload.get("items", [])
        if isinstance(items_raw, str):
            try:
                items_list = json.loads(items_raw)
            except Exception:
                items_list = []
        else:
            items_list = items_raw if isinstance(items_raw, list) else []

        db_invoice = {
            "id": inv_id,
            "requestId": invoice_payload.get("requestId") or f"req_off_{inv_id}",
            "merchantId": merchant_id,
            "invoiceNo": canonical_no,
            "invoiceNumber": canonical_no,
            "invoiceDate": invoice_payload.get("invoiceDate", now),
            "customerName": invoice_payload.get("customerName", "Walk-in Customer"),
            "customerPhone": invoice_payload.get("customerPhone", ""),
            "customerEmail": invoice_payload.get("customerEmail", ""),
            "customerGstin": invoice_payload.get("customerGstin", ""),
            "customerPan": invoice_payload.get("customerPan", ""),
            "customerAddress": invoice_payload.get("customerAddress", ""),
            "customerState": invoice_payload.get("customerState", "Delhi"),
            "paymentMode": invoice_payload.get("paymentMode", "cash"),
            "paymentRef": invoice_payload.get("paymentRef", ""),
            "notes": invoice_payload.get("notes", ""),
            "items": items_list,
            "taxableValue": float(invoice_payload.get("taxableValue", 0)),
            "cgst": float(invoice_payload.get("cgst", 0)),
            "sgst": float(invoice_payload.get("sgst", 0)),
            "igst": float(invoice_payload.get("igst", 0)),
            "totalTax": float(invoice_payload.get("totalTax", 0)),
            "roundOff": float(invoice_payload.get("roundOff", 0)),
            "grandTotal": float(invoice_payload.get("grandTotal", 0)),
            "amountInWords": invoice_payload.get("amountInWords", ""),
            "placeOfSupply": invoice_payload.get("placeOfSupply", ""),
            "isInterState": bool(invoice_payload.get("isInterState", False)),
            "branded": bool(invoice_payload.get("branded", False)),
            "createdAt": invoice_payload.get("createdAt", now),
        }

        # 3. Insert into public.invoices (commit=False)
        await billing_repo.insert_invoice(db, db_invoice, commit=False)

        # 4. Atomic Stock Delta Updates
        has_id_deltas = False
        for it_delta in stock_deltas:
            item_id = it_delta.get("itemId")
            delta = float(it_delta.get("delta", 0))
            if item_id and delta != 0:
                has_id_deltas = True
                await db.execute(
                    text('''
                        UPDATE public.merchant_inventory
                        SET stock_quantity = GREATEST(0, stock_quantity + :delta),
                            updated_at = :now
                        WHERE id = :id AND merchant_id = :mid
                    '''),
                    {"delta": delta, "now": now, "id": item_id, "mid": merchant_id}
                )

        # Fallback stock deduction by product name / HSN if explicit item IDs were absent
        if not has_id_deltas and items_list:
            for it in items_list:
                it_desc = (it.get("description") or it.get("name") or "").strip()
                it_hsn = (it.get("hsn") or "").strip()
                it_qty = float(it.get("qty") or 1)
                if it_desc or it_hsn:
                    hsn_clause = "OR (hsn_code = :hsn AND length(hsn_code) >= 6)" if len(it_hsn) >= 6 else ""
                    await db.execute(
                        text(f'''
                            UPDATE public.merchant_inventory
                            SET stock_quantity = GREATEST(0, stock_quantity - :qty),
                                updated_at = :now
                            WHERE merchant_id = :mid
                              AND (lower(product_name) = lower(:name) {hsn_clause})
                        '''),
                        {"mid": merchant_id, "name": it_desc, "hsn": it_hsn, "qty": it_qty, "now": now}
                    )

        # 5. Reconcile Original Billing Request to 'approved' if linked
        req_id = db_invoice.get("requestId")
        if req_id and not str(req_id).startswith("req_off_"):
            await db.execute(
                text('''
                    UPDATE public.billing_requests
                    SET status = 'approved',
                        "invoiceId" = :inv_id,
                        "invoiceNo" = :inv_no,
                        "resolvedAt" = :now
                    WHERE id = :req_id AND "merchantId" = :mid
                '''),
                {
                    "inv_id": inv_id,
                    "inv_no": canonical_no,
                    "now": now,
                    "req_id": req_id,
                    "mid": merchant_id
                }
            )

        # 6. Double-Entry Accounting Posting (commit=False)
        await accounting_repo.post_invoice_journal(db, merchant_id, db_invoice, commit=False)

        result = {
            "ok": True,
            "confirmed_id": inv_id,
            "canonical_invoice_no": canonical_no
        }

        # 7. Idempotency Record (commit=False)
        if idempotency_key:
            await save_idempotency_record(
                db=db,
                idempotency_key=idempotency_key,
                merchant_id=merchant_id,
                entity_type="invoice",
                entity_id=inv_id,
                response_payload=result,
                commit=False
            )

        # 8. Single Unified Commit for the entire transaction
        await db.commit()
        return result

    except Exception as e:
        await db.rollback()
        logger.error(f"[Sync] Transaction error during invoice sync: {e}")
        raise
