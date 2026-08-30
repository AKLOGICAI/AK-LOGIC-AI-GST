"""Server-to-server admin reporting endpoints.

Read-only bridge for AK-LOGIC-AI-PLATFORM (the internal company OS) to pull
REAL figures from this, the actual GST product's database — instead of the
platform showing a fabricated, hardcoded revenue number as it did before
(see AK-LOGIC-AI-PLATFORM's src/hooks/useSystemStore.tsx, revenue object,
prior to this fix).

Scope, deliberately narrow for this pass: read-only reporting only. No
merchant status changes, credit grants, or any other write live here —
those are a separate, more sensitive piece of work and are NOT implemented
by this router.

Auth: a single shared secret in the `X-Service-Auth` header, compared with
constant-time comparison. This intentionally does NOT reuse the human
admin JWT flow (security.require_admin) — PLATFORM is a machine caller,
not a browser session. Fails closed if GST_S2S_SECRET is unset: every
route in this file returns 503 rather than silently running open or
falling back to any mock data, matching this codebase's existing
fail-closed pattern for razorpay_webhook_secret / admin_password_hash.
"""
from __future__ import annotations

import hmac
import logging

from fastapi import APIRouter, Header, HTTPException
from sqlalchemy import text

from ..config import settings
from ..database import SessionLocal

logger = logging.getLogger("s2s_admin")

router = APIRouter(tags=["s2s-admin"])


def _require_s2s(x_service_auth: str | None = Header(default=None)) -> None:
    if not settings.gst_s2s_secret:
        raise HTTPException(503, "S2S reporting is not configured (GST_S2S_SECRET unset).")
    if not x_service_auth or not hmac.compare_digest(x_service_auth, settings.gst_s2s_secret):
        raise HTTPException(401, "Invalid or missing service credentials.")


@router.get("/overview")
async def s2s_overview(x_service_auth: str | None = Header(default=None)):
    _require_s2s(x_service_auth)

    async with SessionLocal() as db:
        merchants_res = await db.execute(
            text(
                """
                select
                  count(*) as total,
                  count(*) filter (where status = 'active') as active,
                  count(*) filter (where status = 'pending') as pending,
                  count(*) filter (where status = 'suspended') as suspended
                from public.merchants
                """
            )
        )
        merchants_row = merchants_res.first()

        # Real revenue — see backend/app/payment_repo.py: an order only
        # ever transitions 'created' -> 'paid' after a verified Razorpay
        # signature check or a verified webhook event. 'created' orders
        # are checkout attempts that were opened but never completed and
        # do not count as revenue.
        revenue_res = await db.execute(
            text(
                """
                select
                  coalesce(sum(amount), 0) as all_time,
                  coalesce(sum(amount) filter (
                    where "paidAt" >= (extract(epoch from date_trunc('day', now())) * 1000)::bigint
                  ), 0) as today,
                  coalesce(sum(amount) filter (
                    where "paidAt" >= (extract(epoch from date_trunc('month', now())) * 1000)::bigint
                  ), 0) as this_month,
                  count(*) as paid_order_count
                from public.payment_orders
                where status = 'paid'
                """
            )
        )
        revenue_row = revenue_res.first()

        pending_orders_res = await db.execute(
            text(
                """
                select count(*) as pending_count, coalesce(sum(amount), 0) as pending_amount
                from public.payment_orders
                where status != 'paid'
                """
            )
        )
        pending_row = pending_orders_res.first()

        tickets_res = await db.execute(
            text("select count(*) as open_count from public.support_tickets where status != 'resolved'")
        )
        tickets_row = tickets_res.first()

    return {
        "merchants": {
            "total": merchants_row.total,
            "active": merchants_row.active,
            "pending": merchants_row.pending,
            "suspended": merchants_row.suspended,
        },
        "revenue": {
            "today": int(revenue_row.today),
            "month": int(revenue_row.this_month),
            "allTime": int(revenue_row.all_time),
            "paidOrderCount": int(revenue_row.paid_order_count),
            "pendingOrderCount": int(pending_row.pending_count),
            "pendingAmount": int(pending_row.pending_amount),
            "source": "payment_orders (status='paid')",
        },
        "openTickets": tickets_row.open_count,
    }
