import os
import uuid
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.user import User, Student, UserRole
from app.models.document_request import (
    DocumentRequest, DocumentType, DocumentRequestStatus
)
from app.schemas.document import DocumentRequestCreate
from app.utils.audit_logger import create_audit_log
from app.utils.notifier import create_in_app_notification
from app.utils.pdf_generator import generate_certificate_pdf

logger = logging.getLogger(__name__)


def create_document_request(
    db: Session,
    student: Student,
    data: DocumentRequestCreate
) -> DocumentRequest:
    """
    Student requests an official institutional certificate.
    Validates institutional dues clearance before processing.
    """
    # Automated eligibility verification rule
    if not student.dues_cleared:
        logger.warning(f"Ineligible certificate request by student {student.roll_number}: dues not cleared")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Outstanding institutional dues pending clearance. You are ineligible to request certificates until accounts are settled."
        )

    req_num = f"DOC-{datetime.now().year}-{uuid.uuid4().hex[:6].upper()}"

    doc_req = DocumentRequest(
        request_number=req_num,
        student_id=student.id,
        document_type=data.document_type,
        purpose=data.purpose,
        status=DocumentRequestStatus.SUBMITTED
    )
    db.add(doc_req)
    db.flush()

    create_audit_log(
        db=db,
        actor_id=student.id,
        entity_type="DOCUMENT_REQUEST",
        entity_id=doc_req.id,
        action="REQUEST",
        new_state={"request_number": req_num, "document_type": data.document_type.value}
    )

    create_in_app_notification(
        db=db,
        user_id=student.id,
        title="Certificate Request Submitted",
        message=f"Request {req_num} for {data.document_type.value} certificate has been submitted for review.",
        notification_type="DOCUMENT_REQUESTED",
        entity_id=doc_req.id
    )

    db.commit()
    db.refresh(doc_req)
    return doc_req


def get_document_requests(
    db: Session,
    user: User,
    status_filter: Optional[DocumentRequestStatus] = None
) -> List[DocumentRequest]:
    """Retrieve certificate requests filtered by user role."""
    query = db.query(DocumentRequest)

    if user.role == UserRole.STUDENT:
        query = query.filter(DocumentRequest.student_id == user.id)

    if status_filter:
        query = query.filter(DocumentRequest.status == status_filter)

    return query.order_by(DocumentRequest.created_at.desc()).all()


def get_document_request_by_id(db: Session, request_id: uuid.UUID) -> DocumentRequest:
    """Find document request or raise HTTP 404."""
    doc_req = db.query(DocumentRequest).filter(DocumentRequest.id == request_id).first()
    if not doc_req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document request with ID {request_id} not found"
        )
    return doc_req


def approve_and_generate_document(
    db: Session,
    request_id: uuid.UUID,
    admin: User
) -> DocumentRequest:
    """
    Admin approves certificate request.
    Triggers ReportLab PDF generation with embedded Segno verification QR code.
    """
    doc_req = get_document_request_by_id(db, request_id)
    student = doc_req.student

    # Re-verify dues clearance prior to generation
    if not student.dues_cleared:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student has outstanding institutional dues. Cannot generate authorized certificate."
        )

    # Cryptographic SHA-256 verification hash
    raw_hash_input = f"{student.roll_number}:{doc_req.document_type.value}:{datetime.now(timezone.utc).isoformat()}:{settings.JWT_SECRET}"
    verification_hash = hashlib.sha256(raw_hash_input.encode("utf-8")).hexdigest()

    # Destination PDF file path inside local uploads
    filename = f"{verification_hash[:16]}_{doc_req.document_type.value.lower()}.pdf"
    pdf_rel_path = f"{settings.UPLOAD_DIR}/documents/{filename}"
    pdf_full_path = os.path.abspath(pdf_rel_path)

    # Generate PDF with ReportLab and embedded Segno QR
    student_full_name = f"{student.user.first_name} {student.user.last_name}"
    generate_certificate_pdf(
        student_name=student_full_name,
        roll_number=student.roll_number,
        department=student.department,
        doc_type=doc_req.document_type.value,
        purpose=doc_req.purpose,
        verification_hash=verification_hash,
        output_path=pdf_full_path
    )

    doc_req.status = DocumentRequestStatus.APPROVED
    doc_req.approved_by = admin.id
    doc_req.verification_hash = verification_hash
    doc_req.document_url = f"/uploads/documents/{filename}"

    create_audit_log(
        db=db,
        actor_id=admin.id,
        entity_type="DOCUMENT_REQUEST",
        entity_id=doc_req.id,
        action="APPROVE_AND_GENERATE",
        new_state={"status": "APPROVED", "verification_hash": verification_hash, "document_url": doc_req.document_url}
    )

    create_in_app_notification(
        db=db,
        user_id=student.id,
        title="Certificate Ready for Download",
        message=f"Your {doc_req.document_type.value} certificate has been generated and digitally verified.",
        notification_type="DOCUMENT_READY",
        entity_id=doc_req.id
    )

    db.commit()
    db.refresh(doc_req)
    return doc_req


def reject_document_request(
    db: Session,
    request_id: uuid.UUID,
    admin: User,
    rejection_reason: str
) -> DocumentRequest:
    """Admin rejects certificate request with explanation."""
    doc_req = get_document_request_by_id(db, request_id)

    doc_req.status = DocumentRequestStatus.REJECTED
    doc_req.approved_by = admin.id
    doc_req.rejection_reason = rejection_reason

    create_audit_log(
        db=db,
        actor_id=admin.id,
        entity_type="DOCUMENT_REQUEST",
        entity_id=doc_req.id,
        action="REJECT",
        new_state={"status": "REJECTED", "rejection_reason": rejection_reason}
    )

    create_in_app_notification(
        db=db,
        user_id=doc_req.student_id,
        title="Certificate Request Rejected",
        message=f"Your certificate request {doc_req.request_number} was rejected: {rejection_reason}",
        notification_type="DOCUMENT_REJECTED",
        entity_id=doc_req.id
    )

    db.commit()
    db.refresh(doc_req)
    return doc_req
