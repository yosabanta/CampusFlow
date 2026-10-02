import enum
import uuid
from datetime import datetime, timezone
from typing import List
from sqlalchemy import (
    String, Text, DateTime, Integer, Uuid, ForeignKey,
    Enum as SAEnum, UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class ClassNoticeType(str, enum.Enum):
    """Academic timetable adjustment event types."""
    CANCELLED = "CANCELLED"
    POSTPONED = "POSTPONED"
    RESCHEDULED = "RESCHEDULED"
    SWITCHED = "SWITCHED"
    ROOM_CHANGED = "ROOM_CHANGED"
    FACULTY_CHANGED = "FACULTY_CHANGED"


class AttendanceStatus(str, enum.Enum):
    """Student lecture presence states."""
    PRESENT = "PRESENT"
    ABSENT = "ABSENT"
    LATE = "LATE"


class ClassNotice(Base):
    """
    Teacher announcement regarding lecture cancellation, room swap, or rescheduling.
    Entity 16 of 24.
    """
    __tablename__ = "class_notices"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    notice_type: Mapped[ClassNoticeType] = mapped_column(
        SAEnum(ClassNoticeType, name="class_notice_type_enum", native_enum=False),
        nullable=False
    )
    target_branch: Mapped[str] = mapped_column(String(50), nullable=False)
    target_year: Mapped[int] = mapped_column(Integer, nullable=False)
    target_semester: Mapped[int] = mapped_column(Integer, nullable=False)
    target_section: Mapped[str] = mapped_column(String(5), nullable=False)
    subject: Mapped[str] = mapped_column(String(80), nullable=False)
    class_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period: Mapped[str] = mapped_column(String(30), nullable=False)
    details: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    teacher: Mapped["User"] = relationship("User", foreign_keys=[teacher_id])


class AttendanceSession(Base):
    """
    Single lecture class period for which attendance is marked.
    Entity 17 of 24.
    """
    __tablename__ = "attendance_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject: Mapped[str] = mapped_column(String(80), nullable=False)
    branch: Mapped[str] = mapped_column(String(50), nullable=False)
    batch_year: Mapped[int] = mapped_column(Integer, nullable=False)
    section: Mapped[str] = mapped_column(String(5), nullable=False)
    session_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    teacher: Mapped["User"] = relationship("User", foreign_keys=[teacher_id])
    records: Mapped[List["AttendanceRecord"]] = relationship(
        "AttendanceRecord", back_populates="session", cascade="all, delete-orphan"
    )


class AttendanceRecord(Base):
    """
    Individual student attendance status entry for a given session.
    Entity 18 of 24.
    """
    __tablename__ = "attendance_records"
    __table_args__ = (
        UniqueConstraint("session_id", "student_id", name="uq_session_student_attendance"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[AttendanceStatus] = mapped_column(
        SAEnum(AttendanceStatus, name="attendance_status_enum", native_enum=False),
        default=AttendanceStatus.PRESENT,
        nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    session: Mapped["AttendanceSession"] = relationship("AttendanceSession", back_populates="records")
    student: Mapped["Student"] = relationship("Student", back_populates="attendance_records")
