"""AI Document Autofill — Google Cloud Vision OCR for the GST/Bank
document scanner shown during merchant registration (Business & Bank
steps). See VISION.md / the architecture review this was built from.

HARD RULES this module exists to enforce:
  - The source image is NEVER written to disk, NEVER stored in the
    database, and NEVER kept in memory past this single request/response
    cycle. It is decoded, sent to Google Vision, and discarded.
  - Only an explicit per-document-type field WHITELIST is ever returned
    to the caller (routers/merchant.py's /ocr-scan). Raw OCR text and
    the image itself never leave this module.
  - This is a best-effort heuristic parser (regex + label matching) on
    top of Vision's raw text output — real-world GST certificates and
    passbooks vary a lot in layout, so extraction accuracy should be
    treated as "assist", not "authoritative". The merchant always
    reviews/edits before anything is saved (existing registration form
    + existing /register API remain the only write path).
"""
from __future__ import annotations

import re
from typing import Literal, Optional

import httpx

from .config import settings

DocumentType = Literal["gst", "bank"]

# Explicit whitelist per document type — anything not in this list is
# dropped before the response ever reaches the frontend, even if the
# parser below happens to detect it (e.g. a passbook's CIF/customer ID,
# balance, or a stray QR code must never be surfaced).
GST_WHITELIST = ("gstin", "legalName", "tradeName", "address", "state", "pan")
BANK_WHITELIST = ("bankName", "accountHolderName", "accountNumber", "ifsc", "accountType", "upiId")

_INDIAN_STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
    "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
    "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim",
    "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
    "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry",
    "Chandigarh",
]

_GSTIN_RE = re.compile(r"\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]\b")
_PAN_RE = re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b")
_IFSC_RE = re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b")
_UPI_RE = re.compile(r"\b[\w.\-]{2,}@[a-zA-Z]{2,}\b")


def is_configured() -> bool:
    return bool(settings.google_vision_api_key)


async def extract_text(image_base64: str) -> str:
    """Send ONE captured photo to Google Cloud Vision (DOCUMENT_TEXT_
    DETECTION) and return the raw recognized text. The image bytes are
    only ever held in this function's local variables/the outgoing HTTP
    request body — nothing here writes to disk or any persistent store."""
    if not is_configured():
        raise RuntimeError("Google Vision is not configured (GOOGLE_VISION_API_KEY unset)")

    if image_base64.strip().startswith("data:") and "," in image_base64:
        image_base64 = image_base64.split(",", 1)[1]

    url = f"https://vision.googleapis.com/v1/images:annotate?key={settings.google_vision_api_key}"
    payload = {
        "requests": [
            {
                "image": {"content": image_base64},
                "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
            }
        ]
    }
    async with httpx.AsyncClient(timeout=25.0) as client:
        resp = await client.post(url, json=payload)
    resp.raise_for_status()
    data = resp.json()
    responses = data.get("responses") or [{}]
    first = responses[0] if responses else {}
    if first.get("error"):
        raise RuntimeError(f"Vision API error: {first['error']}")
    return (first.get("fullTextAnnotation") or {}).get("text", "") or ""


def _line_after_label(text: str, labels: list[str]) -> Optional[str]:
    """Find a line containing one of `labels` and return the text after
    the label on that same line (common on GST REG-06 style key: value
    rows), falling back to the next non-empty line (common on tabular
    OCR output where the value lands on its own line)."""
    lines = [ln.strip() for ln in text.splitlines()]
    # Longest label first, so e.g. "account holder name" is tried before
    # the shorter "account holder" and doesn't swallow "Name" into the
    # extracted value.
    lower_labels = sorted((l.lower() for l in labels), key=len, reverse=True)
    for i, line in enumerate(lines):
        low = line.lower()
        for lbl in lower_labels:
            if lbl in low:
                after = line[low.index(lbl) + len(lbl):].strip(" :.-\t")
                # GST REG-06 labels commonly read "Trade Name, if any" —
                # strip that trailing qualifier so it isn't swallowed
                # into the extracted value.
                after = re.sub(r"^,?\s*if any\s*", "", after, flags=re.I).strip(" :.-\t")
                if after:
                    return after
                for nxt in lines[i + 1: i + 3]:
                    if nxt.strip():
                        return nxt.strip()
    return None


def parse_gst_fields(text: str) -> dict:
    upper = text.upper()
    fields: dict = {}

    m = _GSTIN_RE.search(upper)
    if m:
        fields["gstin"] = m.group(0)

    m = _PAN_RE.search(upper)
    if m:
        fields["pan"] = m.group(0)

    legal = _line_after_label(text, ["legal name"])
    if legal:
        fields["legalName"] = legal

    trade = _line_after_label(text, ["trade name"])
    if trade and trade != "-":
        fields["tradeName"] = trade

    addr = _line_after_label(
        text, ["address of principal place of business", "principal place of business", "address"]
    )
    if addr:
        fields["address"] = addr

    for state in _INDIAN_STATES:
        if state.lower() in text.lower():
            fields["state"] = state
            break

    return fields


def parse_bank_fields(text: str) -> dict:
    fields: dict = {}

    m = _IFSC_RE.search(text.upper())
    if m:
        fields["ifsc"] = m.group(0)

    acc = _line_after_label(text, ["account no", "a/c no", "account number", "acc no"])
    if acc:
        digits = re.sub(r"\D", "", acc)
        if 9 <= len(digits) <= 18:
            fields["accountNumber"] = digits

    holder = _line_after_label(text, ["account holder name", "name of account holder", "holder name", "account holder"])
    if holder:
        fields["accountHolderName"] = holder

    bank = _line_after_label(text, ["bank name"])
    if bank:
        fields["bankName"] = bank.split(",")[0].strip()

    m = _UPI_RE.search(text)
    if m:
        fields["upiId"] = m.group(0)

    if re.search(r"\bsavings\b", text, re.I):
        fields["accountType"] = "savings"
    elif re.search(r"\bcurrent\b", text, re.I):
        fields["accountType"] = "current"

    return fields


def extract_fields(document_type: DocumentType, text: str) -> dict:
    raw = parse_gst_fields(text) if document_type == "gst" else parse_bank_fields(text)
    whitelist = GST_WHITELIST if document_type == "gst" else BANK_WHITELIST
    return {k: v for k, v in raw.items() if k in whitelist and v}
