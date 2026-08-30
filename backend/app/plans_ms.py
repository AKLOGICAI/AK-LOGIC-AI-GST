"""Epoch-millisecond plan/credit math for merchant plan purchase & validity
extension — the authoritative, server-side version of what
src/lib/services.ts's subscriptionService used to do purely client-side
(and only against the local browser cache, never Supabase — see the
merchant.py router docstring for why that was a real bug, not just an RLS
gap).

Deliberately mirrors src/lib/plans.ts's constants/logic 1:1 (DAY_MS,
CUSTOM_BRANDING_MIN_DAYS, CARRY_FORWARD_WINDOW_DAYS, FREE_PLAN, PLANS,
VALIDITY_ADDON) using epoch-ms integers (bigint columns), NOT the
datetime-based helpers in plans.py (those model a different, unused
convention). If the catalog ever changes, update both this file and
plans.ts together.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

DAY_MS = 86_400_000
CUSTOM_BRANDING_MIN_DAYS = 30
CARRY_FORWARD_WINDOW_DAYS = 3


@dataclass(frozen=True)
class PlanDef:
    id: str
    name: str
    price: int
    validity_days: int
    credits: int


FREE_PLAN = PlanDef("free", "Free Plan", 0, 0, 0)

PLANS = [
    PlanDef("trial_20", "₹20 Trial", 20, 1, 10),
    PlanDef("starter_50", "₹50 Starter", 50, 3, 30),
    PlanDef("monthly_199", "₹199 Monthly", 199, 30, 300),
    PlanDef("monthly_299", "₹299 Monthly", 299, 30, 600),
    PlanDef("monthly_399", "₹399 Monthly", 399, 30, 1000),
    PlanDef("monthly_900", "₹900 Monthly", 900, 30, 2500),
]

VALIDITY_ADDON_DAYS = 30

_BY_ID = {p.id: p for p in [FREE_PLAN, *PLANS]}


def plan_by_id(plan_id: str) -> PlanDef | None:
    return _BY_ID.get(plan_id)


def plan_unlocks_branding(validity_days: int) -> bool:
    return validity_days >= CUSTOM_BRANDING_MIN_DAYS


def now_ms() -> int:
    return int(time.time() * 1000)


def is_active(plan_expires_at: int) -> bool:
    return plan_expires_at > 0 and plan_expires_at > now_ms()


def available_credits(plan_expires_at: int, pdf_credits: int) -> int:
    if not is_active(plan_expires_at):
        return 0
    return max(0, pdf_credits)


# --- free invoice per 24h ---
FREE_INVOICE_COOLDOWN_MS = DAY_MS  # 24 hours


def free_invoice_available(last_free_invoice_at: int | None) -> bool:
    """Whether the merchant's free daily invoice is available right now."""
    if not last_free_invoice_at:
        return True
    return (now_ms() - last_free_invoice_at) >= FREE_INVOICE_COOLDOWN_MS
