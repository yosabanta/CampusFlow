import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, RequireRole
from app.models.user import User, UserRole
from app.models.lab import EquipmentWorkingStatus, LabRequisitionStatus
from app.schemas.lab import (
    LabEquipmentCreate,
    LabEquipmentUpdate,
    LabEquipmentResponse,
    LabRequisitionCreate,
    LabRequisitionItemCreate,
    LabRequisitionItemResponse,
    LabRequisitionReviewRequest,
    LabRequisitionResponse
)
from app.services import lab_service

router = APIRouter()


# ==============================================================================
# LAB EQUIPMENT ENDPOINTS
# ==============================================================================

@router.post(
    "/equipment",
    response_model=LabEquipmentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRole(UserRole.LAB_ASSISTANT, UserRole.ADMIN))]
)
def create_equipment(
    payload: LabEquipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lab Assistant or Admin registers physical workshop equipment.
    """
    return lab_service.create_equipment(
        db=db,
        actor=current_user,
        data=payload
    )


@router.patch(
    "/equipment/{equipment_id}",
    response_model=LabEquipmentResponse,
    dependencies=[Depends(RequireRole(UserRole.LAB_ASSISTANT, UserRole.ADMIN))]
)
def update_equipment(
    equipment_id: uuid.UUID,
    payload: LabEquipmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update equipment status, quantities, or maintenance info.
    """
    return lab_service.update_equipment(
        db=db,
        equipment_pk=equipment_id,
        actor=current_user,
        data=payload
    )


@router.get(
    "/equipment",
    response_model=List[LabEquipmentResponse]
)
def list_equipment(
    lab_name: Optional[str] = None,
    working_status: Optional[EquipmentWorkingStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List lab and workshop equipment with optional filters.
    """
    return lab_service.list_equipment(
        db=db,
        lab_name=lab_name,
        working_status=working_status
    )


# ==============================================================================
# LAB REQUISITION LIFECYCLE ENDPOINTS
# ==============================================================================

@router.post(
    "/requisitions",
    response_model=LabRequisitionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRole(UserRole.LAB_ASSISTANT, UserRole.ADMIN))]
)
def create_requisition(
    payload: LabRequisitionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new lab procurement indent in DRAFT status.
    """
    return lab_service.create_requisition(
        db=db,
        assistant=current_user,
        data=payload
    )


@router.post(
    "/requisitions/{requisition_id}/items",
    response_model=LabRequisitionItemResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRole(UserRole.LAB_ASSISTANT, UserRole.ADMIN))]
)
def add_requisition_item(
    requisition_id: uuid.UUID,
    payload: LabRequisitionItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Add a line item to a DRAFT requisition indent.
    """
    return lab_service.add_requisition_item(
        db=db,
        requisition_id=requisition_id,
        actor=current_user,
        data=payload
    )


@router.post(
    "/requisitions/{requisition_id}/submit",
    response_model=LabRequisitionResponse,
    dependencies=[Depends(RequireRole(UserRole.LAB_ASSISTANT, UserRole.ADMIN))]
)
def submit_requisition(
    requisition_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Submit requisition indent for review: DRAFT -> SUBMITTED.
    """
    return lab_service.submit_requisition(
        db=db,
        requisition_id=requisition_id,
        actor=current_user
    )


@router.post(
    "/requisitions/{requisition_id}/review",
    response_model=LabRequisitionResponse,
    dependencies=[Depends(RequireRole(UserRole.ADMIN, UserRole.LAB_ASSISTANT))]
)
def review_requisition(
    requisition_id: uuid.UUID,
    payload: LabRequisitionReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Authorized reviewer evaluates requisition: transitions to APPROVED or REJECTED.
    """
    return lab_service.review_requisition(
        db=db,
        requisition_id=requisition_id,
        reviewer=current_user,
        review_data=payload
    )


@router.post(
    "/requisitions/{requisition_id}/order",
    response_model=LabRequisitionResponse,
    dependencies=[Depends(RequireRole(UserRole.ADMIN, UserRole.LAB_ASSISTANT))]
)
def order_requisition(
    requisition_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Transition approved requisition: APPROVED -> ORDERED.
    """
    return lab_service.move_requisition_to_ordered(
        db=db,
        requisition_id=requisition_id,
        actor=current_user
    )


@router.post(
    "/requisitions/{requisition_id}/complete",
    response_model=LabRequisitionResponse,
    dependencies=[Depends(RequireRole(UserRole.ADMIN, UserRole.LAB_ASSISTANT))]
)
def complete_requisition(
    requisition_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Transition received requisition: ORDERED -> COMPLETED.
    """
    return lab_service.move_requisition_to_completed(
        db=db,
        requisition_id=requisition_id,
        actor=current_user
    )


@router.get(
    "/requisitions",
    response_model=List[LabRequisitionResponse]
)
def list_requisitions(
    status_filter: Optional[LabRequisitionStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List lab procurement requisitions with optional status filter.
    """
    return lab_service.list_requisitions(
        db=db,
        status_filter=status_filter
    )
