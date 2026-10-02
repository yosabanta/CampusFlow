import uuid
import random
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.user import Student
from app.models.complaint import Complaint
from app.models.proxy_request import OTPVerification, ProxyRequest
from app.schemas.complaint import ComplaintCreate
from app.services.complaint_service import create_complaint
from app.utils.audit_logger import create_audit_log
from app.utils.notifier import send_mock_sms

logger = logging.getLogger(__name__)


def _ensure_utc(dt: datetime) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def initiate_proxy_otp(
    db: Session,
    proxy_student: Student,
    beneficiary_roll_number: str
) -> Dict[str, Any]:
    """
    Step 1 & 2: Student A initiates a proxy submission on behalf of peer Student B.
    Generates a 6-digit numeric OTP, hashes it with SHA-256, and dispatches via SMS.
    """
    clean_roll = beneficiary_roll_number.strip()
    beneficiary = db.query(Student).filter(Student.roll_number == clean_roll).first()

    if not beneficiary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Beneficiary student with roll number '{clean_roll}' not found."
        )

    phone = beneficiary.user.phone_number
    if not phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Beneficiary student does not have a registered contact phone number."
        )

    # Generate 6-digit numeric OTP
    otp_code = f"{random.randint(100000, 999999)}"
    otp_hash = hashlib.sha256(otp_code.encode("utf-8")).hexdigest()

    # 5-minute strict lifespan
    expires = datetime.now(timezone.utc) + timedelta(minutes=5)

    otp_record = OTPVerification(
        beneficiary_student_id=beneficiary.id,
        phone_number=phone,
        otp_code_hash=otp_hash,
        purpose="HELP_A_FRIEND",
        expires_at=expires,
        attempts=0,
        is_verified=False
    )
    db.add(otp_record)
    db.flush()

    # Dispatch prototype SMS to Student B's basic phone
    sms_body = f"CampusFLow proxy verification code: {otp_code}. Valid for 5 minutes. Share with your peer to lodge request."
    send_mock_sms(
        db=db,
        phone_number=phone,
        message=sms_body,
        trigger_event="OTP_DISPATCH",
        student_id=beneficiary.id
    )

    create_audit_log(
        db=db,
        actor_id=proxy_student.id,
        entity_type="OTP_PROXY",
        entity_id=otp_record.id,
        action="OTP_INITIATE",
        new_state={"beneficiary_id": str(beneficiary.id), "phone_masked": f"****{phone[-4:]}"}
    )

    db.commit()

    return {
        "status": "OTP_SENT",
        "beneficiary_roll_number": clean_roll,
        "masked_phone": f"****{phone[-4:]}",
        "expires_in_seconds": 300
    }


def verify_proxy_otp(
    db: Session,
    proxy_student: Student,
    beneficiary_roll_number: str,
    otp_code: str
) -> OTPVerification:
    """
    Step 3: Verify the 6-digit numeric OTP provided by Student B.
    Enforces 5-minute expiry, max 3 attempts, and single-use validation.
    """
    clean_roll = beneficiary_roll_number.strip()
    beneficiary = db.query(Student).filter(Student.roll_number == clean_roll).first()

    if not beneficiary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Beneficiary student '{clean_roll}' not found."
        )

    # Retrieve most recent unverified OTP record
    otp_record = db.query(OTPVerification).filter(
        OTPVerification.beneficiary_student_id == beneficiary.id,
        OTPVerification.is_verified == False
    ).order_by(OTPVerification.created_at.desc()).first()

    if not otp_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active pending OTP request found for this student. Please initiate request first."
        )

    now = datetime.now(timezone.utc)

    # Expiration check
    if now > _ensure_utc(otp_record.expires_at):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP code has expired (exceeded 5 minutes). Please request a fresh code."
        )

    # Rate limiting: Maximum 3 attempts
    if otp_record.attempts >= 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum verification attempts (3) exceeded. Security lockout triggered. Please initiate a new request."
        )

    # Compare SHA-256 hash
    submitted_hash = hashlib.sha256(otp_code.strip().encode("utf-8")).hexdigest()

    if submitted_hash != otp_record.otp_code_hash:
        otp_record.attempts += 1
        db.commit()
        remaining = 3 - otp_record.attempts
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid OTP code. {remaining} attempt(s) remaining."
        )

    # Verification successful
    otp_record.is_verified = True

    create_audit_log(
        db=db,
        actor_id=proxy_student.id,
        entity_type="OTP_PROXY",
        entity_id=otp_record.id,
        action="OTP_VERIFIED",
        new_state={"beneficiary_id": str(beneficiary.id), "status": "VERIFIED"}
    )

    db.commit()
    db.refresh(otp_record)
    return otp_record


def submit_proxy_complaint(
    db: Session,
    proxy_student: Student,
    otp_verification_id: uuid.UUID,
    complaint_data: ComplaintCreate
) -> Complaint:
    """
    Step 4: File complaint on behalf of Student B using verified OTP token.
    Ensures ticket is stored under Student B's profile and links ProxyRequest.
    """
    otp_record = db.query(OTPVerification).filter(
        OTPVerification.id == otp_verification_id
    ).first()

    if not otp_record or not otp_record.is_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid and verified OTP token required to submit on behalf of peer."
        )

    # Single-use check: OTP verification record can only be used once
    existing_proxy = db.query(ProxyRequest).filter(
        ProxyRequest.otp_verification_id == otp_record.id
    ).first()

    if existing_proxy:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This verified OTP token has already been consumed for a proxy request."
        )

    beneficiary = otp_record.beneficiary

    # Create ticket registered to Student B
    complaint = create_complaint(
        db=db,
        student=beneficiary,
        data=complaint_data
    )

    # Store audit linkage between Student A and Student B
    proxy_link = ProxyRequest(
        entity_type="COMPLAINT",
        entity_id=complaint.id,
        proxy_student_id=proxy_student.id,
        beneficiary_student_id=beneficiary.id,
        otp_verification_id=otp_record.id
    )
    db.add(proxy_link)

    # Confirmation SMS dispatched to Student B
    send_mock_sms(
        db=db,
        phone_number=beneficiary.user.phone_number,
        message=f"Complaint {complaint.ticket_number} ({complaint.title}) successfully registered on your behalf by peer.",
        trigger_event="PROXY_CONFIRMATION",
        student_id=beneficiary.id
    )

    create_audit_log(
        db=db,
        actor_id=proxy_student.id,
        entity_type="PROXY_REQUEST",
        entity_id=proxy_link.id,
        action="PROXY_SUBMITTED",
        new_state={"complaint_id": str(complaint.id), "beneficiary_id": str(beneficiary.id)}
    )

    db.commit()
    db.refresh(complaint)
    return complaint
