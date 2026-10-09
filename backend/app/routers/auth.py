import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.core.security import verify_password, create_access_token
from app.core.dependencies import get_current_user
from app.models.user import User, Student, UserRole
from app.models.audit import AuditLog
from app.schemas.auth import (
    LoginRequest, TokenResponse, UserResponse, StudentRegisterRequest,
    DemoLoginRequest, DemoAccountItem
)

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

    # Fallback: Look up by student roll number or university registration number if not found
    if not user:
        student = db.query(Student).filter(
            (Student.roll_number == identifier) | (Student.university_reg_number == identifier)
        ).first()
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


@router.get(
    "/hostels",
    summary="List campus hostel facilities for student enrollment dropdown",
    status_code=status.HTTP_200_OK
)
def list_registration_hostels(
    db: Session = Depends(get_db)
):
    """Public lookup endpoint for active hostel facilities during student registration."""
    from app.models.hostel import Hostel
    hostels = db.query(Hostel).all()
    results = []
    for h in hostels:
        occupied = db.query(Student).filter(Student.hostel_id == h.id).count()
        results.append({
            "id": str(h.id),
            "name": h.name,
            "code": h.code,
            "total_rooms": h.total_rooms,
            "available_rooms": max(0, h.total_rooms - occupied)
        })
    return results


@router.post(
    "/register",
    response_model=TokenResponse,
    summary="Register a new student account",
    status_code=status.HTTP_201_CREATED
)
def register_student(
    payload: StudentRegisterRequest,
    db: Session = Depends(get_db)
):
    """
    Self-service registration for enrolled students.
    Enforces required full name, email, mobile, password, college roll number,
    university registration number, and accommodation category (Hosteler vs Day Scholar).
    """
    from app.core.security import hash_password
    from app.models.user import UserRole
    from app.models.audit import AuditLog
    from app.models.hostel import Hostel
    import uuid

    # 1. Validate full name
    full_name_val = (payload.full_name or "").strip()
    if not full_name_val and payload.first_name:
        full_name_val = f"{payload.first_name} {payload.last_name or ''}".strip()
    if not full_name_val:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Full name is required."
        )
    parts = full_name_val.split(" ", 1)
    first_name = parts[0]
    last_name = parts[1] if len(parts) > 1 else ""

    # 2. Validate email
    clean_email = payload.email.strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A valid institutional email address is required."
        )

    # 3. Validate mobile number
    phone_val = payload.phone_number or payload.phone or ""
    clean_phone = phone_val.strip()
    if not clean_phone or len(clean_phone) < 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A valid mobile number (10-15 digits) is required."
        )

    # 4. Validate password and confirm password
    if len(payload.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters long."
        )
    if payload.confirm_password is not None and payload.password != payload.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Passwords do not match."
        )

    # 5. Validate College Roll Number
    roll_val = payload.college_roll_number or payload.roll_number or ""
    clean_roll = roll_val.strip().upper()
    if not clean_roll:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="College roll number is required."
        )

    # 6. Validate University Registration Number
    uni_reg_val = payload.university_reg_number or ""
    clean_uni_reg = uni_reg_val.strip().upper()
    if not clean_uni_reg:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="University registration number is required."
        )

    # 7. Validate Accommodation Type (Hosteler vs Day Scholar)
    acc_raw = (payload.accommodation_type or "").strip()
    if not acc_raw:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Accommodation type (Hosteler or Day Scholar) is required."
        )
    acc_upper = acc_raw.upper()
    if "DAY" in acc_upper:
        acc_type = "DAY_SCHOLAR"
    elif "HOSTEL" in acc_upper:
        acc_type = "HOSTELER"
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid accommodation type. Must be either 'Hosteler' or 'Day Scholar'."
        )

    # 8. Accommodation Type Specific Validation & Hostel Details Enforcement
    if acc_type == "DAY_SCHOLAR":
        # Day Scholar cannot have hostel details assigned (reject direct API attempts)
        has_hostel_info = bool(
            payload.hostel_id or
            (payload.hostel_name and payload.hostel_name.strip()) or
            (payload.hostel_block and payload.hostel_block.strip()) or
            (payload.room_number and payload.room_number.strip())
        )
        if has_hostel_info:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Hostel details (hostel, block, room) cannot be assigned to Day Scholar students."
            )
        final_hostel_id = None
        final_hostel_block = None
        final_room_number = None
    else:  # HOSTELER
        final_hostel_id = payload.hostel_id
        if not final_hostel_id and payload.hostel_name and payload.hostel_name.strip():
            h_match = db.query(Hostel).filter(
                (Hostel.name.ilike(f"%{payload.hostel_name.strip()}%")) |
                (Hostel.code.ilike(f"%{payload.hostel_name.strip()}%"))
            ).first()
            if h_match:
                final_hostel_id = h_match.id
            else:
                db_hostel_count = db.query(Hostel).count()
                if db_hostel_count > 0:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Hostel facility '{payload.hostel_name}' does not exist in the database."
                    )
        elif final_hostel_id:
            h_match = db.query(Hostel).filter(Hostel.id == final_hostel_id).first()
            if not h_match:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Selected hostel ID does not exist in institutional database records."
                )

        final_hostel_block = payload.hostel_block.strip() if payload.hostel_block else None
        final_room_number = payload.room_number.strip() if payload.room_number else None

    # 9. Enforce Uniqueness Constraints
    existing_email = db.query(User).filter(User.email == clean_email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A user with email '{clean_email}' already exists."
        )

    existing_phone = db.query(User).filter(User.phone_number == clean_phone).first()
    if existing_phone:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A user with phone number '{clean_phone}' already exists."
        )

    existing_roll = db.query(Student).filter(Student.roll_number == clean_roll).first()
    if existing_roll:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A student with college roll number '{clean_roll}' is already registered."
        )

    existing_uni_reg = db.query(Student).filter(Student.university_reg_number == clean_uni_reg).first()
    if existing_uni_reg:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A student with university registration number '{clean_uni_reg}' is already registered."
        )

    # 10. Persist User and Student Records
    user = User(
        id=uuid.uuid4(),
        email=clean_email,
        phone_number=clean_phone,
        password_hash=hash_password(payload.password),
        role=UserRole.STUDENT,
        first_name=first_name.strip(),
        last_name=last_name.strip(),
        theme_preference="light",
        is_active=True
    )
    db.add(user)
    db.flush()

    student_profile = Student(
        id=user.id,
        roll_number=clean_roll,
        university_reg_number=clean_uni_reg,
        accommodation_type=acc_type,
        department=(payload.department or "Computer Science & Engineering").strip(),
        batch_year=payload.batch_year or 2026,
        semester=payload.semester or 1,
        section=(payload.section or "A").strip().upper(),
        hostel_id=final_hostel_id,
        hostel_block=final_hostel_block,
        room_number=final_room_number,
        dues_cleared=True,
        has_smartphone=True,
        parent_phone=payload.parent_phone.strip() if payload.parent_phone else None
    )
    db.add(student_profile)
    db.flush()

    # Log registration in append-only audit trail
    audit_entry = AuditLog(
        actor_id=user.id,
        entity_type="USER",
        entity_id=user.id,
        action="STUDENT_REGISTRATION",
        new_state={
            "email": clean_email,
            "roll_number": clean_roll,
            "university_reg_number": clean_uni_reg,
            "accommodation_type": acc_type,
            "role": "STUDENT"
        }
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(user)

    token_claims = {
        "sub": str(user.id),
        "role": user.role.value,
        "email": user.email
    }
    access_token = create_access_token(data=token_claims)

    logger.info(f"New student registered: {clean_email} (Roll: {clean_roll}, Uni Reg: {clean_uni_reg}, Type: {acc_type})")

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )


@router.get(
    "/demo-accounts",
    response_model=List[DemoAccountItem],
    summary="List available demo roles and authorized accounts (non-production only)",
    status_code=status.HTTP_200_OK
)
def get_demo_accounts(
    db: Session = Depends(get_db)
):
    """
    Returns available role accounts for quick one-tap demonstration.
    Strictly disabled and returns an empty list in production environments.
    Only queries existing, real accounts in the database; never creates or fabricates fake accounts.
    """
    if not settings.is_quick_demo_login_allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Quick demo login is disabled in this environment."
        )

    role_order = [
        (UserRole.STUDENT, "Student", "Lodge issues, gate pass, certificates"),
        (UserRole.WARDEN, "Hostel Warden", "Review & approve gate passes, discipline"),
        (UserRole.HOSTEL_FACULTY, "Hostel Authority", "Gate pass records & student welfare"),
        (UserRole.TEACHER, "Faculty / Teacher", "Class notices & digital attendance"),
        (UserRole.LAB_ASSISTANT, "Lab Assistant", "Machinery status & requisitions"),
        (UserRole.STAFF, "Maintenance Staff", "Assigned work orders & repairs"),
        (UserRole.GUARD, "Security Guard", "Perimeter QR code gate scanner"),
        (UserRole.ADMIN, "Administrator", "Control tower, SLAs, audit ledger")
    ]

    accounts: List[DemoAccountItem] = []
    for role_enum, label, subtext in role_order:
        user = db.query(User).filter(User.role == role_enum, User.is_active == True).first()
        if user:
            name = f"{user.first_name} {user.last_name}".strip() or user.role.value
            accounts.append(DemoAccountItem(
                role=role_enum,
                role_label=label,
                display_name=name,
                username=user.email,
                subtext=subtext
            ))

    return accounts


@router.post(
    "/demo-login",
    response_model=TokenResponse,
    summary="One-tap quick login for authorized demo role (non-production only)",
    status_code=status.HTTP_200_OK
)
def demo_login(
    payload: DemoLoginRequest,
    db: Session = Depends(get_db)
):
    """
    Authenticates an existing, authorized user for a requested role in non-production environments.
    Strictly rejected in production or when ENABLE_QUICK_DEMO_LOGIN is disabled.
    Uses the real authentication token generation mechanism; does not fabricate tokens or expose passwords.
    """
    if not settings.is_quick_demo_login_allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Quick demo login is disabled in this environment."
        )

    user: Optional[User] = None

    if payload.username:
        clean_user = payload.username.strip()
        user = db.query(User).filter(
            (User.email == clean_user) | (User.phone_number == clean_user)
        ).first()

    if not user and payload.role:
        user = db.query(User).filter(
            User.role == payload.role,
            User.is_active == True
        ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No eligible account found for the requested role or identifier. Fake accounts are not created."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is inactive."
        )

    # Issue authentic JWT with standard claims
    token_claims = {
        "sub": str(user.id),
        "role": user.role.value,
        "email": user.email
    }
    access_token = create_access_token(data=token_claims)

    # Record in audit trail
    audit_entry = AuditLog(
        actor_id=user.id,
        entity_type="USER",
        entity_id=user.id,
        action="DEMO_LOGIN",
        new_state={"role": user.role.value, "email": user.email}
    )
    db.add(audit_entry)
    db.commit()

    logger.info(f"[Quick Demo Login] Authenticated user {user.email} (Role: {user.role.value})")

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )


