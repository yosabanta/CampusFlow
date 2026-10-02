import uuid
import logging
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

# Security scheme for Bearer token extraction
security_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    FastAPI dependency extracting the Bearer token, validating claims,
    and loading the active User from the database.
    Rejects missing, expired, or invalid credentials with HTTP 401.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"}
        )

    token = credentials.credentials
    payload = decode_access_token(token)

    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials: Token is invalid or expired",
            headers={"WWW-Authenticate": "Bearer"}
        )

    user_id_str = payload.get("sub")
    try:
        user_uuid = uuid.UUID(str(user_id_str))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid subject claim format in token",
            headers={"WWW-Authenticate": "Bearer"}
        )

    user = db.query(User).filter(User.id == user_uuid).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with token not found",
            headers={"WWW-Authenticate": "Bearer"}
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return user


class RequireRole:
    """
    FastAPI RBAC guard verifying that the authenticated user possesses one of
    the permitted institutional roles.
    Raises HTTP 403 Forbidden on role mismatch.
    """
    def __init__(self, *allowed_roles: UserRole):
        if not allowed_roles:
            raise ValueError("RequireRole requires at least one allowed UserRole")
        self.allowed_roles = set(allowed_roles)

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in self.allowed_roles:
            allowed_names = [r.value for r in self.allowed_roles]
            logger.warning(
                f"RBAC check failed for user {current_user.email} (Role: {current_user.role.value}). "
                f"Required: {allowed_names}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: User role '{current_user.role.value}' lacks required permission."
            )
        return current_user
