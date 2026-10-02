import uuid
from typing import Optional, List
from sqlalchemy import String, Integer, Uuid, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class Hostel(Base):
    """
    Campus residential hostel facility.
    Entity 4 of 24.
    """
    __tablename__ = "hostels"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    warden_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    total_rooms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relationships
    warden: Mapped[Optional["User"]] = relationship("User", foreign_keys=[warden_id])
    students: Mapped[List["Student"]] = relationship("Student", back_populates="hostel")
