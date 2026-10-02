import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class MaterialTargetCreate(BaseModel):
    branch: str
    batch_year: int
    semester: int
    section: Optional[str] = None
    subject: str


class MaterialTargetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    material_id: uuid.UUID
    branch: str
    batch_year: int
    semester: int
    section: Optional[str] = None
    subject: str


class StudyMaterialCreate(BaseModel):
    title: str
    description: Optional[str] = None
    file_url: str
    file_type: str
    targets: List[MaterialTargetCreate]


class StudyMaterialResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    teacher_id: uuid.UUID
    title: str
    description: Optional[str] = None
    file_url: str
    file_type: str
    created_at: datetime
    targets: List[MaterialTargetResponse] = []
