from typing import List, Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, RequireRole
from app.models.user import User, UserRole
from app.schemas.material import StudyMaterialCreate, StudyMaterialResponse
from app.services import material_service

router = APIRouter()


@router.post(
    "",
    response_model=StudyMaterialResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRole(UserRole.TEACHER, UserRole.ADMIN))]
)
def create_material(
    payload: StudyMaterialCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Teacher publishes study materials and assigns academic cohort targeting.
    """
    return material_service.create_study_material(
        db=db,
        teacher=current_user,
        data=payload
    )


@router.get(
    "",
    response_model=List[StudyMaterialResponse]
)
def get_materials(
    subject: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve study materials.
    Students only receive materials targeted to their department, batch year, and semester.
    """
    return material_service.get_study_materials(
        db=db,
        user=current_user,
        subject=subject
    )
