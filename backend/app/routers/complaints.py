import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, RequireRole
from app.models.user import User, Student, UserRole
from app.models.complaint import ComplaintStatus
from app.schemas.complaint import (
    ComplaintCreate, ComplaintResponse, ComplaintAssignRequest,
    ComplaintStatusUpdateRequest, ComplaintRateRequest
)
from app.services import complaint_service

router = APIRouter()


@router.post(
    "",
    response_model=ComplaintResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Lodge a new maintenance or campus complaint"
)
def create_complaint(
    payload: ComplaintCreate,
    current_user: User = Depends(RequireRole(UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    if not student:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account lacks an active student profile."
        )
    return complaint_service.create_complaint(db=db, student=student, data=payload)


@router.get(
    "",
    response_model=List[ComplaintResponse],
    summary="Retrieve complaints according to user role permissions"
)
def list_complaints(
    status_filter: Optional[ComplaintStatus] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return complaint_service.get_complaints(db=db, user=current_user, status_filter=status_filter)


@router.get(
    "/{id}",
    response_model=ComplaintResponse,
    summary="Retrieve single complaint by UUID"
)
def get_complaint(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    complaint = complaint_service.get_complaint_by_id(db=db, complaint_id=id)
    if current_user.role == UserRole.STUDENT and complaint.student_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view this ticket."
        )
    return complaint


@router.patch(
    "/{id}/assign",
    response_model=ComplaintResponse,
    summary="Assign complaint to maintenance staff"
)
def assign_complaint(
    id: uuid.UUID,
    payload: ComplaintAssignRequest,
    current_user: User = Depends(RequireRole(UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    return complaint_service.assign_complaint(
        db=db,
        complaint_id=id,
        staff_id=payload.assigned_staff_id,
        admin=current_user
    )


@router.patch(
    "/{id}/status",
    response_model=ComplaintResponse,
    summary="Update complaint resolution status"
)
def update_status(
    id: uuid.UUID,
    payload: ComplaintStatusUpdateRequest,
    current_user: User = Depends(RequireRole(UserRole.STAFF, UserRole.ADMIN, UserRole.WARDEN)),
    db: Session = Depends(get_db)
):
    return complaint_service.update_complaint_status(
        db=db,
        complaint_id=id,
        new_status=payload.status,
        actor=current_user,
        notes=payload.resolution_notes
    )


@router.post(
    "/{id}/rate",
    response_model=ComplaintResponse,
    summary="Rate resolution quality and close ticket"
)
def rate_complaint(
    id: uuid.UUID,
    payload: ComplaintRateRequest,
    current_user: User = Depends(RequireRole(UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    return complaint_service.rate_complaint(
        db=db,
        complaint_id=id,
        student_id=current_user.id,
        rating=payload.rating
    )
