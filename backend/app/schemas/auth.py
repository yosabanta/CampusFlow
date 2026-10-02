from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from app.models.user import UserRole


class LoginRequest(BaseModel):
    """
    Credentials submitted for authentication.
    Accepts email, phone number, or roll number in the username field.
    """
    username: str
    password: str


class UserResponse(BaseModel):
    """
    Sanitized user identity schema.
    Guarantees password_hash and internal security fields are never exposed.
    """
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    phone_number: str
    role: UserRole
    first_name: str
    last_name: str
    theme_preference: str = "light"
    is_active: bool = True
    created_at: datetime


class TokenResponse(BaseModel):
    """
    Bearer access token payload returned upon successful authentication.
    """
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
