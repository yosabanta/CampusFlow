import logging
import uuid
from typing import Optional
from sqlalchemy.orm import Session
from app.models.notification import InAppNotification, SMSNotification

logger = logging.getLogger(__name__)


def create_in_app_notification(
    db: Session,
    user_id: uuid.UUID,
    title: str,
    message: str,
    notification_type: str,
    entity_id: Optional[uuid.UUID] = None
) -> InAppNotification:
    """
    Persist an unread in-app notification for a user.
    """
    notification = InAppNotification(
        user_id=user_id,
        title=title,
        message=message,
        type=notification_type,
        entity_id=entity_id,
        is_read=False
    )
    db.add(notification)
    db.flush()
    logger.info(f"In-App Notification: '{title}' created for user:{user_id}")
    return notification


def send_mock_sms(
    db: Session,
    phone_number: str,
    message: str,
    trigger_event: str,
    student_id: Optional[uuid.UUID] = None
) -> SMSNotification:
    """
    Prototype SMS abstraction.
    Logs message to console/logs and persists a record in sms_notifications.
    """
    sms = SMSNotification(
        recipient_phone=phone_number,
        student_id=student_id,
        message_body=message,
        trigger_event=trigger_event,
        status="SENT"
    )
    db.add(sms)
    db.flush()
    logger.info(f"[SMS DISPATCH] To: {phone_number} | Event: {trigger_event} | Msg: {message}")
    return sms
