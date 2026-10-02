import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.user import User, Student, UserRole
from app.models.complaint import Complaint, ComplaintAttachment, ComplaintStatus
from app.schemas.complaint import ComplaintCreate, ComplaintStatusUpdateRequest
from app.services.heuristics_service import triage_complaint_category, detect_recurring_hotspot
from app.utils.audit_logger import create_audit_log
from app.utils.notifier import create_in_app_notification

logger = logging.getLogger(__name__)


def create_complaint(
    db: Session,
    student: Student,
    data: ComplaintCreate
) -> Complaint:
    """
    Lodge a new maintenance ticket with automatic category triage and recurring hotspot detection.
    """
    category = data.category_id
    if not category or category.strip() == "":
        category = triage_complaint_category(data.title, data.description)

    # Check recurring infrastructure hotspot heuristic
    is_recurring = detect_recurring_hotspot(db, data.location_details, category)

    # Generate sequential or unique ticket number
    ticket_num = f"CMP-{datetime.now().year}-{uuid.uuid4().hex[:6].upper()}"

    # SLA deadline default: 48 hours from submission
    sla_time = datetime.now(timezone.utc) + timedelta(hours=48)

    complaint = Complaint(
        ticket_number=ticket_num,
        student_id=student.id,
        category_id=category,
        location_type=data.location_type,
        location_details=data.location_details,
        title=data.title,
        description=data.description,
        status=ComplaintStatus.OPEN,
        priority=data.priority or "NORMAL",
        sla_deadline=sla_time,
        is_recurring=is_recurring
    )
    db.add(complaint)
    db.flush()

    # Attach photo files if supplied
    if data.attachments:
        for file_url in data.attachments:
            att = ComplaintAttachment(
                complaint_id=complaint.id,
                file_url=file_url,
                file_type="image/jpeg"
            )
            db.add(att)
        db.flush()

    # Audit & In-App Notification
    create_audit_log(
        db=db,
        actor_id=student.id,
        entity_type="COMPLAINT",
        entity_id=complaint.id,
        action="CREATE",
        new_state={"ticket_number": ticket_num, "status": "OPEN", "category": category}
    )

    create_in_app_notification(
        db=db,
        user_id=student.id,
        title="Complaint Lodged",
        message=f"Your ticket {ticket_num} ({data.title}) has been registered.",
        notification_type="COMPLAINT_CREATED",
        entity_id=complaint.id
    )

    db.commit()
    db.refresh(complaint)
    return complaint


def get_complaints(
    db: Session,
    user: User,
    status_filter: Optional[ComplaintStatus] = None
) -> List[Complaint]:
    """
    Retrieve complaints according to RBAC scope.
    """
    query = db.query(Complaint)

    if user.role == UserRole.STUDENT:
        query = query.filter(Complaint.student_id == user.id)
    elif user.role == UserRole.STAFF:
        query = query.filter(Complaint.assigned_staff_id == user.id)

    if status_filter:
        query = query.filter(Complaint.status == status_filter)

    return query.order_by(Complaint.created_at.desc()).all()


def get_complaint_by_id(db: Session, complaint_id: uuid.UUID) -> Complaint:
    """Find a complaint or raise HTTP 404."""
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Complaint with ID {complaint_id} not found"
        )
    return complaint


def assign_complaint(
    db: Session,
    complaint_id: uuid.UUID,
    staff_id: uuid.UUID,
    admin: User
) -> Complaint:
    """
    Admin assigns ticket to department staff.
    """
    complaint = get_complaint_by_id(db, complaint_id)
    staff = db.query(User).filter(User.id == staff_id).first()
    if not staff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Staff member with ID {staff_id} not found"
        )

    prev_status = complaint.status.value
    complaint.assigned_staff_id = staff.id
    complaint.status = ComplaintStatus.ASSIGNED

    create_audit_log(
        db=db,
        actor_id=admin.id,
        entity_type="COMPLAINT",
        entity_id=complaint.id,
        action="ASSIGN",
        previous_state={"status": prev_status, "assigned_staff_id": None},
        new_state={"status": "ASSIGNED", "assigned_staff_id": str(staff.id)}
    )

    create_in_app_notification(
        db=db,
        user_id=staff.id,
        title="Work Order Assigned",
        message=f"Ticket {complaint.ticket_number} ({complaint.title}) has been assigned to you.",
        notification_type="COMPLAINT_ASSIGNED",
        entity_id=complaint.id
    )

    db.commit()
    db.refresh(complaint)
    return complaint


def update_complaint_status(
    db: Session,
    complaint_id: uuid.UUID,
    new_status: ComplaintStatus,
    actor: User,
    notes: Optional[str] = None
) -> Complaint:
    """
    Maintenance staff or admin updates ticket progress.
    """
    complaint = get_complaint_by_id(db, complaint_id)
    prev_status = complaint.status.value

    complaint.status = new_status
    if new_status == ComplaintStatus.RESOLVED:
        complaint.resolved_at = datetime.now(timezone.utc)

    create_audit_log(
        db=db,
        actor_id=actor.id,
        entity_type="COMPLAINT",
        entity_id=complaint.id,
        action="STATUS_UPDATE",
        previous_state={"status": prev_status},
        new_state={"status": new_status.value, "notes": notes}
    )

    # Notify student of resolution or status change
    create_in_app_notification(
        db=db,
        user_id=complaint.student_id,
        title=f"Complaint Status: {new_status.value}",
        message=f"Ticket {complaint.ticket_number} status updated to {new_status.value}.",
        notification_type="COMPLAINT_STATUS_UPDATED",
        entity_id=complaint.id
    )

    db.commit()
    db.refresh(complaint)
    return complaint


def rate_complaint(
    db: Session,
    complaint_id: uuid.UUID,
    student_id: uuid.UUID,
    rating: int
) -> Complaint:
    """
    Student rates resolution quality (1 to 5) and marks ticket COMPLETED.
    """
    complaint = get_complaint_by_id(db, complaint_id)
    if complaint.student_id != student_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the student who lodged the ticket may submit a verification rating."
        )

    complaint.rating = rating
    complaint.status = ComplaintStatus.COMPLETED

    create_audit_log(
        db=db,
        actor_id=student_id,
        entity_type="COMPLAINT",
        entity_id=complaint.id,
        action="RATE",
        new_state={"rating": rating, "status": "COMPLETED"}
    )

    db.commit()
    db.refresh(complaint)
    return complaint
