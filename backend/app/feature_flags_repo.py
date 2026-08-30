"""Direct-Postgres repository for public.network_feature_flags.
Safe and clean.

Per-merchant override support (added 2026-08-23): a row with
merchant_id = NULL is the GLOBAL DEFAULT for a flag_key. A row with a
specific merchant_id OVERRIDES that default for that merchant only.
is_enabled() checks the merchant-specific row first (if a merchant_id is
passed in) and falls back to the global row when no override exists.
This is what makes "enable this for one test merchant only, verify, then
expand" (the project's own Ground Rules in PROMPT.md) actually possible —
the previous version of this table only supported a single global switch.

Default policy: established, long-running features
(`merchant_website_enabled`, `merchant_network_enabled`) stay enabled by
default since they are already live, depended-on behavior — not new gated
modules. Every newer module added under the Ecosystem Expansion plan
(Deep Accounting, Primary Merchant, @akai, Smart Website, ONDC, Parcel
Delivery) defaults to FALSE / fail-closed at the global level, per the
Ground Rules ("every new module ships default OFF"). Turning a module on
for a specific merchant is done via set_enabled(..., merchant_id=...),
never by flipping the global default.

`akai_audit_enabled` (added 2026-08-25) is a SEPARATE flag from
`akai_assistant_enabled` — the former gates the merchant-facing
"AKAI Business Controller / Live Production Audit" self-audit tool
(AkaiTriggerButton / AkaiAuditOverlay on the dashboard), the latter gates
the @akai chat copilot. They share the "@akai" branding but are otherwise
unrelated features and must be toggled independently.
"""
from typing import Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# In-process cache: "flag_key:merchant_id_or_global" -> (enabled_bool, cache_expiry_timestamp)
_FLAGS_CACHE = {}
CACHE_TTL = 30  # 30 seconds
_schema_ensured = False


async def ensure_schema(db: AsyncSession) -> None:
    """Creates network_feature_flags table if missing, adds per-merchant override
    support, and seeds default state. Safe to run repeatedly (every statement is
    idempotent)."""
    global _schema_ensured
    if _schema_ensured:
        return
    import time
    now_ms = int(time.time() * 1000)
    statements = [
        """
        CREATE TABLE IF NOT EXISTS public.network_feature_flags (
            id text PRIMARY KEY,
            flag_key text NOT NULL,
            enabled boolean DEFAULT true,
            updated_by_admin_id text,
            updated_at bigint NOT NULL
        );
        """,
        "ALTER TABLE public.network_feature_flags ADD COLUMN IF NOT EXISTS merchant_id text REFERENCES public.merchants(id) ON DELETE CASCADE;",
        "ALTER TABLE public.network_feature_flags DROP CONSTRAINT IF EXISTS network_feature_flags_flag_key_key;",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_flags_global_unique ON public.network_feature_flags(flag_key) WHERE merchant_id IS NULL;",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_flags_merchant_unique ON public.network_feature_flags(flag_key, merchant_id) WHERE merchant_id IS NOT NULL;",
        "CREATE INDEX IF NOT EXISTS idx_flags_merchant ON public.network_feature_flags(merchant_id);",
    ]
    for stmt in statements:
        try:
            await db.execute(text(stmt))
            await db.commit()
        except Exception:
            pass

    try:
        await db.execute(text('''
            INSERT INTO public.network_feature_flags (id, flag_key, enabled, updated_at, merchant_id)
            VALUES ('flag_web_default', 'merchant_website_enabled', true, :now_ms, NULL),
                   ('flag_net_default', 'merchant_network_enabled', true, :now_ms, NULL),
                   ('flag_acc_default', 'deep_accounting_enabled', false, :now_ms, NULL),
                   ('flag_prim_default', 'primary_merchant_enabled', false, :now_ms, NULL),
                   ('flag_akai_default', 'akai_assistant_enabled', false, :now_ms, NULL),
                   ('flag_akai_audit_default', 'akai_audit_enabled', false, :now_ms, NULL),
                   ('flag_smart_web', 'smart_website_enabled', false, :now_ms, NULL),
                   ('flag_ondc_default', 'ondc_enabled', false, :now_ms, NULL),
                   ('flag_deliv_default', 'parcel_delivery_enabled', false, :now_ms, NULL)
            ON CONFLICT (flag_key) WHERE merchant_id IS NULL DO NOTHING;
        '''), {"now_ms": now_ms})
        await db.commit()
    except Exception:
        pass
    _schema_ensured = True


async def is_enabled(db: AsyncSession, flag_key: str, merchant_id: Optional[str] = None) -> bool:
    """Checks if a feature flag is enabled for the given merchant (or globally,
    if merchant_id is None). A merchant-specific override row always wins over
    the global default. Fails CLOSED (False) if unconfigured, missing, or on
    any query error — a feature must be explicitly turned on."""
    import time
    now = time.time()
    cache_key = f"{flag_key}:{merchant_id or 'global'}"

    if cache_key in _FLAGS_CACHE:
        val, expiry = _FLAGS_CACHE[cache_key]
        if now < expiry:
            return val

    val = False
    try:
        if merchant_id:
            res = await db.execute(
                text('select enabled from public.network_feature_flags where flag_key = :flag_key and merchant_id = :mid'),
                {"flag_key": flag_key, "mid": merchant_id},
            )
            row = res.first()
            if row is not None:
                val = row[0]
            else:
                # No merchant-specific override — fall back to the global row.
                res = await db.execute(
                    text('select enabled from public.network_feature_flags where flag_key = :flag_key and merchant_id is null'),
                    {"flag_key": flag_key},
                )
                row = res.first()
                val = row[0] if row is not None else False
        else:
            res = await db.execute(
                text('select enabled from public.network_feature_flags where flag_key = :flag_key and merchant_id is null'),
                {"flag_key": flag_key},
            )
            row = res.first()
            val = row[0] if row is not None else False
    except Exception:
        val = False

    _FLAGS_CACHE[cache_key] = (val, now + CACHE_TTL)
    return val


async def set_enabled(
    db: AsyncSession,
    flag_key: str,
    enabled: bool,
    admin_id: Optional[str] = None,
    merchant_id: Optional[str] = None,
) -> bool:
    """Updates a flag's state. With merchant_id=None, updates the GLOBAL default
    (only affects merchants that don't have their own override row). With a
    merchant_id, upserts a per-merchant override row that takes precedence over
    the global default for that merchant only — this is the "enable for one
    test merchant" mechanism the Ground Rules call for."""
    import time
    import secrets
    now_ms = int(time.time() * 1000)

    if merchant_id:
        res = await db.execute(
            text('''
                INSERT INTO public.network_feature_flags
                    (id, flag_key, enabled, updated_by_admin_id, updated_at, merchant_id)
                VALUES (:id, :flag_key, :enabled, :admin_id, :updated_at, :mid)
                ON CONFLICT (flag_key, merchant_id) WHERE merchant_id IS NOT NULL
                DO UPDATE SET enabled = :enabled, updated_by_admin_id = :admin_id, updated_at = :updated_at
                RETURNING flag_key, enabled
            '''),
            {
                "id": f"flag_ov_{secrets.token_hex(6)}",
                "flag_key": flag_key,
                "enabled": enabled,
                "admin_id": admin_id,
                "updated_at": now_ms,
                "mid": merchant_id,
            },
        )
    else:
        res = await db.execute(
            text('''
                UPDATE public.network_feature_flags
                SET enabled = :enabled, updated_by_admin_id = :admin_id, updated_at = :updated_at
                WHERE flag_key = :flag_key AND merchant_id IS NULL
                RETURNING flag_key, enabled
            '''),
            {
                "flag_key": flag_key,
                "enabled": enabled,
                "admin_id": admin_id,
                "updated_at": now_ms,
            },
        )

    row = res.first()
    await db.commit()

    # Invalidate cache for both the specific merchant key and (to be safe on
    # global updates that affect any merchant without an override) the global key.
    for key in list(_FLAGS_CACHE.keys()):
        if key.startswith(f"{flag_key}:"):
            del _FLAGS_CACHE[key]

    return row is not None


async def remove_merchant_override(db: AsyncSession, flag_key: str, merchant_id: str) -> bool:
    """Removes a merchant's override row, reverting them back to the global default."""
    res = await db.execute(
        text('DELETE FROM public.network_feature_flags WHERE flag_key = :flag_key AND merchant_id = :mid RETURNING id'),
        {"flag_key": flag_key, "mid": merchant_id},
    )
    row = res.first()
    await db.commit()

    for key in list(_FLAGS_CACHE.keys()):
        if key.startswith(f"{flag_key}:"):
            del _FLAGS_CACHE[key]

    return row is not None


async def list_all_flags_and_overrides(db: AsyncSession) -> dict:
    """Returns all global defaults and per-merchant overrides with merchant metadata."""
    await ensure_schema(db)

    # Global flags
    res_global = await db.execute(
        text('SELECT id, flag_key, enabled, updated_by_admin_id, updated_at FROM public.network_feature_flags WHERE merchant_id IS NULL ORDER BY flag_key')
    )
    global_flags = [dict(r._mapping) for r in res_global.fetchall()]

    # Merchant overrides with merchant shop/trade name
    res_overrides = await db.execute(
        text('''
            SELECT 
                f.id, f.flag_key, f.enabled, f.updated_by_admin_id, f.updated_at, f.merchant_id,
                m."shopName", m."tradeName", m."ownerName", m.phone, m.email, m."merchantCode"
            FROM public.network_feature_flags f
            JOIN public.merchants m ON m.id = f.merchant_id
            WHERE f.merchant_id IS NOT NULL
            ORDER BY f.updated_at DESC
        ''')
    )
    merchant_overrides = [dict(r._mapping) for r in res_overrides.fetchall()]

    return {
        "global_flags": global_flags,
        "merchant_overrides": merchant_overrides,
        "supported_flags": [
            {"key": "deep_accounting_enabled", "label": "Deep Accounting (Double-Entry Ledger & GST Register)", "default": False},
            {"key": "primary_merchant_enabled", "label": "Primary Merchant / Sub-Merchant Multi-Store Hierarchy", "default": False},
            {"key": "akai_assistant_enabled", "label": "@AKAI Intelligence Assistant & AI Voice Copilot (Chat)", "default": False},
            {"key": "akai_audit_enabled", "label": "AKAI Business Controller (Live Production Walkthrough Audit)", "default": False},
            {"key": "smart_website_enabled", "label": "Smart Website Builder AI Copilot", "default": False},
            {"key": "ondc_enabled", "label": "ONDC Network B2B/B2C Protocol Gateway", "default": False},
            {"key": "parcel_delivery_enabled", "label": "Hyperlocal / Courier Parcel Delivery Automation", "default": False},
            {"key": "merchant_website_enabled", "label": "Merchant Public Website Storefront", "default": True},
            {"key": "merchant_network_enabled", "label": "Merchant B2B Network Marketplace", "default": True},
        ]
    }
