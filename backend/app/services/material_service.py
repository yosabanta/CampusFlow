import uuid
import logging
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.user import User, Student, UserRole
from app.models.material import StudyMaterial, StudyMaterialTarget
from app.schemas.material import StudyMaterialCreate
from app.utils.audit_logger import create_audit_log

logger = logging.getLogger(__name__)


def create_study_material(
    db: Session,
    teacher: User,
    data: StudyMaterialCreate
) -> StudyMaterial:
    """
    Teacher uploads course material and specifies cohort targeting rules.
    """
    material = StudyMaterial(
        teacher_id=teacher.id,
        title=data.title,
        description=data.description,
        file_url=data.file_url,
        file_type=data.file_type
    )
    db.add(material)
    db.flush()

    for t in data.targets:
        target = StudyMaterialTarget(
            material_id=material.id,
            branch=t.branch,
            batch_year=t.batch_year,
            semester=t.semester,
            section=t.section,
            subject=t.subject
        )
        db.add(target)
    db.flush()

    create_audit_log(
        db=db,
        actor_id=teacher.id,
        entity_type="STUDY_MATERIAL",
        entity_id=material.id,
        action="MATERIAL_PUBLISHED",
        new_state={
            "title": data.title,
            "targets_count": len(data.targets),
            "file_type": data.file_type
        }
    )

    db.commit()
    db.refresh(material)
    return material


def get_study_materials(
    db: Session,
    user: User,
    subject: Optional[str] = None
) -> List[StudyMaterial]:
    """
    Retrieve study materials.
    If student, filters to materials targeted to the student's cohort.
    If teacher/admin, returns all or filtered by subject.
    """
    if user.role == UserRole.STUDENT:
        student = db.query(Student).filter(Student.id == user.id).first()
        if not student:
            return []

        # Find materials where at least one target matches student cohort
        query = db.query(StudyMaterial).join(StudyMaterial.targets).filter(
            StudyMaterialTarget.branch.ilike(student.department),
            StudyMaterialTarget.batch_year == student.batch_year,
            StudyMaterialTarget.semester == student.semester
        )
        if subject:
            query = query.filter(StudyMaterialTarget.subject.ilike(f"%{subject}%"))

        return query.distinct().order_by(StudyMaterial.created_at.desc()).all()

    query = db.query(StudyMaterial)
    if subject:
        query = query.join(StudyMaterial.targets).filter(StudyMaterialTarget.subject.ilike(f"%{subject}%")).distinct()

    return query.order_by(StudyMaterial.created_at.desc()).all()
