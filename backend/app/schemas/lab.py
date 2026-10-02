import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from app.models.lab import EquipmentWorkingStatus, LabRequisitionStatus


# Equipment Schemas
class LabEquipmentCreate(BaseModel):
    equipment_id: str
    name: str
    category: str
    lab_name: str
    total_quantity: int = 1
    available_quantity: int = 1
    damaged_quantity: int = 0
    working_status: EquipmentWorkingStatus = EquipmentWorkingStatus.FUNCTIONAL
    maintenance_status: Optional[str] = None


class LabEquipmentUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    lab_name: Optional[str] = None
    total_quantity: Optional[int] = None
    available_quantity: Optional[int] = None
    damaged_quantity: Optional[int] = None
    working_status: Optional[EquipmentWorkingStatus] = None
    maintenance_status: Optional[str] = None


class LabEquipmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    equipment_id: str
    name: str
    category: str
    lab_name: str
    total_quantity: int
    available_quantity: int
    damaged_quantity: int
    working_status: EquipmentWorkingStatus
    maintenance_status: Optional[str] = None
    last_updated: datetime


# Requisition Schemas
class LabRequisitionItemCreate(BaseModel):
    item_name: str
    specifications: Optional[str] = None
    quantity: int
    unit: str = "units"
    justification: Optional[str] = None


class LabRequisitionItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    requisition_id: uuid.UUID
    item_name: str
    specifications: Optional[str] = None
    quantity: int
    unit: str
    justification: Optional[str] = None


class LabRequisitionCreate(BaseModel):
    lab_name: str
    items: Optional[List[LabRequisitionItemCreate]] = None


class LabRequisitionReviewRequest(BaseModel):
    status: LabRequisitionStatus  # APPROVED or REJECTED
    rejection_reason: Optional[str] = None


class LabRequisitionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    requisition_number: str
    assistant_id: uuid.UUID
    lab_name: str
    status: LabRequisitionStatus
    approved_by: Optional[uuid.UUID] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    items: List[LabRequisitionItemResponse] = []
