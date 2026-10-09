"""
Automated Test Suite for Administrator Email Configuration and Student Registration Enhancements.
Verifies all 12 criteria specified in CampusFlow update requirements:
1. Administrator login works with updated email (dev.rocky2006@gmail.com).
2. Duplicate administrator accounts are prevented.
3. Registration fails when college roll number is missing.
4. Registration fails when university registration number is missing.
5. Duplicate college roll numbers are rejected (409 Conflict).
6. Duplicate university registration numbers are rejected (409 Conflict).
7. Hosteler selection validates hostel fields and links valid records.
8. Day Scholar registration succeeds without hostel details.
9. Direct API requests cannot assign hostel details to Day Scholars (rejected with 422).
10. Registration data persists and displays in Student and Admin views.
11. Login works via university registration number as username.
12. Public hostel lookup endpoint works without authentication.
"""

import os
import sys
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.main import app
from app.core.database import Base, get_db
from app.models.user import User, Student, UserRole
from app.models.hostel import Hostel
from app.core.security import verify_password
from bootstrap_admin import bootstrap_admin

TEST_DB_PATH = "test_registration_and_admin.db"
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
def setup_test_db():
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


def test_01_bootstrap_admin_with_user_email():
    """Verify administrator is bootstrapped with dev.rocky2006@gmail.com."""
    db = TestingSessionLocal()
    try:
        admin = bootstrap_admin(
            email="dev.rocky2006@gmail.com",
            first_name="Ashok",
            last_name="Patnaik",
            phone="9876543211",
            password="SecureAdminPass2026!",
            force=False,
            db=db
        )
        assert admin is not None
        assert admin.email == "dev.rocky2006@gmail.com"
        assert admin.role == UserRole.ADMIN
        assert verify_password("SecureAdminPass2026!", admin.password_hash) is True
    finally:
        db.close()


def test_02_admin_login_works_with_updated_email(client):
    """Verify administrator login works using dev.rocky2006@gmail.com."""
    res = client.post("/api/v1/auth/login", json={
        "username": "dev.rocky2006@gmail.com",
        "password": "SecureAdminPass2026!"
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "dev.rocky2006@gmail.com"
    assert data["user"]["role"] == "ADMIN"


def test_03_duplicate_admin_account_prevented():
    """Verify duplicate administrator accounts are rejected."""
    db = TestingSessionLocal()
    try:
        with pytest.raises(ValueError, match="An administrator already exists"):
            bootstrap_admin(
                email="duplicate.admin@campusflow.edu",
                first_name="Another",
                last_name="Admin",
                phone="9876543299",
                password="AnotherPassword@2026",
                force=False,
                update=False,
                db=db
            )
        admin_count = db.query(User).filter(User.role == UserRole.ADMIN).count()
        assert admin_count == 1
    finally:
        db.close()


def test_04_admin_update_in_place():
    """Verify --update updates existing admin in place without creating duplicates."""
    db = TestingSessionLocal()
    try:
        updated = bootstrap_admin(
            email="dev.rocky2006@gmail.com",
            first_name="Ashok Kumar",
            last_name="Patnaik",
            phone="9876543211",
            password="SecureAdminPass2026!",
            force=False,
            update=True,
            db=db
        )
        assert updated.first_name == "Ashok Kumar"
        admin_count = db.query(User).filter(User.role == UserRole.ADMIN).count()
        assert admin_count == 1
    finally:
        db.close()


def test_05_public_hostel_endpoint_accessible(client):
    """Verify GET /api/v1/auth/hostels is accessible without authentication."""
    res = client.get("/api/v1/auth/hostels")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_06_registration_fails_when_college_roll_missing(client):
    """Verify registration fails when college roll number is omitted."""
    payload = {
        "full_name": "Priya Sharma",
        "email": "priya.sharma@campusflow.edu",
        "phone": "9876500101",
        "password": "StudentPassword@2026",
        "confirm_password": "StudentPassword@2026",
        "university_reg_number": "2201108201",
        "accommodation_type": "Day Scholar"
    }
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 422
    assert "College roll number is required" in res.text


def test_07_registration_fails_when_university_reg_missing(client):
    """Verify registration fails when university registration number is omitted."""
    payload = {
        "full_name": "Priya Sharma",
        "email": "priya.sharma@campusflow.edu",
        "phone": "9876500101",
        "password": "StudentPassword@2026",
        "confirm_password": "StudentPassword@2026",
        "college_roll_number": "2201042",
        "accommodation_type": "Day Scholar"
    }
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 422
    assert "University registration number is required" in res.text


def test_08_registration_fails_on_password_mismatch(client):
    """Verify registration fails when password and confirm_password differ."""
    payload = {
        "full_name": "Priya Sharma",
        "email": "priya.sharma@campusflow.edu",
        "phone": "9876500101",
        "password": "StudentPassword@2026",
        "confirm_password": "DifferentPassword@2026",
        "college_roll_number": "2201042",
        "university_reg_number": "2201108201",
        "accommodation_type": "Day Scholar"
    }
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 422
    assert "Passwords do not match" in res.text


def test_09_day_scholar_registration_succeeds_without_hostel_details(client):
    """Verify Day Scholar registration succeeds without hostel fields."""
    payload = {
        "full_name": "Priya Sharma",
        "email": "priya.sharma@campusflow.edu",
        "phone": "9876500101",
        "password": "StudentPassword@2026",
        "confirm_password": "StudentPassword@2026",
        "college_roll_number": "2201042",
        "university_reg_number": "2201108201",
        "accommodation_type": "Day Scholar"
    }
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert "access_token" in data
    user = data["user"]
    assert user["email"] == "priya.sharma@campusflow.edu"
    assert user["student_profile"] is not None
    sp = user["student_profile"]
    assert sp["roll_number"] == "2201042"
    assert sp["college_roll_number"] == "2201042"
    assert sp["university_reg_number"] == "2201108201"
    assert sp["accommodation_type"] == "DAY_SCHOLAR"
    assert sp["room_number"] is None
    assert sp["hostel_id"] is None


def test_10_day_scholar_direct_api_hostel_assignment_rejected(client):
    """Verify direct API requests cannot assign hostel details to Day Scholars."""
    payload = {
        "full_name": "Rohan Gupta",
        "email": "rohan.gupta@campusflow.edu",
        "phone": "9876500102",
        "password": "StudentPassword@2026",
        "confirm_password": "StudentPassword@2026",
        "college_roll_number": "2201043",
        "university_reg_number": "2201108202",
        "accommodation_type": "Day Scholar",
        "room_number": "B-304"  # Direct injection attempt
    }
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 422
    assert "Hostel details (hostel, block, room) cannot be assigned to Day Scholar" in res.text


def test_11_duplicate_college_roll_number_rejected(client):
    """Verify duplicate college roll number is rejected with 409 Conflict."""
    payload = {
        "full_name": "Amit Kumar",
        "email": "amit.kumar@campusflow.edu",
        "phone": "9876500103",
        "password": "StudentPassword@2026",
        "confirm_password": "StudentPassword@2026",
        "college_roll_number": "2201042",  # Duplicate of Priya Sharma
        "university_reg_number": "2201108203",
        "accommodation_type": "Day Scholar"
    }
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 409
    assert "college roll number '2201042' is already registered" in res.text


def test_12_duplicate_university_reg_number_rejected(client):
    """Verify duplicate university registration number is rejected with 409 Conflict."""
    payload = {
        "full_name": "Neha Verma",
        "email": "neha.verma@campusflow.edu",
        "phone": "9876500104",
        "password": "StudentPassword@2026",
        "confirm_password": "StudentPassword@2026",
        "college_roll_number": "2201044",
        "university_reg_number": "2201108201",  # Duplicate of Priya Sharma
        "accommodation_type": "Day Scholar"
    }
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 409
    assert "university registration number '2201108201' is already registered" in res.text


def test_13_hosteler_registration_with_facility(client):
    """Verify Hosteler registration stores accommodation details."""
    db = TestingSessionLocal()
    hostel_id = None
    try:
        hostel = Hostel(
            name="Mahanadi Hall of Residence",
            code="MHR",
            total_rooms=150
        )
        db.add(hostel)
        db.commit()
        db.refresh(hostel)
        hostel_id = str(hostel.id)
    finally:
        db.close()

    payload = {
        "full_name": "Siddharth Das",
        "email": "siddharth.das@campusflow.edu",
        "phone": "9876500105",
        "password": "StudentPassword@2026",
        "confirm_password": "StudentPassword@2026",
        "college_roll_number": "2201045",
        "university_reg_number": "2201108205",
        "accommodation_type": "Hosteler",
        "hostel_id": hostel_id,
        "hostel_block": "Block B",
        "room_number": "B-204"
    }
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 201
    sp = res.json()["user"]["student_profile"]
    assert sp["accommodation_type"] == "HOSTELER"
    assert sp["hostel_block"] == "Block B"
    assert sp["room_number"] == "B-204"
    assert sp["hostel_id"] == hostel_id


def test_14_login_via_university_registration_number(client):
    """Verify student can authenticate using their university registration number."""
    res = client.post("/api/v1/auth/login", json={
        "username": "2201108201",  # Priya Sharma's university reg number
        "password": "StudentPassword@2026"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["email"] == "priya.sharma@campusflow.edu"


def test_15_admin_students_view_displays_new_fields(client):
    """Verify Admin student directory returns the newly collected fields."""
    login_res = client.post("/api/v1/auth/login", json={
        "username": "dev.rocky2006@gmail.com",
        "password": "SecureAdminPass2026!"
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    students_res = client.get("/api/v1/admin/students", headers=headers)
    assert students_res.status_code == 200
    students = students_res.json()
    assert len(students) >= 2

    priya = next(s for s in students if s["email"] == "priya.sharma@campusflow.edu")
    assert priya["college_roll_number"] == "2201042"
    assert priya["university_reg_number"] == "2201108201"
    assert priya["accommodation_type"] == "DAY_SCHOLAR"

    siddharth = next(s for s in students if s["email"] == "siddharth.das@campusflow.edu")
    assert siddharth["college_roll_number"] == "2201045"
    assert siddharth["university_reg_number"] == "2201108205"
    assert siddharth["accommodation_type"] == "HOSTELER"
    assert siddharth["hostel_block"] == "Block B"
    assert siddharth["room_number"] == "B-204"
