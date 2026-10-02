import enum
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import (
    String, Text, DateTime, Integer, Uuid, ForeignKey,
    Enum as SAEnum, UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class AnnouncementPriority(str, enum.Enum):
    """Urgency flag for circulars displayed on the Notice Board."""
    NORMAL = "NORMAL"
    URGENT = "URGENT"


class Announcement(Base):
    """
    Campus-wide or targeted circular published on the digital Notice Board.
    Entity 14 of 24.
    """
    __tablename__ = "announcements"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    author_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[AnnouncementPriority] = mapped_column(
        SAEnum(AnnouncementPriority, name="announcement_priority_enum", native_enum=False),
        default=AnnouncementPriority.NORMAL,
        index=True,
        nullable=False
    )

    # Cohort Targeting
    target_branch: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    target_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    target_section: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    target_hostel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("hostels.id", ondelete="SET NULL"), nullable=True, index=True
    )
    attachment_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False
    )

    # Relationships
    author: Mapped["User"] = relationship("User", foreign_keys=[author_id])
    target_hostel: Mapped[Optional["Hostel"]] = relationship("Hostel", foreign_keys=[target_hostel_id])
    reads: Mapped[List["AnnouncementRead"]] = relationship(
        "AnnouncementRead", back_populates="announcement", cascade="all, delete-orphan"
    )


class AnnouncementRead(Base):
    """
    Receipt tracking individual student notice board read acknowledgements.
    Entity 15 of 24.
    """
    __tablename__ = "announcement_reads"
    __table_args__ = (
        UniqueConstraint("announcement_id", "student_id", name="uq_announcement_student_read"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    announcement_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    read_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    announcement: Mapped["Announcement"] = relationship("Announcement", back_populates="reads")
    student: Mapped["Student"] = relationship("Student", back_populates="announcement_reads")
