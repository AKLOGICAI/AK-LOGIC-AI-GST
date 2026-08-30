"""JWT auth helpers — separate realms for merchant and admin."""
import hashlib
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .database import get_db

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)

# bcrypt hashes produced by passlib always start with one of these prefixes.
_BCRYPT_PREFIXES = ("$2a$", "$2b$", "$2y$")

# Mirrors src/lib/hash.ts exactly: sha256(`${MPIN_SALT}:${phone}:${mpin}`).
# Only used to VERIFY (never to create) MPIN digests belonging to merchants
# who registered before the backend owned MPIN verification, so a past
# registration isn't locked out the moment this migration ships. See
# verify_mpin_any() below.
_LEGACY_MPIN_SALT = "aklogic.mpin.v1"


def hash_mpin(mpin: str) -> str:
    return pwd.hash(mpin)


def verify_mpin(mpin: str, hashed: str) -> bool:
    return pwd.verify(mpin, hashed)


def _legacy_sha256_digest(phone: str, mpin: str) -> str:
    return hashlib.sha256(f"{_LEGACY_MPIN_SALT}:{phone}:{mpin}".encode("utf-8")).hexdigest()


def verify_mpin_any(phone: str, mpin: str, stored: str) -> tuple[bool, bool]:
    """Verify an MPIN against whatever is currently stored for this
    merchant, supporting both hash formats during the migration window.

    Returns (matched, needs_upgrade):
      - matched: whether `mpin` is correct.
      - needs_upgrade: True when the match came from the legacy SHA-256
        digest, meaning the caller should immediately re-hash with bcrypt
        and persist it (the account is upgraded to the secure format on
        its very next successful login — no forced reset for existing
        merchants).
    """
    if stored.startswith(_BCRYPT_PREFIXES):
        return verify_mpin(mpin, stored), False
    if _legacy_sha256_digest(phone, mpin) == stored:
        return True, True
    return False, False


def create_token(subject: str, realm: str, mpin_hash: str = None) -> str:
    payload = {
        "sub": subject,
        "realm": realm,  # 'merchant' | 'admin'
        "exp": datetime.utcnow() + timedelta(minutes=settings.access_token_ttl_min),
    }
    if mpin_hash:
        payload["mpin_hash"] = mpin_hash
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_reset_token(phone: str) -> str:
    """Short-lived, single-purpose token proving a phone+email pair just
    passed /verify-otp. Used ONLY by POST /merchant/reset-mpin (the
    "Forgot MPIN" flow) so a merchant can set a new MPIN without knowing
    the old one, while still requiring a fresh OTP check — the same
    verification strength as registration, just scoped to one phone
    number and expiring quickly so it can't be replayed later.
    """
    payload = {
        "sub": phone,
        "realm": "mpin_reset",
        "exp": datetime.utcnow() + timedelta(minutes=10),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_reset_token(token: str, phone: str) -> None:
    """Raise HTTPException if `token` isn't a valid, unexpired reset token
    for exactly this phone number."""
    try:
        data = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your verification has expired. Please request a new code.")
    if data.get("realm") != "mpin_reset" or data.get("sub") != phone:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your verification has expired. Please request a new code.")


def decode_token_str(token: str) -> dict:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing token")
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")


def _decode(creds: HTTPAuthorizationCredentials | None):
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing token")
    return decode_token_str(creds.credentials)


async def require_merchant(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db)
) -> str:
    data = _decode(creds)
    if data.get("realm") != "merchant":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Merchant access required")
    
    merchant_id = data["sub"]
    
    from . import merchant_repo
    merchant = await merchant_repo.get_by_id_light(db, merchant_id)
    if not merchant:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Merchant not found")
        
    if merchant.get("status") in ("suspended", "disabled"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been suspended. Please contact support.")
        
    token_mpin_hash = data.get("mpin_hash")
    if token_mpin_hash and merchant.get("mpin") != token_mpin_hash:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired due to MPIN change")
        
    return merchant_id


async def require_verified_merchant(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db)
) -> tuple[str, dict]:
    """Dependency enforcing that caller is an active merchant AND is KYC Verified."""
    merchant_id = await require_merchant(creds, db)
    from . import merchant_repo
    merchant = await merchant_repo.get_by_id_light(db, merchant_id)
    if not merchant or merchant.get("kyc") != "verified":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nationwide Customer Lookup is only available for KYC Verified Merchants."
        )
    return merchant_id, merchant


def require_admin(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> str:
    data = _decode(creds)
    if data.get("realm") != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return data["sub"]


async def require_customer(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db)
) -> str:
    data = _decode(creds)
    if data.get("realm") != "customer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Customer access required")
    
    customer_id = data["sub"]
    from . import customer_repo
    customer = await customer_repo.get_by_id(db, customer_id)
    if not customer:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Customer not found")
        
    if customer.get("status") in ("suspended", "disabled"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been suspended.")
        
    return customer_id


async def require_chat_actor(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db)
) -> tuple[str, str]:
    """Dependency for endpoints usable by either a Merchant or a Customer.
    Returns tuple: (actor_realm, actor_id), where actor_realm is 'merchant' or 'customer'.
    """
    data = _decode(creds)
    realm = data.get("realm")
    actor_id = data.get("sub")
    if not realm or not actor_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid authentication token")

    if realm == "merchant":
        from . import merchant_repo
        m = await merchant_repo.get_by_id_light(db, actor_id)
        if not m or m.get("status") in ("suspended", "disabled"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Merchant access denied")
        return ("merchant", actor_id)
    elif realm == "customer":
        from . import customer_repo
        c = await customer_repo.get_by_id(db, actor_id)
        if not c or c.get("status") in ("suspended", "disabled"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Customer access denied")
        return ("customer", actor_id)
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Unauthorized realm for chat")


