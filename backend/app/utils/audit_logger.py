import logging
import uuid
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models.audit import AuditLog

logger = logging.getLogger(__name__)


def create_audit_log(
    db: Session,
    actor_id: Optional[uuid.UUID],
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    previous_state: Optional[Dict[str, Any]] = None,
    new_state: Optional[Dict[str, Any]] = None
) -> AuditLog:
    """
    Append an immutable transaction audit log record.
    """
    audit = AuditLog(
        actor_id=actor_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        previous_state=previous_state,
        new_state=new_state
    )
    db.add(audit)
    db.flush()
    logger.info(f"Audit log: [{action}] on {entity_type}:{entity_id} by actor:{actor_id}")
    return audit
