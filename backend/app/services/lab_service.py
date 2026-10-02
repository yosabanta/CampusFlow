import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.lab import (
    LabEquipment,
    EquipmentWorkingStatus,
    LabRequisition,
    LabRequisitionItem,
    LabRequisitionStatus
)
from app.schemas.lab import (
    LabEquipmentCreate,
    LabEquipmentUpdate,
    LabRequisitionCreate,
    LabRequisitionItemCreate,
    LabRequisitionReviewRequest
)
from app.utils.audit_logger import create_audit_log

logger = logging.getLogger(__name__)


# ==============================================================================
# LAB EQUIPMENT
# ==============================================================================

def create_equipment(
    db: Session,
    actor: User,
    data: LabEquipmentCreate
) -> LabEquipment:
    """
    Lab Assistant registers physical workshop machine or instrument.
    """
    existing = db.query(LabEquipment).filter(
        LabEquipment.equipment_id == data.equipment_id.strip()
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Equipment with ID '{data.equipment_id}' is already registered."
        )

    eq = LabEquipment(
        equipment_id=data.equipment_id.strip(),
        name=data.name,
        category=data.category,
        lab_name=data.lab_name,
        total_quantity=data.total_quantity,
        available_quantity=data.available_quantity,
        damaged_quantity=data.damaged_quantity,
        working_status=data.working_status,
        maintenance_status=data.maintenance_status
    )
    db.add(eq)
    db.flush()

    create_audit_log(
        db=db,
        actor_id=actor.id,
        entity_type="LAB_EQUIPMENT",
        entity_id=eq.id,
        action="EQUIPMENT_REGISTERED",
        new_state={
            "equipment_id": eq.equipment_id,
            "status": eq.working_status.value,
            "lab": eq.lab_name
        }
    )

    db.commit()
    db.refresh(eq)
    return eq


def update_equipment(
    db: Session,
    equipment_pk: uuid.UUID,
    actor: User,
    data: LabEquipmentUpdate
) -> LabEquipment:
    """
    Lab Assistant updates operational status and inventory counts.
    """
    eq = db.query(LabEquipment).filter(LabEquipment.id == equipment_pk).first()
    if not eq:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lab equipment item not found."
        )

    prev_state = {
        "status": eq.working_status.value,
        "available": eq.available_quantity,
        "damaged": eq.damaged_quantity
    }

    if data.name is not None:
        eq.name = data.name
    if data.category is not None:
        eq.category = data.category
    if data.lab_name is not None:
        eq.lab_name = data.lab_name
    if data.total_quantity is not None:
        eq.total_quantity = data.total_quantity
    if data.available_quantity is not None:
        eq.available_quantity = data.available_quantity
    if data.damaged_quantity is not None:
        eq.damaged_quantity = data.damaged_quantity
    if data.working_status is not None:
        eq.working_status = data.working_status
    if data.maintenance_status is not None:
        eq.maintenance_status = data.maintenance_status

    eq.last_updated = datetime.now(timezone.utc)
    db.flush()

    create_audit_log(
        db=db,
        actor_id=actor.id,
        entity_type="LAB_EQUIPMENT",
        entity_id=eq.id,
        action="EQUIPMENT_UPDATED",
        previous_state=prev_state,
        new_state={
            "status": eq.working_status.value,
            "available": eq.available_quantity,
            "damaged": eq.damaged_quantity
        }
    )

    db.commit()
    db.refresh(eq)
    return eq


def list_equipment(
    db: Session,
    lab_name: Optional[str] = None,
    working_status: Optional[EquipmentWorkingStatus] = None
) -> List[LabEquipment]:
    """
    List registered equipment with optional lab and status filters.
    """
    query = db.query(LabEquipment)
    if lab_name:
        query = query.filter(LabEquipment.lab_name.ilike(f"%{lab_name}%"))
    if working_status:
        query = query.filter(LabEquipment.working_status == working_status)

    return query.order_by(LabEquipment.equipment_id.asc()).all()


# ==============================================================================
# LAB REQUISITIONS STATE MACHINE
# ==============================================================================

def create_requisition(
    db: Session,
    assistant: User,
    data: LabRequisitionCreate
) -> LabRequisition:
    """
    Create a new lab procurement indent in DRAFT status.
    """
    req_num = f"REQ-{datetime.now().year}-{uuid.uuid4().hex[:6].upper()}"

    req = LabRequisition(
        requisition_number=req_num,
        assistant_id=assistant.id,
        lab_name=data.lab_name,
        status=LabRequisitionStatus.DRAFT
    )
    db.add(req)
    db.flush()

    if data.items:
        for item in data.items:
            req_item = LabRequisitionItem(
                requisition_id=req.id,
                item_name=item.item_name,
                specifications=item.specifications,
                quantity=item.quantity,
                unit=item.unit,
                justification=item.justification
            )
            db.add(req_item)
        db.flush()

    create_audit_log(
        db=db,
        actor_id=assistant.id,
        entity_type="LAB_REQUISITION",
        entity_id=req.id,
        action="REQUISITION_DRAFT_CREATED",
        new_state={"requisition_number": req_num, "status": "DRAFT"}
    )

    db.commit()
    db.refresh(req)
    return req


def add_requisition_item(
    db: Session,
    requisition_id: uuid.UUID,
    actor: User,
    data: LabRequisitionItemCreate
) -> LabRequisitionItem:
    """
    Add a line item to a requisition in DRAFT status.
    """
    req = db.query(LabRequisition).filter(LabRequisition.id == requisition_id).first()
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lab requisition not found."
        )

    if req.status != LabRequisitionStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot add items to a requisition that has already been submitted."
        )

    item = LabRequisitionItem(
        requisition_id=req.id,
        item_name=data.item_name,
        specifications=data.specifications,
        quantity=data.quantity,
        unit=data.unit,
        justification=data.justification
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def submit_requisition(
    db: Session,
    requisition_id: uuid.UUID,
    actor: User
) -> LabRequisition:
    """
    Transition requisition: DRAFT -> SUBMITTED.
    """
    req = db.query(LabRequisition).filter(LabRequisition.id == requisition_id).first()
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lab requisition not found."
        )

    if req.status != LabRequisitionStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Requisition cannot be submitted from status '{req.status.value}'. Must be in DRAFT."
        )

    req.status = LabRequisitionStatus.SUBMITTED
    db.flush()

    create_audit_log(
        db=db,
        actor_id=actor.id,
        entity_type="LAB_REQUISITION",
        entity_id=req.id,
        action="REQUISITION_SUBMITTED",
        new_state={"status": "SUBMITTED"}
    )

    db.commit()
    db.refresh(req)
    return req


def review_requisition(
    db: Session,
    requisition_id: uuid.UUID,
    reviewer: User,
    review_data: LabRequisitionReviewRequest
) -> LabRequisition:
    """
    Authority reviews submitted requisition: moves to APPROVED or REJECTED.
    Requires rejection_reason if REJECTED.
    """
    req = db.query(LabRequisition).filter(LabRequisition.id == requisition_id).first()
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lab requisition not found."
        )

    if req.status not in (LabRequisitionStatus.SUBMITTED, LabRequisitionStatus.UNDER_REVIEW):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot review requisition currently in status '{req.status.value}'. Must be SUBMITTED or UNDER_REVIEW."
        )

    if review_data.status == LabRequisitionStatus.REJECTED:
        if not review_data.rejection_reason or review_data.rejection_reason.strip() == "":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A valid rejection reason is required when rejecting a requisition."
            )
        req.status = LabRequisitionStatus.REJECTED
        req.rejection_reason = review_data.rejection_reason.strip()
        req.approved_by = reviewer.id

        action = "REQUISITION_REJECTED"
        new_state = {"status": "REJECTED", "reason": req.rejection_reason}
    elif review_data.status == LabRequisitionStatus.APPROVED:
        req.status = LabRequisitionStatus.APPROVED
        req.approved_by = reviewer.id
        action = "REQUISITION_APPROVED"
        new_state = {"status": "APPROVED", "approved_by": str(reviewer.id)}
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Review decision must be either APPROVED or REJECTED."
        )

    db.flush()
    create_audit_log(
        db=db,
        actor_id=reviewer.id,
        entity_type="LAB_REQUISITION",
        entity_id=req.id,
        action=action,
        new_state=new_state
    )

    db.commit()
    db.refresh(req)
    return req


def move_requisition_to_ordered(
    db: Session,
    requisition_id: uuid.UUID,
    actor: User
) -> LabRequisition:
    """
    Transition: APPROVED -> ORDERED.
    """
    req = db.query(LabRequisition).filter(LabRequisition.id == requisition_id).first()
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lab requisition not found."
        )

    if req.status != LabRequisitionStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Requisition cannot be ordered from status '{req.status.value}'. Must be APPROVED."
        )

    req.status = LabRequisitionStatus.ORDERED
    db.flush()

    create_audit_log(
        db=db,
        actor_id=actor.id,
        entity_type="LAB_REQUISITION",
        entity_id=req.id,
        action="REQUISITION_ORDERED",
        new_state={"status": "ORDERED"}
    )

    db.commit()
    db.refresh(req)
    return req


def move_requisition_to_completed(
    db: Session,
    requisition_id: uuid.UUID,
    actor: User
) -> LabRequisition:
    """
    Transition: ORDERED -> COMPLETED.
    """
    req = db.query(LabRequisition).filter(LabRequisition.id == requisition_id).first()
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lab requisition not found."
        )

    if req.status != LabRequisitionStatus.ORDERED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Requisition cannot be completed from status '{req.status.value}'. Must be ORDERED."
        )

    req.status = LabRequisitionStatus.COMPLETED
    db.flush()

    create_audit_log(
        db=db,
        actor_id=actor.id,
        entity_type="LAB_REQUISITION",
        entity_id=req.id,
        action="REQUISITION_COMPLETED",
        new_state={"status": "COMPLETED"}
    )

    db.commit()
    db.refresh(req)
    return req


def list_requisitions(
    db: Session,
    status_filter: Optional[LabRequisitionStatus] = None
) -> List[LabRequisition]:
    """
    List requisitions, optionally filtered by status.
    """
    query = db.query(LabRequisition)
    if status_filter:
        query = query.filter(LabRequisition.status == status_filter)
    return query.order_by(LabRequisition.created_at.desc()).all()
