import os
import uuid
import hashlib
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.core.database import Base, get_db
from app.core.security import create_access_token
from app.models.user import User, Student, UserRole
from app.models.complaint import Complaint, ComplaintStatus
from app.models.gate_pass import GatePass, GatePassStatus, DecisionStatus, QRTokenStatus
from app.models.proxy_request import OTPVerification, ProxyRequest
from app.models.document_request import DocumentRequest, DocumentRequestStatus
from app.models.audit import AuditLog
from seed import seed_demo_users, DEMO_PASSWORD

TEST_DB_PATH = "test_phase4.db"
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
def setup_test_db():
    if os.path.exists(TEST_DB_PATH):
        try:
            os.remove(TEST_DB_PATH)
        except OSError:
            pass

    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    seed_demo_users(db)

    # Add a second student for Help-a-Friend and ineligible document tests
    # Student B: Sanjay Soren (no smartphone, has dues)
    from app.core.security import hash_password
    student_b_user = User(
        email="sanjay.soren@bput.ac.in",
        phone_number="9876544102",
        password_hash=hash_password(DEMO_PASSWORD),
        role=UserRole.STUDENT,
        first_name="Sanjay",
        last_name="Soren",
        theme_preference="light",
        is_active=True
    )
    db.add(student_b_user)
    db.flush()

    student_b = Student(
        id=student_b_user.id,
        roll_number="2201019",
        department="Mechanical Engineering",
        batch_year=2022,
        semester=6,
        section="B",
        room_number="A-108",
        dues_cleared=False,  # Ineligible for document generation!
        has_smartphone=False,
        parent_phone="9876544000"
    )
    db.add(student_b)
    db.commit()
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


def get_token(client, username):
    resp = client.post("/api/v1/auth/login", json={"username": username, "password": DEMO_PASSWORD})
    return resp.json()["access_token"]


# ==============================================================================
# WORKFLOW A: COMPLAINTS & MAINTENANCE TESTS (1 - 6)
# ==============================================================================

def test_01_student_creates_complaint(client):
    """Test 1: Student creates complaint with auto-triage category classification."""
    token = get_token(client, "priya.sharma@bput.ac.in")
    resp = client.post(
        "/api/v1/complaints",
        json={
            "title": "Water leakage in 3rd floor washroom",
            "description": "The pipe near the main basin has a broken seal leaking water continuously.",
            "location_type": "Hostel",
            "location_details": "Hostel Block B, 3rd Floor Washroom",
            "priority": "HIGH"
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["ticket_number"].startswith("CMP-")
    assert data["status"] == "OPEN"
    # Auto-triage should classify pipe/leak/water as plumbing
    assert data["category_id"] == "plumbing"


def test_02_complaint_belongs_to_authenticated_student(client):
    """Test 2: Complaint records the authenticated student's UUID."""
    token = get_token(client, "priya.sharma@bput.ac.in")
    resp = client.get("/api/v1/complaints", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    complaints = resp.json()
    assert len(complaints) >= 1
    db = TestingSessionLocal()
    student = db.query(Student).filter(Student.roll_number == "2201042").first()
    assert complaints[0]["student_id"] == str(student.id)
    db.close()


def test_03_admin_can_assign_complaint(client):
    """Test 3: Campus Admin can assign a complaint to maintenance staff."""
    admin_token = get_token(client, "dean.admin@bput.ac.in")
    student_token = get_token(client, "priya.sharma@bput.ac.in")

    # Get student complaint ID
    my_complaints = client.get("/api/v1/complaints", headers={"Authorization": f"Bearer {student_token}"}).json()
    cmp_id = my_complaints[0]["id"]

    # Get maintenance staff user ID
    db = TestingSessionLocal()
    staff_user = db.query(User).filter(User.email == "ramesh.estate@bput.ac.in").first()
    staff_id = str(staff_user.id)
    db.close()

    resp = client.patch(
        f"/api/v1/complaints/{cmp_id}/assign",
        json={"assigned_staff_id": staff_id},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ASSIGNED"
    assert resp.json()["assigned_staff_id"] == staff_id


def test_04_maintenance_staff_can_update_and_resolve(client):
    """Test 4: Maintenance staff can update status and mark RESOLVED."""
    staff_token = get_token(client, "ramesh.estate@bput.ac.in")
    student_token = get_token(client, "priya.sharma@bput.ac.in")

    cmp_id = client.get("/api/v1/complaints", headers={"Authorization": f"Bearer {student_token}"}).json()[0]["id"]

    # Transition to IN_PROGRESS
    resp1 = client.patch(
        f"/api/v1/complaints/{cmp_id}/status",
        json={"status": "IN_PROGRESS", "resolution_notes": "Plumber dispatched with spare pipe."},
        headers={"Authorization": f"Bearer {staff_token}"}
    )
    assert resp1.status_code == 200
    assert resp1.json()["status"] == "IN_PROGRESS"

    # Transition to RESOLVED
    resp2 = client.patch(
        f"/api/v1/complaints/{cmp_id}/status",
        json={"status": "RESOLVED", "resolution_notes": "Replaced pipe joint and tested water flow."},
        headers={"Authorization": f"Bearer {staff_token}"}
    )
    assert resp2.status_code == 200
    assert resp2.json()["status"] == "RESOLVED"
    assert resp2.json()["resolved_at"] is not None

    # Student verifies and rates
    rate_resp = client.post(
        f"/api/v1/complaints/{cmp_id}/rate",
        json={"rating": 5},
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert rate_resp.status_code == 200
    assert rate_resp.json()["rating"] == 5
    assert rate_resp.json()["status"] == "COMPLETED"


def test_05_unauthorized_role_rejected_from_complaint_assignment(client):
    """Test 5: Students cannot assign complaints (Requires ADMIN role)."""
    student_token = get_token(client, "priya.sharma@bput.ac.in")
    cmp_id = client.get("/api/v1/complaints", headers={"Authorization": f"Bearer {student_token}"}).json()[0]["id"]

    resp = client.patch(
        f"/api/v1/complaints/{cmp_id}/assign",
        json={"assigned_staff_id": str(uuid.uuid4())},
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert resp.status_code == 403


def test_06_recurring_hotspot_heuristic(client):
    """Test 6: Heuristic triggers is_recurring = True when >= 3 complaints occur in same block within 14 days."""
    token = get_token(client, "priya.sharma@bput.ac.in")

    loc = "Hostel Block B Wing 2"
    # Submit 2 electrical complaints
    for i in range(2):
        client.post(
            "/api/v1/complaints",
            json={
                "title": f"Flickering bulb {i+1}",
                "description": "Light switch sparks when turned on.",
                "location_type": "Hostel",
                "location_details": loc,
                "category_id": "electrical"
            },
            headers={"Authorization": f"Bearer {token}"}
        )

    # 3rd complaint in same location and category should trigger is_recurring = True
    resp3 = client.post(
        "/api/v1/complaints",
        json={
            "title": "Main power cut in corridor",
            "description": "Entire switchboard fuse tripped.",
            "location_type": "Hostel",
            "location_details": loc,
            "category_id": "electrical"
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp3.status_code == 201
    assert resp3.json()["is_recurring"] is True


# ==============================================================================
# WORKFLOW B: GATE PASS & ONE-TIME QR TESTS (7 - 15)
# ==============================================================================

def test_07_student_creates_gate_pass(client):
    """Test 7: Student submits gate pass outing application."""
    token = get_token(client, "priya.sharma@bput.ac.in")
    out_dt = datetime.now(timezone.utc) + timedelta(hours=1)
    in_dt = datetime.now(timezone.utc) + timedelta(hours=5)

    resp = client.post(
        "/api/v1/gatepasses",
        json={
            "pass_type": "DAY_OUTING",
            "out_time": out_dt.isoformat(),
            "expected_in_time": in_dt.isoformat(),
            "destination": "Central Market, Rourkela",
            "purpose": "Purchasing academic textbooks and stationery",
            "pin_code": "4321"
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["pass_number"].startswith("GP-")
    assert data["status"] == "PENDING"
    assert data["decision_status"] == "PENDING"
    assert data["pin_code"] == "4321"


def test_08_and_10_warden_approves_and_creates_one_active_qr(client):
    """Test 8 & 10: Warden approves pass, creating exactly one ACTIVE single-use QR token."""
    warden_token = get_token(client, "warden.sharma@bput.ac.in")
    student_token = get_token(client, "priya.sharma@bput.ac.in")

    pass_id = client.get("/api/v1/gatepasses", headers={"Authorization": f"Bearer {student_token}"}).json()[0]["id"]

    resp = client.patch(
        f"/api/v1/gatepasses/{pass_id}/approve",
        headers={"Authorization": f"Bearer {warden_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "APPROVED"
    assert data["decision_status"] == "APPROVED"
    assert data["decision_at"] is not None
    assert data["decision_by"] is not None

    # Check QR token exists and is ACTIVE
    assert data["qr_token"] is not None
    assert data["qr_token"]["status"] == "ACTIVE"
    assert len(data["qr_token"]["qr_token"]) == 64
    assert data["qr_token"]["qr_data_uri"].startswith("data:image/png;base64,")


def test_09_warden_can_reject_with_reason(client):
    """Test 9: Warden rejects gate pass with reason and updates decision timestamps."""
    warden_token = get_token(client, "warden.sharma@bput.ac.in")
    student_token = get_token(client, "priya.sharma@bput.ac.in")

    # Create second pass
    out_dt = datetime.now(timezone.utc) + timedelta(hours=2)
    in_dt = datetime.now(timezone.utc) + timedelta(hours=6)
    new_pass = client.post(
        "/api/v1/gatepasses",
        json={
            "pass_type": "DAY_OUTING",
            "out_time": out_dt.isoformat(),
            "expected_in_time": in_dt.isoformat(),
            "destination": "Cinema Hall",
            "purpose": "Movie with friends",
            "pin_code": "1111"
        },
        headers={"Authorization": f"Bearer {student_token}"}
    ).json()

    reject_resp = client.patch(
        f"/api/v1/gatepasses/{new_pass['id']}/reject",
        json={"rejection_reason": "Curfew restrictions active during semester examinations."},
        headers={"Authorization": f"Bearer {warden_token}"}
    )
    assert reject_resp.status_code == 200
    data = reject_resp.json()
    assert data["status"] == "REJECTED"
    assert data["decision_status"] == "REJECTED"
    assert "Curfew restrictions active" in data["rejection_reason"]


def test_11_12_14_guard_consumes_active_qr_records_actual_out_time(client):
    """Test 11, 12, 14: Security Guard scans active QR token, marks it USED, and logs actual_out_time."""
    guard_token = get_token(client, "guard.gate1@bput.ac.in")
    student_token = get_token(client, "priya.sharma@bput.ac.in")

    # Find the approved pass
    passes = client.get("/api/v1/gatepasses", headers={"Authorization": f"Bearer {student_token}"}).json()
    approved_pass = [p for p in passes if p["status"] == "APPROVED"][0]
    qr_token_str = approved_pass["qr_token"]["qr_token"]

    # Guard scans at perimeter gate
    scan_resp = client.post(
        "/api/v1/gatepasses/verify-qr",
        json={"qr_token": qr_token_str},
        headers={"Authorization": f"Bearer {guard_token}"}
    )
    assert scan_resp.status_code == 200
    data = scan_resp.json()
    assert data["status"] == "APPROVED"
    assert "actual_out_time" in data

    # Verify pass is now CHECKED_OUT and QR is USED
    updated_pass = client.get(f"/api/v1/gatepasses/{approved_pass['id']}", headers={"Authorization": f"Bearer {student_token}"}).json()
    assert updated_pass["status"] == "CHECKED_OUT"
    assert updated_pass["actual_out_time"] is not None
    assert updated_pass["qr_token"]["status"] == "USED"
    assert updated_pass["qr_token"]["used_at"] is not None


def test_13_second_qr_scan_is_strictly_rejected(client):
    """Test 13: Replaying / re-scanning an already USED QR code returns HTTP 409 Conflict."""
    guard_token = get_token(client, "guard.gate1@bput.ac.in")
    student_token = get_token(client, "priya.sharma@bput.ac.in")

    passes = client.get("/api/v1/gatepasses", headers={"Authorization": f"Bearer {student_token}"}).json()
    used_pass = [p for p in passes if p["status"] == "CHECKED_OUT"][0]
    qr_token_str = used_pass["qr_token"]["qr_token"]

    # Guard attempts replay scan
    replay_resp = client.post(
        "/api/v1/gatepasses/verify-qr",
        json={"qr_token": qr_token_str},
        headers={"Authorization": f"Bearer {guard_token}"}
    )
    assert replay_resp.status_code == 409
    assert "REPLAY ATTEMPT DETECTED" in replay_resp.json()["error"]["message"]


def test_15_return_completion_records_actual_in_time(client):
    """Test 15: Guard or warden logs student return, recording actual_in_time and marking pass COMPLETED."""
    guard_token = get_token(client, "guard.gate1@bput.ac.in")
    student_token = get_token(client, "priya.sharma@bput.ac.in")

    passes = client.get("/api/v1/gatepasses", headers={"Authorization": f"Bearer {student_token}"}).json()
    checked_out_pass = [p for p in passes if p["status"] == "CHECKED_OUT"][0]

    return_resp = client.post(
        f"/api/v1/gatepasses/{checked_out_pass['id']}/return",
        headers={"Authorization": f"Bearer {guard_token}"}
    )
    assert return_resp.status_code == 200
    data = return_resp.json()
    assert data["status"] == "COMPLETED"
    assert data["actual_in_time"] is not None


# ==============================================================================
# WORKFLOW C: HELP A FRIEND + OTP TESTS (16 - 23)
# ==============================================================================

def test_16_and_17_proxy_request_identifies_beneficiary_and_dispatches_otp(client):
    """Test 16 & 17: Student A identifies Student B (2201019) and backend creates 6-digit OTP."""
    student_a_token = get_token(client, "priya.sharma@bput.ac.in")

    with patch("app.services.proxy_service.twilio_verify_service.start_verification") as mock_start:
        mock_start.return_value = {"sid": "VExxx1617", "status": "pending", "to": "+919876544102"}
        resp = client.post(
            "/api/v1/help-a-friend/initiate",
            json={"beneficiary_roll_number": "2201019"},
            headers={"Authorization": f"Bearer {student_a_token}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "OTP_SENT"
        assert data["beneficiary_roll_number"] == "2201019"
        assert data["masked_phone"] == "****4102"
        assert data["expires_in_seconds"] == 600

    # Verify OTP was created in database
    db = TestingSessionLocal()
    beneficiary = db.query(Student).filter(Student.roll_number == "2201019").first()
    otp_record = db.query(OTPVerification).filter(
        OTPVerification.beneficiary_student_id == beneficiary.id,
        OTPVerification.is_verified == False
    ).first()
    assert otp_record is not None
    assert len(otp_record.otp_code_hash) == 64
    db.close()


def test_19_and_20_wrong_otp_and_max_attempts_lockout(client):
    """Test 19 & 20: Incorrect OTP decrements attempts; exceeding 3 attempts locks out request."""
    student_a_token = get_token(client, "priya.sharma@bput.ac.in")

    with patch("app.services.proxy_service.twilio_verify_service.check_verification") as mock_check:
        mock_check.return_value = {"sid": "VExxx", "status": "pending", "valid": False}

        # Attempt 1: Wrong code
        resp1 = client.post(
            "/api/v1/help-a-friend/verify-otp",
            json={"beneficiary_roll_number": "2201019", "otp_code": "000000"},
            headers={"Authorization": f"Bearer {student_a_token}"}
        )
        assert resp1.status_code == 400
        assert "2 attempt(s) remaining" in resp1.json()["error"]["message"]

        # Attempt 2: Wrong code
        resp2 = client.post(
            "/api/v1/help-a-friend/verify-otp",
            json={"beneficiary_roll_number": "2201019", "otp_code": "111111"},
            headers={"Authorization": f"Bearer {student_a_token}"}
        )
        assert resp2.status_code == 400
        assert "1 attempt(s) remaining" in resp2.json()["error"]["message"]

        # Attempt 3: Wrong code
        resp3 = client.post(
            "/api/v1/help-a-friend/verify-otp",
            json={"beneficiary_roll_number": "2201019", "otp_code": "222222"},
            headers={"Authorization": f"Bearer {student_a_token}"}
        )
        assert resp3.status_code == 400

        # Attempt 4: Should be locked out
        resp4 = client.post(
            "/api/v1/help-a-friend/verify-otp",
            json={"beneficiary_roll_number": "2201019", "otp_code": "333333"},
            headers={"Authorization": f"Bearer {student_a_token}"}
        )
        assert resp4.status_code == 400
        assert "exceeded" in resp4.json()["error"]["message"].lower()


def test_21_expired_otp_fails(client):
    """Test 21: Expired OTP is rejected."""
    student_a_token = get_token(client, "priya.sharma@bput.ac.in")

    # Manually seed an expired OTP record
    db = TestingSessionLocal()
    beneficiary = db.query(Student).filter(Student.roll_number == "2201019").first()
    raw_otp = "987654"
    expired_record = OTPVerification(
        beneficiary_student_id=beneficiary.id,
        phone_number="9876544102",
        otp_code_hash=hashlib.sha256(raw_otp.encode("utf-8")).hexdigest(),
        purpose="HELP_A_FRIEND",
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),  # Expired
        attempts=0,
        is_verified=False
    )
    db.add(expired_record)
    db.commit()
    db.close()

    resp = client.post(
        "/api/v1/help-a-friend/verify-otp",
        json={"beneficiary_roll_number": "2201019", "otp_code": raw_otp},
        headers={"Authorization": f"Bearer {student_a_token}"}
    )
    assert resp.status_code == 400
    assert "expired" in resp.json()["error"]["message"].lower()


def test_18_22_23_correct_otp_succeeds_single_use_request_belongs_to_beneficiary(client):
    """Test 18, 22, 23: Correct OTP verifies, can only be used once, and links complaint to Student B."""
    student_a_token = get_token(client, "priya.sharma@bput.ac.in")

    # Seed fresh valid OTP
    db = TestingSessionLocal()
    beneficiary = db.query(Student).filter(Student.roll_number == "2201019").first()
    valid_otp = "654321"
    valid_record = OTPVerification(
        beneficiary_student_id=beneficiary.id,
        phone_number="+919876544102",
        otp_code_hash=hashlib.sha256(b"validsid").hexdigest(),
        purpose="HELP_A_FRIEND",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        attempts=0,
        is_verified=False
    )
    db.add(valid_record)
    db.commit()
    db.refresh(valid_record)
    otp_id = str(valid_record.id)
    db.close()

    # Verify correct OTP via mocked Twilio Verify check
    with patch("app.services.proxy_service.twilio_verify_service.check_verification") as mock_check:
        mock_check.return_value = {"sid": "VExxx", "status": "approved", "valid": True}
        verify_resp = client.post(
            "/api/v1/help-a-friend/verify-otp",
            json={"beneficiary_roll_number": "2201019", "otp_code": valid_otp},
            headers={"Authorization": f"Bearer {student_a_token}"}
        )
        assert verify_resp.status_code == 200
        assert verify_resp.json()["status"] == "VERIFIED"

    # Submit complaint via proxy
    submit_resp = client.post(
        "/api/v1/help-a-friend/submit",
        json={
            "otp_verification_id": otp_id,
            "complaint": {
                "title": "Broken window latch in Room A-108",
                "description": "Window glass rattles in strong wind, latch screw loose.",
                "location_type": "Hostel",
                "location_details": "Hostel Block A, Room 108",
                "category_id": "carpentry"
            }
        },
        headers={"Authorization": f"Bearer {student_a_token}"}
    )
    assert submit_resp.status_code == 201
    created_cmp = submit_resp.json()

    # Crucial Test 23: Complaint belongs to Student B (beneficiary), NOT Student A!
    db = TestingSessionLocal()
    beneficiary_student = db.query(Student).filter(Student.roll_number == "2201019").first()
    assert created_cmp["student_id"] == str(beneficiary_student.id)

    # Crucial Test 22: Re-submitting with the same OTP fails (Single-use enforcement)
    reuse_resp = client.post(
        "/api/v1/help-a-friend/submit",
        json={
            "otp_verification_id": otp_id,
            "complaint": {
                "title": "Duplicate attempt",
                "description": "This should fail because token is already consumed.",
                "location_type": "Hostel",
                "location_details": "Hostel Block A, Room 108"
            }
        },
        headers={"Authorization": f"Bearer {student_a_token}"}
    )
    assert reuse_resp.status_code == 409
    db.close()


# ==============================================================================
# WORKFLOW D: DOCUMENT REQUEST & REPORTLAB PDF TESTS (24 - 28)
# ==============================================================================

def test_24_eligible_student_can_request_document(client):
    """Test 24: Eligible student (dues cleared) can submit certificate request."""
    token = get_token(client, "priya.sharma@bput.ac.in")
    resp = client.post(
        "/api/v1/documents",
        json={
            "document_type": "BONAFIDE",
            "purpose": "National Scholarship Portal Renewal"
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["request_number"].startswith("DOC-")
    assert data["status"] == "SUBMITTED"
    assert data["document_type"] == "BONAFIDE"


def test_25_ineligible_student_cannot_request_document(client):
    """Test 25: Ineligible student (dues not cleared) is rejected with clear error."""
    token = get_token(client, "sanjay.soren@bput.ac.in")
    resp = client.post(
        "/api/v1/documents",
        json={
            "document_type": "HOSTEL_RESIDENCE",
            "purpose": "Bank Loan Verification"
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 400
    assert "Outstanding institutional dues" in resp.json()["error"]["message"]


def test_26_27_28_admin_approves_pdf_generated_and_qr_stamped(client):
    """Test 26, 27, 28: Admin approves request -> ReportLab generates PDF with Segno QR and stores reference."""
    admin_token = get_token(client, "dean.admin@bput.ac.in")
    student_token = get_token(client, "priya.sharma@bput.ac.in")

    doc_requests = client.get("/api/v1/documents", headers={"Authorization": f"Bearer {student_token}"}).json()
    req_id = doc_requests[0]["id"]

    approve_resp = client.patch(
        f"/api/v1/documents/{req_id}/approve",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert approve_resp.status_code == 200
    data = approve_resp.json()
    assert data["status"] == "APPROVED"
    assert data["verification_hash"] is not None
    assert len(data["verification_hash"]) == 64
    assert data["document_url"] is not None
    assert data["document_url"].endswith(".pdf")

    # Verify physical PDF file exists on disk
    rel_path = data["document_url"].lstrip("/")
    assert os.path.exists(rel_path)
    assert os.path.getsize(rel_path) > 1000  # PDF generated with canvas & QR

    # Test downloading the PDF certificate
    dl_resp = client.get(
        f"/api/v1/documents/{req_id}/download",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert dl_resp.status_code == 200
    assert dl_resp.headers["content-type"] == "application/pdf"
    assert dl_resp.content.startswith(b"%PDF")


def test_21_help_a_friend_with_matching_mobile_number(client):
    """Test 21: Student A initiates proxy with matching mobile number via Twilio Verify."""
    student_a_token = get_token(client, "priya.sharma@bput.ac.in")

    # Clear prior pending OTP records to reset 60-second cooldown
    db = TestingSessionLocal()
    beneficiary = db.query(Student).filter(Student.roll_number == "2201019").first()
    db.query(OTPVerification).filter(OTPVerification.beneficiary_student_id == beneficiary.id).delete()
    db.commit()
    db.close()

    with patch("app.services.proxy_service.twilio_verify_service.start_verification") as mock_start:
        mock_start.return_value = {"sid": "VExxx21", "status": "pending", "to": "+919876544102"}
        resp = client.post(
            "/api/v1/help-a-friend/initiate",
            json={
                "student_id": "2201019",
                "student_mobile_number": "+91 9876544102"
            },
            headers={"Authorization": f"Bearer {student_a_token}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "OTP_SENT"
        assert data["beneficiary_roll_number"] == "2201019"
        assert data["demo_otp"] is None
        assert data["student_mobile"] == "+91 9876544102"


def test_22_help_a_friend_with_mismatched_mobile_number_fails(client):
    """Test 22: Student A initiates proxy with mismatched mobile number and gets 400 error."""
    student_a_token = get_token(client, "priya.sharma@bput.ac.in")

    resp = client.post(
        "/api/v1/help-a-friend/initiate",
        json={
            "student_id": "2201019",
            "student_mobile_number": "+91 9876500000"
        },
        headers={"Authorization": f"Bearer {student_a_token}"}
    )
    assert resp.status_code == 400
    assert "does not match the registered contact number" in resp.json()["error"]["message"]

