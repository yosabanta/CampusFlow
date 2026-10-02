import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, status, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, RequireRole
from app.models.user import User, UserRole
from app.models.document_request import DocumentRequestStatus
from app.schemas.document import (
    DocumentRequestCreate, DocumentRequestResponse, DocumentDecisionRequest
)
from app.services import document_service

router = APIRouter()


@router.post(
    "",
    response_model=DocumentRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit student certificate request"
)
def request_document(
    payload: DocumentRequestCreate,
    current_user: User = Depends(RequireRole(UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    if not student:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account lacks an active student profile."
        )
    return document_service.create_document_request(db=db, student=student, data=payload)


@router.get(
    "",
    response_model=List[DocumentRequestResponse],
    summary="List document requests based on user role"
)
def list_document_requests(
    status_filter: Optional[DocumentRequestStatus] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return document_service.get_document_requests(db=db, user=current_user, status_filter=status_filter)


@router.get(
    "/{id}",
    response_model=DocumentRequestResponse,
    summary="Retrieve certificate request details"
)
def get_document_request(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc_req = document_service.get_document_request_by_id(db=db, request_id=id)
    if current_user.role == UserRole.STUDENT and doc_req.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Unauthorized to view this certificate request.")
    return doc_req


@router.patch(
    "/{id}/approve",
    response_model=DocumentRequestResponse,
    summary="Admin approves request and generates ReportLab certificate PDF with Segno QR"
)
def approve_document(
    id: uuid.UUID,
    current_user: User = Depends(RequireRole(UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    return document_service.approve_and_generate_document(
        db=db,
        request_id=id,
        admin=current_user
    )


@router.patch(
    "/{id}/reject",
    response_model=DocumentRequestResponse,
    summary="Admin rejects certificate request"
)
def reject_document(
    id: uuid.UUID,
    payload: DocumentDecisionRequest,
    current_user: User = Depends(RequireRole(UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    reason = payload.rejection_reason or "Document issuance request rejected by registrar."
    return document_service.reject_document_request(
        db=db,
        request_id=id,
        admin=current_user,
        rejection_reason=reason
    )


@router.get(
    "/{id}/download",
    summary="Download generated institutional PDF certificate"
)
def download_document(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc_req = document_service.get_document_request_by_id(db=db, request_id=id)

    if current_user.role == UserRole.STUDENT and doc_req.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Unauthorized to download this document.")

    if not doc_req.document_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document has not yet been generated or authorized."
        )

    # Relative to project directory
    clean_path = doc_req.document_url.lstrip("/")
    file_path = os.path.abspath(clean_path)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Certificate PDF file not found on disk.")

    return FileResponse(
        file_path,
        media_type="application/pdf",
        filename=os.path.basename(file_path)
    )
