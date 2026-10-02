import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_password, create_access_token
from app.core.dependencies import get_current_user
from app.models.user import User, Student
from app.schemas.auth import LoginRequest, TokenResponse, UserResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate user and issue JWT access token",
    status_code=status.HTTP_200_OK
)
def login(
    credentials: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    Authenticate against institutional credentials.
    Supports email address, phone number, or student roll number as username.
    Returns Bearer JWT with sub, role, and email claims.
    """
    identifier = credentials.username.strip()

    # Look up by email or phone number
    user = db.query(User).filter(
        (User.email == identifier) | (User.phone_number == identifier)
    ).first()

    # Fallback: Look up by student roll number if not found
    if not user:
        student = db.query(Student).filter(Student.roll_number == identifier).first()
        if student:
            user = student.user

    # Generic credential rejection without leaking user existence
    if not user or not verify_password(credentials.password, user.password_hash):
        logger.warning(f"Failed login attempt for identifier: {identifier}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"}
        )

    if not user.is_active:
        logger.warning(f"Login attempted on inactive account: {identifier}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is inactive. Please contact your campus administrator.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # Generate JWT with approved claims: sub, role, email
    token_claims = {
        "sub": str(user.id),
        "role": user.role.value,
        "email": user.email
    }
    access_token = create_access_token(data=token_claims)

    logger.info(f"Successful login for user {user.email} (Role: {user.role.value})")

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Retrieve authenticated user profile",
    status_code=status.HTTP_200_OK
)
def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    """
    Returns the sanitized identity profile of the currently authenticated user.
    Password hash and credentials are never exposed.
    """
    return UserResponse.model_validate(current_user)
