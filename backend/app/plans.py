"""Plan catalog + branding policy — mirrors src/lib/plans.ts.

CORE PRINCIPLE: branding is decided by VALIDITY DURATION, not price.
  validity < 30 days  -> AK-LOGIC-AI branding only (no custom logo)
  validity >= 30 days -> custom logo + brand name + custom invoice branding
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

CUSTOM_BRANDING_MIN_DAYS = 30
CARRY_FORWARD_WINDOW_DAYS = 3
VALIDITY_ADDON_PRICE = 50
VALIDITY_ADDON_DAYS = 30


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

_BY_ID = {p.id: p for p in [FREE_PLAN, *PLANS]}


def plan_by_id(plan_id: str) -> PlanDef | None:
    return _BY_ID.get(plan_id)


def plan_unlocks_branding(validity_days: int) -> bool:
    """Branding unlocked iff plan validity is 30 days or more."""
    return validity_days >= CUSTOM_BRANDING_MIN_DAYS


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def is_active(expires_at: datetime | None) -> bool:
    return bool(expires_at) and expires_at > now_utc()


def days_remaining(expires_at: datetime | None) -> int:
    if not expires_at:
        return 0
    delta = expires_at - now_utc()
    return max(0, (delta.days + (1 if delta.seconds else 0)))


def branding_enabled(merchant) -> bool:
    """Custom branding active iff plan is active AND validity >= 30 days."""
    return is_active(merchant.plan_expires_at) and plan_unlocks_branding(merchant.plan_validity_days)


def logo_upload_allowed(merchant) -> bool:
    """Logo upload only for merchants on an active monthly (>=30 day) plan."""
    return branding_enabled(merchant)
