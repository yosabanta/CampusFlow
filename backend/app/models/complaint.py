import enum
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import (
    String, Text, Boolean, DateTime, Integer, Uuid, ForeignKey,
    Enum as SAEnum, CheckConstraint
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class ComplaintStatus(str, enum.Enum):
    """The approved lifecycle statuses for CampusFLow complaints."""
    OPEN = "OPEN"
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"
    REOPENED = "REOPENED"
    COMPLETED = "COMPLETED"


class Complaint(Base):
    """
    Campus maintenance and grievance ticket.
    Entity 5 of 24.
    """
    __tablename__ = "complaints"
    __table_args__ = (
        CheckConstraint("rating IS NULL OR (rating >= 1 AND rating <= 5)", name="ck_complaint_rating"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    ticket_number: Mapped[str] = mapped_column(String(30), unique=True, index=True, nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    location_type: Mapped[str] = mapped_column(String(30), nullable=False)
    location_details: Mapped[str] = mapped_column(String(120), nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ComplaintStatus] = mapped_column(
        SAEnum(ComplaintStatus, name="complaint_status_enum", native_enum=False),
        default=ComplaintStatus.OPEN,
        index=True,
        nullable=False
    )
    priority: Mapped[str] = mapped_column(String(20), default="NORMAL", nullable=False)
    assigned_staff_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sla_deadline: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    student: Mapped["Student"] = relationship("Student", back_populates="complaints")
    assigned_staff: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assigned_staff_id])
    attachments: Mapped[List["ComplaintAttachment"]] = relationship(
        "ComplaintAttachment", back_populates="complaint", cascade="all, delete-orphan"
    )


class ComplaintAttachment(Base):
    """
    Evidence photo or document attached to a complaint ticket.
    Entity 6 of 24.
    """
    __tablename__ = "complaint_attachments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    complaint_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_url: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(30), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    complaint: Mapped["Complaint"] = relationship("Complaint", back_populates="attachments")
