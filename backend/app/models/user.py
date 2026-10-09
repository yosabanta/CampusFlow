import enum
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class UserRole(str, enum.Enum):
    """The 8 approved institutional roles for CampusFLow."""
    STUDENT = "STUDENT"
    ADMIN = "ADMIN"
    WARDEN = "WARDEN"
    HOSTEL_FACULTY = "HOSTEL_FACULTY"
    TEACHER = "TEACHER"
    LAB_ASSISTANT = "LAB_ASSISTANT"
    STAFF = "STAFF"
    GUARD = "GUARD"


class User(Base):
    """
    Core authentication and user identity model.
    Entity 1 of 24.
    """
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    phone_number: Mapped[str] = mapped_column(String(15), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role_enum", native_enum=False),
        index=True,
        nullable=False
    )
    first_name: Mapped[str] = mapped_column(String(50), nullable=False)
    last_name: Mapped[str] = mapped_column(String(50), nullable=False)
    theme_preference: Mapped[str] = mapped_column(String(10), default="light", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    student_profile: Mapped[Optional["Student"]] = relationship(
        "Student", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    staff_profile: Mapped[Optional["Staff"]] = relationship(
        "Staff", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    notifications: Mapped[List["InAppNotification"]] = relationship(
        "InAppNotification", back_populates="user", cascade="all, delete-orphan"
    )
    audit_logs: Mapped[List["AuditLog"]] = relationship(
        "AuditLog", back_populates="actor"
    )


class Student(Base):
    """
    Student academic and hostel residency profile.
    Entity 2 of 24.
    """
    __tablename__ = "students"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    roll_number: Mapped[str] = mapped_column(String(30), unique=True, index=True, nullable=False)
    university_reg_number: Mapped[Optional[str]] = mapped_column(
        String(50), unique=True, index=True, nullable=True
    )
    accommodation_type: Mapped[str] = mapped_column(
        String(20), default="DAY_SCHOLAR", nullable=False
    )
    department: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    batch_year: Mapped[int] = mapped_column(Integer, nullable=False)
    semester: Mapped[int] = mapped_column(Integer, nullable=False)
    section: Mapped[str] = mapped_column(String(5), nullable=False)
    hostel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("hostels.id", ondelete="SET NULL"), nullable=True, index=True
    )
    hostel_block: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    room_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    dues_cleared: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    has_smartphone: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    parent_phone: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)

    @property
    def college_roll_number(self) -> str:
        """Alias for college roll number."""
        return self.roll_number

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="student_profile")
    hostel: Mapped[Optional["Hostel"]] = relationship("Hostel", back_populates="students")
    complaints: Mapped[List["Complaint"]] = relationship("Complaint", back_populates="student")
    gate_passes: Mapped[List["GatePass"]] = relationship("GatePass", back_populates="student")
    document_requests: Mapped[List["DocumentRequest"]] = relationship("DocumentRequest", back_populates="student")
    attendance_records: Mapped[List["AttendanceRecord"]] = relationship("AttendanceRecord", back_populates="student")
    announcement_reads: Mapped[List["AnnouncementRead"]] = relationship("AnnouncementRead", back_populates="student")


class Staff(Base):
    """
    Institutional staff member profile (Faculty, Lab, Warden, Maintenance, Guard).
    Entity 3 of 24.
    """
    __tablename__ = "staff"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    department_id: Mapped[str] = mapped_column(String(50), nullable=False)
    designation: Mapped[str] = mapped_column(String(80), nullable=False)
    assigned_lab_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="staff_profile")
