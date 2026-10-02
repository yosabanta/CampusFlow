import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    String, Text, Boolean, DateTime, Uuid, ForeignKey
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class InAppNotification(Base):
    """
    Real-time transactional in-app user alert.
    Entity 10 of 24.
    """
    __tablename__ = "in_app_notifications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, index=True, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="notifications")


class SMSNotification(Base):
    """
    Abstracted SMS dispatch record for feature-phone students & parents.
    Entity 13 of 24.
    """
    __tablename__ = "sms_notifications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    recipient_phone: Mapped[str] = mapped_column(String(15), nullable=False)
    student_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("students.id", ondelete="SET NULL"), nullable=True, index=True
    )
    message_body: Mapped[str] = mapped_column(Text, nullable=False)
    trigger_event: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="SENT", nullable=False)
    dispatched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    student: Mapped[Optional["Student"]] = relationship("Student", foreign_keys=[student_id])
