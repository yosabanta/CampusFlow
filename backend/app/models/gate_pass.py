import enum
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    String, Text, DateTime, Uuid, ForeignKey, Enum as SAEnum
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class GatePassType(str, enum.Enum):
    """Permitted gate pass outing classifications."""
    DAY_OUTING = "DAY_OUTING"
    HOME_LEAVE = "HOME_LEAVE"


class GatePassStatus(str, enum.Enum):
    """The frozen PRD gate pass lifecycle statuses."""
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CHECKED_OUT = "CHECKED_OUT"
    COMPLETED = "COMPLETED"
    OVERDUE = "OVERDUE"


class DecisionStatus(str, enum.Enum):
    """Explicit decision states for Warden/Authority audit records."""
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class QRTokenStatus(str, enum.Enum):
    """One-time single-use non-rotating QR token states."""
    ACTIVE = "ACTIVE"
    USED = "USED"
    EXPIRED = "EXPIRED"


class GatePass(Base):
    """
    Hostel residential exit and night curfew authorization pass.
    Entity 8 of 24.
    """
    __tablename__ = "gate_passes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    pass_number: Mapped[str] = mapped_column(String(30), unique=True, index=True, nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    pass_type: Mapped[GatePassType] = mapped_column(
        SAEnum(GatePassType, name="gate_pass_type_enum", native_enum=False),
        nullable=False
    )
    out_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expected_in_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    destination: Mapped[str] = mapped_column(String(150), nullable=False)
    purpose: Mapped[str] = mapped_column(String(255), nullable=False)

    # Status & Explicit Audit Timestamps
    status: Mapped[GatePassStatus] = mapped_column(
        SAEnum(GatePassStatus, name="gate_pass_status_enum", native_enum=False),
        default=GatePassStatus.PENDING,
        index=True,
        nullable=False
    )
    decision_status: Mapped[DecisionStatus] = mapped_column(
        SAEnum(DecisionStatus, name="decision_status_enum", native_enum=False),
        default=DecisionStatus.PENDING,
        index=True,
        nullable=False
    )
    decision_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    decision_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Perimeter Gate Actual Check-in / Check-out Scans
    actual_out_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    actual_in_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    pin_code: Mapped[str] = mapped_column(String(4), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False
    )

    # Relationships
    student: Mapped["Student"] = relationship("Student", back_populates="gate_passes")
    decider: Mapped[Optional["User"]] = relationship("User", foreign_keys=[decision_by])
    qr_token: Mapped[Optional["GatePassQRToken"]] = relationship(
        "GatePassQRToken", back_populates="gate_pass", uselist=False, cascade="all, delete-orphan"
    )


class GatePassQRToken(Base):
    """
    Cryptographic single-use non-rotating perimeter scan token.
    Entity 9 of 24.
    """
    __tablename__ = "gate_pass_qr_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    gate_pass_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("gate_passes.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    qr_token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    used_by_guard_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[QRTokenStatus] = mapped_column(
        SAEnum(QRTokenStatus, name="qr_token_status_enum", native_enum=False),
        default=QRTokenStatus.ACTIVE,
        index=True,
        nullable=False
    )

    # Relationships
    gate_pass: Mapped["GatePass"] = relationship("GatePass", back_populates="qr_token")
    guard: Mapped[Optional["User"]] = relationship("User", foreign_keys=[used_by_guard_id])
    student: Mapped["Student"] = relationship("Student", foreign_keys=[student_id])
