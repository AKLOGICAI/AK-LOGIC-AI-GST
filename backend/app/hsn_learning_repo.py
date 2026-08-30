"""Direct-Postgres repository for HSN Learning Signals table.

Stores merchant-approved HSN/SAC selections so the AI suggestion engine
can learn from real invoice data. All queries use parameterized text()
with explicit column lists, matching the conventions in
merchant_network_repo.py.
"""
from __future__ import annotations

import re
import secrets
import time
from typing import Any, List

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Explicit column allowlist
SIGNALS_COLUMNS = [
    "id", "merchant_id", "normalized_item_name", "sample_item_name",
    "hsn", "gst_rate", "approve_count", "override_count",
    "first_seen_at", "last_seen_at",
]

_SIGNALS_COLS_SQL = ", ".join(f'"{c}"' for c in SIGNALS_COLUMNS)

# Return-shape columns (subset returned to the frontend)
_RETURN_COLUMNS = [
    "normalized_item_name", "hsn", "gst_rate", "approve_count", "last_seen_at",
]
_RETURN_COLS_SQL = ", ".join(f'"{c}"' for c in _RETURN_COLUMNS)


def _row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row._mapping)


# ─── Normalization (faithful port of hsnAi.ts's normName) ───────────────
# Must produce the EXACT same output as the frontend's tokenize() → sort()
# → join(' ') pipeline for any given input string.

_STOPWORDS = frozenset([
    "the", "a", "an", "and", "or", "for", "with", "of",
    "new", "set", "pack", "piece", "pcs", "unit",
    "inch", "kg", "ltr", "ml", "model", "series",
])

_NON_ALNUM_RE = re.compile(r"[^a-z0-9\s]")


def _norm_name(raw: str) -> str:
    """Normalize an item description identically to hsnAi.ts's normName().

    Steps (mirrors the JS exactly):
      1. lowercase
      2. replace every non-[a-z0-9\\s] char with a space
      3. split on whitespace
      4. keep tokens with length > 1 that are NOT stopwords
      5. sort alphabetically
      6. join with a single space
    """
    lowered = raw.lower()
    cleaned = _NON_ALNUM_RE.sub(" ", lowered)
    tokens = cleaned.split()
    filtered = [t for t in tokens if len(t) > 1 and t not in _STOPWORDS]
    filtered.sort()
    return " ".join(filtered)


# ─── Repository functions ──────────────────────────────────────────────


async def record_approved_selection(
    db: AsyncSession,
    merchant_id: str,
    items: List[dict[str, Any]],
) -> None:
    """Upsert one or more merchant-approved HSN selections.

    ``items`` is a list of ``{description, hsn, gst_rate}`` dicts — the
    same shape already passed into ``learnFromInvoice`` on the frontend.
    """
    now_ms = int(time.time() * 1000)

    for item in items:
        description: str = item.get("description", "")
        hsn: str = item.get("hsn", "")
        gst_rate = item.get("gst_rate")

        if not description or not hsn or gst_rate is None:
            continue

        norm = _norm_name(description)
        if not norm:
            continue

        # Upsert: ON CONFLICT increment approve_count, update timestamps
        await db.execute(
            text(
                'INSERT INTO public.hsn_learning_signals '
                '  (id, merchant_id, normalized_item_name, sample_item_name, '
                '   hsn, gst_rate, approve_count, override_count, first_seen_at, last_seen_at) '
                'VALUES '
                '  (:id, :merchant_id, :normalized_item_name, :sample_item_name, '
                '   :hsn, :gst_rate, 1, 0, :now, :now) '
                'ON CONFLICT (merchant_id, normalized_item_name, hsn, gst_rate) DO UPDATE SET '
                '  approve_count = public.hsn_learning_signals.approve_count + 1, '
                '  sample_item_name = EXCLUDED.sample_item_name, '
                '  last_seen_at = EXCLUDED.last_seen_at'
            ),
            {
                "id": f"hls_{secrets.token_hex(12)}",
                "merchant_id": merchant_id,
                "normalized_item_name": norm,
                "sample_item_name": description,
                "hsn": hsn,
                "gst_rate": float(gst_rate),
                "now": now_ms,
            },
        )

    await db.commit()


async def get_learned_signals(
    db: AsyncSession,
    merchant_id: str,
) -> List[dict[str, Any]]:
    """Return all learned HSN signals for a merchant."""
    res = await db.execute(
        text(
            f"SELECT {_RETURN_COLS_SQL} FROM public.hsn_learning_signals "
            f"WHERE merchant_id = :merchant_id "
            f"ORDER BY last_seen_at DESC"
        ),
        {"merchant_id": merchant_id},
    )
    return [_row_to_dict(r) for r in res.fetchall()]
