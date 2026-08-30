"""Merchant Network (B2B Marketplace) API router.
Gated behind Verified KYC + super-admin feature flag check.
"""
import secrets
import time
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from .. import merchant_repo, merchant_network_repo, feature_flags_repo
from ..database import get_db
from ..security import require_merchant
from ..schemas import (
    MerchantNetworkRequestCreateIn,
    MerchantNetworkRespondIn,
    MerchantNetworkAcceptIn,
    MerchantNetworkMessageIn,
)

logger = logging.getLogger("merchant_network")

router = APIRouter(tags=["merchant_network"])

# ==========================================
# Gating Dependency
# ==========================================
async def require_network_enabled(
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Verifies that the merchant is KYC-verified AND the B2B marketplace feature
    flag is enabled.
    """
    merchant = await merchant_repo.get_by_id_light(db, merchant_id)
    if not merchant:
        raise HTTPException(
            status_code=401,
            detail="Access denied: Merchant not found."
        )
        
    if merchant.get("kyc") != "verified":
        raise HTTPException(
            status_code=403,
            detail="Access denied: Merchant KYC must be verified to use the Merchant Network."
        )
    
    enabled = await feature_flags_repo.is_enabled(db, "merchant_network_enabled")
    if not enabled:
        raise HTTPException(
            status_code=403,
            detail="Access denied: The Merchant Network module is currently disabled by administrator."
        )
        
    return merchant

# ==========================================
# Helpers
# ==========================================
async def _get_merchant_details(db: AsyncSession, merchant_id: str) -> Optional[dict]:
    return await merchant_repo.get_by_id_light(db, merchant_id)

async def _get_shop_name(db: AsyncSession, merchant_id: str) -> str:
    m = await _get_merchant_details(db, merchant_id)
    return m["shopName"] if m else "Unknown Merchant"

async def log_activity(
    db: AsyncSession,
    actor_id: str,
    action: str,
    request_id: Optional[str] = None,
    order_id: Optional[str] = None,
    meta: Optional[dict] = None
):
    """Appends an audit log entry to the merchant_network_activity_log.
    """
    log_entry = {
        "id": f"log_{secrets.token_hex(8)}",
        "actor_merchant_id": actor_id,
        "request_id": request_id,
        "order_id": order_id,
        "action": action,
        "meta": meta or {},
        "created_at": int(time.time() * 1000)
    }
    await merchant_network_repo.insert_activity_log(db, log_entry)

async def notify(
    db: AsyncSession,
    recipient_id: str,
    event_type: str,
    title: str,
    body: str,
    request_id: Optional[str] = None,
    order_id: Optional[str] = None
):
    """Sends a cross-merchant notification by inserting a record into network_notifications.
    """
    await merchant_network_repo.notify(
        db,
        recipient_id=recipient_id,
        event_type=event_type,
        title=title,
        body=body,
        request_id=request_id,
        order_id=order_id
    )

# ==========================================
# Endpoints
# ==========================================

@router.get("/feature-flag")
async def get_feature_flag(
    _merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db)
):
    """Checks if the B2B marketplace feature is enabled globally.
    Gated only by require_merchant (so it doesn't fail with 403 when the feature is off).
    """
    enabled = await feature_flags_repo.is_enabled(db, "merchant_network_enabled")
    return {"merchant_network_enabled": enabled}


@router.post("/requests")
async def create_request(
    payload: MerchantNetworkRequestCreateIn,
    merchant: dict = Depends(require_network_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Creates a new B2B request in the network.
    Coordinates notifications using Phase 5 AI matching and Phase 6 Escalation Engine.
    """
    now = int(time.time() * 1000)
    req_id = f"req_{secrets.token_hex(8)}"
    
    # Copy location fields from requester's profile
    city = merchant.get("city")
    pincode = merchant.get("pincode")
    state = merchant.get("state")
    
    request_data = {
        "id": req_id,
        "requester_merchant_id": merchant["id"],
        "product_name": payload.product_name,
        "quantity": payload.quantity,
        "unit": payload.unit,
        "urgency": payload.urgency,
        "status": "open",
        "city": city,
        "pincode": pincode,
        "state": state,
        "origin": "direct",
        "origin_customer_request_id": None,
        "match_source": "manual",
        "created_at": now,
        "updated_at": now
    }
    
    # 1. Insert request
    request = await merchant_network_repo.insert_request(db, request_data)
    
    # 2. Log activity
    await log_activity(db, merchant["id"], "create_request", request_id=req_id)
    
    # 3. Seam for stock matching (always returns empty [] for now)
    matched_stock = []
    
    # 4. Phase 5: Initial Smart Search (10km radius, top 10 matches)
    matches = await merchant_network_repo.find_matching_merchants(
        db, 
        request_id=req_id, 
        radius_km=10.0, 
        limit=10
    )
    
    shop_name = merchant["shopName"]
    title = "New B2B Request Nearby"
    body = f"{shop_name} requested {payload.quantity} {payload.unit} of {payload.product_name}."
    if payload.urgency == "urgent":
        title = "🚨 Urgent B2B Request Nearby"
        body = f"[URGENT] {body}"
        
    notified_count = 0
    for match in matches:
        await merchant_network_repo.notify(
            db, 
            recipient_id=match["merchant_id"], 
            event_type="new_nearby_request", 
            title=title, 
            body=body, 
            request_id=req_id
        )
        notified_count += 1
        
    # 5. Phase 6: Enqueue Escalation Job (Persistent)
    # Background worker will automatically expand the radius if the request remains open
    from .. import jobs_repo
    await jobs_repo.enqueue_job(
        db,
        job_type="escalate_network_search",
        payload={
            "request_id": req_id,
            "radius_km": 25.0, # Next radius step
            "limit": 25,       # Next limit step
            "notified_count": notified_count
        },
        run_after_ms=now + (15 * 60 * 1000) # Escalates after 15 minutes
    )
            
    return {
        "matched_inventory": matched_stock,
        "manual_request_created": request
    }

@router.get("/requests/nearby")
async def list_nearby_requests(
    merchant: dict = Depends(require_network_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Fetches open requests from other merchants in the same city, pincode, or state."""
    city = merchant.get("city")
    pincode = merchant.get("pincode")
    state = merchant.get("state")
    
    requests = await merchant_network_repo.get_nearby_requests(
        db, 
        caller_id=merchant["id"], 
        city=city, 
        pincode=pincode, 
        state=state
    )
    
    # Batch lookup to eliminate N+1 database queries
    requester_ids = list({r["requester_merchant_id"] for r in requests if r.get("requester_merchant_id")})
    merchant_map = {}
    if requester_ids:
        res = await db.execute(
            text('SELECT id, "shopName", kyc FROM public.merchants WHERE id = ANY(:mids)'),
            {"mids": requester_ids}
        )
        for row in res.fetchall():
            d = dict(row._mapping)
            merchant_map[d["id"]] = d

    # Mask requester merchant details (exposing only non-sensitive data)
    masked_requests = []
    for r in requests:
        req_merchant = merchant_map.get(r.get("requester_merchant_id"))
        masked_requests.append({
            "request": r,
            "shopName": req_merchant["shopName"] if req_merchant else "Verified Merchant",
            "kyc": req_merchant.get("kyc") if req_merchant else "verified"
        })
        
    return {"requests": masked_requests}

class UpdateRequestPayload(BaseModel):
    product_name: Optional[str] = None
    quantity: Optional[int] = None
    unit: Optional[str] = None
    urgency: Optional[str] = None

@router.patch("/requests/{id}")
async def update_request(
    id: str,
    payload: UpdateRequestPayload,
    merchant: dict = Depends(require_network_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Updates a posted request. Only allowed if zero responses."""
    request = await merchant_network_repo.get_request_by_id(db, id)
    if not request:
        raise HTTPException(404, "Request not found")
    if request["requester_merchant_id"] != merchant["id"]:
        raise HTTPException(403, "Not authorized")
        
    responses = await merchant_network_repo.get_responses_for_request(db, id)
    if len(responses) > 0:
        raise HTTPException(400, "Cannot edit request because it already has responses.")
        
    updates = payload.dict(exclude_unset=True)
    if not updates:
        return {"ok": True, "request": request}
        
    updated = await merchant_network_repo.update_request_details(db, id, updates)
    return {"ok": True, "request": updated}

@router.patch("/requests/{id}/cancel")
async def cancel_request(
    id: str,
    merchant: dict = Depends(require_network_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Cancels an open request broadcast."""
    req = await merchant_network_repo.get_request_by_id(db, id)
    if not req:
        raise HTTPException(404, "Request not found")
    if req["requester_merchant_id"] != merchant["id"]:
        raise HTTPException(403, "Not authorized to cancel this request")
    if req["status"] not in ["open", "pending"]:
        raise HTTPException(400, "Only open requests can be cancelled")
        
    updated = await merchant_network_repo.update_request_status(db, id, "cancelled")
    return {"ok": True, "request": updated}

@router.patch("/orders/{id}/cancel")
async def cancel_order(
    id: str,
    merchant: dict = Depends(require_network_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Cancels an already-matched order."""
    order = await merchant_network_repo.get_order_by_id(db, id)
    if not order:
        raise HTTPException(404, "Order not found")
    if merchant["id"] not in (order["buyer_merchant_id"], order["seller_merchant_id"]):
        raise HTTPException(403, "Not authorized to cancel this order")
    if order["status"] in ["completed", "cancelled"]:
        raise HTTPException(400, "Only open or accepted orders can be cancelled")
        
    updated_order = await merchant_network_repo.update_order_status(db, id, "cancelled")
    await merchant_network_repo.update_request_status(db, order["request_id"], "cancelled")
    
    await log_activity(db, merchant["id"], "cancel_order", order_id=id)
    
    recipient_id = order["seller_merchant_id"] if merchant["id"] == order["buyer_merchant_id"] else order["buyer_merchant_id"]
    sender_shop = merchant["shopName"]
    
    await notify(
        db,
        recipient_id=recipient_id,
        event_type="order_cancelled",
        title="Order Cancelled",
        body=f"{sender_shop} has cancelled the order.",
        order_id=id
    )
    
    return {"ok": True, "order": updated_order}

@router.post("/requests/{id}/respond")
async def respond_to_request(
    id: str,
    payload: MerchantNetworkRespondIn,
    merchant: dict = Depends(require_network_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Responds to a request in the network (marking availability).
    """
    request = await merchant_network_repo.get_request_by_id(db, id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found.")
        
    if request["status"] not in ("open", "responded"):
        raise HTTPException(status_code=400, detail="This request is no longer open for responses.")
        
    if request["requester_merchant_id"] == merchant["id"]:
        raise HTTPException(status_code=400, detail="You cannot respond to your own request.")
        
    # Check if already responded
    existing = await merchant_network_repo.get_response_by_request_and_responder(db, id, merchant["id"])
    if existing:
        raise HTTPException(status_code=400, detail="You have already responded to this request.")
        
    now = int(time.time() * 1000)
    resp_id = f"resp_{secrets.token_hex(8)}"
    
    response_data = {
        "id": resp_id,
        "request_id": id,
        "responder_merchant_id": merchant["id"],
        "availability": payload.availability,
        "created_at": now
    }
    
    # 1. Insert response
    response = await merchant_network_repo.insert_response(db, response_data)
    
    # 2. Update request status to 'responded' if it was 'open'
    if request["status"] == "open" and payload.availability == "available":
        await merchant_network_repo.update_request_status(db, id, "responded")
        
    # 3. Log activity
    await log_activity(
        db, 
        merchant["id"], 
        "respond_to_request", 
        request_id=id, 
        meta={"availability": payload.availability}
    )
    
    # 4. Notify the requester
    if payload.availability == "available":
        shop_name = merchant["shopName"]
        await notify(
            db,
            recipient_id=request["requester_merchant_id"],
            event_type="response_received",
            title="Stock Response Received",
            body=f"{shop_name} has responded that they have {request['product_name']} available.",
            request_id=id
        )
        
    return {"ok": True, "response": response}

@router.patch("/responses/{id}/dismiss")
async def dismiss_response(
    id: str,
    merchant: dict = Depends(require_network_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Dismisses a response."""
    response = await merchant_network_repo.get_response_by_id(db, id)
    if not response:
        raise HTTPException(status_code=404, detail="Response not found.")
        
    request = await merchant_network_repo.get_request_by_id(db, response["request_id"])
    if not request:
        raise HTTPException(status_code=404, detail="Request not found.")
        
    if request["requester_merchant_id"] != merchant["id"]:
        raise HTTPException(status_code=403, detail="Only the request creator can dismiss responses.")
        
    await merchant_network_repo.delete_response(db, id)
    
    return {"ok": True}

@router.post("/requests/{id}/accept")
async def accept_response(
    id: str,
    payload: MerchantNetworkAcceptIn,
    merchant: dict = Depends(require_network_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Accepts a seller's response for a request, creating an order and initializing chat.
    """
    request = await merchant_network_repo.get_request_by_id(db, id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found.")
        
    if request["requester_merchant_id"] != merchant["id"]:
        raise HTTPException(status_code=403, detail="Only the request creator can accept responses.")
        
    if request["status"] not in ("open", "responded"):
        raise HTTPException(status_code=400, detail="This request has already been accepted or finalized.")
        
    # Verify response exists
    response = await merchant_network_repo.get_response_by_request_and_responder(db, id, payload.responder_merchant_id)
    if not response or response["availability"] != "available":
        raise HTTPException(status_code=400, detail="No active available response found for this merchant.")
        
    now = int(time.time() * 1000)
    order_id = f"ord_{secrets.token_hex(8)}"
    
    order_data = {
        "id": order_id,
        "request_id": id,
        "buyer_merchant_id": merchant["id"],
        "seller_merchant_id": payload.responder_merchant_id,
        "delivery_mode": "self_pickup",
        "delivery_provider_code": "self_pickup",
        "delivery_provider_ref": None,
        "buyer_confirmed_at": None,
        "seller_confirmed_at": None,
        "status": "accepted",
        "created_at": now,
        "updated_at": now
    }
    
    # 1. Create order
    order = await merchant_network_repo.insert_order(db, order_data)
    
    # 2. Update request status to 'accepted'
    await merchant_network_repo.update_request_status(db, id, "accepted")
    
    # 3. Log activity
    await log_activity(db, merchant["id"], "accept_response", request_id=id, order_id=order_id, meta={"responder_merchant_id": payload.responder_merchant_id})
    
    # 4. Open chat with system message
    chat_msg = {
        "id": f"msg_{secrets.token_hex(8)}",
        "order_id": order_id,
        "request_id": id,
        "sender_merchant_id": merchant["id"],
        "body": "System: Order accepted. Chat and negotiation is now open.",
        "created_at": now
    }
    await merchant_network_repo.insert_message(db, chat_msg)
    
    # 5. Notify the seller
    buyer_shop = merchant["shopName"]
    await notify(
        db,
        recipient_id=payload.responder_merchant_id,
        event_type="order_created",
        title="Order Opened / Response Accepted",
        body=f"{buyer_shop} accepted your stock response for {request['product_name']}. Negotiation is open.",
        request_id=id,
        order_id=order_id
    )
    
    return {"ok": True, "order": order}

@router.get("/orders/{id}/messages")
async def get_chat_messages(
    id: str,
    merchant: dict = Depends(require_network_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Fetches chat history/messages for a B2B order.
    """
    order = await merchant_network_repo.get_order_by_id(db, id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
        
    if merchant["id"] not in (order["buyer_merchant_id"], order["seller_merchant_id"]):
        raise HTTPException(status_code=403, detail="You do not have access to this order's chat.")
        
    messages = await merchant_network_repo.get_messages_for_order(db, id)
    return {"messages": messages}

@router.post("/orders/{id}/messages")
async def send_chat_message(
    id: str,
    payload: MerchantNetworkMessageIn,
    merchant: dict = Depends(require_network_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Sends a chat message to the order partner.
    """
    order = await merchant_network_repo.get_order_by_id(db, id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
        
    if merchant["id"] not in (order["buyer_merchant_id"], order["seller_merchant_id"]):
        raise HTTPException(status_code=403, detail="You do not have permission to post in this chat.")
        
    now = int(time.time() * 1000)
    msg_id = f"msg_{secrets.token_hex(8)}"
    
    message_data = {
        "id": msg_id,
        "order_id": id,
        "request_id": order["request_id"],
        "sender_merchant_id": merchant["id"],
        "body": payload.body,
        "image_url": payload.image_url,
        "created_at": now
    }
    
    # 1. Insert message
    msg = await merchant_network_repo.insert_message(db, message_data)
    
    # 2. Notify the other merchant
    recipient_id = order["seller_merchant_id"] if merchant["id"] == order["buyer_merchant_id"] else order["buyer_merchant_id"]
    sender_shop = merchant["shopName"]
    
    await notify(
        db,
        recipient_id=recipient_id,
        event_type="new_chat_message",
        title=f"Chat message from {sender_shop}",
        body=payload.body[:100] + ("..." if len(payload.body) > 100 else ""),
        order_id=id
    )
    
    return {"ok": True, "message": msg}

@router.post("/orders/{id}/confirm")
async def confirm_order(
    id: str,
    merchant: dict = Depends(require_network_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Confirms the order. Idempotent per side.
    If both sides confirm, updates the order and request status to 'confirmed'.
    """
    order = await merchant_network_repo.get_order_by_id(db, id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
        
    if merchant["id"] not in (order["buyer_merchant_id"], order["seller_merchant_id"]):
        raise HTTPException(status_code=403, detail="You do not have access to confirm this order.")
        
    now = int(time.time() * 1000)

    # SECURITY-AUDIT B2B-001 (HIGH): capture whether the order was ALREADY
    # confirmed before this call touches anything. Without this, calling
    # /confirm again on an already-confirmed order recomputes
    # final_status == "confirmed" (both confirmed_at timestamps are still
    # set from before) and re-ran the trust-score increment block below
    # every single time -- letting either party inflate BOTH sides'
    # successful_transactions count indefinitely by simply re-calling this
    # endpoint, with no new real transaction behind it.
    was_already_confirmed = order["status"] == "confirmed"

    buyer_confirmed_at = order["buyer_confirmed_at"]
    seller_confirmed_at = order["seller_confirmed_at"]
    
    if merchant["id"] == order["buyer_merchant_id"]:
        buyer_confirmed_at = now
    else:
        seller_confirmed_at = now
        
    # Check if both have confirmed
    final_status = order["status"]
    if buyer_confirmed_at and seller_confirmed_at:
        final_status = "confirmed"
        
    # Update order confirmations and status
    updated_order = await merchant_network_repo.update_order_confirmations(
        db, 
        order_id=id, 
        status=final_status, 
        buyer_confirmed_at=buyer_confirmed_at, 
        seller_confirmed_at=seller_confirmed_at
    )
    
    # If both sides confirmed AND this call is the one that just performed
    # that transition (not a replay after it was already confirmed),
    # transition request status and increment trust metrics exactly once
    # per order.
    if final_status == "confirmed" and not was_already_confirmed:
        await merchant_network_repo.update_request_status(db, order["request_id"], "confirmed")
        
        # Increment successful transactions for both merchants
        await merchant_network_repo.increment_successful_transactions(db, order["buyer_merchant_id"])
        await merchant_network_repo.increment_successful_transactions(db, order["seller_merchant_id"])
        
        # System notification message in chat
        chat_msg = {
            "id": f"msg_{secrets.token_hex(8)}",
            "order_id": id,
            "request_id": order["request_id"],
            "sender_merchant_id": merchant["id"],
            "body": "System: Both parties have confirmed this order. Deal completed successfully!",
            "created_at": now
        }
        await merchant_network_repo.insert_message(db, chat_msg)
        
    # Log activity
    await log_activity(db, merchant["id"], "confirm_order", order_id=id, meta={"final_status": final_status})
    
    # Notify partner
    recipient_id = order["seller_merchant_id"] if merchant["id"] == order["buyer_merchant_id"] else order["buyer_merchant_id"]
    sender_shop = merchant["shopName"]
    await notify(
        db,
        recipient_id=recipient_id,
        event_type="order_confirmed",
        title="B2B Order Confirmed",
        body=f"{sender_shop} confirmed the deal. " + ("Both confirmed!" if final_status == "confirmed" else "Awaiting your confirmation."),
        order_id=id
    )
    
    return {"ok": True, "order": updated_order}

@router.get("/history")
async def get_history(
    status: Optional[str] = Query(None),
    merchant: dict = Depends(require_network_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Fetches B2B marketplace history (requests created, and orders joined)."""
    my_requests = await merchant_network_repo.list_merchant_requests(db, merchant["id"])
    my_orders = await merchant_network_repo.list_merchant_orders(db, merchant["id"])
    
    # Apply status filter if provided
    if status:
        my_requests = [r for r in my_requests if r["status"] == status]
        my_orders = [o for o in my_orders if o["status"] == status]

    # 1. Batch Hydrate Orders
    order_req_ids = list({o["request_id"] for o in my_orders if o.get("request_id")})
    order_partner_ids = list({
        (o["seller_merchant_id"] if merchant["id"] == o["buyer_merchant_id"] else o["buyer_merchant_id"])
        for o in my_orders if o.get("seller_merchant_id") or o.get("buyer_merchant_id")
    })

    req_map = {}
    if order_req_ids:
        r_res = await db.execute(
            text('SELECT id, product_name FROM public.merchant_network_requests WHERE id = ANY(:rids)'),
            {"rids": order_req_ids}
        )
        for r_row in r_res.fetchall():
            r_dict = dict(r_row._mapping)
            req_map[r_dict["id"]] = r_dict.get("product_name")

    partner_map = {}
    if order_partner_ids:
        p_res = await db.execute(
            text('SELECT id, "shopName" FROM public.merchants WHERE id = ANY(:pids)'),
            {"pids": order_partner_ids}
        )
        for p_row in p_res.fetchall():
            p_dict = dict(p_row._mapping)
            partner_map[p_dict["id"]] = p_dict.get("shopName") or "Unknown Merchant"

    hydrated_orders = []
    for o in my_orders:
        partner_id = o["seller_merchant_id"] if merchant["id"] == o["buyer_merchant_id"] else o["buyer_merchant_id"]
        hydrated_orders.append({
            "order": o,
            "partnerShopName": partner_map.get(partner_id, "Unknown Merchant"),
            "productName": req_map.get(o.get("request_id"), "Unknown Product")
        })

    # 2. Batch Hydrate Requests & Responses
    hydrated_requests = []
    for r in my_requests:
        responses = await merchant_network_repo.get_responses_for_request(db, r["id"])
        responder_ids = list({resp["responder_merchant_id"] for resp in responses if resp.get("responder_merchant_id")})
        resp_m_map = {}
        if responder_ids:
            rm_res = await db.execute(
                text('SELECT id, "shopName", kyc FROM public.merchants WHERE id = ANY(:rmids)'),
                {"rmids": responder_ids}
            )
            for rm_row in rm_res.fetchall():
                rm_dict = dict(rm_row._mapping)
                resp_m_map[rm_dict["id"]] = rm_dict

        hydrated_responses = []
        for resp in responses:
            resp_m = resp_m_map.get(resp.get("responder_merchant_id"))
            shop = resp_m.get("shopName", "Partner Merchant") if resp_m else "Partner Merchant"
            kyc = resp_m.get("kyc", "verified") if resp_m else "verified"
            hydrated_responses.append({
                "response": resp,
                "shopName": shop,
                "kyc": kyc
            })
        hydrated_requests.append({
            "request": r,
            "responses": hydrated_responses
        })
        
    return {
        "requests": hydrated_requests,
        "orders": hydrated_orders
    }

@router.get("/notifications")
async def list_notifications(
    merchant: dict = Depends(require_network_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Fetches B2B network notifications for the logged-in merchant.
    """
    notifs = await merchant_network_repo.get_notifications_for_merchant(db, merchant["id"])
    return {"notifications": notifs}

@router.patch("/notifications/{id}/read")
async def mark_read(
    id: str,
    merchant: dict = Depends(require_network_enabled),
    db: AsyncSession = Depends(get_db)
):
    """Marks a network notification as read.
    """
    success = await merchant_network_repo.mark_notification_as_read(db, id, merchant["id"])
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found.")
    return {"ok": True}


class MerchantNetworkRateIn(BaseModel):
    rating: int
    comment: Optional[str] = None

class MerchantNetworkDisputeIn(BaseModel):
    reason: str
    details: Optional[str] = None

class MerchantNetworkCancelIn(BaseModel):
    reason: Optional[str] = None

@router.patch("/orders/{id}/cancel")
async def cancel_order_endpoint(
    id: str,
    payload: MerchantNetworkCancelIn = MerchantNetworkCancelIn(),
    merchant: dict = Depends(require_network_enabled),
    db: AsyncSession = Depends(get_db)
):
    ok = await merchant_network_repo.cancel_order_with_reason(db, id, merchant["id"], payload.reason)
    if not ok:
        raise HTTPException(status_code=404, detail="Order not found or permission denied.")
    return {"ok": True}

@router.post("/orders/{id}/rate")
async def rate_order_endpoint(
    id: str,
    payload: MerchantNetworkRateIn,
    merchant: dict = Depends(require_network_enabled),
    db: AsyncSession = Depends(get_db)
):
    order = await merchant_network_repo.get_order_by_id(db, id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    if merchant["id"] not in (order["buyer_merchant_id"], order["seller_merchant_id"]):
        raise HTTPException(status_code=403, detail="Permission denied.")
    
    reviewee_id = order["seller_merchant_id"] if merchant["id"] == order["buyer_merchant_id"] else order["buyer_merchant_id"]
    rev = await merchant_network_repo.create_review(db, id, merchant["id"], reviewee_id, payload.rating, payload.comment)
    return {"ok": True, "review": rev}

@router.post("/orders/{id}/dispute")
async def dispute_order_endpoint(
    id: str,
    payload: MerchantNetworkDisputeIn,
    merchant: dict = Depends(require_network_enabled),
    db: AsyncSession = Depends(get_db)
):
    order = await merchant_network_repo.get_order_by_id(db, id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    if merchant["id"] not in (order["buyer_merchant_id"], order["seller_merchant_id"]):
        raise HTTPException(status_code=403, detail="Permission denied.")

    target_id = order["seller_merchant_id"] if merchant["id"] == order["buyer_merchant_id"] else order["buyer_merchant_id"]
    disp = await merchant_network_repo.create_dispute(db, id, merchant["id"], target_id, payload.reason, payload.details)
    return {"ok": True, "dispute": disp}
