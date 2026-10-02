import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.models.academic import ClassNoticeType


class ClassNoticeCreate(BaseModel):
    notice_type: ClassNoticeType
    target_branch: str
    target_year: int
    target_semester: int
    target_section: str
    subject: str
    class_date: datetime
    period: str
    details: str


class ClassNoticeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    teacher_id: uuid.UUID
    notice_type: ClassNoticeType
    target_branch: str
    target_year: int
    target_semester: int
    target_section: str
    subject: str
    class_date: datetime
    period: str
    details: str
    created_at: datetime
