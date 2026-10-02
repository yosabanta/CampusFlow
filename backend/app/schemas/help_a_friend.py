from uuid import UUID
from pydantic import BaseModel, Field
from app.schemas.complaint import ComplaintCreate


class HelpAFriendInitiateRequest(BaseModel):
    """Step 1: Student A initiates proxy filing by supplying Student B's roll number."""
    beneficiary_roll_number: str = Field(..., min_length=3, max_length=30)


class HelpAFriendInitiateResponse(BaseModel):
    """Step 2: Server confirms OTP dispatch to Student B's feature phone."""
    status: str = "OTP_SENT"
    beneficiary_roll_number: str
    masked_phone: str
    expires_in_seconds: int = 300


class HelpAFriendVerifyRequest(BaseModel):
    """Step 3: Student A submits the 6-digit numeric OTP given by Student B."""
    beneficiary_roll_number: str
    otp_code: str = Field(..., min_length=6, max_length=6)


class HelpAFriendVerifyResponse(BaseModel):
    """Step 3 response: OTP verified, authorization to file proxy complaint granted."""
    status: str = "VERIFIED"
    otp_verification_id: UUID
    message: str = "OTP successfully verified. You may now lodge the complaint on behalf of your peer."


class HelpAFriendSubmitComplaint(BaseModel):
    """Step 4: Student A submits complaint data accompanied by verified OTP token."""
    otp_verification_id: UUID
    complaint: ComplaintCreate
