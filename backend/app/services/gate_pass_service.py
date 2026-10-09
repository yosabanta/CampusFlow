import uuid
import secrets
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.user import User, Student, UserRole
from app.models.gate_pass import (
    GatePass, GatePassQRToken, GatePassType, GatePassStatus,
    DecisionStatus, QRTokenStatus
)
from app.schemas.gate_pass import GatePassCreate
from app.utils.audit_logger import create_audit_log
from app.utils.notifier import create_in_app_notification
from app.utils.qr_generator import generate_qr_data_uri

logger = logging.getLogger(__name__)


def _ensure_utc(dt: datetime) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def create_gate_pass(
    db: Session,
    student: Student,
    data: GatePassCreate
) -> GatePass:
    """
    Student submits an institutional gate pass application.
    """
    acc_type = (student.accommodation_type or "").strip().upper() if student else ""
    if acc_type != "HOSTELER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Gate pass is available only to hostel residents."
        )

    pass_num = f"GP-{datetime.now().year}-{uuid.uuid4().hex[:6].upper()}"

    gate_pass = GatePass(
        pass_number=pass_num,
        student_id=student.id,
        pass_type=data.pass_type,
        out_time=data.out_time,
        expected_in_time=data.expected_in_time,
        destination=data.destination,
        purpose=data.purpose,
        pin_code=data.pin_code or "1234",
        status=GatePassStatus.PENDING,
        decision_status=DecisionStatus.PENDING
    )
    db.add(gate_pass)
    db.flush()

    create_audit_log(
        db=db,
        actor_id=student.id,
        entity_type="GATE_PASS",
        entity_id=gate_pass.id,
        action="REQUEST",
        new_state={"pass_number": pass_num, "status": "PENDING", "destination": data.destination}
    )

    create_in_app_notification(
        db=db,
        user_id=student.id,
        title="Gate Pass Submitted",
        message=f"Gate pass {pass_num} has been forwarded to the hostel warden for approval.",
        notification_type="GATE_PASS_SUBMITTED",
        entity_id=gate_pass.id
    )

    db.commit()
    db.refresh(gate_pass)
    return gate_pass


def get_gate_passes(
    db: Session,
    user: User,
    status_filter: Optional[GatePassStatus] = None
) -> List[GatePass]:
    """Retrieve gate passes based on user role."""
    query = db.query(GatePass)

    if user.role == UserRole.STUDENT:
        query = query.filter(GatePass.student_id == user.id)

    if status_filter:
        query = query.filter(GatePass.status == status_filter)

    return query.order_by(GatePass.created_at.desc()).all()


def get_gate_pass_by_id(db: Session, pass_id: uuid.UUID) -> GatePass:
    """Find gate pass or raise HTTP 404."""
    gp = db.query(GatePass).filter(GatePass.id == pass_id).first()
    if not gp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Gate pass with ID {pass_id} not found"
        )
    return gp


def approve_gate_pass(
    db: Session,
    pass_id: uuid.UUID,
    warden: User
) -> GatePass:
    """
    Warden approves gate pass:
    1. Sets decision_status='APPROVED', status='APPROVED', decision_at=now, decision_by=warden.id.
    2. Issues exactly one active, non-rotating single-use cryptographic QR token.
    3. Creates transactional in-app notification for the student.
    """
    gp = get_gate_pass_by_id(db, pass_id)

    now = datetime.now(timezone.utc)
    gp.decision_status = DecisionStatus.APPROVED
    gp.status = GatePassStatus.APPROVED
    gp.decision_at = now
    gp.decision_by = warden.id

    # Generate 64-character cryptographic token
    crypto_token = secrets.token_hex(32)

    # Issue single-use QR token record
    qr_token = GatePassQRToken(
        gate_pass_id=gp.id,
        qr_token=crypto_token,
        student_id=gp.student_id,
        generated_at=now,
        expires_at=gp.expected_in_time,
        status=QRTokenStatus.ACTIVE
    )
    db.add(qr_token)
    db.flush()

    create_audit_log(
        db=db,
        actor_id=warden.id,
        entity_type="GATE_PASS",
        entity_id=gp.id,
        action="APPROVE",
        new_state={"status": "APPROVED", "qr_token": crypto_token}
    )

    create_in_app_notification(
        db=db,
        user_id=gp.student_id,
        title="Gate Pass Approved",
        message=f"Your gate pass {gp.pass_number} has been approved. Your single-use QR pass is ready.",
        notification_type="GATE_PASS_APPROVED",
        entity_id=gp.id
    )

    db.commit()
    db.refresh(gp)
    return gp


def reject_gate_pass(
    db: Session,
    pass_id: uuid.UUID,
    warden: User,
    rejection_reason: str
) -> GatePass:
    """
    Warden rejects gate pass with reason and triggers student notification.
    """
    gp = get_gate_pass_by_id(db, pass_id)

    now = datetime.now(timezone.utc)
    gp.decision_status = DecisionStatus.REJECTED
    gp.status = GatePassStatus.REJECTED
    gp.decision_at = now
    gp.decision_by = warden.id
    gp.rejection_reason = rejection_reason

    create_audit_log(
        db=db,
        actor_id=warden.id,
        entity_type="GATE_PASS",
        entity_id=gp.id,
        action="REJECT",
        new_state={"status": "REJECTED", "rejection_reason": rejection_reason}
    )

    create_in_app_notification(
        db=db,
        user_id=gp.student_id,
        title="Gate Pass Rejected",
        message=f"Your gate pass {gp.pass_number} was rejected by warden: {rejection_reason}",
        notification_type="GATE_PASS_REJECTED",
        entity_id=gp.id
    )

    db.commit()
    db.refresh(gp)
    return gp


def verify_and_consume_qr(
    db: Session,
    qr_token_str: str,
    guard: User
) -> Dict[str, Any]:
    """
    Security Guard scans single-use QR token at perimeter gate.
    Row-level locking guarantees token can never be reused.
    """
    cleaned_input = qr_token_str.strip()
    query = db.query(GatePassQRToken).filter(GatePassQRToken.qr_token == cleaned_input)
    if db.bind and db.bind.dialect.name != "sqlite":
        query = query.with_for_update()

    token = query.first()

    # Manual fallback: Look up by human-readable pass number (e.g. GP-2026-0001) or PIN code
    if not token:
        gp_match = db.query(GatePass).filter(
            (func.upper(GatePass.pass_number) == cleaned_input.upper()) |
            (GatePass.pin_code == cleaned_input)
        ).first()

        if gp_match:
            if gp_match.decision_status != DecisionStatus.APPROVED:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Gate pass {gp_match.pass_number} is {gp_match.decision_status.value}. Only APPROVED passes can be verified for exit."
                )
            if gp_match.status == GatePassStatus.REJECTED:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Gate pass {gp_match.pass_number} has been rejected."
                )
            if gp_match.status == GatePassStatus.CHECKED_OUT:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"REPLAY ATTEMPT DETECTED: Gate pass {gp_match.pass_number} is already checked out."
                )
            if gp_match.status == GatePassStatus.COMPLETED:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Gate pass {gp_match.pass_number} has already completed return check-in."
                )
            token = db.query(GatePassQRToken).filter(
                GatePassQRToken.gate_pass_id == gp_match.id
            ).first()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid QR token or Pass Identifier: Pass not found in system"
        )

    # Replay protection: if already used, reject immediately
    if token.status == QRTokenStatus.USED:
        used_time_str = token.used_at.strftime("%I:%M %p") if token.used_at else "earlier"
        logger.warning(f"Replay attack / Reused QR token: {token.qr_token} was already consumed at {used_time_str}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"REPLAY ATTEMPT DETECTED: This one-time QR pass was already consumed at {used_time_str}. Exit denied."
        )

    now = datetime.now(timezone.utc)

    # Check expiration
    if _ensure_utc(token.expires_at) < now or token.status == QRTokenStatus.EXPIRED:
        token.status = QRTokenStatus.EXPIRED
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Gate pass QR token has expired. Outing timeframe has elapsed."
        )

    # Valid ACTIVE token -> Consume immediately
    token.status = QRTokenStatus.USED
    token.used_at = now
    token.used_by_guard_id = guard.id

    # Update parent gate pass
    gp = token.gate_pass
    gp.status = GatePassStatus.CHECKED_OUT
    gp.actual_out_time = now

    create_audit_log(
        db=db,
        actor_id=guard.id,
        entity_type="GATE_PASS",
        entity_id=gp.id,
        action="CHECKOUT",
        new_state={"status": "CHECKED_OUT", "actual_out_time": now.isoformat(), "guard_id": str(guard.id)}
    )

    db.commit()

    return {
        "status": "APPROVED",
        "action": "CHECK_OUT",
        "message": "Valid gate pass. Exit permitted.",
        "pass_id": str(gp.id),
        "pass_number": gp.pass_number,
        "student_id": str(gp.student_id),
        "actual_out_time": now.isoformat()
    }


def record_gate_pass_return(
    db: Session,
    pass_id: uuid.UUID,
    actor: User
) -> GatePass:
    """
    Guard or warden scans student return, logging actual_in_time and marking pass COMPLETED.
    """
    gp = get_gate_pass_by_id(db, pass_id)
    now = datetime.now(timezone.utc)

    gp.actual_in_time = now
    gp.status = GatePassStatus.COMPLETED

    create_audit_log(
        db=db,
        actor_id=actor.id,
        entity_type="GATE_PASS",
        entity_id=gp.id,
        action="RETURN",
        new_state={"status": "COMPLETED", "actual_in_time": now.isoformat()}
    )

    db.commit()
    db.refresh(gp)
    return gp
