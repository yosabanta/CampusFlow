import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict
from app.models.user import UserRole


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    action: str
    actor_id: Optional[uuid.UUID] = None
    previous_state: Optional[Dict[str, Any]] = None
    new_state: Optional[Dict[str, Any]] = None
    timestamp: datetime


class ControlTowerMetrics(BaseModel):
    total_complaints: int
    complaints_by_status: Dict[str, int]
    sla_breaches_count: int
    recurring_hotspots_count: int
    gate_passes_by_status: Dict[str, int]
    document_requests_by_status: Dict[str, int]
    total_audit_events: int
    staff_workload: Dict[str, int]


class StaffSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    full_name: Optional[str] = None
    email: str
    phone_number: str
    phone: Optional[str] = None
    role: str
    department: Optional[str] = None
    designation: Optional[str] = None


class StudentSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    full_name: Optional[str] = None
    roll_number: str
    college_roll_number: Optional[str] = None
    university_reg_number: Optional[str] = None
    accommodation_type: str = "DAY_SCHOLAR"
    email: str
    phone_number: str
    phone: Optional[str] = None
    department: str
    batch_year: int
    semester: int
    section: str
    room_number: Optional[str] = None
    hostel_block: Optional[str] = None
    hostel_id: Optional[uuid.UUID] = None
    hostel_name: Optional[str] = None


class HostelCreateRequest(BaseModel):
    name: str
    code: str
    total_rooms: int = 100
    warden_id: Optional[uuid.UUID] = None


class HostelResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    code: str
    total_rooms: int
    occupied_rooms: int
    available_rooms: int
    warden_id: Optional[uuid.UUID] = None
    warden_name: Optional[str] = None


class AdminUserCreateRequest(BaseModel):
    email: str
    phone_number: str
    password: str
    role: UserRole
    first_name: str
    last_name: str
    # Staff attributes
    department: Optional[str] = None
    designation: Optional[str] = None
    # Student attributes
    roll_number: Optional[str] = None
    college_roll_number: Optional[str] = None
    university_reg_number: Optional[str] = None
    accommodation_type: Optional[str] = "DAY_SCHOLAR"
    batch_year: Optional[int] = None
    semester: Optional[int] = None
    section: Optional[str] = None
    room_number: Optional[str] = None
    hostel_block: Optional[str] = None
    hostel_id: Optional[uuid.UUID] = None
