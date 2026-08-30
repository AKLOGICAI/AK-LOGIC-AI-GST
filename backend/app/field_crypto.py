"""AES-256-GCM field-level encryption for sensitive merchant bank columns
(bankName, accountNumber, ifsc, upiId) stored at rest in public.merchants.

WHY THIS EXISTS: SettingsPage.tsx shows merchants a badge claiming
"Account number, IFSC, UPI and mobile are stored AES-256 encrypted at
rest." Until this module, that claim was FALSE — merchant_repo.py wrote
these fields to Postgres as plain values with no encryption anywhere in
the backend (verified: no `encrypt` call existed outside of an unrelated
frontend-only config field). This module makes the bank-detail portion
of that claim true. `phone` is deliberately NOT covered here — it is
used in equality lookups (get_by_phone / login) that a random-IV AES
scheme would break; encrypting it needs a separate deterministic/hashed
lookup design and is out of scope for this fix.

Fails closed, matching this app's existing pattern for other secrets
(see routers/merchant.py's /verify-payment, and the production fail-fast
checks in config.py): if FIELD_ENCRYPTION_KEY isn't configured, encrypting
or decrypting raises rather than silently reading/writing plaintext.
"""
from __future__ import annotations

import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import settings

# Every value this module encrypts is prefixed with this marker so
# decrypt_field() can tell an already-encrypted value apart from a
# pre-migration plaintext row (see decrypt_field's backward-compat path)
# and so encrypt_field() never double-encrypts an already-encrypted value.
_PREFIX = "enc:v1:"

# The exact merchant columns this module encrypts/decrypts. Kept as an
# explicit, named set (not "encrypt everything") so it's obvious at a
# glance which fields are covered, and so columns used in SQL equality
# lookups (phone, gstin, qrId, email) are never accidentally included.
SENSITIVE_MERCHANT_FIELDS = {"bankName", "accountNumber", "ifsc", "upiId"}


def _key_bytes() -> bytes:
    key = settings.field_encryption_key
    if not key or len(key.strip()) < 16:
        raise RuntimeError(
            "FIELD_ENCRYPTION_KEY is not configured (or is too short). "
            "Refusing to read or write bank details in plaintext. Set a "
            "strong random secret (32+ characters) as the FIELD_ENCRYPTION_KEY "
            "environment variable on the backend."
        )
    key = key.strip()
    # Accept a base64-encoded 32-byte key as-is; otherwise derive a stable
    # 32-byte AES-256 key from whatever passphrase was configured.
    try:
        raw = base64.b64decode(key, validate=True)
        if len(raw) == 32:
            return raw
    except Exception:
        pass
    return hashlib.sha256(key.encode("utf-8")).digest()


def encrypt_field(plaintext: str | None) -> str | None:
    """Encrypts a single field value. None/empty values pass through
    unchanged (nothing to protect, and keeps optional fields like upiId
    working exactly as before)."""
    if plaintext is None or plaintext == "":
        return plaintext
    if not isinstance(plaintext, str):
        plaintext = str(plaintext)
    if plaintext.startswith(_PREFIX):
        return plaintext  # already encrypted — never double-encrypt
    aesgcm = AESGCM(_key_bytes())
    nonce = os.urandom(12)  # fresh random nonce per value, per AES-GCM requirements
    ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return _PREFIX + base64.b64encode(nonce + ct).decode("ascii")


def decrypt_field(value: str | None) -> str | None:
    """Decrypts a single field value. Values that don't carry the enc:v1:
    marker are returned unchanged — this is what keeps existing
    (pre-migration) plaintext rows working immediately after this code
    ships, before the one-time backfill migration re-saves them
    encrypted. Once a row has been re-saved (register/update, or the
    migration script), it will always carry the marker."""
    if value is None or value == "":
        return value
    if not isinstance(value, str) or not value.startswith(_PREFIX):
        return value
    aesgcm = AESGCM(_key_bytes())
    raw = base64.b64decode(value[len(_PREFIX):])
    nonce, ct = raw[:12], raw[12:]
    return aesgcm.decrypt(nonce, ct, None).decode("utf-8")


def encrypt_sensitive(data: dict) -> dict:
    """Returns a shallow copy of `data` with every present
    SENSITIVE_MERCHANT_FIELDS key encrypted. Used right before an insert/
    update hits the database."""
    out = dict(data)
    for field in SENSITIVE_MERCHANT_FIELDS:
        if field in out:
            out[field] = encrypt_field(out[field])
    return out


def decrypt_sensitive(data: dict | None) -> dict | None:
    """Returns a shallow copy of `data` with every present
    SENSITIVE_MERCHANT_FIELDS key decrypted. Used right after a row comes
    back from the database, so every existing caller elsewhere in the
    backend keeps seeing plain values exactly as before — encryption stays
    invisible to everything outside this module and merchant_repo.py."""
    if data is None:
        return None
    out = dict(data)
    for field in SENSITIVE_MERCHANT_FIELDS:
        if field in out:
            out[field] = decrypt_field(out[field])
    return out
