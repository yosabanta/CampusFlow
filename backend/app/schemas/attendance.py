import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from app.models.academic import AttendanceStatus


class AttendanceRecordCreate(BaseModel):
    student_id: uuid.UUID
    status: AttendanceStatus = AttendanceStatus.PRESENT


class AttendanceRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    student_id: uuid.UUID
    status: AttendanceStatus
    created_at: datetime


class AttendanceSessionCreate(BaseModel):
    subject: str
    branch: str
    batch_year: int
    section: str
    session_date: Optional[datetime] = None


class AttendanceSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    teacher_id: uuid.UUID
    subject: str
    branch: str
    batch_year: int
    section: str
    session_date: datetime
    created_at: datetime
    records: Optional[List[AttendanceRecordResponse]] = None


class StudentAttendanceSummary(BaseModel):
    student_id: uuid.UUID
    total_sessions: int
    present_count: int
    absent_count: int
    late_count: int
    attendance_percentage: float
    records: List[AttendanceRecordResponse]
