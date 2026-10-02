import enum
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import (
    String, Text, DateTime, Integer, Uuid, ForeignKey,
    Enum as SAEnum
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class EquipmentWorkingStatus(str, enum.Enum):
    """Operational state of physical lab/workshop equipment."""
    FUNCTIONAL = "FUNCTIONAL"
    NEEDS_REPAIR = "NEEDS_REPAIR"
    NON_FUNCTIONAL = "NON_FUNCTIONAL"


class LabRequisitionStatus(str, enum.Enum):
    """Lifecycle stages for workshop tool and consumable procurement."""
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    ORDERED = "ORDERED"
    COMPLETED = "COMPLETED"


class LabEquipment(Base):
    """
    Physical workshop tool, machine, or component registered in inventory.
    Entity 21 of 24.
    """
    __tablename__ = "lab_equipment"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    equipment_id: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    lab_name: Mapped[str] = mapped_column(String(80), nullable=False)
    total_quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    available_quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    damaged_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    working_status: Mapped[EquipmentWorkingStatus] = mapped_column(
        SAEnum(EquipmentWorkingStatus, name="equipment_working_status_enum", native_enum=False),
        default=EquipmentWorkingStatus.FUNCTIONAL,
        nullable=False
    )
    maintenance_status: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )


class LabRequisition(Base):
    """
    Formal procurement and repair indent raised by workshop assistants.
    Entity 22 of 24.
    """
    __tablename__ = "lab_requisitions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    requisition_number: Mapped[str] = mapped_column(String(30), unique=True, index=True, nullable=False)
    assistant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lab_name: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[LabRequisitionStatus] = mapped_column(
        SAEnum(LabRequisitionStatus, name="lab_requisition_status_enum", native_enum=False),
        default=LabRequisitionStatus.DRAFT,
        index=True,
        nullable=False
    )
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False
    )

    # Relationships
    assistant: Mapped["User"] = relationship("User", foreign_keys=[assistant_id])
    approver: Mapped[Optional["User"]] = relationship("User", foreign_keys=[approved_by])
    items: Mapped[List["LabRequisitionItem"]] = relationship(
        "LabRequisitionItem", back_populates="requisition", cascade="all, delete-orphan"
    )


class LabRequisitionItem(Base):
    """
    Line item inside a lab equipment requisition indent.
    Entity 23 of 24.
    """
    __tablename__ = "lab_requisition_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    requisition_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("lab_requisitions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_name: Mapped[str] = mapped_column(String(100), nullable=False)
    specifications: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit: Mapped[str] = mapped_column(String(20), default="units", nullable=False)
    justification: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Relationships
    requisition: Mapped["LabRequisition"] = relationship("LabRequisition", back_populates="items")
