"""
routers/chat.py — REST & Realtime WebSocket API Endpoints for Customer <-> Merchant Chat.
"""

from typing import Any, Optional
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from ..database import get_db
from .. import security, chat_repo

logger = logging.getLogger("chat")
router = APIRouter(tags=["chat"])

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}
    async def connect(self, websocket: WebSocket, thread_id: str):
        await websocket.accept()
        self.active_connections.setdefault(thread_id, []).append(websocket)
    def disconnect(self, websocket: WebSocket, thread_id: str):
        connections = self.active_connections.get(thread_id)
        if not connections:
            return
        if websocket in connections:
            connections.remove(websocket)
        if not connections:
            del self.active_connections[thread_id]
    async def broadcast(self, thread_id: str, message: dict):
        connections = list(self.active_connections.get(thread_id, []))
        stale: list[WebSocket] = []
        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect(connection, thread_id)

manager = ConnectionManager()

class StartThreadIn(BaseModel):
    merchantId: str
    customerId: str

class SendMessageIn(BaseModel):
    threadId: str
    senderType: Optional[str] = None
    senderId: Optional[str] = None
    content: str = Field(..., min_length=1, max_length=10000)
    msgType: Optional[str] = "text"
    mediaUrl: Optional[str] = ""
    metadata: Optional[dict[str, Any]] = None

class StartThreadByCodeIn(BaseModel):
    code: str

@router.post("/chat/threads/start")
async def start_b2c_thread(body: StartThreadIn, actor: tuple[str, str] = Depends(security.require_chat_actor), db: AsyncSession = Depends(get_db)):
    actor_realm, actor_id = actor
    merchant_id = actor_id if actor_realm == "merchant" else body.merchantId
    customer_id = actor_id if actor_realm == "customer" else body.customerId
    thread = await chat_repo.get_or_create_b2c_thread(db, merchant_id, customer_id)
    return {"ok": True, "thread": thread}

@router.post("/chat/threads/start-by-code")
async def start_thread_by_code(body: StartThreadByCodeIn, merchant_id: str = Depends(security.require_merchant), db: AsyncSession = Depends(get_db)):
    query_str = body.code.strip()
    if not query_str:
        raise HTTPException(400, "Please enter a Customer ID, Phone, or Merchant ID.")

    from .. import customer_repo, merchant_repo
    cust = await customer_repo.search_customer_resilient(db, query_str)
    if cust:
        thread = await chat_repo.get_or_create_b2c_thread(db, merchant_id, cust["id"])
        thread["customer_name"] = cust.get("name") or "Customer"
        thread["customer_code"] = cust.get("customerCode") or query_str
        thread["customer_phone"] = cust.get("phone") or ""
        return {"ok": True, "thread": thread, "type": "customer"}

    # Use repository methods that actually exist. The previous
    # search_active_merchants() call did not exist and caused HTTP 500.
    merchant = await merchant_repo.get_by_id_light(db, query_str)
    if not merchant:
        merchant = await merchant_repo.get_by_phone_light(db, query_str)
    if not merchant:
        # Public Merchant ID/code lookup (e.g. AKM-000001), kept in SQL so
        # this works without introducing a second repository API.
        from sqlalchemy import text
        res = await db.execute(
            text(
                'select "id" from public.merchants '
                'where upper("merchantCode") = upper(:code) '
                'and coalesce("status", \'active\') <> \'deleted\' limit 1'
            ),
            {"code": query_str},
        )
        row = res.first()
        if row:
            merchant = await merchant_repo.get_by_id_light(db, row[0])

    if merchant:
        if merchant["id"] == merchant_id:
            raise HTTPException(400, "You cannot start a chat thread with yourself.")
        thread = await chat_repo.get_or_create_b2c_thread(db, merchant_id, merchant["id"])
        thread["customer_name"] = merchant.get("shopName") or "Partner Merchant"
        thread["customer_code"] = merchant.get("merchantCode") or merchant.get("phone") or merchant.get("id")
        thread["customer_phone"] = merchant.get("phone") or ""
        return {"ok": True, "thread": thread, "type": "merchant"}

    raise HTTPException(404, f"No customer or merchant found matching '{query_str}'. Please check the ID or phone number.")

@router.get("/chat/threads/merchant")
async def get_merchant_threads(merchant_id: str = Depends(security.require_merchant), db: AsyncSession = Depends(get_db)):
    threads = await chat_repo.list_merchant_threads(db, merchant_id)
    return {"ok": True, "threads": threads}

@router.get("/chat/threads/customer/{customer_id}")
async def get_customer_threads(customer_id: str, authenticated_customer_id: str = Depends(security.require_customer), db: AsyncSession = Depends(get_db)):
    if customer_id != authenticated_customer_id:
        raise HTTPException(403, "Access denied: Cannot access another customer's chat threads.")
    threads = await chat_repo.list_customer_threads(db, customer_id)
    return {"ok": True, "threads": threads}

@router.get("/chat/threads/{thread_id}/messages")
async def get_thread_messages(thread_id: str, actor: tuple[str, str] = Depends(security.require_chat_actor), db: AsyncSession = Depends(get_db)):
    actor_realm, actor_id = actor
    thread = await chat_repo.get_thread_by_id(db, thread_id)
    if not thread:
        raise HTTPException(404, "Chat thread not found.")
    if actor_realm == "merchant" and thread["merchant_id"] != actor_id:
        raise HTTPException(403, "Access denied: Not authorized to view this chat thread.")
    if actor_realm == "customer" and thread["customer_id"] != actor_id:
        raise HTTPException(403, "Access denied: Not authorized to view this chat thread.")
    messages = await chat_repo.get_thread_messages(db, thread_id)
    return {"ok": True, "messages": messages}

@router.post("/chat/send")
async def send_chat_message(body: SendMessageIn, actor: tuple[str, str] = Depends(security.require_chat_actor), db: AsyncSession = Depends(get_db)):
    actor_realm, actor_id = actor
    content = body.content.strip()
    if not content:
        raise HTTPException(422, "Message cannot be empty.")
    thread = await chat_repo.get_thread_by_id(db, body.threadId)
    if not thread:
        raise HTTPException(404, "Chat thread not found.")
    if thread.get("status") not in {"active", "open"}:
        raise HTTPException(409, "This chat is no longer active.")
    if actor_realm == "merchant" and thread["merchant_id"] != actor_id:
        raise HTTPException(403, "Access denied: Not authorized to send messages in this thread.")
    if actor_realm == "customer" and thread["customer_id"] != actor_id:
        raise HTTPException(403, "Access denied: Not authorized to send messages in this thread.")
    try:
        msg = await chat_repo.send_message(db=db, thread_id=body.threadId, sender_type=actor_realm, sender_id=actor_id, content=content, msg_type=body.msgType or "text", media_url=body.mediaUrl or "", metadata=body.metadata)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("Error sending message in thread %s: %s", body.threadId, exc)
        raise HTTPException(500, f"Message could not be saved. {exc}") from exc
    await manager.broadcast(body.threadId, {"type": "new_message", "message": msg})

    # Trigger @akai Assistant if mentioned in message.
    #
    # BUG FIX (2026-08-24): this used to pass the request-scoped `db`
    # session (the one injected via Depends(get_db) above) straight into
    # asyncio.create_task(). That session is closed by FastAPI's
    # dependency teardown (see database.py: `async with SessionLocal() as
    # session`) the moment this endpoint function returns — and
    # asyncio.create_task() is fire-and-forget, so the background
    # coroutine only actually starts running AFTER the response has
    # already been sent. By the time process_akai_mention_if_present()
    # tried to use `db`, the session was already closed, every DB call
    # inside it raised, and that exception was silently swallowed by its
    # own try/except (logged as a warning only). Net effect: the message
    # itself always saved and delivered fine (so it looked "connected" in
    # the UI), but @akai never replied to a single @akai mention, with no
    # visible error anywhere in the app.
    #
    # Fix: give the background task its own independent session created
    # fresh from SessionLocal, completely decoupled from this request's
    # session lifecycle, so it stays valid for the task's entire runtime.
    try:
        from .. import akai_service
        from ..database import SessionLocal
        if akai_service.contains_akai_mention(content):
            import asyncio

            async def _run_akai_in_background() -> None:
                try:
                    async with SessionLocal() as bg_db:
                        await akai_service.process_akai_mention_if_present(
                            db=bg_db,
                            thread_id=body.threadId,
                            message_content=content,
                            sender_type=actor_realm,
                            sender_id=actor_id,
                            manager=manager,
                        )
                except Exception as bg_exc:
                    logger.warning(f"@akai background processing failed for thread {body.threadId}: {bg_exc}")

            asyncio.create_task(_run_akai_in_background())
    except Exception as exc:
        logger.warning(f"Error checking @akai mention: {exc}")

    return {"ok": True, "message": msg}


class AkaiQueryIn(BaseModel):
    query: str
    threadId: Optional[str] = None


@router.get("/chat/ai/health")
async def akai_health():
    """Health check endpoint for @akai AI assistant service."""
    return {"ok": True, "status": "active", "service": "@akai Smart Business Assistant"}


@router.post("/chat/ai/query")
async def akai_query(body: AkaiQueryIn, actor: tuple[str, str] = Depends(security.require_chat_actor), db: AsyncSession = Depends(get_db)):
    """Direct query endpoint for @akai conversational assistant."""
    actor_realm, actor_id = actor
    from .. import akai_service
    context = {"merchant_name": "AK-LOGIC AI", "partner_name": "Valued Partner", "inventory_sample": [], "recent_invoices": []}
    if body.threadId:
        thread = await chat_repo.get_thread_by_id(db, body.threadId)
        if thread:
            merchant_id = thread["merchant_id"]
            partner_id = thread["customer_id"]
            context = await akai_service.fetch_grounded_context(db, body.threadId, merchant_id, partner_id)
    reply = akai_service.generate_akai_response(body.query, context, [])
    return {"ok": True, "reply": reply, "bot_name": "@akai Smart Business AI"}

@router.post("/chat/threads/{thread_id}/read")
async def mark_read(thread_id: str, actor: tuple[str, str] = Depends(security.require_chat_actor), db: AsyncSession = Depends(get_db)):
    actor_realm, actor_id = actor
    thread = await chat_repo.get_thread_by_id(db, thread_id)
    if not thread:
        raise HTTPException(404, "Chat thread not found.")
    if actor_realm == "merchant" and thread["merchant_id"] != actor_id:
        raise HTTPException(403, "Access denied: Not authorized.")
    if actor_realm == "customer" and thread["customer_id"] != actor_id:
        raise HTTPException(403, "Access denied: Not authorized.")
    await chat_repo.mark_thread_read(db, thread_id, actor_realm)
    await manager.broadcast(thread_id, {"type": "messages_read", "readerType": actor_realm})
    return {"ok": True}

@router.websocket("/chat/ws/{thread_id}")
async def websocket_endpoint(websocket: WebSocket, thread_id: str, token: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    if not token:
        await websocket.close(code=1008, reason="Authentication token required")
        return
    try:
        data = security.decode_token_str(token)
    except Exception:
        await websocket.close(code=1008, reason="Invalid authentication token")
        return
    actor_realm = data.get("realm")
    actor_id = data.get("sub")
    if not actor_realm or not actor_id:
        await websocket.close(code=1008, reason="Invalid token claims")
        return
    thread = await chat_repo.get_thread_by_id(db, thread_id)
    if not thread:
        await websocket.close(code=1008, reason="Thread not found")
        return
    if actor_realm == "merchant" and thread["merchant_id"] != actor_id:
        await websocket.close(code=1008, reason="Not authorized for this thread")
        return
    if actor_realm == "customer" and thread["customer_id"] != actor_id:
        await websocket.close(code=1008, reason="Not authorized for this thread")
        return
    await manager.connect(websocket, thread_id)
    try:
        while True:
            recv_data = await websocket.receive_text()
            try:
                payload = json.loads(recv_data)
            except (json.JSONDecodeError, ValueError):
                continue
            await manager.broadcast(thread_id, payload)
    except WebSocketDisconnect:
        manager.disconnect(websocket, thread_id)
    except Exception:
        manager.disconnect(websocket, thread_id)
