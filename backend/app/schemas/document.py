from datetime import datetime
from uuid import UUID
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from app.models.document_request import DocumentType, DocumentRequestStatus


class DocumentRequestCreate(BaseModel):
    """Payload for submitting an institutional document/certificate request."""
    document_type: DocumentType
    purpose: str = Field(..., min_length=3, max_length=255)


class DocumentDecisionRequest(BaseModel):
    """Payload for Admin decision on certificate request."""
    status: DocumentRequestStatus
    rejection_reason: Optional[str] = None


class DocumentRequestResponse(BaseModel):
    """Full document request details."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    request_number: str
    student_id: UUID
    document_type: DocumentType
    purpose: str
    status: DocumentRequestStatus
    approved_by: Optional[UUID] = None
    rejection_reason: Optional[str] = None
    document_url: Optional[str] = None
    verification_hash: Optional[str] = None
    created_at: datetime
