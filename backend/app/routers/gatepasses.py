import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, RequireRole
from app.models.user import User, UserRole
from app.models.gate_pass import GatePassStatus
from app.schemas.gate_pass import (
    GatePassCreate, GatePassResponse, GatePassDecisionRequest,
    QRVerifyRequest, GatePassQRTokenResponse
)
from app.services import gate_pass_service
from app.utils.qr_generator import generate_qr_data_uri

router = APIRouter()


@router.post(
    "",
    response_model=GatePassResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit student gate pass application"
)
def apply_gate_pass(
    payload: GatePassCreate,
    current_user: User = Depends(RequireRole(UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    if not student:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account lacks an active student profile."
        )
    acc_type = (student.accommodation_type or "").strip().upper()
    if acc_type != "HOSTELER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Gate pass is available only to hostel residents."
        )
    return gate_pass_service.create_gate_pass(db=db, student=student, data=payload)


@router.get(
    "",
    response_model=List[GatePassResponse],
    summary="List gate passes according to user role permissions"
)
def list_gate_passes(
    status_filter: Optional[GatePassStatus] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    passes = gate_pass_service.get_gate_passes(db=db, user=current_user, status_filter=status_filter)

    # Attach QR data URI for approved active passes
    results = []
    for gp in passes:
        gp_resp = GatePassResponse.model_validate(gp)
        if gp.qr_token and gp.qr_token.status.value == "ACTIVE":
            gp_resp.qr_token.qr_data_uri = generate_qr_data_uri(gp.qr_token.qr_token)
        results.append(gp_resp)

    return results


@router.get(
    "/{id}",
    response_model=GatePassResponse,
    summary="Get single gate pass details"
)
def get_gate_pass(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    gp = gate_pass_service.get_gate_pass_by_id(db=db, pass_id=id)
    if current_user.role == UserRole.STUDENT and gp.student_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view this pass."
        )

    resp = GatePassResponse.model_validate(gp)
    if gp.qr_token and gp.qr_token.status.value == "ACTIVE":
        resp.qr_token.qr_data_uri = generate_qr_data_uri(gp.qr_token.qr_token)
    return resp


@router.patch(
    "/{id}/approve",
    response_model=GatePassResponse,
    summary="Warden approves gate pass and generates single-use QR token"
)
def approve_gate_pass(
    id: uuid.UUID,
    current_user: User = Depends(RequireRole(UserRole.WARDEN, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    gp = gate_pass_service.approve_gate_pass(db=db, pass_id=id, warden=current_user)
    resp = GatePassResponse.model_validate(gp)
    if gp.qr_token:
        resp.qr_token.qr_data_uri = generate_qr_data_uri(gp.qr_token.qr_token)
    return resp


@router.patch(
    "/{id}/reject",
    response_model=GatePassResponse,
    summary="Warden rejects gate pass with justification reason"
)
def reject_gate_pass(
    id: uuid.UUID,
    payload: GatePassDecisionRequest,
    current_user: User = Depends(RequireRole(UserRole.WARDEN, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    reason = payload.rejection_reason or "Outing request not approved by hostel authority"
    return gate_pass_service.reject_gate_pass(
        db=db,
        pass_id=id,
        warden=current_user,
        rejection_reason=reason
    )


@router.post(
    "/verify-qr",
    summary="Security Guard perimeter scan verifying and consuming single-use QR pass"
)
def verify_qr_pass(
    payload: QRVerifyRequest,
    current_user: User = Depends(RequireRole(UserRole.GUARD, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    return gate_pass_service.verify_and_consume_qr(
        db=db,
        qr_token_str=payload.qr_token,
        guard=current_user
    )


@router.post(
    "/{id}/return",
    response_model=GatePassResponse,
    summary="Record student return at perimeter gate"
)
def record_return(
    id: uuid.UUID,
    current_user: User = Depends(RequireRole(UserRole.GUARD, UserRole.WARDEN, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    return gate_pass_service.record_gate_pass_return(
        db=db,
        pass_id=id,
        actor=current_user
    )
