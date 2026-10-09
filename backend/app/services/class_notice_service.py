import uuid
import logging
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.user import User, Student, UserRole
from app.models.academic import ClassNotice, ClassNoticeType
from app.schemas.class_notice import ClassNoticeCreate
from app.utils.audit_logger import create_audit_log

logger = logging.getLogger(__name__)


def create_class_notice(
    db: Session,
    teacher: User,
    data: ClassNoticeCreate
) -> ClassNotice:
    """
    Teacher publishes an academic schedule adjustment or cancellation notice.
    """
    notice = ClassNotice(
        teacher_id=teacher.id,
        notice_type=data.notice_type,
        target_branch=data.target_branch,
        target_year=data.target_year,
        target_semester=data.target_semester,
        target_section=data.target_section,
        subject=data.subject,
        class_date=data.class_date,
        period=data.period,
        details=data.details
    )
    db.add(notice)
    db.flush()

    create_audit_log(
        db=db,
        actor_id=teacher.id,
        entity_type="CLASS_NOTICE",
        entity_id=notice.id,
        action="NOTICE_CREATED",
        new_state={
            "notice_type": data.notice_type.value,
            "target_branch": data.target_branch,
            "target_section": data.target_section,
            "subject": data.subject
        }
    )

    db.commit()
    db.refresh(notice)
    return notice


def get_class_notices(
    db: Session,
    user: User,
    branch: Optional[str] = None,
    section: Optional[str] = None
) -> List[ClassNotice]:
    """
    Retrieve class notices.
    If student, strictly filters to only notices matching the student's cohort.
    If teacher/admin, returns all or filtered by query parameters.
    """
    query = db.query(ClassNotice)

    if user.role == UserRole.STUDENT:
        student = db.query(Student).filter(Student.id == user.id).first()
        if not student:
            return []
        query = query.filter(
            (ClassNotice.target_branch.ilike(student.department)) | (ClassNotice.target_branch == "ALL"),
            (ClassNotice.target_semester == student.semester) | (ClassNotice.target_semester == 0),
            (ClassNotice.target_section.ilike(student.section)) | (ClassNotice.target_section == "ALL")
        )
    else:
        if branch and branch != "ALL":
            query = query.filter(ClassNotice.target_branch.ilike(branch))
        if section and section != "ALL":
            query = query.filter(ClassNotice.target_section.ilike(section))

    return query.order_by(ClassNotice.created_at.desc()).all()
