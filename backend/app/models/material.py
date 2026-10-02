import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import (
    String, Text, DateTime, Integer, Uuid, ForeignKey
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class StudyMaterial(Base):
    """
    Teacher course notes, question banks, and syllabus handouts.
    Entity 19 of 24.
    """
    __tablename__ = "study_materials"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    file_url: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    teacher: Mapped["User"] = relationship("User", foreign_keys=[teacher_id])
    targets: Mapped[List["StudyMaterialTarget"]] = relationship(
        "StudyMaterialTarget", back_populates="material", cascade="all, delete-orphan"
    )


class StudyMaterialTarget(Base):
    """
    Academic cohort destination rules for study materials.
    Entity 20 of 24.
    """
    __tablename__ = "study_material_targets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    material_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("study_materials.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch: Mapped[str] = mapped_column(String(50), nullable=False)
    batch_year: Mapped[int] = mapped_column(Integer, nullable=False)
    semester: Mapped[int] = mapped_column(Integer, nullable=False)
    section: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    subject: Mapped[str] = mapped_column(String(80), nullable=False)

    # Relationships
    material: Mapped["StudyMaterial"] = relationship("StudyMaterial", back_populates="targets")
