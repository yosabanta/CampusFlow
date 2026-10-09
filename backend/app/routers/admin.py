import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, RequireRole
from app.models.user import User, UserRole
from app.schemas.admin import (
    ControlTowerMetrics, AuditLogResponse, StaffSummaryResponse,
    StudentSummaryResponse, HostelCreateRequest, HostelResponse, AdminUserCreateRequest
)
from app.schemas.auth import UserResponse
from app.schemas.complaint import ComplaintResponse
from app.services import admin_service

router = APIRouter()


@router.get(
    "/users",
    response_model=List[UserResponse],
    dependencies=[Depends(RequireRole(UserRole.ADMIN))]
)
def list_users(
    role: Optional[UserRole] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """List users in the institutional directory with optional role and keyword filters."""
    users = admin_service.get_all_users(db=db, role=role, search=search, limit=limit, offset=offset)
    return [UserResponse.model_validate(u) for u in users]


@router.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRole(UserRole.ADMIN))]
)
def create_user(
    payload: AdminUserCreateRequest,
    current_admin: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Admin provisions an institutional user with role and profile."""
    user = admin_service.create_user_by_admin(db=db, admin=current_admin, data=payload)
    return UserResponse.model_validate(user)


@router.get(
    "/staff",
    response_model=List[StaffSummaryResponse]
)
def list_staff(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List active institutional staff for assignment and triage workflows."""
    return admin_service.get_all_staff(db=db)


@router.get(
    "/students",
    response_model=List[StudentSummaryResponse],
    dependencies=[Depends(RequireRole(UserRole.ADMIN, UserRole.TEACHER, UserRole.WARDEN, UserRole.HOSTEL_FACULTY))]
)
def list_students(
    db: Session = Depends(get_db)
):
    """List enrolled students with department and hostel residency metadata."""
    return admin_service.get_all_students(db=db)


@router.get(
    "/hostels",
    response_model=List[HostelResponse]
)
def list_hostels(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List campus hostel facilities with dynamic capacity and occupancy calculation."""
    return admin_service.get_all_hostels(db=db)


@router.post(
    "/hostels",
    response_model=HostelResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRole(UserRole.ADMIN))]
)
def create_hostel_facility(
    payload: HostelCreateRequest,
    current_admin: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new hostel facility with capacity."""
    return admin_service.create_hostel(db=db, admin=current_admin, data=payload)


@router.get(
    "/control-tower/metrics",
    response_model=ControlTowerMetrics,
    dependencies=[Depends(RequireRole(UserRole.ADMIN))]
)
def get_metrics(
    db: Session = Depends(get_db)
):
    """
    Control Tower high-level operational telemetry metrics.
    Restricted to Campus Admin.
    """
    return admin_service.get_control_tower_metrics(db=db)


@router.get(
    "/control-tower/sla-breaches",
    response_model=List[ComplaintResponse],
    dependencies=[Depends(RequireRole(UserRole.ADMIN))]
)
def get_sla_breaches(
    db: Session = Depends(get_db)
):
    """
    List of active complaints that have breached SLA resolution deadlines.
    Restricted to Campus Admin.
    """
    return admin_service.get_sla_breach_complaints(db=db)


@router.get(
    "/control-tower/recurring-complaints",
    response_model=List[ComplaintResponse],
    dependencies=[Depends(RequireRole(UserRole.ADMIN))]
)
def get_recurring_complaints(
    db: Session = Depends(get_db)
):
    """
    List of complaints flagged as recurring infrastructure hotspots.
    Restricted to Campus Admin.
    """
    return admin_service.get_recurring_complaints(db=db)


@router.get(
    "/audit-logs",
    response_model=List[AuditLogResponse],
    dependencies=[Depends(RequireRole(UserRole.ADMIN))]
)
def get_audit_trail(
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    actor_id: Optional[uuid.UUID] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """
    Query append-only immutable audit trail with filtering.
    Restricted to Campus Admin.
    """
    return admin_service.get_audit_logs(
        db=db,
        entity_type=entity_type,
        action=action,
        actor_id=actor_id,
        limit=limit,
        offset=offset
    )

