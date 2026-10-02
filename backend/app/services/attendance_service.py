import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.models.user import User, Student
from app.models.academic import AttendanceSession, AttendanceRecord, AttendanceStatus
from app.schemas.attendance import (
    AttendanceSessionCreate,
    AttendanceRecordCreate,
    StudentAttendanceSummary
)
from app.utils.audit_logger import create_audit_log

logger = logging.getLogger(__name__)


def create_attendance_session(
    db: Session,
    teacher: User,
    data: AttendanceSessionCreate
) -> AttendanceSession:
    """
    Teacher creates an attendance session for a class period.
    """
    session_dt = data.session_date or datetime.now(timezone.utc)

    session = AttendanceSession(
        teacher_id=teacher.id,
        subject=data.subject,
        branch=data.branch,
        batch_year=data.batch_year,
        section=data.section,
        session_date=session_dt
    )
    db.add(session)
    db.flush()

    create_audit_log(
        db=db,
        actor_id=teacher.id,
        entity_type="ATTENDANCE_SESSION",
        entity_id=session.id,
        action="SESSION_CREATED",
        new_state={
            "subject": data.subject,
            "branch": data.branch,
            "batch_year": data.batch_year,
            "section": data.section
        }
    )

    db.commit()
    db.refresh(session)
    return session


def record_session_attendance(
    db: Session,
    session_id: uuid.UUID,
    teacher: User,
    records: List[AttendanceRecordCreate]
) -> List[AttendanceRecord]:
    """
    Teacher marks attendance records for students in a session.
    Enforces duplicate prevention per (session_id, student_id) constraint.
    """
    session = db.query(AttendanceSession).filter(AttendanceSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance session {session_id} not found."
        )

    # Check for existing records to prevent duplicates
    student_ids = [r.student_id for r in records]
    existing = db.query(AttendanceRecord).filter(
        AttendanceRecord.session_id == session_id,
        AttendanceRecord.student_id.in_(student_ids)
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Attendance has already been recorded for student {existing.student_id} in this session."
        )

    created_records = []
    for r in records:
        # Validate student exists
        student = db.query(Student).filter(Student.id == r.student_id).first()
        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Student {r.student_id} not found."
            )

        rec = AttendanceRecord(
            session_id=session_id,
            student_id=r.student_id,
            status=r.status
        )
        db.add(rec)
        created_records.append(rec)

    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Duplicate attendance record detected for this session."
        )

    create_audit_log(
        db=db,
        actor_id=teacher.id,
        entity_type="ATTENDANCE_SESSION",
        entity_id=session.id,
        action="ATTENDANCE_RECORDED",
        new_state={"session_id": str(session_id), "records_count": len(created_records)}
    )

    db.commit()
    for rec in created_records:
        db.refresh(rec)
    return created_records


def get_student_attendance_summary(
    db: Session,
    student_id: uuid.UUID
) -> StudentAttendanceSummary:
    """
    Calculate attendance summary and percentage for a student.
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student profile not found."
        )

    records = db.query(AttendanceRecord).filter(
        AttendanceRecord.student_id == student_id
    ).order_by(AttendanceRecord.created_at.desc()).all()

    total = len(records)
    present_cnt = sum(1 for r in records if r.status == AttendanceStatus.PRESENT)
    absent_cnt = sum(1 for r in records if r.status == AttendanceStatus.ABSENT)
    late_cnt = sum(1 for r in records if r.status == AttendanceStatus.LATE)

    # Standard percentage calculation: (PRESENT + LATE) / total * 100 or PRESENT / total * 100
    percentage = round(((present_cnt + late_cnt) / total) * 100.0, 2) if total > 0 else 100.0

    return StudentAttendanceSummary(
        student_id=student_id,
        total_sessions=total,
        present_count=present_cnt,
        absent_count=absent_cnt,
        late_count=late_cnt,
        attendance_percentage=percentage,
        records=records
    )
