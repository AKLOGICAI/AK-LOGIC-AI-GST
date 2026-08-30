"""Direct-Postgres repository for Merchant Network tables.
All queries are parameterized using text() with explicit column lists.
"""
from __future__ import annotations

import logging
from typing import Any, Optional, List
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import ProgrammingError

logger = logging.getLogger("merchant_network_repo")

# Explicit column allowlists for all tables
REQUESTS_COLUMNS = [
    "id", "requester_merchant_id", "product_name", "quantity", "unit",
    "urgency", "status", "city", "pincode", "state", "origin",
    "origin_customer_request_id", "match_source", "created_at", "updated_at"
]

RESPONSES_COLUMNS = [
    "id", "request_id", "responder_merchant_id", "availability", "created_at"
]

ORDERS_COLUMNS = [
    "id", "request_id", "buyer_merchant_id", "seller_merchant_id",
    "delivery_mode", "delivery_provider_code", "delivery_provider_ref",
    "buyer_confirmed_at", "seller_confirmed_at", "status", "created_at", "updated_at"
]

MESSAGES_COLUMNS = [
    "id", "order_id", "request_id", "sender_merchant_id",
    "body", "image_url", "created_at"
]

ACTIVITY_LOG_COLUMNS = [
    "id", "actor_merchant_id", "request_id", "order_id", "action", "meta", "created_at"
]

TRUST_METRICS_COLUMNS = [
    "id", "merchant_id", "trust_score", "successful_transactions",
    "response_rate", "cancellation_rate", "ai_risk_score", "updated_at"
]

NOTIFICATIONS_COLUMNS = [
    "id", "recipient_merchant_id", "event_type", "title", "body",
    "related_request_id", "related_order_id", "read", "created_at"
]

# Helper query builders
_REQ_COLS_SQL = ", ".join(f'"{c}"' for c in REQUESTS_COLUMNS)
_RESP_COLS_SQL = ", ".join(f'"{c}"' for c in RESPONSES_COLUMNS)
_ORD_COLS_SQL = ", ".join(f'"{c}"' for c in ORDERS_COLUMNS)
_MSG_COLS_SQL = ", ".join(f'"{c}"' for c in MESSAGES_COLUMNS)
_ACT_COLS_SQL = ", ".join(f'"{c}"' for c in ACTIVITY_LOG_COLUMNS)
_TRUST_COLS_SQL = ", ".join(f'"{c}"' for c in TRUST_METRICS_COLUMNS)
_NOTIF_COLS_SQL = ", ".join(f'"{c}"' for c in NOTIFICATIONS_COLUMNS)

def _row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row._mapping)

# ==========================================
# 1. Merchant Network Requests
# ==========================================

async def get_request_by_id(db: AsyncSession, request_id: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_REQ_COLS_SQL} from public.merchant_network_requests where id = :id'),
        {"id": request_id}
    )
    row = res.first()
    return _row_to_dict(row) if row else None

async def insert_request(db: AsyncSession, request: dict[str, Any]) -> dict[str, Any]:
    cols = [c for c in REQUESTS_COLUMNS if c in request]
    col_sql = ", ".join(f'"{c}"' for c in cols)
    val_sql = ", ".join(f':{c}' for c in cols)
    res = await db.execute(
        text(
            f'insert into public.merchant_network_requests ({col_sql}) values ({val_sql}) '
            f'returning {_REQ_COLS_SQL}'
        ),
        {c: request[c] for c in cols}
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row)

async def update_request_status(db: AsyncSession, request_id: str, status: str) -> Optional[dict[str, Any]]:
    import time
    now_ms = int(time.time() * 1000)
    res = await db.execute(
        text(
            'update public.merchant_network_requests '
            'set status = :status, updated_at = :updated_at '
            'where id = :id '
            f'returning {_REQ_COLS_SQL}'
        ),
        {"id": request_id, "status": status, "updated_at": now_ms}
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row) if row else None

async def update_request_details(db: AsyncSession, request_id: str, updates: dict[str, Any]) -> Optional[dict[str, Any]]:
    cols = [c for c in ["product_name", "quantity", "unit", "urgency"] if c in updates]
    if not cols:
        return None
    import time
    now_ms = int(time.time() * 1000)
    set_sql = ", ".join(f'{c} = :{c}' for c in cols) + ", updated_at = :updated_at"
    params = {c: updates[c] for c in cols}
    params["id"] = request_id
    params["updated_at"] = now_ms
    
    res = await db.execute(
        text(
            f'update public.merchant_network_requests set {set_sql} '
            f'where id = :id returning {_REQ_COLS_SQL}'
        ),
        params
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row) if row else None

async def get_nearby_requests(
    db: AsyncSession, 
    caller_id: str, 
    city: Optional[str], 
    pincode: Optional[str], 
    state: Optional[str],
    radius_km: float = 50.0
) -> List[dict[str, Any]]:
    # 1. Fetch caller's coordinates
    caller_res = await db.execute(
        text('SELECT latitude, longitude FROM public.merchants WHERE id = :caller_id'),
        {"caller_id": caller_id}
    )
    caller_row = caller_res.first()
    caller_lat = caller_row.latitude if caller_row else None
    caller_lng = caller_row.longitude if caller_row else None

    # 2. Build legacy fallback conditions
    conditions = []
    params = {"caller_id": caller_id}
    
    if city:
        conditions.append("lower(r.city) = lower(:city)")
        params["city"] = city.strip()
    if pincode:
        conditions.append("r.pincode = :pincode")
        params["pincode"] = pincode.strip()
    if state:
        conditions.append("lower(r.state) = lower(:state)")
        params["state"] = state.strip()
        
    if not conditions:
        return []
        
    cond_sql = " OR ".join(conditions)
    req_cols_prefixed = ", ".join(f'r."{c}"' for c in REQUESTS_COLUMNS)
    
    # 3. Build dynamic WHERE clause based on coordinate availability
    if caller_lat is not None and caller_lng is not None:
        params["caller_lat"] = caller_lat
        params["caller_lng"] = caller_lng
        params["radius_km"] = radius_km
        
        # Haversine formula (clamped to prevent float precision errors in acos)
        distance_sql = """
            6371.0 * acos(
                least(1.0, greatest(-1.0,
                    cos(radians(:caller_lat)) * cos(radians(m.latitude)) * cos(radians(m.longitude - :caller_lng)) +
                    sin(radians(:caller_lat)) * sin(radians(m.latitude))
                ))
            )
        """
        
        where_clause = f"""
            r.status = 'open' 
            AND r.requester_merchant_id != :caller_id
            AND (
                (m.latitude IS NOT NULL AND m.longitude IS NOT NULL AND {distance_sql} <= :radius_km)
                OR
                ((m.latitude IS NULL OR m.longitude IS NULL) AND ({cond_sql}))
            )
        """
    else:
        # Fallback completely if caller has no coordinates
        where_clause = f"""
            r.status = 'open' 
            AND r.requester_merchant_id != :caller_id
            AND ({cond_sql})
        """
        
    # 4. Execute joined query
    res = await db.execute(
        text(f'''
            SELECT {req_cols_prefixed}
            FROM public.merchant_network_requests r
            JOIN public.merchants m ON r.requester_merchant_id = m.id
            WHERE {where_clause}
            ORDER BY r.created_at DESC
        '''),
        params
    )
    return [_row_to_dict(r) for r in res.fetchall()]

async def list_merchant_requests(db: AsyncSession, merchant_id: str) -> List[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_REQ_COLS_SQL} from public.merchant_network_requests where requester_merchant_id = :merch_id order by created_at desc'),
        {"merch_id": merchant_id}
    )
    return [_row_to_dict(r) for r in res.fetchall()]

# ==========================================
# 2. Merchant Network Responses
# ==========================================

async def get_response_by_id(db: AsyncSession, response_id: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_RESP_COLS_SQL} from public.merchant_network_responses where id = :id'),
        {"id": response_id}
    )
    row = res.first()
    return _row_to_dict(row) if row else None

async def get_response_by_request_and_responder(db: AsyncSession, request_id: str, responder_merchant_id: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text(
            f'select {_RESP_COLS_SQL} from public.merchant_network_responses '
            f'where request_id = :request_id and responder_merchant_id = :responder_merchant_id'
        ),
        {"request_id": request_id, "responder_merchant_id": responder_merchant_id}
    )
    row = res.first()
    return _row_to_dict(row) if row else None

async def get_responses_for_request(db: AsyncSession, request_id: str) -> List[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_RESP_COLS_SQL} from public.merchant_network_responses where request_id = :request_id order by created_at desc'),
        {"request_id": request_id}
    )
    return [_row_to_dict(r) for r in res.fetchall()]

async def insert_response(db: AsyncSession, response: dict[str, Any]) -> dict[str, Any]:
    cols = [c for c in RESPONSES_COLUMNS if c in response]
    col_sql = ", ".join(f'"{c}"' for c in cols)
    val_sql = ", ".join(f':{c}' for c in cols)
    res = await db.execute(
        text(
            f'insert into public.merchant_network_responses ({col_sql}) values ({val_sql}) '
            f'returning {_RESP_COLS_SQL}'
        ),
        {c: response[c] for c in cols}
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row)

async def delete_response(db: AsyncSession, response_id: str) -> bool:
    res = await db.execute(
        text('delete from public.merchant_network_responses where id = :id returning id'),
        {"id": response_id}
    )
    row = res.first()
    await db.commit()
    return row is not None

# ==========================================
# 3. Merchant Network Orders
# ==========================================

async def get_order_by_id(db: AsyncSession, order_id: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_ORD_COLS_SQL} from public.merchant_network_orders where id = :id'),
        {"id": order_id}
    )
    row = res.first()
    return _row_to_dict(row) if row else None

async def insert_order(db: AsyncSession, order: dict[str, Any]) -> dict[str, Any]:
    cols = [c for c in ORDERS_COLUMNS if c in order]
    col_sql = ", ".join(f'"{c}"' for c in cols)
    val_sql = ", ".join(f':{c}' for c in cols)
    res = await db.execute(
        text(
            f'insert into public.merchant_network_orders ({col_sql}) values ({val_sql}) '
            f'returning {_ORD_COLS_SQL}'
        ),
        {c: order[c] for c in cols}
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row)

async def update_order_confirmations(
    db: AsyncSession, order_id: str, status: str, buyer_confirmed_at: Optional[int], seller_confirmed_at: Optional[int]
) -> Optional[dict[str, Any]]:
    import time
    now_ms = int(time.time() * 1000)
    
    # We update buyer_confirmed_at if not null, seller_confirmed_at if not null, status, and updated_at
    updates = ["status = :status", "updated_at = :updated_at"]
    params = {"id": order_id, "status": status, "updated_at": now_ms}
    
    if buyer_confirmed_at is not None:
        updates.append('"buyer_confirmed_at" = :buyer_confirmed_at')
        params["buyer_confirmed_at"] = buyer_confirmed_at
    if seller_confirmed_at is not None:
        updates.append('"seller_confirmed_at" = :seller_confirmed_at')
        params["seller_confirmed_at"] = seller_confirmed_at
        
    updates_sql = ", ".join(updates)
    res = await db.execute(
        text(
            f'update public.merchant_network_orders '
            f'set {updates_sql} '
            f'where id = :id '
            f'returning {_ORD_COLS_SQL}'
        ),
        params
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row) if row else None

async def update_order_status(db: AsyncSession, order_id: str, status: str) -> Optional[dict[str, Any]]:
    import time
    now_ms = int(time.time() * 1000)
    res = await db.execute(
        text(
            'update public.merchant_network_orders '
            'set status = :status, updated_at = :updated_at '
            'where id = :id '
            f'returning {_ORD_COLS_SQL}'
        ),
        {"id": order_id, "status": status, "updated_at": now_ms}
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row) if row else None

async def list_merchant_orders(db: AsyncSession, merchant_id: str) -> List[dict[str, Any]]:
    res = await db.execute(
        text(
            f'select {_ORD_COLS_SQL} from public.merchant_network_orders '
            f'where buyer_merchant_id = :merch_id or seller_merchant_id = :merch_id '
            f'order by created_at desc'
        ),
        {"merch_id": merchant_id}
    )
    return [_row_to_dict(r) for r in res.fetchall()]

# ==========================================
# 4. Merchant Network Messages
# ==========================================

async def get_messages_for_order(db: AsyncSession, order_id: str) -> List[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_MSG_COLS_SQL} from public.merchant_network_messages where order_id = :order_id order by created_at asc'),
        {"order_id": order_id}
    )
    return [_row_to_dict(r) for r in res.fetchall()]

async def insert_message(db: AsyncSession, message: dict[str, Any]) -> dict[str, Any]:
    cols = [c for c in MESSAGES_COLUMNS if c in message]
    col_sql = ", ".join(f'"{c}"' for c in cols)
    val_sql = ", ".join(f':{c}' for c in cols)
    res = await db.execute(
        text(
            f'insert into public.merchant_network_messages ({col_sql}) values ({val_sql}) '
            f'returning {_MSG_COLS_SQL}'
        ),
        {c: message[c] for c in cols}
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row)

# ==========================================
# 5. Merchant Network Activity Log
# ==========================================

async def insert_activity_log(db: AsyncSession, log: dict[str, Any]) -> dict[str, Any]:
    import json
    cols = [c for c in ACTIVITY_LOG_COLUMNS if c in log]
    col_sql = ", ".join(f'"{c}"' for c in cols)
    val_sql = ", ".join(f':{c}' for c in cols)
    
    # meta needs to be json string if passed as dict
    params = {}
    for c in cols:
        if c == "meta" and isinstance(log[c], dict):
            params[c] = json.dumps(log[c])
        else:
            params[c] = log[c]
            
    res = await db.execute(
        text(
            f'insert into public.merchant_network_activity_log ({col_sql}) values ({val_sql}) '
            f'returning {_ACT_COLS_SQL}'
        ),
        params
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row)

# ==========================================
# 6. Merchant Trust Metrics
# ==========================================

async def get_trust_metrics(db: AsyncSession, merchant_id: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_TRUST_COLS_SQL} from public.merchant_trust_metrics where merchant_id = :merchant_id'),
        {"merchant_id": merchant_id}
    )
    row = res.first()
    return _row_to_dict(row) if row else None

async def increment_successful_transactions(db: AsyncSession, merchant_id: str) -> dict[str, Any]:
    import time
    import secrets
    now_ms = int(time.time() * 1000)
    
    # Use upsert to handle first transaction
    res = await db.execute(
        text('''
            insert into public.merchant_trust_metrics (id, merchant_id, successful_transactions, updated_at)
            values (:id, :merchant_id, 1, :updated_at)
            on conflict (merchant_id) do update
            set successful_transactions = public.merchant_trust_metrics.successful_transactions + 1,
                updated_at = excluded.updated_at
            returning '''+_TRUST_COLS_SQL
        ),
        {
            "id": f"tm_{secrets.token_hex(8)}",
            "merchant_id": merchant_id,
            "updated_at": now_ms
        }
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row)

# ==========================================
# 7. Network Notifications
# ==========================================

async def insert_notification(db: AsyncSession, notif: dict[str, Any]) -> dict[str, Any]:
    cols = [c for c in NOTIFICATIONS_COLUMNS if c in notif]
    col_sql = ", ".join(f'"{c}"' for c in cols)
    val_sql = ", ".join(f':{c}' for c in cols)
    res = await db.execute(
        text(
            f'insert into public.network_notifications ({col_sql}) values ({val_sql}) '
            f'returning {_NOTIF_COLS_SQL}'
        ),
        {c: notif[c] for c in cols}
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row)

async def get_notifications_for_merchant(db: AsyncSession, merchant_id: str) -> List[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_NOTIF_COLS_SQL} from public.network_notifications where recipient_merchant_id = :merchant_id order by created_at desc'),
        {"merchant_id": merchant_id}
    )
    return [_row_to_dict(r) for r in res.fetchall()]

async def mark_notification_as_read(db: AsyncSession, notification_id: str, merchant_id: str) -> bool:
    res = await db.execute(
        text(
            'update public.network_notifications '
            'set read = true '
            'where id = :id and recipient_merchant_id = :merchant_id '
            'returning id'
        ),
        {"id": notification_id, "merchant_id": merchant_id}
    )
    row = res.first()
    await db.commit()
    return row is not None

async def notify(
    db: AsyncSession,
    recipient_id: str,
    event_type: str,
    title: str,
    body: str,
    request_id: Optional[str] = None,
    order_id: Optional[str] = None
) -> dict[str, Any]:
    """Sends a cross-merchant notification by inserting a record into network_notifications.
    Centralized notify() single call-site pattern.
    """
    import secrets
    import time
    notif = {
        "id": f"nnot_{secrets.token_hex(8)}",
        "recipient_merchant_id": recipient_id,
        "event_type": event_type,
        "title": title,
        "body": body,
        "related_request_id": request_id,
        "related_order_id": order_id,
        "read": False,
        "created_at": int(time.time() * 1000)
    }
    return await insert_notification(db, notif)


# ==========================================
# Phase 5: AI Merchant Matching (Deterministic Engine)
# ==========================================

async def find_matching_merchants(
    db: AsyncSession, 
    request_id: str, 
    radius_km: float = 50.0,
    limit: int = 10
) -> List[dict[str, Any]]:
    """Phase 5: Automatically ranks merchants based on Distance, Product Match (Invoice History), 
    and Behaviour (Billing Requests). Completely deterministic and purely runs on existing canonical data.
    """
    req = await get_request_by_id(db, request_id)
    if not req:
        return []
        
    caller_id = req["requester_merchant_id"]
    product_name = req["product_name"]
    req_city = req["city"] or ""
    req_pincode = req["pincode"] or ""
    
    # Fetch caller's coordinates
    caller_res = await db.execute(
        text('SELECT latitude, longitude FROM public.merchants WHERE id = :caller_id'),
        {"caller_id": caller_id}
    )
    caller_row = caller_res.first()
    caller_lat = caller_row.latitude if caller_row else None
    caller_lng = caller_row.longitude if caller_row else None

    # Simple substring match for product
    product_match = f"%{product_name.strip()}%"

    params = {
        "caller_id": caller_id,
        "radius_km": radius_km,
        "req_pincode": req_pincode,
        "req_city": req_city,
        "product_match": product_match,
        "limit": limit
    }

    if caller_lat is not None and caller_lng is not None:
        params["caller_lat"] = float(caller_lat)
        params["caller_lng"] = float(caller_lng)
        distance_sql = """
            CASE 
                WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN
                    6371.0 * acos(least(1.0, greatest(-1.0, 
                        cos(radians(:caller_lat)) * cos(radians(latitude)) * cos(radians(longitude - :caller_lng)) + 
                        sin(radians(:caller_lat)) * sin(radians(latitude))
                    )))
                ELSE NULL
            END
        """
    else:
        distance_sql = "NULL::double precision"

    query = f"""
        WITH candidates AS (
            SELECT id, latitude, longitude, city, pincode, state
            FROM public.merchants
            WHERE id != :caller_id
        ),
        distances AS (
            SELECT id, {distance_sql} as distance_km
            FROM candidates
        ),
        filtered_candidates AS (
            SELECT c.id, d.distance_km
            FROM candidates c
            JOIN distances d ON c.id = d.id
            WHERE 
                (d.distance_km IS NOT NULL AND d.distance_km <= :radius_km)
                OR 
                (d.distance_km IS NULL AND (c.pincode = :req_pincode OR lower(c.city) = lower(:req_city)))
        ),
        product_history AS (
            SELECT "merchantId", COUNT(*) as sell_count, MAX("createdAt") as last_sold
            FROM public.invoices, jsonb_array_elements(
                CASE
                    WHEN jsonb_typeof(items)='array' THEN items
                    ELSE '[]'::jsonb
                END
            ) as item
            WHERE lower(item->>'description') LIKE lower(:product_match)
            GROUP BY "merchantId"
        ),
        behaviour AS (
            SELECT "merchantId", 
                   COUNT(*) FILTER (WHERE status = 'approved') as approved_count
            FROM public.billing_requests
            GROUP BY "merchantId"
        )
        SELECT 
            fc.id as merchant_id,
            fc.distance_km,
            COALESCE(ph.sell_count, 0) as product_sell_count,
            COALESCE(ph.last_sold, 0) as last_sold_at,
            COALESCE(b.approved_count, 0) as behaviour_score,
            (
                (COALESCE(ph.sell_count, 0) * 10) + 
                (COALESCE(b.approved_count, 0) * 2) + 
                CASE 
                    WHEN fc.distance_km IS NOT NULL THEN GREATEST(0, 50 - fc.distance_km) 
                    ELSE 10
                END
            ) as match_score
        FROM filtered_candidates fc
        LEFT JOIN product_history ph ON fc.id = ph."merchantId"
        LEFT JOIN behaviour b ON fc.id = b."merchantId"
        WHERE COALESCE(ph.sell_count, 0) > 0
        ORDER BY match_score DESC
        LIMIT :limit
    """
    
    logger.info(f"find_matching_merchants SQL params: {params}")
    
    try:
        res = await db.execute(text(query), params)
    except ProgrammingError as e:
        logger.error(f"SQLAlchemy ProgrammingError in find_matching_merchants: {e}")
        if e.orig:
            logger.error(f"Original DB Driver Error (asyncpg): {e.orig}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error in find_matching_merchants: {e}")
        raise
    
    return [_row_to_dict(r) for r in res.fetchall()]


# ==========================================
# Phase 6 Additions: Cancellation, Images, Reviews & Disputes
# ==========================================

async def cancel_order_with_reason(db: AsyncSession, order_id: str, merchant_id: str, reason: Optional[str] = None) -> bool:
    res = await db.execute(
        text(
            'update public.merchant_network_orders '
            'set status = \'cancelled\', cancellation_reason = :reason, updated_at = extract(epoch from now())::bigint * 1000 '
            'where id = :order_id and (buyer_merchant_id = :merchant_id or seller_merchant_id = :merchant_id) '
            'returning id'
        ),
        {"order_id": order_id, "merchant_id": merchant_id, "reason": reason}
    )
    row = res.first()
    await db.commit()
    return row is not None

async def send_message_with_image(db: AsyncSession, order_id: str, sender_merchant_id: str, body: str, image_url: Optional[str] = None) -> dict[str, Any]:
    import secrets, time
    msg = {
        "id": f"msg_{secrets.token_hex(8)}",
        "order_id": order_id,
        "sender_merchant_id": sender_merchant_id,
        "body": body,
        "image_url": image_url,
        "created_at": int(time.time() * 1000)
    }
    res = await db.execute(
        text('insert into public.merchant_network_messages (id, order_id, sender_merchant_id, body, image_url, created_at) '
             'values (:id, :order_id, :sender_merchant_id, :body, :image_url, :created_at) returning *'),
        msg
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row)

async def create_review(db: AsyncSession, order_id: str, reviewer_id: str, reviewee_id: str, rating: int, comment: Optional[str] = None) -> dict[str, Any]:
    import secrets, time
    rev = {
        "id": f"rev_{secrets.token_hex(8)}",
        "order_id": order_id,
        "reviewer_merchant_id": reviewer_id,
        "reviewee_merchant_id": reviewee_id,
        "rating": rating,
        "comment": comment,
        "created_at": int(time.time() * 1000)
    }
    res = await db.execute(
        text('insert into public.merchant_network_reviews (id, order_id, reviewer_merchant_id, reviewee_merchant_id, rating, comment, created_at) '
             'values (:id, :order_id, :reviewer_merchant_id, :reviewee_merchant_id, :rating, :comment, :created_at) returning *'),
        rev
    )
    row = res.first()
    
    avg_res = await db.execute(
        text('select avg(rating)::numeric(3,1) as avg_rating, count(*) as cnt from public.merchant_network_reviews where reviewee_merchant_id = :mid'),
        {"mid": reviewee_id}
    )
    avg_row = avg_res.first()
    if avg_row and avg_row.cnt > 0:
        new_score = float(avg_row.avg_rating) * 20.0
        await db.execute(
            text('insert into public.merchant_trust_metrics (id, merchant_id, trust_score, successful_transactions, updated_at) '
                 'values (:id, :mid, :score, :cnt, :now) '
                 'on conflict (merchant_id) do update set trust_score = :score, successful_transactions = :cnt, updated_at = :now'),
            {"id": f"tm_{secrets.token_hex(6)}", "mid": reviewee_id, "score": new_score, "cnt": int(avg_row.cnt), "now": int(time.time() * 1000)}
        )

    await db.commit()
    return _row_to_dict(row)

async def create_dispute(db: AsyncSession, order_id: str, reporter_id: str, target_id: str, reason: str, details: Optional[str] = None) -> dict[str, Any]:
    import secrets, time
    disp = {
        "id": f"disp_{secrets.token_hex(8)}",
        "order_id": order_id,
        "reporter_merchant_id": reporter_id,
        "target_merchant_id": target_id,
        "reason": reason,
        "details": details,
        "status": "open",
        "created_at": int(time.time() * 1000)
    }
    res = await db.execute(
        text('insert into public.merchant_network_disputes (id, order_id, reporter_merchant_id, target_merchant_id, reason, details, status, created_at) '
             'values (:id, :order_id, :reporter_merchant_id, :target_merchant_id, :reason, :details, :status, :created_at) returning *'),
        disp
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row)

