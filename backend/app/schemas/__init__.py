"""
Pydantic v2 Request and Response Schemas for CampusFLow
"""
from app.schemas.auth import LoginRequest, UserResponse, TokenResponse

__all__ = [
    "LoginRequest",
    "UserResponse",
    "TokenResponse",
]
