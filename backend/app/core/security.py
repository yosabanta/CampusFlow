import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import bcrypt
import jwt
from app.core.config import settings

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"


def hash_password(plain_password: str) -> str:
    """
    Hash a plaintext password using bcrypt with a secure salt.
    """
    salt = bcrypt.gensalt()
    hashed_bytes = bcrypt.hashpw(plain_password.encode("utf-8"), salt)
    return hashed_bytes.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify that a plaintext password matches the bcrypt hashed password.
    Returns False on mismatch or corrupted hash without raising unhandled errors.
    """
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception as e:
        logger.warning(f"Error during password verification: {e}")
        return False


def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Generate an HMAC-SHA256 signed JWT access token containing required claims:
    - sub (subject / user_id)
    - role (institutional user role)
    - email (user email)
    - exp (expiration timestamp)
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(seconds=settings.JWT_EXPIRY)

    to_encode.update({"exp": expire})

    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET,
        algorithm=ALGORITHM
    )
    return encoded_jwt


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Decode and validate a JWT access token.
    Returns the claims payload dictionary if valid, or None if invalid/expired.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        logger.debug("JWT decode failed: Token has expired")
        return None
    except (jwt.InvalidTokenError, jwt.PyJWTError) as e:
        logger.debug(f"JWT decode failed: Invalid token ({e})")
        return None
