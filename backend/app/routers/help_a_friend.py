from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import RequireRole
from app.models.user import User, UserRole
from app.schemas.complaint import ComplaintResponse
from app.schemas.help_a_friend import (
    HelpAFriendInitiateRequest, HelpAFriendInitiateResponse,
    HelpAFriendVerifyRequest, HelpAFriendVerifyResponse,
    HelpAFriendSubmitComplaint
)
from app.services import proxy_service

router = APIRouter()


@router.post(
    "/initiate",
    response_model=HelpAFriendInitiateResponse,
    status_code=status.HTTP_200_OK,
    summary="Step 1: Initiate proxy filing and dispatch 6-digit OTP to peer's phone"
)
def initiate_proxy(
    payload: HelpAFriendInitiateRequest,
    current_user: User = Depends(RequireRole(UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    if not student:
        raise HTTPException(status_code=400, detail="Active student profile required.")
    return proxy_service.initiate_proxy_otp(
        db=db,
        proxy_student=student,
        beneficiary_roll_number=payload.beneficiary_roll_number,
        student_mobile_number=payload.student_mobile_number
    )


@router.post(
    "/verify-otp",
    response_model=HelpAFriendVerifyResponse,
    status_code=status.HTTP_200_OK,
    summary="Step 2: Verify 6-digit OTP code provided by peer"
)
def verify_proxy(
    payload: HelpAFriendVerifyRequest,
    current_user: User = Depends(RequireRole(UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    if not student:
        raise HTTPException(status_code=400, detail="Active student profile required.")

    otp_record = proxy_service.verify_proxy_otp(
        db=db,
        proxy_student=student,
        beneficiary_roll_number=payload.beneficiary_roll_number,
        otp_code=payload.otp_code
    )

    return HelpAFriendVerifyResponse(
        status="VERIFIED",
        otp_verification_id=otp_record.id,
        message="OTP successfully verified. You may now lodge the complaint on behalf of your peer."
    )


@router.post(
    "/submit",
    response_model=ComplaintResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Step 3: Lodge complaint on behalf of peer using verified OTP token"
)
def submit_proxy(
    payload: HelpAFriendSubmitComplaint,
    current_user: User = Depends(RequireRole(UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    if not student:
        raise HTTPException(status_code=400, detail="Active student profile required.")

    return proxy_service.submit_proxy_complaint(
        db=db,
        proxy_student=student,
        otp_verification_id=payload.otp_verification_id,
        complaint_data=payload.complaint
    )
