import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, RequireRole
from app.models.user import User, UserRole
from app.models.academic import AttendanceSession
from app.schemas.attendance import (
    AttendanceSessionCreate,
    AttendanceSessionResponse,
    AttendanceRecordCreate,
    AttendanceRecordResponse,
    StudentAttendanceSummary,
    StudentRosterItem
)
from app.services import attendance_service

router = APIRouter()


@router.get(
    "/sessions",
    response_model=List[AttendanceSessionResponse],
    dependencies=[Depends(RequireRole(UserRole.TEACHER, UserRole.ADMIN))]
)
def list_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve attendance sessions conducted by the current teacher (or all for admin).
    """
    return attendance_service.get_teacher_sessions(db=db, teacher=current_user)


@router.get(
    "/roster",
    response_model=List[StudentRosterItem],
    dependencies=[Depends(RequireRole(UserRole.TEACHER, UserRole.ADMIN))]
)
def get_cohort_roster(
    branch: Optional[str] = None,
    batch_year: Optional[int] = None,
    section: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Retrieve real cohort student roster from the database for roll-call attendance.
    """
    return attendance_service.get_cohort_roster(
        db=db,
        branch=branch,
        batch_year=batch_year,
        section=section
    )



@router.post(
    "/sessions",
    response_model=AttendanceSessionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRole(UserRole.TEACHER, UserRole.ADMIN))]
)
def create_session(
    payload: AttendanceSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Teacher creates an attendance session for a lecture.
    """
    return attendance_service.create_attendance_session(
        db=db,
        teacher=current_user,
        data=payload
    )


@router.post(
    "/sessions/{session_id}/records",
    response_model=List[AttendanceRecordResponse],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRole(UserRole.TEACHER, UserRole.ADMIN))]
)
def record_attendance(
    session_id: uuid.UUID,
    payload: List[AttendanceRecordCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Teacher records student attendance for a session.
    Duplicate submissions for the same student are strictly rejected with 409 Conflict.
    """
    return attendance_service.record_session_attendance(
        db=db,
        session_id=session_id,
        teacher=current_user,
        records=payload
    )


@router.get(
    "/sessions/{session_id}",
    response_model=AttendanceSessionResponse,
    dependencies=[Depends(RequireRole(UserRole.TEACHER, UserRole.ADMIN))]
)
def get_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    """
    Get attendance session details and its recorded attendance entries.
    """
    session = db.query(AttendanceSession).filter(AttendanceSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attendance session not found."
        )
    return session


@router.get(
    "/my-attendance",
    response_model=StudentAttendanceSummary
)
@router.get(
    "/summary",
    response_model=StudentAttendanceSummary
)
def get_my_attendance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Authenticated student views their personal attendance summary and percentage.
    """
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only students have personal student attendance profiles."
        )

    return attendance_service.get_student_attendance_summary(
        db=db,
        student_id=current_user.id
    )


@router.get(
    "/student/{student_id}",
    response_model=StudentAttendanceSummary
)
def get_student_attendance(
    student_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve attendance for a specific student.
    Students cannot retrieve other students' attendance (403 Forbidden).
    """
    if current_user.role == UserRole.STUDENT and current_user.id != student_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You cannot view another student's attendance records."
        )

    return attendance_service.get_student_attendance_summary(
        db=db,
        student_id=student_id
    )
