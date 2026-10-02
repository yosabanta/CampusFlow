import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.complaint import Complaint, ComplaintStatus
from app.models.gate_pass import GatePass
from app.models.document_request import DocumentRequest
from app.models.audit import AuditLog
from app.schemas.admin import ControlTowerMetrics

logger = logging.getLogger(__name__)


def _ensure_utc(dt: datetime) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def get_control_tower_metrics(db: Session) -> ControlTowerMetrics:
    """
    Aggregate operational metrics across complaints, gate-passes, documents, and SLA health.
    """
    now = datetime.now(timezone.utc)
    if db.bind and db.bind.dialect.name == "sqlite":
        now = now.replace(tzinfo=None)

    # Complaints by status
    complaints = db.query(Complaint).all()
    total_complaints = len(complaints)
    complaints_by_status = {}
    for st in ComplaintStatus:
        complaints_by_status[st.value] = sum(1 for c in complaints if c.status == st)

    # SLA breaches: deadline has passed and not in terminal state
    terminal_statuses = (ComplaintStatus.RESOLVED, ComplaintStatus.COMPLETED, ComplaintStatus.CLOSED)
    sla_breaches = [
        c for c in complaints
        if c.status not in terminal_statuses and c.sla_deadline and _ensure_utc(c.sla_deadline) < datetime.now(timezone.utc)
    ]
    sla_breaches_count = len(sla_breaches)

    # Recurring hotspots
    recurring_hotspots_count = sum(1 for c in complaints if c.is_recurring)

    # Gate passes by status
    gate_passes = db.query(GatePass).all()
    gate_passes_by_status = {}
    for gp in gate_passes:
        st_val = gp.status.value if hasattr(gp.status, "value") else str(gp.status)
        gate_passes_by_status[st_val] = gate_passes_by_status.get(st_val, 0) + 1

    # Document requests by status
    doc_requests = db.query(DocumentRequest).all()
    doc_by_status = {}
    for doc in doc_requests:
        st_val = doc.status.value if hasattr(doc.status, "value") else str(doc.status)
        doc_by_status[st_val] = doc_by_status.get(st_val, 0) + 1

    # Total audit events
    total_audit_events = db.query(AuditLog).count()

    # Staff workload: complaints assigned per staff
    workload = {}
    for c in complaints:
        if c.assigned_staff_id and c.status not in terminal_statuses:
            s_id = str(c.assigned_staff_id)
            workload[s_id] = workload.get(s_id, 0) + 1

    return ControlTowerMetrics(
        total_complaints=total_complaints,
        complaints_by_status=complaints_by_status,
        sla_breaches_count=sla_breaches_count,
        recurring_hotspots_count=recurring_hotspots_count,
        gate_passes_by_status=gate_passes_by_status,
        document_requests_by_status=doc_by_status,
        total_audit_events=total_audit_events,
        staff_workload=workload
    )


def get_sla_breach_complaints(db: Session) -> List[Complaint]:
    """
    Retrieve open complaints that have breached their SLA resolution deadline.
    """
    terminal_statuses = (ComplaintStatus.RESOLVED, ComplaintStatus.COMPLETED, ComplaintStatus.CLOSED)
    complaints = db.query(Complaint).filter(~Complaint.status.in_(terminal_statuses)).all()

    now = datetime.now(timezone.utc)
    breached = [
        c for c in complaints
        if c.sla_deadline and _ensure_utc(c.sla_deadline) < now
    ]
    return breached


def get_recurring_complaints(db: Session) -> List[Complaint]:
    """
    Retrieve complaints flagged as recurring infrastructure hotspots.
    """
    return db.query(Complaint).filter(Complaint.is_recurring == True).order_by(Complaint.created_at.desc()).all()


def get_audit_logs(
    db: Session,
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    actor_id: Optional[uuid.UUID] = None,
    limit: int = 50,
    offset: int = 0
) -> List[AuditLog]:
    """
    Retrieve append-only audit trail logs with filtering.
    """
    query = db.query(AuditLog)
    if entity_type:
        query = query.filter(AuditLog.entity_type.ilike(f"%{entity_type}%"))
    if action:
        query = query.filter(AuditLog.action.ilike(f"%{action}%"))
    if actor_id:
        query = query.filter(AuditLog.actor_id == actor_id)

    return query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()
