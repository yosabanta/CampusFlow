import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict


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
