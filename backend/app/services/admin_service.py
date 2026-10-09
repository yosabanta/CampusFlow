import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status
from app.models.complaint import Complaint, ComplaintStatus
from app.models.gate_pass import GatePass
from app.models.document_request import DocumentRequest
from app.models.audit import AuditLog
from app.models.user import User, Student, Staff, UserRole
from app.models.hostel import Hostel
from app.core.security import hash_password
from app.schemas.admin import ControlTowerMetrics, AdminUserCreateRequest, HostelCreateRequest


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


def get_all_users(
    db: Session,
    role: Optional[UserRole] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
) -> List[User]:
    """Retrieve users with optional role filtering and keyword search."""
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (User.email.ilike(s)) |
            (User.first_name.ilike(s)) |
            (User.last_name.ilike(s)) |
            (User.phone_number.ilike(s))
        )
    return query.order_by(User.created_at.desc()).offset(offset).limit(limit).all()


def create_user_by_admin(
    db: Session,
    admin: User,
    data: AdminUserCreateRequest
) -> User:
    """Administrator provisions a new institutional user with corresponding profile."""
    clean_email = data.email.strip().lower()
    clean_phone = data.phone_number.strip()

    if len(data.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters long."
        )

    existing = db.query(User).filter(
        (User.email == clean_email) | (User.phone_number == clean_phone)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email or phone number already exists."
        )

    user = User(
        id=uuid.uuid4(),
        email=clean_email,
        phone_number=clean_phone,
        password_hash=hash_password(data.password),
        role=data.role,
        first_name=data.first_name.strip(),
        last_name=data.last_name.strip(),
        theme_preference="light",
        is_active=True
    )
    db.add(user)
    db.flush()

    if data.role == UserRole.STUDENT:
        roll_val = data.college_roll_number or data.roll_number
        if not roll_val:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="College roll number is required when creating a student."
            )
        clean_roll = roll_val.strip().upper()
        existing_roll = db.query(Student).filter(Student.roll_number == clean_roll).first()
        if existing_roll:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Student with roll number '{clean_roll}' already exists."
            )
        clean_uni_reg = data.university_reg_number.strip().upper() if data.university_reg_number else None
        if clean_uni_reg:
            existing_uni = db.query(Student).filter(Student.university_reg_number == clean_uni_reg).first()
            if existing_uni:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Student with university registration number '{clean_uni_reg}' already exists."
                )

        acc_type = (data.accommodation_type or "DAY_SCHOLAR").strip().upper()
        if "DAY" in acc_type:
            acc_type = "DAY_SCHOLAR"
        elif "HOSTEL" in acc_type:
            acc_type = "HOSTELER"

        student_profile = Student(
            id=user.id,
            roll_number=clean_roll,
            university_reg_number=clean_uni_reg,
            accommodation_type=acc_type,
            department=(data.department or "Computer Science & Engineering").strip(),
            batch_year=data.batch_year or datetime.now().year,
            semester=data.semester or 1,
            section=(data.section or "A").strip().upper(),
            hostel_id=data.hostel_id if acc_type == "HOSTELER" else None,
            hostel_block=data.hostel_block.strip() if (data.hostel_block and acc_type == "HOSTELER") else None,
            room_number=data.room_number.strip() if (data.room_number and acc_type == "HOSTELER") else None,
            dues_cleared=True,
            has_smartphone=True
        )
        db.add(student_profile)
    elif data.role in (UserRole.STAFF, UserRole.WARDEN, UserRole.HOSTEL_FACULTY, UserRole.TEACHER, UserRole.LAB_ASSISTANT, UserRole.GUARD):
        staff_profile = Staff(
            id=user.id,
            department_id=(data.department or "Campus Operations").strip(),
            designation=(data.designation or data.role.value).strip()
        )
        db.add(staff_profile)

    audit_entry = AuditLog(
        actor_id=admin.id,
        entity_type="USER",
        entity_id=user.id,
        action="ADMIN_CREATE_USER",
        new_state={"email": clean_email, "role": data.role.value, "created_by": str(admin.id)}
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(user)
    return user


def get_all_staff(db: Session) -> List[dict]:
    """Retrieve all operational staff across all institutional staff roles."""
    staff_users = db.query(User).filter(
        User.role.in_([
            UserRole.STAFF, UserRole.WARDEN, UserRole.HOSTEL_FACULTY,
            UserRole.TEACHER, UserRole.LAB_ASSISTANT, UserRole.GUARD
        ])
    ).all()
    results = []
    for u in staff_users:
        dept = u.staff_profile.department_id if u.staff_profile else None
        desig = u.staff_profile.designation if u.staff_profile else u.role.value
        name = f"{u.first_name} {u.last_name}".strip()
        results.append({
            "id": u.id,
            "name": name,
            "full_name": name,
            "email": u.email,
            "phone_number": u.phone_number,
            "phone": u.phone_number,
            "role": u.role.value,
            "department": dept,
            "designation": desig
        })
    return results


def get_all_students(db: Session) -> List[dict]:
    """Retrieve all enrolled students with academic and residence metadata."""
    students = db.query(Student).all()
    results = []
    for s in students:
        u = s.user
        h = s.hostel
        name = f"{u.first_name} {u.last_name}".strip() if u else s.roll_number
        results.append({
            "id": s.id,
            "name": name,
            "full_name": name,
            "roll_number": s.roll_number,
            "college_roll_number": s.roll_number,
            "university_reg_number": s.university_reg_number,
            "accommodation_type": s.accommodation_type or ("HOSTELER" if s.hostel_id else "DAY_SCHOLAR"),
            "email": u.email if u else "",
            "phone_number": u.phone_number if u else "",
            "phone": u.phone_number if u else "",
            "department": s.department,
            "batch_year": s.batch_year,
            "semester": s.semester,
            "section": s.section,
            "room_number": s.room_number,
            "hostel_block": s.hostel_block,
            "hostel_id": s.hostel_id,
            "hostel_name": h.name if h else None
        })
    return results


def get_all_hostels(db: Session) -> List[dict]:
    """Calculate live occupancy statistics per hostel facility from persisted records."""
    hostels = db.query(Hostel).all()
    results = []
    for h in hostels:
        occupied = db.query(Student).filter(Student.hostel_id == h.id).count()
        warden_user = h.warden
        results.append({
            "id": h.id,
            "name": h.name,
            "code": h.code,
            "total_rooms": h.total_rooms,
            "occupied_rooms": occupied,
            "available_rooms": max(0, h.total_rooms - occupied),
            "warden_id": h.warden_id,
            "warden_name": f"{warden_user.first_name} {warden_user.last_name}".strip() if warden_user else None
        })
    return results


def create_hostel(db: Session, admin: User, data: HostelCreateRequest) -> dict:
    """Create a new hostel facility with capacity."""
    clean_code = data.code.strip().upper()
    existing = db.query(Hostel).filter(Hostel.code == clean_code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Hostel with code '{clean_code}' already exists."
        )

    hostel = Hostel(
        id=uuid.uuid4(),
        name=data.name.strip(),
        code=clean_code,
        total_rooms=data.total_rooms,
        warden_id=data.warden_id
    )
    db.add(hostel)
    db.flush()

    audit_entry = AuditLog(
        actor_id=admin.id,
        entity_type="HOSTEL",
        entity_id=hostel.id,
        action="CREATE_HOSTEL",
        new_state={"code": clean_code, "name": hostel.name, "total_rooms": hostel.total_rooms}
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(hostel)
    return {
        "id": hostel.id,
        "name": hostel.name,
        "code": hostel.code,
        "total_rooms": hostel.total_rooms,
        "occupied_rooms": 0,
        "available_rooms": hostel.total_rooms,
        "warden_id": hostel.warden_id,
        "warden_name": None
    }

