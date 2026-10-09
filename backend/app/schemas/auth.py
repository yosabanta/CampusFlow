from datetime import datetime
from uuid import UUID
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.models.user import UserRole


class LoginRequest(BaseModel):
    """
    Credentials submitted for authentication.
    Accepts email, phone number, or roll number in the username field.
    """
    username: str
    password: str


class StudentProfileSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    roll_number: str
    college_roll_number: Optional[str] = None
    university_reg_number: Optional[str] = None
    accommodation_type: str = "DAY_SCHOLAR"
    department: str
    batch_year: int
    semester: int
    section: str
    room_number: Optional[str] = None
    hostel_block: Optional[str] = None
    hostel_id: Optional[UUID] = None
    dues_cleared: bool = True
    has_smartphone: bool = True
    parent_phone: Optional[str] = None


class StaffProfileSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    department_id: Optional[str] = None
    designation: Optional[str] = None


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
    student_profile: Optional[StudentProfileSummary] = None
    staff_profile: Optional[StaffProfileSummary] = None


class StudentRegisterRequest(BaseModel):
    """
    Registration payload for self-onboarding students.
    Enforces collection and validation of required academic and accommodation fields.
    """
    email: str
    phone_number: Optional[str] = None
    phone: Optional[str] = None
    password: str
    confirm_password: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    # College Roll Number & University Registration Number
    roll_number: Optional[str] = None
    college_roll_number: Optional[str] = None
    university_reg_number: Optional[str] = None
    # Accommodation Type: Hosteler or Day Scholar
    accommodation_type: Optional[str] = "Day Scholar"
    # Hostel residency details (applicable only for Hosteler)
    hostel_id: Optional[UUID] = None
    hostel_name: Optional[str] = None
    hostel_block: Optional[str] = None
    room_number: Optional[str] = None
    # Academic defaults
    department: Optional[str] = "Computer Science & Engineering"
    batch_year: Optional[int] = 2026
    semester: int = 1
    section: str = "A"
    parent_phone: Optional[str] = None


class TokenResponse(BaseModel):
    """
    Bearer access token payload returned upon successful authentication.
    """
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class DemoLoginRequest(BaseModel):
    """
    One-tap demo authentication request.
    Allows specifying role (e.g. STUDENT, WARDEN, ADMIN) or explicit username.
    """
    role: Optional[UserRole] = None
    username: Optional[str] = None


class DemoAccountItem(BaseModel):
    """
    Publicly displayable demo account information (non-production only).
    Never exposes passwords, hashes, or sensitive tokens.
    """
    role: UserRole
    role_label: str
    display_name: str
    username: str
    subtext: str


