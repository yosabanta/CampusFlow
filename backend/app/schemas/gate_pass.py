from datetime import datetime
from uuid import UUID
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from app.models.gate_pass import GatePassType, GatePassStatus, DecisionStatus, QRTokenStatus


class GatePassCreate(BaseModel):
    """Payload for submitting a gate pass application."""
    pass_type: GatePassType
    out_time: datetime
    expected_in_time: datetime
    destination: str = Field(..., min_length=2, max_length=150)
    purpose: str = Field(..., min_length=3, max_length=255)
    pin_code: Optional[str] = Field("1234", min_length=4, max_length=4)


class GatePassDecisionRequest(BaseModel):
    """Payload for Warden gate pass decision."""
    rejection_reason: Optional[str] = None


class QRVerifyRequest(BaseModel):
    """Payload when Security Guard scans a student's perimeter QR token."""
    qr_token: str = Field(..., min_length=10, max_length=64)


class GatePassQRTokenResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    gate_pass_id: UUID
    qr_token: str
    status: QRTokenStatus
    generated_at: datetime
    expires_at: datetime
    used_at: Optional[datetime] = None
    qr_data_uri: Optional[str] = None


class GatePassResponse(BaseModel):
    """Detailed gate pass response including token and timestamps."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    pass_number: str
    student_id: UUID
    pass_type: GatePassType
    out_time: datetime
    expected_in_time: datetime
    destination: str
    purpose: str
    status: GatePassStatus
    decision_status: DecisionStatus
    decision_at: Optional[datetime] = None
    decision_by: Optional[UUID] = None
    rejection_reason: Optional[str] = None
    actual_out_time: Optional[datetime] = None
    actual_in_time: Optional[datetime] = None
    pin_code: str
    created_at: datetime
    qr_token: Optional[GatePassQRTokenResponse] = None
