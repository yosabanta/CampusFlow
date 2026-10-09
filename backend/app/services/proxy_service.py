import uuid
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from app.models.user import Student, User
from app.models.complaint import Complaint
from app.models.proxy_request import OTPVerification, ProxyRequest
from app.schemas.complaint import ComplaintCreate
from app.services.complaint_service import create_complaint
from app.utils.audit_logger import create_audit_log
from app.utils.notifier import send_mock_sms
from app.services.twilio_verify_service import twilio_verify_service, normalize_to_e164
from app.core.config import settings

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
    beneficiary_roll_number: str,
    student_mobile_number: Optional[str] = None
) -> Dict[str, Any]:
    """
    Step 1 & 2: Student A initiates a proxy submission on behalf of peer Student B.
    Validates Student ID and registered Student Mobile Number.
    Dispatches SMS verification code via official Twilio Verify v2 Service.
    """
    clean_roll = beneficiary_roll_number.strip()
    candidates = (
        db.query(Student)
        .join(Student.user)
        .filter(
            or_(
                func.upper(Student.roll_number) == clean_roll.upper(),
                func.upper(Student.university_reg_number) == clean_roll.upper(),
                User.phone_number == clean_roll,
                func.upper(User.email) == clean_roll.upper()
            )
        )
        .all()
    )

    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Beneficiary student with roll number or registration number '{clean_roll}' not found."
        )

    # Disambiguate if multiple candidates match
    beneficiary = candidates[0]
    if student_mobile_number and len(candidates) > 1:
        try:
            cand_entered_e164 = normalize_to_e164(student_mobile_number)
            for cand in candidates:
                if cand.user.phone_number:
                    try:
                        if normalize_to_e164(cand.user.phone_number) == cand_entered_e164:
                            beneficiary = cand
                            break
                    except ValueError:
                        pass
        except ValueError:
            pass

    phone = beneficiary.user.phone_number
    if not phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Beneficiary student does not have a registered contact phone number."
        )

    # Normalize beneficiary registered phone number to strict E.164 format
    try:
        phone_e164 = normalize_to_e164(phone)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Beneficiary student registered phone number is invalid: {str(e)}"
        )

    # Validate entered mobile number against beneficiary's registered mobile number if provided
    if student_mobile_number:
        try:
            entered_e164 = normalize_to_e164(student_mobile_number)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The entered mobile number is not in a valid phone number format."
            )

        if entered_e164 != phone_e164:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The entered mobile number does not match the registered contact number for student ID '{clean_roll}'."
            )

    now_utc = datetime.now(timezone.utc)

    # Anti-abuse cooldown: Enforce 60-second limit between OTP requests for same beneficiary
    recent_otp = db.query(OTPVerification).filter(
        OTPVerification.beneficiary_student_id == beneficiary.id,
        OTPVerification.is_verified == False
    ).order_by(OTPVerification.created_at.desc()).first()

    if recent_otp and recent_otp.created_at:
        elapsed = (now_utc - _ensure_utc(recent_otp.created_at)).total_seconds()
        if elapsed < 60:
            remaining_cooldown = int(60 - elapsed)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Please wait {remaining_cooldown} second(s) before requesting another verification code."
            )

    # Dispatch verification code
    demo_otp_val: Optional[str] = None
    verification_sid = ""

    # Check if SMS_PROVIDER_MODE is explicitly set to mock/demo or Twilio credentials missing
    use_mock_demo = (
        getattr(settings, "SMS_PROVIDER_MODE", "").lower() in ["mock", "demo"]
        or not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_VERIFY_SERVICE_SID)
    )

    if not use_mock_demo:
        try:
            verification = twilio_verify_service.start_verification(phone_e164=phone_e164, channel="sms")
            verification_sid = verification.get("sid", "")
            sid_hash = hashlib.sha256(verification_sid.encode("utf-8")).hexdigest()
            otp_hash = sid_hash
        except Exception as e:
            if getattr(settings, "ENABLE_DEMO_OTP_FALLBACK", False) and settings.ENVIRONMENT.strip().lower() != "production":
                demo_code = "482910"
                otp_hash = "DEMO_HASH:" + hashlib.sha256(demo_code.encode("utf-8")).hexdigest()
                demo_otp_val = f"DEMO_FALLBACK_OTP: {demo_code}"
                verification_sid = "DEMO_FALLBACK_SID"
                logger.warning(f"[Demo Fallback] Real SMS dispatch unavailable ({e}). Using demo OTP fallback: {demo_otp_val}")
            else:
                raise e
    else:
        # Standard live demo workflow without external Twilio: generate authentic 6-digit numeric OTP
        import random
        demo_code = f"{random.randint(100000, 999999)}"
        otp_hash = hashlib.sha256(demo_code.encode("utf-8")).hexdigest()
        demo_otp_val = demo_code
        verification_sid = "DEMO_LOCAL_DISPATCH"

    # Always log and persist mock SMS for local auditing and demo visibility
    sms_body = f"CampusFlow proxy verification code: {demo_otp_val or 'SECURE_SMS'}. Valid for 10 minutes. Share with your peer to lodge request."
    send_mock_sms(
        db=db,
        phone_number=phone_e164,
        message=sms_body,
        trigger_event="OTP_DISPATCH",
        student_id=beneficiary.id
    )

    # Store verification metadata in OTPVerification
    expires = now_utc + timedelta(minutes=10)

    otp_record = OTPVerification(
        beneficiary_student_id=beneficiary.id,
        phone_number=phone_e164,
        otp_code_hash=otp_hash,
        purpose="HELP_A_FRIEND",
        expires_at=expires,
        attempts=0,
        is_verified=False
    )
    db.add(otp_record)
    db.flush()

    create_audit_log(
        db=db,
        actor_id=proxy_student.id,
        entity_type="OTP_PROXY",
        entity_id=otp_record.id,
        action="OTP_INITIATE",
        new_state={
            "beneficiary_id": str(beneficiary.id),
            "phone_masked": f"****{phone_e164[-4:]}"
        }
    )

    db.commit()

    return {
        "status": "OTP_SENT",
        "beneficiary_roll_number": clean_roll,
        "masked_phone": f"****{phone_e164[-4:]}",
        "expires_in_seconds": 600,
        "demo_otp": demo_otp_val,
        "demo_fallback": bool(demo_otp_val is not None),
        "student_mobile": student_mobile_number or phone_e164,
        "generated_at": now_utc.strftime("%I:%M:%S %p")
    }


def verify_proxy_otp(
    db: Session,
    proxy_student: Student,
    beneficiary_roll_number: str,
    otp_code: str
) -> OTPVerification:
    """
    Step 3: Verify the 6-digit numeric OTP provided by Student B using Twilio Verify Check API.
    Enforces expiry, max 3 attempts, and single-use validation.
    """
    clean_roll = beneficiary_roll_number.strip()
    candidates = (
        db.query(Student)
        .join(Student.user)
        .filter(
            or_(
                func.upper(Student.roll_number) == clean_roll.upper(),
                func.upper(Student.university_reg_number) == clean_roll.upper(),
                User.phone_number == clean_roll,
                func.upper(User.email) == clean_roll.upper()
            )
        )
        .all()
    )

    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Beneficiary student '{clean_roll}' not found."
        )

    candidate_ids = [c.id for c in candidates]

    # Retrieve most recent unverified OTP record
    otp_record = db.query(OTPVerification).filter(
        OTPVerification.beneficiary_student_id.in_(candidate_ids),
        OTPVerification.is_verified == False
    ).order_by(OTPVerification.created_at.desc()).first()

    if not otp_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active pending OTP request found for this student. Please initiate request first."
        )

    beneficiary = otp_record.beneficiary

    now = datetime.now(timezone.utc)

    # Expiration check
    if now > _ensure_utc(otp_record.expires_at):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP verification code has expired. Please initiate a fresh request."
        )

    # Rate limiting: Maximum 3 attempts
    if otp_record.attempts >= 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum verification attempts (3) exceeded. Security lockout triggered. Please initiate a new request."
        )

    # Validate OTP code: direct hash match, demo hash, or twilio service check
    entered_hash = hashlib.sha256(otp_code.strip().encode("utf-8")).hexdigest()
    if entered_hash == otp_record.otp_code_hash:
        is_valid = True
    elif otp_record.otp_code_hash.startswith("DEMO_HASH:"):
        expected_hash = otp_record.otp_code_hash.replace("DEMO_HASH:", "", 1)
        is_valid = (entered_hash == expected_hash)
    else:
        # Fallback to verify check service (for backward-compatible tests)
        try:
            phone_e164 = otp_record.phone_number
            check_result = twilio_verify_service.check_verification(
                phone_e164=phone_e164,
                code=otp_code.strip()
            )
            is_valid = (check_result.get("status") == "approved" and bool(check_result.get("valid")))
        except Exception:
            is_valid = False

    if not is_valid:
        otp_record.attempts += 1
        db.commit()
        remaining = max(0, 3 - otp_record.attempts)
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
