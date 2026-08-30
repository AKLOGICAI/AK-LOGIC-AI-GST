"""
akai_tools.py — Authorized Business Tool Registry & Execution Engine for @AKAI.

Strict Security & Architectural Rules:
1. Zero AI Math: All financial, tax, and inventory calculations are performed strictly
   by deterministic application engines (gst_engine.py, billing_repo.py, plans_ms.py).
2. Server-Enforced Tenant Isolation: Every tool requires merchant_id resolved strictly
   from the verified JWT session. The AI model is NEVER permitted to supply or override merchant_id.
3. Two-Phase Action Execution: Mutating actions (invoice creation, stock updates, request approval)
   first generate a structured 'Action Preview Card' with a cryptographic confirmation_token.
   Database writes happen ONLY after explicit user confirmation with idempotency protection.
4. Prompt-Injection Defense: All business data (customer names, notes, items) is treated
   as untrusted passive data.
"""

from __future__ import annotations
import hmac
import hashlib
import json
import time
import secrets
import base64
import logging
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from . import gst_engine, merchant_repo, billing_repo, inventory_repo, customer_repo, plans_ms, rate_limit_repo
from .config import settings

logger = logging.getLogger("akai_tools")

_TOKEN_SECRET = settings.jwt_secret or "akai_default_secure_action_token_secret"
TOKEN_VALIDITY_SECONDS = 15 * 60  # 15 minutes


def generate_confirmation_token(payload: Dict[str, Any]) -> str:
    data_str = json.dumps(payload, sort_keys=True, separators=(',', ':'))
    signature = hmac.new(
        _TOKEN_SECRET.encode("utf-8"),
        data_str.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    raw_bundle = {"data": payload, "sig": signature, "ts": int(time.time())}
    json_str = json.dumps(raw_bundle)
    return base64.urlsafe_b64encode(json_str.encode("utf-8")).decode("utf-8")


def verify_confirmation_token(token_val: Any) -> Optional[Dict[str, Any]]:
    try:
        if isinstance(token_val, dict):
            bundle = token_val
        elif isinstance(token_val, str):
            token_str = token_val.strip()
            try:
                raw = base64.urlsafe_b64decode(token_str.encode("utf-8")).decode("utf-8")
                bundle = json.loads(raw)
            except Exception:
                bundle = json.loads(token_str)
        else:
            return None

        payload = bundle.get("data")
        sig = bundle.get("sig")
        ts = bundle.get("ts", 0)

        if not payload or not sig:
            return None

        now = int(time.time())
        if now - ts > TOKEN_VALIDITY_SECONDS or ts > now + 60:
            logger.warning("[AKAI Token] Expired confirmation token.")
            return None

        data_str = json.dumps(payload, sort_keys=True, separators=(',', ':'))
        expected_sig = hmac.new(
            _TOKEN_SECRET.encode("utf-8"),
            data_str.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected_sig, sig):
            logger.warning("[AKAI Token] Invalid signature on confirmation token.")
            return None

        return payload
    except Exception as e:
        logger.error(f"[AKAI Token] Verification error: {e}")
        return None


# =========================================================================
# 1. READ-ONLY BUSINESS INTELLIGENCE TOOLS
# =========================================================================

async def tool_find_customer(
    db: AsyncSession,
    merchant_id: str,
    query: str,
) -> Dict[str, Any]:
    """
    Tenant-Isolated Customer Search for @AKAI.
    CRIT-01 Security Rules:
    1. NEVER performs unrestricted global searches across public.customers.
    2. Searches ONLY customers with an established relationship with this merchant_id
       (prior invoices, billing requests, primary merchant designation, or chat threads).
    3. If searching by exact AKC ID without prior history, enforces KYC verification and phone masking.
    4. Unassociated third-party customer PII (phone, email, GSTIN, address) is NEVER exposed.
    """
    q = query.strip()
    if not q:
        return {"ok": False, "found": False, "message": "Kripya customer ka naam ya mobile number batayein."}

    merged: List[Dict[str, Any]] = []
    seen_identifiers = set()

    # 1. Search customers who have past invoices with THIS merchant
    try:
        res_inv = await db.execute(
            text("""
                SELECT DISTINCT 
                    "customerName" as name, 
                    "customerPhone" as phone, 
                    "customerGstin" as gstin, 
                    "customerAddress" as address, 
                    "customerState" as state,
                    "customerEmail" as email
                FROM public.invoices 
                WHERE "merchantId" = :mid 
                  AND (
                    "customerName" ILIKE :pattern 
                    OR "customerPhone" ILIKE :pattern 
                    OR COALESCE("customerGstin", '') ILIKE :pattern
                  ) 
                ORDER BY "customerName" 
                LIMIT 5
            """),
            {"mid": merchant_id, "pattern": f"%{q}%"}
        )
        for ic in [dict(r._mapping) for r in res_inv.fetchall()]:
            ident = ic.get("phone") or ic.get("name")
            if ident and ident not in seen_identifiers:
                seen_identifiers.add(ident)
                merged.append({
                    "name": ic.get("name") or "Customer",
                    "phone": ic.get("phone") or "",
                    "phoneMasked": customer_repo.mask_phone(ic["phone"]) if ic.get("phone") else "",
                    "gstin": ic.get("gstin") or "",
                    "state": ic.get("state") or "",
                    "address": ic.get("address") or "",
                    "source": "merchant_invoice_history",
                })
    except Exception as e:
        logger.warning(f"Error searching invoice customers for merchant {merchant_id}: {e}")

    # 2. Search customers who submitted billing requests to THIS merchant
    try:
        res_req = await db.execute(
            text("""
                SELECT DISTINCT 
                    "customerName" as name, 
                    "customerPhone" as phone, 
                    "customerGstin" as gstin, 
                    "customerAddress" as address, 
                    "customerState" as state
                FROM public.billing_requests 
                WHERE "merchantId" = :mid 
                  AND (
                    "customerName" ILIKE :pattern 
                    OR "customerPhone" ILIKE :pattern
                  ) 
                ORDER BY "customerName" 
                LIMIT 5
            """),
            {"mid": merchant_id, "pattern": f"%{q}%"}
        )
        for rc in [dict(r._mapping) for r in res_req.fetchall()]:
            ident = rc.get("phone") or rc.get("name")
            if ident and ident not in seen_identifiers:
                seen_identifiers.add(ident)
                merged.append({
                    "name": rc.get("name") or "Customer",
                    "phone": rc.get("phone") or "",
                    "phoneMasked": customer_repo.mask_phone(rc["phone"]) if rc.get("phone") else "",
                    "gstin": rc.get("gstin") or "",
                    "state": rc.get("state") or "",
                    "address": rc.get("address") or "",
                    "source": "merchant_billing_request",
                })
    except Exception as e:
        logger.warning(f"Error searching billing request customers for merchant {merchant_id}: {e}")

    # 3. Search customers who designated THIS merchant as Primary Merchant
    try:
        res_pm = await db.execute(
            text("""
                SELECT 
                    id, "customerCode", name, phone, email, gstin, "billingAddress" as address, state
                FROM public.customers
                WHERE "primaryMerchantId" = :mid
                  AND (
                    name ILIKE :pattern 
                    OR phone ILIKE :pattern 
                    OR "customerCode" ILIKE :pattern
                  )
                LIMIT 5
            """),
            {"mid": merchant_id, "pattern": f"%{q}%"}
        )
        for pc in [dict(r._mapping) for r in res_pm.fetchall()]:
            ident = pc.get("phone") or pc.get("customerCode")
            if ident and ident not in seen_identifiers:
                seen_identifiers.add(ident)
                merged.append({
                    "name": pc.get("name") or "Customer",
                    "phone": pc.get("phone") or "",
                    "phoneMasked": customer_repo.mask_phone(pc["phone"]) if pc.get("phone") else "",
                    "code": pc.get("customerCode"),
                    "gstin": pc.get("gstin") or "",
                    "state": pc.get("state") or "",
                    "address": pc.get("address") or "",
                    "source": "primary_merchant_relationship",
                })
    except Exception as e:
        logger.warning(f"Error searching primary merchant customers: {e}")

    # 4. Handle exact AKC ID lookup (e.g. AKC-00000001) for verified merchants with privacy masking
    if not merged and (q.upper().startswith("AKC-") or q.upper().startswith("AKC")):
        try:
            m_light = await merchant_repo.get_by_id_light(db, merchant_id)
            if m_light and m_light.get("kyc") == "verified":
                vault_cust = await customer_repo.search_customer_resilient(db, q)
                if vault_cust:
                    merged.append({
                        "name": vault_cust.get("name") or "Customer",
                        "phone": "", # Never leak unmasked phone for unassociated vault lookup
                        "phoneMasked": customer_repo.mask_phone(vault_cust.get("phone", "")),
                        "code": vault_cust.get("customerCode"),
                        "state": vault_cust.get("state") or "",
                        "address": "", # Never leak address
                        "gstin": "",
                        "source": "masked_vault_lookup",
                    })
        except Exception as e:
            logger.warning(f"Error in resilient vault lookup: {e}")

    if not merged:
        return {
            "ok": True,
            "found": False,
            "query": q,
            "message": f"Aapke customer records me '{q}' se juda koi customer nahi mila.",
        }

    return {
        "ok": True,
        "found": True,
        "query": q,
        "count": len(merged),
        "customers": merged,
        "best_match": merged[0],
    }


async def tool_find_product(
    db: AsyncSession,
    merchant_id: str,
    query: str,
) -> Dict[str, Any]:
    q = query.strip()
    if not q:
        return {"ok": False, "found": False, "message": "Kripya product ka naam batayein."}

    items = []
    try:
        res = await db.execute(
            text('SELECT id, product_name, description, hsn_code, gst_rate, selling_price, cost_price, stock_quantity, unit, is_active FROM public.merchant_inventory WHERE merchant_id = :mid AND (product_name ILIKE :pattern OR description ILIKE :pattern OR hsn_code ILIKE :pattern) ORDER BY is_active DESC, stock_quantity DESC LIMIT 5'),
            {"mid": merchant_id, "pattern": f"%{q}%"}
        )
        items = [dict(r._mapping) for r in res.fetchall()]
    except Exception as e:
        logger.warning(f"Error finding product: {e}")

    if not items:
        return {"ok": True, "found": False, "query": q, "message": f"Inventory me '{q}' se milta-julta koi product nahi mila."}

    return {
        "ok": True,
        "found": True,
        "query": q,
        "count": len(items),
        "products": items,
        "best_match": items[0],
    }


async def tool_get_sales_summary(
    db: AsyncSession,
    merchant_id: str,
    period: str = "today",
) -> Dict[str, Any]:
    import datetime
    now = datetime.datetime.now()

    if period == "today":
        start_dt = datetime.datetime(now.year, now.month, now.day, 0, 0, 0)
        start_ms = int(start_dt.timestamp() * 1000)
        label = "Aaj (Today)"
    elif period == "this_month":
        start_dt = datetime.datetime(now.year, now.month, 1, 0, 0, 0)
        start_ms = int(start_dt.timestamp() * 1000)
        label = "Is Mahine (This Month)"
    else:
        start_ms = 0
        label = "All Time"

    res = await db.execute(
        text('SELECT COUNT(*) as invoice_count, COALESCE(SUM("grandTotal"), 0) as total_sales, COALESCE(SUM("taxableValue"), 0) as total_taxable, COALESCE(SUM("cgst"), 0) as total_cgst, COALESCE(SUM("sgst"), 0) as total_sgst, COALESCE(SUM("igst"), 0) as total_igst, COALESCE(SUM("totalTax"), 0) as total_tax FROM public.invoices WHERE "merchantId" = :mid AND "createdAt" >= :start_ms'),
        {"mid": merchant_id, "start_ms": start_ms}
    )
    row = res.first()

    return {
        "ok": True,
        "period": period,
        "label": label,
        "invoice_count": int(row.invoice_count if row else 0),
        "total_sales": float(row.total_sales if row else 0),
        "taxable_value": float(row.total_taxable if row else 0),
        "cgst": float(row.total_cgst if row else 0),
        "sgst": float(row.total_sgst if row else 0),
        "igst": float(row.total_igst if row else 0),
        "total_tax": float(row.total_tax if row else 0),
    }


async def tool_get_credit_balance(
    db: AsyncSession,
    merchant_id: str,
) -> Dict[str, Any]:
    merchant = await merchant_repo.get_by_id_light(db, merchant_id)
    if not merchant:
        return {"ok": False, "message": "Merchant record not found."}

    credits = merchant.get("pdfCredits", 0)
    plan_name = merchant.get("planName", "Free Plan")
    expires_at = merchant.get("planExpiresAt", 0)
    is_active = expires_at > int(time.time() * 1000)

    return {
        "ok": True,
        "credits": credits,
        "plan_name": plan_name,
        "is_active": is_active,
        "expires_at": expires_at,
        "status_text": f"{credits} PDF Credits available · Plan: {plan_name}" + (" (Active)" if is_active else " (Free/Expired)")
    }


async def tool_get_inventory_summary(
    db: AsyncSession,
    merchant_id: str,
) -> Dict[str, Any]:
    res = await db.execute(
        text('SELECT COUNT(*) as total_items, COUNT(*) FILTER (WHERE stock_quantity <= 10) as low_stock_count, COALESCE(SUM(stock_quantity * selling_price), 0) as total_inventory_value FROM public.merchant_inventory WHERE merchant_id = :mid AND is_active = true'),
        {"mid": merchant_id}
    )
    row = res.first()

    res_low = await db.execute(
        text('SELECT product_name, stock_quantity, unit, selling_price FROM public.merchant_inventory WHERE merchant_id = :mid AND is_active = true AND stock_quantity <= 10 ORDER BY stock_quantity ASC LIMIT 5'),
        {"mid": merchant_id}
    )
    low_items = [dict(r._mapping) for r in res_low.fetchall()]

    return {
        "ok": True,
        "total_products": int(row.total_items if row else 0),
        "low_stock_count": int(row.low_stock_count if row else 0),
        "total_inventory_value": float(row.total_inventory_value if row else 0),
        "low_stock_items": low_items,
    }


async def tool_get_pending_requests(
    db: AsyncSession,
    merchant_id: str,
) -> Dict[str, Any]:
    requests = await billing_repo.list_by_merchant(db, merchant_id)
    pending = [r for r in requests if r.get("status") == "pending"]

    return {
        "ok": True,
        "count": len(pending),
        "requests": pending[:5],
        "message": f"Aapke paas {len(pending)} pending customer billing requests hain." if pending else "Filhal koi pending billing request nahi hai."
    }


# =========================================================================
# 2. DETERMINISTIC INVOICE AGENT & ACTION PREVIEW BUILDER
# =========================================================================

async def tool_calculate_invoice_preview(
    db: AsyncSession,
    merchant_id: str,
    customer_query: str,
    items_raw: List[Dict[str, Any]],
    discount_amount: float = 0.0,
    payment_mode: str = "Cash",
) -> Dict[str, Any]:
    merchant = await merchant_repo.get_by_id_light(db, merchant_id)
    if not merchant:
        return {"ok": False, "message": "Merchant profile not found."}

    seller_state = merchant.get("state") or "Delhi"
    seller_gstin = merchant.get("gstin") or ""

    cust_res = await tool_find_customer(db, merchant_id, customer_query)
    customer_data = cust_res.get("best_match") if cust_res.get("found") else {
        "name": customer_query.strip() or "Walk-in Customer",
        "phone": "",
        "gstin": "",
        "state": seller_state,
        "address": "",
    }

    buyer_state = customer_data.get("state") or seller_state
    buyer_gstin = customer_data.get("gstin") or None

    resolved_items = []
    for raw_it in items_raw:
        item_name = (raw_it.get("name") or raw_it.get("description") or "Item").strip()
        qty = float(raw_it.get("qty") or 1)
        rate = float(raw_it.get("rate") or 0)
        hsn = (raw_it.get("hsn") or "").strip()
        gst_rate = float(raw_it.get("gstRate") or raw_it.get("gst_rate") or 18)

        if rate <= 0 or not hsn:
            inv_res = await tool_find_product(db, merchant_id, item_name)
            if inv_res.get("found") and inv_res.get("best_match"):
                match = inv_res["best_match"]
                if rate <= 0:
                    rate = float(match.get("selling_price") or 100)
                if not hsn:
                    hsn = match.get("hsn_code") or "9983"
                if "gstRate" not in raw_it and "gst_rate" not in raw_it:
                    gst_rate = float(match.get("gst_rate") or 18)

        if rate <= 0:
            rate = 100.0

        resolved_items.append({
            "name": item_name,
            "description": item_name,
            "qty": qty,
            "rate": rate,
            "hsn": hsn or "9983",
            "gstRate": gst_rate,
        })

    is_inter_state, place_of_supply = gst_engine.resolve_supply(
        seller_state=seller_state,
        seller_gstin=seller_gstin,
        buyer_gstin=buyer_gstin,
        buyer_state=buyer_state,
    )

    comp = gst_engine.compute(
        items=resolved_items,
        is_inter_state=is_inter_state,
        place_of_supply=place_of_supply,
    )

    action_payload = {
        "action_type": "create_invoice",
        "merchant_id": merchant_id,
        "customer": {
            "name": customer_data.get("name"),
            "phone": customer_data.get("phone", ""),
            "gstin": customer_data.get("gstin", ""),
            "state": buyer_state,
            "address": customer_data.get("address", ""),
        },
        "items": resolved_items,
        "calculation": {
            "taxableValue": comp.taxable_value,
            "cgst": comp.cgst,
            "sgst": comp.sgst,
            "igst": comp.igst,
            "totalTax": comp.total_tax,
            "roundOff": comp.round_off,
            "grandTotal": comp.grand_total,
            "amountInWords": comp.amount_in_words,
            "isInterState": comp.is_inter_state,
            "placeOfSupply": comp.place_of_supply,
        },
        "payment_mode": payment_mode,
        "issued_at": int(time.time()),
    }

    confirmation_token = generate_confirmation_token(action_payload)

    return {
        "ok": True,
        "status": "waiting_confirmation",
        "confirmation_required": True,
        "confirmation_token": confirmation_token,
        "preview_card": {
            "card_type": "invoice_preview",
            "title": "🧾 Invoice Preview (Draft)",
            "customer_name": customer_data.get("name"),
            "customer_phone": customer_data.get("phone", ""),
            "customer_gstin": customer_data.get("gstin", ""),
            "items": [
                {
                    "name": it["name"],
                    "qty": it["qty"],
                    "rate": it["rate"],
                    "hsn": it["hsn"],
                    "gst_rate": it["gstRate"],
                    "taxable_amount": round(it["qty"] * it["rate"], 2),
                }
                for it in resolved_items
            ],
            "taxable_value": comp.taxable_value,
            "cgst": comp.cgst,
            "sgst": comp.sgst,
            "igst": comp.igst,
            "total_tax": comp.total_tax,
            "round_off": comp.round_off,
            "grand_total": comp.grand_total,
            "is_inter_state": comp.is_inter_state,
            "place_of_supply": comp.place_of_supply,
            "payment_mode": payment_mode,
            "actions": [
                {"id": "confirm", "label": "Confirm & Create Invoice", "style": "primary"},
                {"id": "cancel", "label": "Cancel", "style": "secondary"},
            ]
        }
    }


# =========================================================================
# 3. ATOMIC ACTION EXECUTION (WITH IDEMPOTENCY GUARD)
# =========================================================================

async def tool_execute_confirmed_action(
    db: AsyncSession,
    merchant_id: str,
    action_type: str,
    confirmation_token: str,
    idempotency_key: str,
) -> Dict[str, Any]:
    try:
        payload = verify_confirmation_token(confirmation_token)
        if not payload:
            return {"ok": False, "message": "Confirmation token expired ya invalid hai. Kripya naye action ke liye dobara prompt karein."}

        if payload.get("merchant_id") != merchant_id:
            logger.warning(f"[Security] Mismatched merchant_id in token: {payload.get('merchant_id')} vs {merchant_id}")
            return {"ok": False, "message": "Unauthorized action token."}

        # 1. Atomic Idempotency Check using rate_limit_repo
        rate_key = f"idemp:akai:{idempotency_key}"
        try:
            existing_idemp = await rate_limit_repo.get(db, rate_key)
            if existing_idemp:
                return {"ok": False, "message": "Ye action pehle hi execute ho chuka hai (Duplicate request prevented)."}
        except Exception:
            pass

        if action_type == "create_invoice":
            calc = payload["calculation"]
            cust = payload["customer"]
            items = payload["items"]
            now_ms = int(time.time() * 1000)

            inv_id = f"inv_{secrets.token_hex(10)}"

            res_existing = await db.execute(
                text('SELECT "invoiceNo" FROM public.invoices WHERE "merchantId" = :mid'),
                {"mid": merchant_id}
            )
            existing_nos = [r[0] for r in res_existing.fetchall() if r[0]]
            merchant_light = await merchant_repo.get_by_id_light(db, merchant_id)
            prefix = merchant_light.get("invoicePrefix") if merchant_light else "INV"
            inv_no = gst_engine.next_invoice_number(prefix or "INV", existing_nos)

            threshold = now_ms - plans_ms.FREE_INVOICE_COOLDOWN_MS
            free_used = await merchant_repo.try_use_free_invoice(db, merchant_id, now_ms, threshold, commit=False)
            if not free_used:
                credited = await merchant_repo.consume_credit(db, merchant_id, 1, commit=False)
                if not credited:
                    await db.rollback()
                    return {"ok": False, "message": "Invoice create karne ke liye paryapt PDF Credits nahi hain. Kripya recharge karein."}

            req_id = f"req_{secrets.token_hex(10)}"
            request_row = {
                "id": req_id,
                "merchantId": merchant_id,
                "invoiceNo": inv_no,
                "invoiceNumber": inv_no,
                "invoiceId": inv_id,
                "customerName": cust.get("name") or "Walk-in Customer",
                "customerPhone": cust.get("phone", ""),
                "customerEmail": "",
                "customerGstin": cust.get("gstin", ""),
                "customerPan": cust.get("gstin", "")[2:12] if len(cust.get("gstin", "")) >= 12 else "",
                "customerAddress": cust.get("address", ""),
                "customerState": cust.get("state", ""),
                "paymentMode": payload.get("payment_mode", "Cash"),
                "paymentRef": "",
                "items": json.dumps(items),
                "notes": "Generated via @AKAI Business Copilot",
                "rejectReason": None,
                "status": "approved",
                "createdAt": now_ms,
                "resolvedAt": now_ms,
                "branded": False,
            }

            req_cols = [c for c in billing_repo.REQUEST_COLUMNS if c in request_row]
            req_col_sql = ", ".join(f'"{c}"' for c in req_cols)
            req_val_sql = ", ".join(f':{c}' for c in req_cols)

            await db.execute(
                text(f'INSERT INTO public.billing_requests ({req_col_sql}) VALUES ({req_val_sql})'),
                {c: request_row[c] for c in req_cols}
            )

            invoice_row = {
                "id": inv_id,
                "requestId": req_id,
                "merchantId": merchant_id,
                "invoiceNo": inv_no,
                "invoiceNumber": inv_no,
                "invoiceDate": now_ms,
                "customerName": cust.get("name") or "Walk-in Customer",
                "customerPhone": cust.get("phone", ""),
                "customerEmail": "",
                "customerGstin": cust.get("gstin", ""),
                "customerPan": cust.get("gstin", "")[2:12] if len(cust.get("gstin", "")) >= 12 else "",
                "customerAddress": cust.get("address", ""),
                "customerState": cust.get("state", ""),
                "paymentMode": payload.get("payment_mode", "Cash"),
                "paymentRef": "",
                "notes": "Generated via @AKAI Business Copilot",
                "items": json.dumps(items),
                "taxableValue": float(calc["taxableValue"]),
                "cgst": float(calc["cgst"]),
                "sgst": float(calc["sgst"]),
                "igst": float(calc["igst"]),
                "totalTax": float(calc["totalTax"]),
                "roundOff": float(calc["roundOff"]),
                "grandTotal": float(calc["grandTotal"]),
                "amountInWords": calc.get("amountInWords") or "",
                "placeOfSupply": calc.get("placeOfSupply") or "",
                "isInterState": bool(calc.get("isInterState", False)),
                "branded": False,
                "createdAt": now_ms,
            }

            inv_cols = [c for c in billing_repo.INVOICE_COLUMNS if c in invoice_row]
            inv_col_sql = ", ".join(f'"{c}"' for c in inv_cols)
            inv_val_sql = ", ".join(f':{c}' for c in inv_cols)

            await db.execute(
                text(f'INSERT INTO public.invoices ({inv_col_sql}) VALUES ({inv_val_sql})'),
                {c: invoice_row[c] for c in inv_cols}
            )

            for it in items:
                it_name = (it.get("name") or it.get("description") or "").strip()
                it_qty = float(it.get("qty") or 1)
                it_hsn = (it.get("hsn") or "").strip()

                if it_name or it_hsn:
                    try:
                        hsn_clause = "OR (hsn_code = :hsn AND length(hsn_code) >= 6)" if len(it_hsn) >= 6 else ""
                        await db.execute(
                            text(f'UPDATE public.merchant_inventory SET stock_quantity = GREATEST(0, stock_quantity - :qty) WHERE merchant_id = :mid AND is_active = true AND (LOWER(TRIM(product_name)) = LOWER(TRIM(:name)) {hsn_clause})'),
                            {"mid": merchant_id, "qty": it_qty, "name": it_name, "hsn": it_hsn}
                        )
                    except Exception as e:
                        logger.warning(f"Stock deduction warning: {e}")

            # Post Double-Entry Journal if Deep Accounting is enabled
            try:
                from . import feature_flags_repo, accounting_repo
                if await feature_flags_repo.is_enabled(db, "deep_accounting_enabled", merchant_id=merchant_id):
                    await accounting_repo.post_invoice_journal(
                        db=db,
                        merchant_id=merchant_id,
                        invoice_data=invoice_row,
                        commit=False
                    )
            except Exception as e:
                logger.warning(f"Accounting journal post failed: {e}")

            # Record Idempotency key atomically
            try:
                await rate_limit_repo.put(
                    db,
                    rate_key,
                    {"executed": True, "invoice_id": inv_id, "invoice_no": inv_no},
                    purge_after=time.time() + 1800
                )
            except Exception as e:
                logger.warning(f"Failed to record idempotency key: {e}")

            await db.commit()

            pdf_url = f"/api/public/invoices/{inv_id}/pdf"

            return {
                "ok": True,
                "status": "success",
                "invoice_id": inv_id,
                "invoice_no": inv_no,
                "grand_total": float(calc["grandTotal"]),
                "customer_name": cust.get("name"),
                "pdf_url": pdf_url,
                "message": f"Tax Invoice #{inv_no} successfully generate ho gaya! Grand Total: ₹{float(calc['grandTotal']):,.2f}.",
                "result_card": {
                    "card_type": "invoice_success",
                    "invoice_no": inv_no,
                    "grand_total": float(calc["grandTotal"]),
                    "customer_name": cust.get("name"),
                    "pdf_url": pdf_url,
                }
            }

        return {"ok": False, "message": f"Unsupported action type: {action_type}"}
    except Exception as e:
        logger.error(f"Error in tool_execute_confirmed_action: {e}", exc_info=True)
        await db.rollback()
        return {"ok": False, "message": f"Action execution failed: {str(e)}"}
