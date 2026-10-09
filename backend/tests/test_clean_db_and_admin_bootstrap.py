"""
Automated Verification Suite for Clean Database and Admin Bootstrap
Verifies:
1. Clean schema initialization (zero dummy records)
2. Safe first-admin bootstrap logic & duplicate prevention
3. Real student self-registration flow (POST /api/v1/auth/register)
4. Admin user provisioning (POST /api/v1/admin/users)
5. Database-backed roster & sessions (GET /api/v1/attendance/roster & /sessions)
6. Empty database behavior and metric handling (0 totals, 0.0% attendance)
"""

import os
import sys
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ensure backend root is on sys.path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.main import app
from app.core.database import Base, get_db
from app.models.user import User, Student, Staff, UserRole
from app.models.audit import AuditLog
from app.core.security import hash_password, verify_password
from bootstrap_admin import bootstrap_admin

# Isolated test database
TEST_DB_PATH = "test_clean_bootstrap.db"
TEST_DB_URL = f"sqlite:///{TEST_DB_PATH}"

test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def setup_clean_db():
    if os.path.exists(TEST_DB_PATH):
        try:
            os.remove(TEST_DB_PATH)
        except PermissionError:
            pass
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    if os.path.exists(TEST_DB_PATH):
        try:
            os.remove(TEST_DB_PATH)
        except PermissionError:
            pass


@pytest.fixture
def client():
    return TestClient(app)


def test_01_clean_database_has_zero_records():
    """Verify that a freshly created database has exactly zero business records."""
    db = TestingSessionLocal()
    try:
        user_count = db.query(User).count()
        student_count = db.query(Student).count()
        staff_count = db.query(Staff).count()
        audit_count = db.query(AuditLog).count()
        assert user_count == 0, f"Expected 0 users, found {user_count}"
        assert student_count == 0, f"Expected 0 students, found {student_count}"
        assert staff_count == 0, f"Expected 0 staff, found {staff_count}"
        assert audit_count == 0, f"Expected 0 audit logs, found {audit_count}"
    finally:
        db.close()


def test_02_first_admin_bootstrap_creates_admin_account():
    """Verify that the first administrator is safely bootstrapped with hashed password."""
    db = TestingSessionLocal()
    try:
        admin_user = bootstrap_admin(
            email="superadmin@campusflow.edu",
            password="SuperAdminSecurePass@2026",
            first_name="Super",
            last_name="Administrator",
            phone="9998887776",
            force=False,
            db=db
        )
        assert admin_user is not None

        admin = db.query(User).filter(User.email == "superadmin@campusflow.edu").first()
        assert admin is not None
        assert admin.role == UserRole.ADMIN
        assert admin.is_active is True
        assert verify_password("SuperAdminSecurePass@2026", admin.password_hash) is True
        assert not admin.password_hash.startswith("SuperAdmin")  # Password must be hashed

        # Verify audit log was recorded
        audit = db.query(AuditLog).filter(AuditLog.action == "ADMIN_BOOTSTRAP").first()
        assert audit is not None
        assert audit.actor_id == admin.id
    finally:
        db.close()


def test_03_repeated_bootstrap_prevented_without_force():
    """Verify duplicate bootstrap is blocked when an administrator already exists."""
    db = TestingSessionLocal()
    try:
        with pytest.raises(ValueError, match="An administrator already exists"):
            bootstrap_admin(
                email="another.admin@campusflow.edu",
                password="AnotherPassword@2026",
                first_name="Another",
                last_name="Admin",
                phone="9998887775",
                force=False,
                db=db
            )
    finally:
        db.close()


def test_04_bootstrapped_admin_can_login(client):
    """Verify the bootstrapped admin can authenticate and receive JWT."""
    res = client.post("/api/v1/auth/login", json={
        "username": "superadmin@campusflow.edu",
        "password": "SuperAdminSecurePass@2026"
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    token = data["access_token"]

    # Verify /me endpoint
    me_res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["email"] == "superadmin@campusflow.edu"
    assert me_data["role"] == "ADMIN"


def test_05_admin_control_tower_empty_metrics(client):
    """Verify control tower returns clean zero metrics on an empty database."""
    login_res = client.post("/api/v1/auth/login", json={
        "username": "superadmin@campusflow.edu",
        "password": "SuperAdminSecurePass@2026"
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    metrics_res = client.get("/api/v1/admin/control-tower/metrics", headers=headers)
    assert metrics_res.status_code == 200
    metrics = metrics_res.json()
    assert metrics["total_complaints"] == 0
    assert metrics["sla_breaches_count"] == 0
    assert metrics["recurring_hotspots_count"] == 0
    assert metrics["total_audit_events"] >= 1

    sla_res = client.get("/api/v1/admin/control-tower/sla-breaches", headers=headers)
    assert sla_res.status_code == 200
    assert sla_res.json() == []

    hotspots_res = client.get("/api/v1/admin/control-tower/recurring-complaints", headers=headers)
    assert hotspots_res.status_code == 200
    assert hotspots_res.json() == []


def test_06_student_self_registration(client):
    """Verify self-service registration endpoint for real students."""
    reg_payload = {
        "full_name": "Aarav Mishra",
        "roll_number": "2201999",
        "department": "Computer Science & Engineering",
        "batch_year": 2022,
        "section": "A",
        "email": "aarav.mishra@campusflow.edu",
        "phone": "9876500111",
        "password": "StudentPassword@2026",
        "confirm_password": "StudentPassword@2026",
        "university_reg_number": "2201108999",
        "accommodation_type": "Hosteler",
        "hostel_name": "Mahanadi Hall",
        "room_number": "A-101"
    }

    res = client.post("/api/v1/auth/register", json=reg_payload)
    assert res.status_code == 201
    reg_data = res.json()
    assert "access_token" in reg_data
    user_data = reg_data["user"]
    assert user_data["email"] == "aarav.mishra@campusflow.edu"
    assert user_data["role"] == "STUDENT"
    assert user_data["student_profile"] is not None
    assert user_data["student_profile"]["roll_number"] == "2201999"

    # Verify duplicate registration is rejected
    dup_res = client.post("/api/v1/auth/register", json=reg_payload)
    assert dup_res.status_code == 409


def test_07_registered_student_login_and_attendance_summary(client):
    """Verify student can login and query their own attendance summary (returns 0.0% cleanly)."""
    login_res = client.post("/api/v1/auth/login", json={
        "username": "aarav.mishra@campusflow.edu",
        "password": "StudentPassword@2026"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    summary_res = client.get("/api/v1/attendance/summary", headers=headers)
    assert summary_res.status_code == 200
    summary = summary_res.json()
    assert summary["total_sessions"] == 0
    assert summary["present_count"] == 0
    assert summary["attendance_percentage"] == 0.0
    assert summary["is_shortage"] is False


def test_08_admin_provisions_staff_member(client):
    """Verify admin can provision a staff member (e.g. TEACHER)."""
    login_res = client.post("/api/v1/auth/login", json={
        "username": "superadmin@campusflow.edu",
        "password": "SuperAdminSecurePass@2026"
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    staff_payload = {
        "role": "TEACHER",
        "email": "prof.sen@campusflow.edu",
        "first_name": "Ananya",
        "last_name": "Sen",
        "phone_number": "9876543299",
        "password": "TeacherPassword@2026",
        "department": "Computer Science & Engineering",
        "designation": "Assistant Professor"
    }

    res = client.post("/api/v1/admin/users", json=staff_payload, headers=headers)
    assert res.status_code == 201
    created_user = res.json()
    assert created_user["email"] == "prof.sen@campusflow.edu"
    assert created_user["role"] == "TEACHER"

    # Verify staff appears in staff directory
    staff_list_res = client.get("/api/v1/admin/staff", headers=headers)
    assert staff_list_res.status_code == 200
    staff_list = staff_list_res.json()
    assert any(s["email"] == "prof.sen@campusflow.edu" for s in staff_list)

    # Verify student appears in student directory
    student_list_res = client.get("/api/v1/admin/students", headers=headers)
    assert student_list_res.status_code == 200
    student_list = student_list_res.json()
    assert any(st["roll_number"] == "2201999" for st in student_list)


def test_09_teacher_roster_queries_real_students(client):
    """Verify teacher can query the student roster by branch/batch/section."""
    login_res = client.post("/api/v1/auth/login", json={
        "username": "prof.sen@campusflow.edu",
        "password": "TeacherPassword@2026"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    roster_res = client.get(
        "/api/v1/attendance/roster?branch=Computer Science & Engineering&batch_year=2022&section=A",
        headers=headers
    )
    assert roster_res.status_code == 200
    roster = roster_res.json()
    assert len(roster) == 1
    assert roster[0]["roll"] == "2201999"
    assert roster[0]["name"] == "Aarav Mishra"
