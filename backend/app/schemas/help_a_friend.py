from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field, model_validator
from app.schemas.complaint import ComplaintCreate


class HelpAFriendInitiateRequest(BaseModel):
    """Step 1: Student A initiates proxy filing by supplying Student ID and Student Mobile Number."""
    beneficiary_roll_number: Optional[str] = Field(None, min_length=1, max_length=50)
    student_id: Optional[str] = Field(None, min_length=1, max_length=50)
    student_mobile_number: Optional[str] = Field(None, max_length=25)
    beneficiary_phone_number: Optional[str] = Field(None, max_length=25)

    @model_validator(mode="after")
    def validate_identifiers(self):
        roll = self.beneficiary_roll_number or self.student_id
        if not roll or not roll.strip():
            raise ValueError("Student ID / Roll Number is required.")
        self.beneficiary_roll_number = roll.strip()
        phone = self.student_mobile_number or self.beneficiary_phone_number
        if phone:
            self.student_mobile_number = phone.strip()
        return self


class HelpAFriendInitiateResponse(BaseModel):
    """Step 2: Server confirms OTP dispatch to Student B's feature phone."""
    status: str = "OTP_SENT"
    beneficiary_roll_number: str
    masked_phone: str
    expires_in_seconds: int = 600
    demo_otp: Optional[str] = None
    demo_fallback: Optional[bool] = False
    student_mobile: Optional[str] = None
    generated_at: Optional[str] = None


class HelpAFriendVerifyRequest(BaseModel):
    """Step 3: Student A submits the 6-digit numeric OTP given by Student B."""
    beneficiary_roll_number: Optional[str] = None
    student_id: Optional[str] = None
    otp_code: str = Field(..., min_length=6, max_length=6)

    @model_validator(mode="after")
    def validate_roll(self):
        roll = self.beneficiary_roll_number or self.student_id
        if not roll or not roll.strip():
            raise ValueError("Student ID / Roll Number is required.")
        self.beneficiary_roll_number = roll.strip()
        return self


class HelpAFriendVerifyResponse(BaseModel):
    """Step 3 response: OTP verified, authorization to file proxy complaint granted."""
    status: str = "VERIFIED"
    otp_verification_id: UUID
    message: str = "OTP successfully verified. You may now lodge the complaint on behalf of your peer."


class HelpAFriendSubmitComplaint(BaseModel):
    """Step 4: Student A submits complaint data accompanied by verified OTP token."""
    otp_verification_id: UUID
    complaint: ComplaintCreate

