import uuid
from datetime import timedelta
import pytest
from fastapi import FastAPI, Depends, status
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.core.database import Base, get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.core.dependencies import get_current_user, RequireRole
from app.models.user import User, Student, UserRole
from app.models.hostel import Hostel
from seed import seed_demo_users, DEMO_PASSWORD


import os

TEST_DB_PATH = "test_auth.db"
test_engine = create_engine(
    f"sqlite:///{TEST_DB_PATH}",
    connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def setup_test_database():
    """Create all 24 schema tables and seed demo users for authentication tests."""
    # Ensure fresh DB
    if os.path.exists(TEST_DB_PATH):
        os.remove(TEST_DB_PATH)

    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    seed_demo_users(db)
    db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)
    if os.path.exists(TEST_DB_PATH):
        try:
            os.remove(TEST_DB_PATH)
        except OSError:
            pass



@pytest.fixture
def client():
    return TestClient(app)


# ------------------------------------------------------------------------------
# Test 1, 2, 3: Password Hashing & Verification
# ------------------------------------------------------------------------------

def test_password_hashing_and_verification_success():
    """Test 1 & 2: Password hashing produces secure hash and verifies with correct password."""
    plain = "MySecretPass@123"
    hashed = hash_password(plain)

    assert hashed != plain
    assert hashed.startswith("$2b$") or hashed.startswith("$2a$")
    assert verify_password(plain, hashed) is True


def test_password_verification_fails_for_incorrect_password():
    """Test 3: Password verification fails when given wrong password."""
    plain = "MySecretPass@123"
    hashed = hash_password(plain)

    assert verify_password("WrongPassword@999", hashed) is False
    assert verify_password("", hashed) is False


# ------------------------------------------------------------------------------
# Test 4 & 5: Login Endpoint
# ------------------------------------------------------------------------------

def test_valid_login_returns_jwt_and_user_profile(client):
    """Test 4: Valid credentials return HTTP 200 with JWT access_token and user profile."""
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "priya.sharma@bput.ac.in", "password": DEMO_PASSWORD}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "user" in data
    assert data["user"]["email"] == "priya.sharma@bput.ac.in"
    assert data["user"]["role"] == "STUDENT"


def test_valid_login_via_roll_number(client):
    """Verify students can also log in using their university roll number."""
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "2201042", "password": DEMO_PASSWORD}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["email"] == "priya.sharma@bput.ac.in"


def test_invalid_credentials_return_401(client):
    """Test 5: Invalid username or incorrect password returns HTTP 401."""
    # Wrong password
    response1 = client.post(
        "/api/v1/auth/login",
        json={"username": "priya.sharma@bput.ac.in", "password": "WrongPassword"}
    )
    assert response1.status_code == 401
    assert "Invalid username or password" in response1.json()["error"]["message"]

    # Non-existent user
    response2 = client.post(
        "/api/v1/auth/login",
        json={"username": "nobody@bput.ac.in", "password": DEMO_PASSWORD}
    )
    assert response2.status_code == 401
    assert "Invalid username or password" in response2.json()["error"]["message"]


# ------------------------------------------------------------------------------
# Test 6, 7, 8, 9: JWT Token Acceptance, Expiry, and Rejection
# ------------------------------------------------------------------------------

def test_valid_jwt_is_accepted_on_me_endpoint(client):
    """Test 6: Valid Bearer JWT allows access to protected GET /api/v1/auth/me."""
    # Obtain token
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"username": "dean.admin@bput.ac.in", "password": DEMO_PASSWORD}
    )
    token = login_resp.json()["access_token"]

    # Access protected route
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    user_data = response.json()
    assert user_data["email"] == "dean.admin@bput.ac.in"
    assert user_data["role"] == "ADMIN"


def test_expired_jwt_is_rejected(client):
    """Test 7: Token expired in the past is rejected with HTTP 401."""
    # Create token with negative expiration delta
    expired_token = create_access_token(
        data={"sub": str(uuid.uuid4()), "role": "STUDENT", "email": "test@bput.ac.in"},
        expires_delta=timedelta(seconds=-60)
    )

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"}
    )
    assert response.status_code == 401
    assert "expired" in response.json()["error"]["message"].lower()


def test_malformed_jwt_is_rejected(client):
    """Test 8: Garbage or tampered token signature is rejected with HTTP 401."""
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer totally_malformed.jwt_payload.token_tampered"}
    )
    assert response.status_code == 401


def test_missing_bearer_token_returns_401(client):
    """Test 9: Calling protected endpoint without Authorization header returns HTTP 401."""
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert "Authentication credentials were not provided" in response.json()["error"]["message"]


# ------------------------------------------------------------------------------
# Test 10: get_current_user Dependency
# ------------------------------------------------------------------------------

def test_get_current_user_returns_correct_model_instance():
    """Test 10: get_current_user loads active User record from DB with correct fields."""
    db = TestingSessionLocal()
    admin_user = db.query(User).filter(User.email == "dean.admin@bput.ac.in").first()
    assert admin_user is not None

    token = create_access_token({"sub": str(admin_user.id), "role": admin_user.role.value, "email": admin_user.email})

    from fastapi.security import HTTPAuthorizationCredentials
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    resolved_user = get_current_user(credentials=creds, db=db)

    assert resolved_user.id == admin_user.id
    assert resolved_user.email == "dean.admin@bput.ac.in"
    assert resolved_user.role == UserRole.ADMIN
    db.close()


# ------------------------------------------------------------------------------
# Test 11, 12, 13: RBAC RequireRole Verification
# ------------------------------------------------------------------------------

def test_rbac_guard_authorization_and_rejection():
    """Test 11 & 12: RequireRole passes correct roles and raises 403 on role mismatch."""
    db = TestingSessionLocal()
    student_user = db.query(User).filter(User.role == UserRole.STUDENT).first()
    admin_user = db.query(User).filter(User.role == UserRole.ADMIN).first()

    # Guard permitting only STUDENT
    student_guard = RequireRole(UserRole.STUDENT)
    passed_student = student_guard(current_user=student_user)
    assert passed_student.id == student_user.id

    # Admin trying to access student-only guard raises 403 Forbidden
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        student_guard(current_user=admin_user)
    assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
    assert "Access forbidden" in exc_info.value.detail

    # Multi-role guard permitting WARDEN and ADMIN
    warden_or_admin_guard = RequireRole(UserRole.WARDEN, UserRole.ADMIN)
    passed_admin = warden_or_admin_guard(current_user=admin_user)
    assert passed_admin.id == admin_user.id

    # Student trying to access warden/admin guard raises 403
    with pytest.raises(HTTPException) as exc_info2:
        warden_or_admin_guard(current_user=student_user)
    assert exc_info2.value.status_code == status.HTTP_403_FORBIDDEN

    db.close()


def test_all_8_approved_roles_can_be_authenticated(client):
    """Test 13: Verify all 8 approved institutional roles can successfully log in."""
    role_emails = [
        ("STUDENT", "priya.sharma@bput.ac.in"),
        ("ADMIN", "dean.admin@bput.ac.in"),
        ("WARDEN", "warden.sharma@bput.ac.in"),
        ("HOSTEL_FACULTY", "dr.mishra.hostel@bput.ac.in"),
        ("TEACHER", "prof.mohanty@bput.ac.in"),
        ("LAB_ASSISTANT", "ramesh.lab@bput.ac.in"),
        ("STAFF", "ramesh.estate@bput.ac.in"),
        ("GUARD", "guard.gate1@bput.ac.in"),
    ]
    assert len(role_emails) == 8

    for role_name, email in role_emails:
        resp = client.post(
            "/api/v1/auth/login",
            json={"username": email, "password": DEMO_PASSWORD}
        )
        assert resp.status_code == 200, f"Failed login for role {role_name}"
        data = resp.json()
        assert data["user"]["role"] == role_name


# ------------------------------------------------------------------------------
# Test 14: Security Scope - Password Hash Never Exposed
# ------------------------------------------------------------------------------

def test_password_hash_never_exposed(client):
    """Test 14: Confirm password_hash is never serialized in login or /me responses."""
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": "priya.sharma@bput.ac.in", "password": DEMO_PASSWORD}
    )
    assert resp.status_code == 200
    data = resp.json()

    # Neither top-level nor inside user
    assert "password_hash" not in data
    assert "password" not in data
    assert "password_hash" not in data["user"]
    assert "password" not in data["user"]

    token = data["access_token"]
    me_resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert "password_hash" not in me_data
    assert "password" not in me_data
