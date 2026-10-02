import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.notification import InAppNotification
from app.models.user import User
from app.schemas.notification import NotificationListResponse, NotificationResponse

router = APIRouter()


@router.get(
    "",
    response_model=NotificationListResponse,
    summary="List in-app notifications with unread badge count for authenticated user"
)
def get_user_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieve transactional notifications for the active user session.
    Returns array sorted descending by creation time and aggregate unread count.
    """
    notifications = (
        db.query(InAppNotification)
        .filter(InAppNotification.user_id == current_user.id)
        .order_by(InAppNotification.created_at.desc())
        .all()
    )
    unread_count = sum(1 for n in notifications if not n.is_read)
    return NotificationListResponse(
        unread_count=unread_count,
        notifications=[NotificationResponse.model_validate(n) for n in notifications]
    )


@router.patch(
    "/{id}/read",
    response_model=NotificationResponse,
    summary="Mark an in-app notification as read"
)
def mark_notification_as_read(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update notification read flag for badge count synchronization.
    Enforces user boundary (users can only mark their own notifications).
    """
    notif = (
        db.query(InAppNotification)
        .filter(InAppNotification.id == id, InAppNotification.user_id == current_user.id)
        .first()
    )
    if not notif:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found."
        )

    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return NotificationResponse.model_validate(notif)
