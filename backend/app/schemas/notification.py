import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    message: str
    type: str
    entity_id: Optional[uuid.UUID] = None
    is_read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    unread_count: int
    notifications: List[NotificationResponse]
