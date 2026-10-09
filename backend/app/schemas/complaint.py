from datetime import datetime
from uuid import UUID
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field
from app.models.complaint import ComplaintStatus


class ComplaintCreate(BaseModel):
    """Payload for lodging a new complaint."""
    title: str = Field(..., min_length=3, max_length=150)
    description: str = Field(..., min_length=5)
    location_type: str = Field(..., max_length=30)
    location_details: str = Field(..., max_length=120)
    category_id: Optional[str] = None  # Auto-triaged if omitted
    priority: str = "NORMAL"
    attachments: Optional[List[str]] = None  # List of file URLs/paths


class ComplaintAssignRequest(BaseModel):
    """Payload for assigning a complaint to maintenance staff."""
    assigned_staff_id: UUID


class ComplaintStatusUpdateRequest(BaseModel):
    """Payload for staff or admin transitioning complaint status."""
    status: ComplaintStatus
    resolution_notes: Optional[str] = None


class ComplaintRateRequest(BaseModel):
    """Payload for student rating and closing the loop."""
    rating: int = Field(..., ge=1, le=5)


class ComplaintAttachmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    file_url: str
    file_type: str
    uploaded_at: datetime


class ComplaintResponse(BaseModel):
    """Full complaint details representation."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    ticket_number: str
    student_id: UUID
    category_id: str
    location_type: str
    location_details: str
    title: str
    description: str
    status: ComplaintStatus
    priority: str
    assigned_staff_id: Optional[UUID] = None
    sla_deadline: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    rating: Optional[int] = None
    is_recurring: bool = False
    created_at: datetime
    updated_at: datetime
    attachments: List[ComplaintAttachmentResponse] = []
    student_name: Optional[str] = None
    student_roll: Optional[str] = None
    assigned_staff_name: Optional[str] = None
