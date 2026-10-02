import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    String, DateTime, Uuid, ForeignKey, JSON
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class AuditLog(Base):
    """
    Append-only immutable transaction audit ledger.
    Entity 24 of 24.
    """
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True, nullable=False)
    action: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    previous_state: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    new_state: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False
    )

    # Relationships
    actor: Mapped[Optional["User"]] = relationship("User", back_populates="audit_logs")
