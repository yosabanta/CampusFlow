import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    String, Boolean, DateTime, Integer, Uuid, ForeignKey
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class OTPVerification(Base):
    """
    Time-bounded, rate-limited SMS OTP verification record for Help-a-Friend proxy requests.
    Entity 12 of 24.
    """
    __tablename__ = "otp_verifications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    beneficiary_student_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    phone_number: Mapped[str] = mapped_column(String(15), nullable=False)
    otp_code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    purpose: Mapped[str] = mapped_column(String(30), default="HELP_A_FRIEND", nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    beneficiary: Mapped["Student"] = relationship("Student", foreign_keys=[beneficiary_student_id])
    proxy_request: Mapped[Optional["ProxyRequest"]] = relationship(
        "ProxyRequest", back_populates="otp_verification", uselist=False
    )


class ProxyRequest(Base):
    """
    Audit linkage between proxy student (Student A) and beneficiary student (Student B).
    Entity 11 of 24.
    """
    __tablename__ = "proxy_requests"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True, nullable=False)
    proxy_student_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    beneficiary_student_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    otp_verification_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("otp_verifications.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    proxy_student: Mapped["Student"] = relationship("Student", foreign_keys=[proxy_student_id])
    beneficiary_student: Mapped["Student"] = relationship("Student", foreign_keys=[beneficiary_student_id])
    otp_verification: Mapped["OTPVerification"] = relationship("OTPVerification", back_populates="proxy_request")
