"""
Automated Test Suite for Resumed Features:
1. Quick Demo Login (Security, permissions, environment enforcement)
2. Security Guard Manual Identifier & QR Gate Pass Verification (Single-use, replay prevention, pass number & PIN lookup)
3. Help-a-Friend Twilio Verify & Demo Fallback Isolation
4. Targeted Class Notices Scoping & Authorization
"""

import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.main import app
from app.core.config import settings
from app.core.database import Base, get_db
from app.core.security import hash_password, create_access_token
from app.models.user import User, Student, UserRole
from app.models.hostel import Hostel
from app.models.gate_pass import GatePass, GatePassStatus, GatePassType, GatePassQRToken, QRTokenStatus, DecisionStatus
from app.models.academic import ClassNotice, ClassNoticeType
# Proxy models accessed via API endpoints

TEST_RESUME_DB = "test_resume_features.db"
TEST_DB_URL = f"sqlite:///{TEST_RESUME_DB}"

engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def setup_resume_test_db():
    if os.path.exists(TEST_RESUME_DB):
        try:
            os.remove(TEST_RESUME_DB)
        except PermissionError:
            pass
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db

    db = TestingSessionLocal()
    try:
        # Seed test users
        admin_user = User(
            id=uuid.uuid4(),
            email="dev.rocky2006@gmail.com",
            phone_number="+919999900001",
            first_name="Rocky",
            last_name="SuperAdmin",
            role=UserRole.ADMIN,
            is_active=True,
            password_hash=hash_password("AdminPass123!")
        )
        db.add(admin_user)

        guard_user = User(
            id=uuid.uuid4(),
            email="guard.gate1@bput.ac.in",
            phone_number="+919999900002",
            first_name="Gate",
            last_name="Guard",
            role=UserRole.GUARD,
            is_active=True,
            password_hash=hash_password("CampusFlow@2026")
        )
        db.add(guard_user)

        teacher_user = User(
            id=uuid.uuid4(),
            email="prof.mohanty@bput.ac.in",
            phone_number="+919999900003",
            first_name="Bimal",
            last_name="Mohanty",
            role=UserRole.TEACHER,
            is_active=True,
            password_hash=hash_password("CampusFlow@2026")
        )
        db.add(teacher_user)

        # Student 1: CSE, Sem 6, Sec A
        student_user_1 = User(
            id=uuid.uuid4(),
            email="barik.jashobanta2020@gmail.com",
            phone_number="+919876543210",
            first_name="Jashobanta",
            last_name="Barik",
            role=UserRole.STUDENT,
            is_active=True,
            password_hash=hash_password("CampusFlow@2026")
        )
        db.add(student_user_1)
        db.flush()

        student_prof_1 = Student(
            id=student_user_1.id,
            roll_number="CSE-2022-042",
            university_reg_number="REG-2022-042",
            department="Computer Science & Engineering",
            batch_year=2022,
            semester=6,
            section="A",
            accommodation_type="HOSTELER",
            hostel_block="Block B",
            room_number="B-101"
        )
        db.add(student_prof_1)

        # Student 2: ME, Sem 4, Sec B (Day Scholar)
        student_user_2 = User(
            id=uuid.uuid4(),
            email="student2.mech@campusflow.in",
            phone_number="+919876543220",
            first_name="Rahul",
            last_name="Verma",
            role=UserRole.STUDENT,
            is_active=True,
            password_hash=hash_password("CampusFlow@2026")
        )
        db.add(student_user_2)
        db.flush()

        student_prof_2 = Student(
            id=student_user_2.id,
            roll_number="ME-2023-010",
            university_reg_number="REG-2023-010",
            department="Mechanical Engineering",
            batch_year=2023,
            semester=4,
            section="B",
            accommodation_type="DAY_SCHOLAR"
        )
        db.add(student_prof_2)

        # Student 3: EE, Sem 2, Sec C (Missing / Invalid accommodation)
        student_user_3 = User(
            id=uuid.uuid4(),
            email="student3.invalid@campusflow.in",
            phone_number="+919876543230",
            first_name="Ananya",
            last_name="Das",
            role=UserRole.STUDENT,
            is_active=True,
            password_hash=hash_password("CampusFlow@2026")
        )
        db.add(student_user_3)
        db.flush()

        student_prof_3 = Student(
            id=student_user_3.id,
            roll_number="EE-2024-005",
            university_reg_number="REG-2024-005",
            department="Electrical Engineering",
            batch_year=2024,
            semester=2,
            section="C",
            accommodation_type=""
        )
        db.add(student_prof_3)

        db.commit()
    finally:
        db.close()

    yield

    app.dependency_overrides.pop(get_db, None)
    if os.path.exists(TEST_RESUME_DB):
        try:
            os.remove(TEST_RESUME_DB)
        except PermissionError:
            pass


@pytest.fixture
def client():
    return TestClient(app)


def get_token(email: str, role: str) -> str:
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        return create_access_token(data={"sub": str(user.id), "email": user.email, "role": role})
    finally:
        db.close()


# ---------------------------------------------------------------------------
# TEST GROUP 1: QUICK DEMO LOGIN
# ---------------------------------------------------------------------------

def test_demo_accounts_list_available_in_development(client):
    settings.ENABLE_QUICK_DEMO_LOGIN = True
    settings.ENVIRONMENT = "development"

    res = client.get("/api/v1/auth/demo-accounts")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    roles = [acc["role"] for acc in data]
    assert "ADMIN" in roles
    assert "GUARD" in roles
    assert "TEACHER" in roles
    assert "STUDENT" in roles


def test_demo_login_success_for_legitimate_accounts(client):
    settings.ENABLE_QUICK_DEMO_LOGIN = True
    settings.ENVIRONMENT = "development"

    # 1. Admin login
    res = client.post("/api/v1/auth/demo-login", json={"role": "ADMIN", "username": "dev.rocky2006@gmail.com"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["role"] == "ADMIN"
    assert data["user"]["email"] == "dev.rocky2006@gmail.com"

    # 2. Guard login
    res = client.post("/api/v1/auth/demo-login", json={"role": "GUARD"})
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["role"] == "GUARD"
    assert data["user"]["email"] == "guard.gate1@bput.ac.in"


def test_demo_login_disabled_in_production(client):
    settings.ENVIRONMENT = "production"
    settings.ENABLE_QUICK_DEMO_LOGIN = True

    res = client.get("/api/v1/auth/demo-accounts")
    assert res.status_code == 403

    res2 = client.post("/api/v1/auth/demo-login", json={"role": "ADMIN"})
    assert res2.status_code == 403

    # Reset
    settings.ENVIRONMENT = "development"


def test_demo_login_disabled_when_flag_false(client):
    settings.ENABLE_QUICK_DEMO_LOGIN = False
    settings.ENVIRONMENT = "development"

    res = client.get("/api/v1/auth/demo-accounts")
    assert res.status_code == 403

    res2 = client.post("/api/v1/auth/demo-login", json={"role": "ADMIN"})
    assert res2.status_code == 403

    # Reset
    settings.ENABLE_QUICK_DEMO_LOGIN = True


# ---------------------------------------------------------------------------
# TEST GROUP 2: SECURITY GUARD GATE PASS VERIFICATION (QR & MANUAL)
# ---------------------------------------------------------------------------

def test_guard_verify_gatepass_by_qr_and_manual_identifiers(client):
    db = TestingSessionLocal()
    guard_token = get_token("guard.gate1@bput.ac.in", "GUARD")
    headers = {"Authorization": f"Bearer {guard_token}"}

    student_user = db.query(User).filter(User.email == "barik.jashobanta2020@gmail.com").first()

    # Create approved GatePass with active QR token
    pass_id = uuid.uuid4()
    qr_hex = "a" * 64
    pin_code = "1234"
    pass_number = "GP-2026-TEST1"

    now = datetime.now(timezone.utc)
    gate_pass = GatePass(
        id=pass_id,
        pass_number=pass_number,
        student_id=student_user.id,
        pass_type=GatePassType.DAY_OUTING,
        destination="Market Square",
        purpose="Textbook purchase",
        pin_code=pin_code,
        out_time=now - timedelta(minutes=10),
        expected_in_time=now + timedelta(hours=3),
        status=GatePassStatus.APPROVED,
        decision_status=DecisionStatus.APPROVED
    )
    db.add(gate_pass)
    db.flush()

    qr_token_obj = GatePassQRToken(
        gate_pass_id=pass_id,
        qr_token=qr_hex,
        student_id=student_user.id,
        expires_at=now + timedelta(hours=3),
        status=QRTokenStatus.ACTIVE
    )
    db.add(qr_token_obj)
    db.commit()
    db.close()

    # 1. Verify via manual pass_number
    res = client.post("/api/v1/gatepasses/verify-qr", json={"qr_token": pass_number}, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["pass_id"] == str(pass_id)
    assert data["pass_number"] == pass_number
    assert data["action"] == "CHECK_OUT"

    # 2. Replay attack: verify again must be rejected because QR token is already consumed
    res_replay = client.post("/api/v1/gatepasses/verify-qr", json={"qr_token": pass_number}, headers=headers)
    assert res_replay.status_code in (400, 409)
    err_replay = (res_replay.json().get("error", {}).get("message") or res_replay.json().get("detail", "")).lower()
    assert "consumed" in err_replay or "not active" in err_replay or "already" in err_replay


def test_guard_verify_gatepass_by_pin_code(client):
    db = TestingSessionLocal()
    guard_token = get_token("guard.gate1@bput.ac.in", "GUARD")
    headers = {"Authorization": f"Bearer {guard_token}"}

    student_user = db.query(User).filter(User.email == "barik.jashobanta2020@gmail.com").first()

    pass_id = uuid.uuid4()
    qr_hex = "b" * 64
    pin_code = "5678"
    pass_number = "GP-2026-TEST2"

    now = datetime.now(timezone.utc)
    gate_pass = GatePass(
        id=pass_id,
        pass_number=pass_number,
        student_id=student_user.id,
        pass_type=GatePassType.DAY_OUTING,
        destination="Pharmacy",
        purpose="Medicine",
        pin_code=pin_code,
        out_time=now,
        expected_in_time=now + timedelta(hours=2),
        status=GatePassStatus.APPROVED,
        decision_status=DecisionStatus.APPROVED
    )
    db.add(gate_pass)
    db.flush()

    qr_token_obj = GatePassQRToken(
        gate_pass_id=pass_id,
        qr_token=qr_hex,
        student_id=student_user.id,
        expires_at=now + timedelta(hours=2),
        status=QRTokenStatus.ACTIVE
    )
    db.add(qr_token_obj)
    db.commit()
    db.close()

    # Verify using 4-digit PIN code
    res = client.post("/api/v1/gatepasses/verify-qr", json={"qr_token": pin_code}, headers=headers)
    assert res.status_code == 200
    assert res.json()["pass_number"] == pass_number


# ---------------------------------------------------------------------------
# TEST GROUP 3: HELP-A-FRIEND TWILIO VERIFY & DEMO FALLBACK
# ---------------------------------------------------------------------------

def test_proxy_otp_demo_fallback_behavior(client, monkeypatch):
    from app.services.twilio_verify_service import twilio_verify_service

    student1_token = get_token("barik.jashobanta2020@gmail.com", "STUDENT")
    headers = {"Authorization": f"Bearer {student1_token}"}

    # Simulate Twilio delivery failure
    def mock_start_failure(phone_e164: str, channel: str = "sms"):
        raise HTTPException(
            status_code=502,
            detail="Twilio network carrier timeout."
        )
    monkeypatch.setattr(twilio_verify_service, "start_verification", mock_start_failure)

    # 1. When fallback is DISABLED, must fail with HTTP 502
    settings.ENABLE_DEMO_OTP_FALLBACK = False
    res_no_fallback = client.post(
        "/api/v1/help-a-friend/initiate",
        json={"beneficiary_roll_number": "ME-2023-010"},
        headers=headers
    )
    assert res_no_fallback.status_code == 502
    err_text = res_no_fallback.json().get("error", {}).get("message") or res_no_fallback.json().get("detail", "")
    assert "Twilio" in err_text

    # 2. When fallback is ENABLED, returns demo OTP fallback instructions
    settings.ENABLE_DEMO_OTP_FALLBACK = True
    res_with_fallback = client.post(
        "/api/v1/help-a-friend/initiate",
        json={"beneficiary_roll_number": "ME-2023-010"},
        headers=headers
    )
    assert res_with_fallback.status_code == 200
    fb_data = res_with_fallback.json()
    assert fb_data["status"] == "OTP_SENT"
    assert fb_data.get("demo_fallback") is True
    raw_demo = fb_data.get("demo_otp")
    assert raw_demo is not None
    demo_code = raw_demo.split(":")[-1].strip()

    # 3. Verify wrong OTP: fails with 400 and decreases attempts
    res_wrong = client.post(
        "/api/v1/help-a-friend/verify-otp",
        json={"beneficiary_roll_number": "ME-2023-010", "otp_code": "000000"},
        headers=headers
    )
    assert res_wrong.status_code == 400
    err_wrong = (res_wrong.json().get("error", {}).get("message") or res_wrong.json().get("detail", "")).lower()
    assert "invalid" in err_wrong

    # 4. Verify correct demo OTP: succeeds
    res_correct = client.post(
        "/api/v1/help-a-friend/verify-otp",
        json={"beneficiary_roll_number": "ME-2023-010", "otp_code": demo_code},
        headers=headers
    )
    assert res_correct.status_code == 200
    assert res_correct.json()["status"] == "VERIFIED"


# ---------------------------------------------------------------------------
# TEST GROUP 4: TARGETED CLASS NOTICES
# ---------------------------------------------------------------------------

def test_targeted_class_notices_scoping(client):
    teacher_token = get_token("prof.mohanty@bput.ac.in", "TEACHER")
    student1_token = get_token("barik.jashobanta2020@gmail.com", "STUDENT")  # CSE Sem 6 Sec A
    student2_token = get_token("student2.mech@campusflow.in", "STUDENT")     # ME Sem 4 Sec B

    teacher_headers = {"Authorization": f"Bearer {teacher_token}"}
    s1_headers = {"Authorization": f"Bearer {student1_token}"}
    s2_headers = {"Authorization": f"Bearer {student2_token}"}

    # 1. Teacher creates Notice targeted ONLY to CSE (Sem 6 Sec A)
    res_n1 = client.post(
        "/api/v1/class-notices",
        json={
            "notice_type": "ROOM_CHANGED",
            "target_branch": "Computer Science & Engineering",
            "target_year": 3,
            "target_semester": 6,
            "target_section": "A",
            "subject": "CS601 Distributed Systems",
            "class_date": datetime.now(timezone.utc).isoformat(),
            "period": "Period 2",
            "details": "Class shifted to Lab 304."
        },
        headers=teacher_headers
    )
    assert res_n1.status_code == 201

    # 2. Teacher creates Notice targeted to ALL students
    res_n2 = client.post(
        "/api/v1/class-notices",
        json={
            "notice_type": "RESCHEDULED",
            "target_branch": "ALL",
            "target_year": 0,
            "target_semester": 0,
            "target_section": "ALL",
            "subject": "Campus Holiday Notice",
            "class_date": datetime.now(timezone.utc).isoformat(),
            "period": "All Day",
            "details": "Campus will remain closed on Friday."
        },
        headers=teacher_headers
    )
    assert res_n2.status_code == 201

    # 3. Student 1 (CSE) gets notices: should see BOTH CSE notice and ALL notice
    res_s1 = client.get("/api/v1/class-notices", headers=s1_headers)
    assert res_s1.status_code == 200
    s1_subjects = [n["subject"] for n in res_s1.json()]
    assert "CS601 Distributed Systems" in s1_subjects
    assert "Campus Holiday Notice" in s1_subjects

    # 4. Student 2 (Mechanical) gets notices: should see ONLY ALL notice, NOT CSE notice
    res_s2 = client.get("/api/v1/class-notices", headers=s2_headers)
    assert res_s2.status_code == 200
    s2_subjects = [n["subject"] for n in res_s2.json()]
    assert "CS601 Distributed Systems" not in s2_subjects
    assert "Campus Holiday Notice" in s2_subjects

    # 5. Student 2 attempts to bypass by specifying query params: must still NOT receive CSE notice
    res_s2_tamper = client.get("/api/v1/class-notices?branch=Computer%20Science%20%26%20Engineering", headers=s2_headers)
    assert res_s2_tamper.status_code == 200
    s2_tamper_subjects = [n["subject"] for n in res_s2_tamper.json()]
    assert "CS601 Distributed Systems" not in s2_tamper_subjects


# ---------------------------------------------------------------------------
# TEST GROUP 6: GATE PASS HOSTELER RESTRICTION TESTS
# ---------------------------------------------------------------------------

def test_hosteler_student_can_apply_gate_pass(client):
    """Hosteler student (registered accommodation = HOSTELER) successfully creates a gate pass."""
    hosteler_token = get_token("barik.jashobanta2020@gmail.com", "STUDENT")
    out_dt = datetime.now(timezone.utc) + timedelta(hours=1)
    in_dt = datetime.now(timezone.utc) + timedelta(hours=4)

    resp = client.post(
        "/api/v1/gatepasses",
        json={
            "pass_type": "DAY_OUTING",
            "out_time": out_dt.isoformat(),
            "expected_in_time": in_dt.isoformat(),
            "destination": "Main Market Rourkela",
            "purpose": "Academic supplies purchase",
            "pin_code": "1234"
        },
        headers={"Authorization": f"Bearer {hosteler_token}"}
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["pass_number"].startswith("GP-")
    assert data["status"] == "PENDING"
    assert data["destination"] == "Main Market Rourkela"


def test_day_scholar_cannot_apply_gate_pass_direct_api(client):
    """Day Scholar student is rejected with 403 Forbidden and exact restriction message."""
    day_scholar_token = get_token("student2.mech@campusflow.in", "STUDENT")
    out_dt = datetime.now(timezone.utc) + timedelta(hours=1)
    in_dt = datetime.now(timezone.utc) + timedelta(hours=4)

    resp = client.post(
        "/api/v1/gatepasses",
        json={
            "pass_type": "DAY_OUTING",
            "out_time": out_dt.isoformat(),
            "expected_in_time": in_dt.isoformat(),
            "destination": "City Center",
            "purpose": "Visiting relatives",
            "pin_code": "1234"
        },
        headers={"Authorization": f"Bearer {day_scholar_token}"}
    )
    assert resp.status_code == 403
    data = resp.json()
    assert data["detail"] == "Gate pass is available only to hostel residents."


def test_day_scholar_cannot_spoof_accommodation_in_payload(client):
    """Frontend-supplied accommodation parameters are ignored; DB profile record is authoritative."""
    day_scholar_token = get_token("student2.mech@campusflow.in", "STUDENT")
    out_dt = datetime.now(timezone.utc) + timedelta(hours=1)
    in_dt = datetime.now(timezone.utc) + timedelta(hours=4)

    resp = client.post(
        "/api/v1/gatepasses",
        json={
            "pass_type": "DAY_OUTING",
            "out_time": out_dt.isoformat(),
            "expected_in_time": in_dt.isoformat(),
            "destination": "City Center",
            "purpose": "Visiting relatives",
            "pin_code": "1234",
            "accommodation_type": "HOSTELER"  # Spoofed field in request payload
        },
        headers={"Authorization": f"Bearer {day_scholar_token}"}
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Gate pass is available only to hostel residents."


def test_student_with_invalid_or_missing_accommodation_rejected(client):
    """Student with empty or invalid accommodation data is rejected by default with 403 Forbidden."""
    invalid_token = get_token("student3.invalid@campusflow.in", "STUDENT")
    out_dt = datetime.now(timezone.utc) + timedelta(hours=1)
    in_dt = datetime.now(timezone.utc) + timedelta(hours=4)

    resp = client.post(
        "/api/v1/gatepasses",
        json={
            "pass_type": "DAY_OUTING",
            "out_time": out_dt.isoformat(),
            "expected_in_time": in_dt.isoformat(),
            "destination": "Library",
            "purpose": "Studying",
            "pin_code": "1234"
        },
        headers={"Authorization": f"Bearer {invalid_token}"}
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Gate pass is available only to hostel residents."

