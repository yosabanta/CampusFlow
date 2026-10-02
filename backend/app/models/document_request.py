import enum
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    String, Text, DateTime, Uuid, ForeignKey, Enum as SAEnum
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class DocumentType(str, enum.Enum):
    """Institutional document/certificate types."""
    BONAFIDE = "BONAFIDE"
    HOSTEL_RESIDENCE = "HOSTEL_RESIDENCE"
    FEE_ESTIMATE = "FEE_ESTIMATE"


class DocumentRequestStatus(str, enum.Enum):
    """Approval lifecycle states for document requests."""
    SUBMITTED = "SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    COMPLETED = "COMPLETED"


class DocumentRequest(Base):
    """
    Formal student request for official institutional certificates.
    Entity 7 of 24.
    """
    __tablename__ = "document_requests"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    request_number: Mapped[str] = mapped_column(String(30), unique=True, index=True, nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_type: Mapped[DocumentType] = mapped_column(
        SAEnum(DocumentType, name="document_type_enum", native_enum=False),
        nullable=False
    )
    purpose: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[DocumentRequestStatus] = mapped_column(
        SAEnum(DocumentRequestStatus, name="document_request_status_enum", native_enum=False),
        default=DocumentRequestStatus.SUBMITTED,
        index=True,
        nullable=False
    )
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    document_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    verification_hash: Mapped[Optional[str]] = mapped_column(String(64), unique=True, index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    student: Mapped["Student"] = relationship("Student", back_populates="document_requests")
    approver: Mapped[Optional["User"]] = relationship("User", foreign_keys=[approved_by])
