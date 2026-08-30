"""
chat_repo.py — Data access layer for public.chat_threads & public.chat_messages tables.

Follows exact AsyncSession + text() pattern of merchant_repo.py.
"""

from typing import Any, Optional
import time
import secrets

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


_schema_ensured = False

def _row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row._mapping)


async def ensure_schema(db: AsyncSession) -> None:
    global _schema_ensured
    if _schema_ensured:
        return
    statements = [
        """
        create table if not exists public.chat_threads (
          id text primary key,
          channel_type text not null default 'b2c_inquiry',
          merchant_id text not null references public.merchants(id) on delete cascade,
          customer_id text references public.customers(id) on delete set null,
          status text not null default 'active',
          last_message_at bigint not null,
          last_message_snippet text default '',
          merchant_unread_count integer not null default 0,
          customer_unread_count integer not null default 0,
          merchant_pinned boolean not null default false,
          customer_pinned boolean not null default false,
          active_inquiry_item_id text references public.merchant_inventory(id) on delete set null,
          agreed_unit_price numeric default null,
          draft_billing_request_id text references public.billing_requests(id) on delete set null,
          created_at bigint not null,
          updated_at bigint not null
        );
        """,
        """
        create table if not exists public.chat_messages (
          id text primary key,
          thread_id text not null references public.chat_threads(id) on delete cascade,
          sender_type text not null,
          sender_id text not null,
          msg_type text not null default 'text',
          content text not null,
          media_url text default '',
          metadata jsonb default '{}'::jsonb,
          status text not null default 'sent',
          read_at bigint default null,
          created_at bigint not null
        );
        """,
        # Schema evolution migrations (ensures missing columns are added to existing tables)
        "alter table public.chat_messages add column if not exists metadata jsonb default '{}'::jsonb;",
        "alter table public.chat_messages add column if not exists media_url text default '';",
        "alter table public.chat_messages add column if not exists msg_type text default 'text';",
        "alter table public.chat_messages add column if not exists status text default 'sent';",
        "alter table public.chat_messages add column if not exists read_at bigint default null;",
        "alter table public.chat_threads add column if not exists active_inquiry_item_id text;",
        "alter table public.chat_threads add column if not exists agreed_unit_price numeric default null;",
        "alter table public.chat_threads add column if not exists draft_billing_request_id text;",
        'create index if not exists idx_threads_merchant on public.chat_threads("merchant_id", "last_message_at" desc);',
        'create index if not exists idx_threads_customer on public.chat_threads("customer_id", "last_message_at" desc);',
        'create index if not exists idx_messages_thread on public.chat_messages("thread_id", "created_at" desc);',
    ]
    for stmt in statements:
        try:
            await db.execute(text(stmt))
        except Exception:
            pass
    await db.commit()
    _schema_ensured = True


async def get_or_create_b2c_thread(
    db: AsyncSession, merchant_id: str, customer_id: str
) -> dict[str, Any]:
    await ensure_schema(db)
    res = await db.execute(
        text("""
            select * from public.chat_threads
            where merchant_id = :mid and customer_id = :cid and channel_type = 'b2c_inquiry'
            limit 1
        """),
        {"mid": merchant_id, "cid": customer_id},
    )
    row = res.first()
    if row:
        return _row_to_dict(row)

    now = int(time.time() * 1000)
    thread_id = f"th_{secrets.token_urlsafe(12)}"
    await db.execute(
        text("""
            insert into public.chat_threads (
                id, channel_type, merchant_id, customer_id, status,
                last_message_at, last_message_snippet, merchant_unread_count, customer_unread_count,
                merchant_pinned, customer_pinned, created_at, updated_at
            ) values (
                :id, 'b2c_inquiry', :mid, :cid, 'active',
                :now, 'Chat started', 0, 0,
                false, false, :now, :now
            )
        """),
        {"id": thread_id, "mid": merchant_id, "cid": customer_id, "now": now},
    )
    await db.commit()

    new_res = await db.execute(
        text("select * from public.chat_threads where id = :id"), {"id": thread_id}
    )
    return _row_to_dict(new_res.first())


async def get_thread_by_id(db: AsyncSession, thread_id: str) -> Optional[dict[str, Any]]:
    await ensure_schema(db)
    res = await db.execute(
        text("select * from public.chat_threads where id = :id"),
        {"id": thread_id},
    )
    row = res.first()
    return _row_to_dict(row) if row else None


async def list_merchant_threads(db: AsyncSession, merchant_id: str) -> list[dict[str, Any]]:
    await ensure_schema(db)
    res = await db.execute(
        text("""
            select t.*, 
                   coalesce(c.name, m2."shopName", 'Chat Partner') as customer_name,
                   coalesce(c."customerCode", m2.phone, t.customer_id, 'AKC-Vault') as customer_code,
                   coalesce(c.phone, m2.phone, '') as customer_phone
            from public.chat_threads t
            left join public.customers c on c.id = t.customer_id
            left join public.merchants m2 on m2.id = t.customer_id
            where t.merchant_id = :mid
            order by t.merchant_pinned desc, t.last_message_at desc
        """),
        {"mid": merchant_id},
    )
    return [_row_to_dict(r) for r in res.fetchall()]


async def list_customer_threads(db: AsyncSession, customer_id: str) -> list[dict[str, Any]]:
    await ensure_schema(db)
    res = await db.execute(
        text("""
            select t.*, m."shopName" as merchant_name, m."logoDataUrl" as merchant_logo, m."logoUrl" as merchant_logo_url
            from public.chat_threads t
            left join public.merchants m on m.id = t.merchant_id
            where t.customer_id = :cid
            order by t.customer_pinned desc, t.last_message_at desc
        """),
        {"cid": customer_id},
    )
    return [_row_to_dict(r) for r in res.fetchall()]


async def get_thread_messages(
    db: AsyncSession, thread_id: str, limit: int = 50
) -> list[dict[str, Any]]:
    await ensure_schema(db)
    res = await db.execute(
        text("""
            select * from public.chat_messages
            where thread_id = :tid
            order by created_at asc
            limit :limit
        """),
        {"tid": thread_id, "limit": limit},
    )
    return [_row_to_dict(r) for r in res.fetchall()]


async def send_message(
    db: AsyncSession,
    thread_id: str,
    sender_type: str,
    sender_id: str,
    content: str,
    msg_type: str = "text",
    media_url: str = "",
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    await ensure_schema(db)
    now = int(time.time() * 1000)
    msg_id = f"msg_{secrets.token_urlsafe(12)}"
    
    import json
    meta_json = json.dumps(metadata) if metadata else "{}"

    await db.execute(
        text("""
            insert into public.chat_messages (
                id, thread_id, sender_type, sender_id, msg_type, content, media_url, metadata, status, created_at
            ) values (
                :id, :tid, :stype, :sid, :mtype, :content, :murl, cast(:meta as jsonb), 'sent', :now
            )
        """),
        {
            "id": msg_id,
            "tid": thread_id,
            "stype": sender_type,
            "sid": sender_id,
            "mtype": msg_type,
            "content": content,
            "murl": media_url,
            "meta": meta_json,
            "now": now,
        },
    )

    snippet = content[:50] if content else f"[{msg_type}]"
    if sender_type == "merchant":
        await db.execute(
            text("""
                update public.chat_threads
                set last_message_at = :now,
                    last_message_snippet = :snippet,
                    customer_unread_count = customer_unread_count + 1,
                    updated_at = :now
                where id = :tid
            """),
            {"tid": thread_id, "snippet": snippet, "now": now},
        )
    else:
        await db.execute(
            text("""
                update public.chat_threads
                set last_message_at = :now,
                    last_message_snippet = :snippet,
                    merchant_unread_count = merchant_unread_count + 1,
                    updated_at = :now
                where id = :tid
            """),
            {"tid": thread_id, "snippet": snippet, "now": now},
        )

    await db.commit()

    res = await db.execute(text("select * from public.chat_messages where id = :id"), {"id": msg_id})
    return _row_to_dict(res.first())


async def mark_thread_read(db: AsyncSession, thread_id: str, reader_type: str) -> None:
    now = int(time.time() * 1000)
    if reader_type == "merchant":
        await db.execute(
            text("""
                update public.chat_threads
                set merchant_unread_count = 0, updated_at = :now
                where id = :tid
            """),
            {"tid": thread_id, "now": now},
        )
    else:
        await db.execute(
            text("""
                update public.chat_threads
                set customer_unread_count = 0, updated_at = :now
                where id = :tid
            """),
            {"tid": thread_id, "now": now},
        )
    await db.commit()
