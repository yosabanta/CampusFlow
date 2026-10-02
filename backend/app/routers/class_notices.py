from typing import List, Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, RequireRole
from app.models.user import User, UserRole
from app.schemas.class_notice import ClassNoticeCreate, ClassNoticeResponse
from app.services import class_notice_service

router = APIRouter()


@router.post(
    "",
    response_model=ClassNoticeResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRole(UserRole.TEACHER, UserRole.ADMIN))]
)
def create_notice(
    payload: ClassNoticeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Teacher publishes an academic notice (cancellation, room switch, faculty change, etc.).
    """
    return class_notice_service.create_class_notice(
        db=db,
        teacher=current_user,
        data=payload
    )


@router.get(
    "",
    response_model=List[ClassNoticeResponse]
)
def get_notices(
    branch: Optional[str] = None,
    section: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve applicable academic notices.
    If authenticated as a student, results are automatically scoped to that student's cohort.
    """
    return class_notice_service.get_class_notices(
        db=db,
        user=current_user,
        branch=branch,
        section=section
    )
