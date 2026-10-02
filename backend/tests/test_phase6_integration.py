import os
import uuid
import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.core.database import get_db
from app.models.base import Base
from app.models.user import User, Student, UserRole
from app.models.complaint import Complaint, ComplaintStatus
from app.models.gate_pass import GatePass, GatePassStatus, DecisionStatus, QRTokenStatus
from app.models.document_request import DocumentRequest, DocumentType, DocumentRequestStatus
from app.models.proxy_request import OTPVerification, ProxyRequest
from app.models.academic import AttendanceSession, AttendanceRecord, AttendanceStatus, ClassNotice
from app.models.lab import LabEquipment, EquipmentWorkingStatus, LabRequisition, LabRequisitionStatus
from app.models.audit import AuditLog
from app.models.notification import InAppNotification
from seed import seed_demo_users, seed_cross_module_data, DEMO_PASSWORD

TEST_DB_PATH = "test_phase6.db"
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
    demo_users = seed_demo_users(db)
    seed_cross_module_data(db, demo_users)
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
# INTEGRATION JOURNEY 1: FULL COMPLAINT & RESOLUTION LIFECYCLE
# ==============================================================================

def test_journey_1_complaint_lifecycle(client):
    """
    STUDENT -> COMPLAINT -> ADMIN ASSIGNMENT -> STAFF RESOLUTION -> STUDENT RATING
    Validates end-to-end maintenance ticket resolution, status progression, audit logging, and rating.
    """
    student_token = get_token(client, "priya.sharma@bput.ac.in")
    admin_token = get_token(client, "dean.admin@bput.ac.in")
    staff_token = get_token(client, "ramesh.estate@bput.ac.in")

    # Step 1: Student lodges complaint
    lodge_resp = client.post(
        "/api/v1/complaints",
        json={
            "title": "Water cooler cooling coil leaking",
            "description": "2nd floor hostel water cooler is leaking water onto electrical wiring.",
            "location_type": "Hostel",
            "location_details": "Hostel Block B, 2nd Floor Corridor",
            "priority": "HIGH"
        },
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert lodge_resp.status_code == 201
    cmp_data = lodge_resp.json()
    cmp_id = cmp_data["id"]
    assert cmp_data["status"] == "OPEN"
    assert cmp_data["category_id"] == "plumbing"  # heuristic auto-triage

    # Step 2: Admin assigns complaint to Maintenance Staff
    db = TestingSessionLocal()
    staff_user = db.query(User).filter(User.email == "ramesh.estate@bput.ac.in").first()
    staff_id = str(staff_user.id)
    db.close()

    assign_resp = client.patch(
        f"/api/v1/complaints/{cmp_id}/assign",
        json={"assigned_staff_id": staff_id},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert assign_resp.status_code == 200
    assert assign_resp.json()["status"] == "ASSIGNED"
    assert assign_resp.json()["assigned_staff_id"] == staff_id

    # Step 3: Staff moves to IN_PROGRESS then RESOLVED
    prog_resp = client.patch(
        f"/api/v1/complaints/{cmp_id}/status",
        json={"status": "IN_PROGRESS", "resolution_notes": "Technician inspecting refrigerant lines."},
        headers={"Authorization": f"Bearer {staff_token}"}
    )
    assert prog_resp.status_code == 200
    assert prog_resp.json()["status"] == "IN_PROGRESS"

    resolve_resp = client.patch(
        f"/api/v1/complaints/{cmp_id}/status",
        json={"status": "RESOLVED", "resolution_notes": "Replaced copper coil joint and refilled gas."},
        headers={"Authorization": f"Bearer {staff_token}"}
    )
    assert resolve_resp.status_code == 200
    assert resolve_resp.json()["status"] == "RESOLVED"
    assert resolve_resp.json()["resolved_at"] is not None

    # Step 4: Student rates and closes ticket -> COMPLETED
    rate_resp = client.post(
        f"/api/v1/complaints/{cmp_id}/rate",
        json={"rating": 5},
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert rate_resp.status_code == 200
    assert rate_resp.json()["status"] == "COMPLETED"
    assert rate_resp.json()["rating"] == 5

    # Step 5: Verify audit ledger trail
    db = TestingSessionLocal()
    audit_entries = db.query(AuditLog).filter(AuditLog.entity_id == uuid.UUID(cmp_id)).all()
    actions = [a.action for a in audit_entries]
    assert "CREATE" in actions
    assert "ASSIGN" in actions
    assert "STATUS_UPDATE" in actions
    assert "RATE" in actions
    db.close()


# ==============================================================================
# INTEGRATION JOURNEY 2: FULL GATE PASS & ONE-TIME QR REPLAY PROTECTION
# ==============================================================================

def test_journey_2_gate_pass_and_single_use_qr(client):
    """
    STUDENT -> GATE PASS -> WARDEN APPROVAL -> ONE-TIME QR -> SECURITY SCAN -> SECOND SCAN REJECTED -> RETURN SCAN
    """
    student_token = get_token(client, "priya.sharma@bput.ac.in")
    warden_token = get_token(client, "warden.sharma@bput.ac.in")
    guard_token = get_token(client, "guard.gate1@bput.ac.in")

    out_time = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    in_time = (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat()

    # Step 1: Student applies for outing gate pass
    apply_resp = client.post(
        "/api/v1/gatepasses",
        json={
            "pass_type": "DAY_OUTING",
            "destination": "Bhubaneswar Railway Station",
            "purpose": "Receiving relative from express train",
            "out_time": out_time,
            "expected_in_time": in_time
        },
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert apply_resp.status_code == 201
    pass_id = apply_resp.json()["id"]
    assert apply_resp.json()["status"] == "PENDING"

    # Step 2: Warden approves gate pass
    approve_resp = client.patch(
        f"/api/v1/gatepasses/{pass_id}/approve",
        headers={"Authorization": f"Bearer {warden_token}"}
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["status"] == "APPROVED"
    assert approve_resp.json()["decision_status"] == "APPROVED"

    # Step 3: Student retrieves active one-time QR token
    gp_resp = client.get(
        f"/api/v1/gatepasses/{pass_id}",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert gp_resp.status_code == 200
    qr_data = gp_resp.json()["qr_token"]
    assert qr_data["status"] == "ACTIVE"
    qr_token_str = qr_data["qr_token"]

    # Step 4: Security guard scans valid ACTIVE QR token -> Exit granted
    scan1 = client.post(
        "/api/v1/gatepasses/verify-qr",
        json={"qr_token": qr_token_str},
        headers={"Authorization": f"Bearer {guard_token}"}
    )
    assert scan1.status_code == 200
    assert scan1.json()["status"] == "APPROVED"
    assert "actual_out_time" in scan1.json()

    # Step 5: CRITICAL ONE-TIME CHECK — Guard scans SAME QR second time -> HTTP 409 REPLAY REJECTED
    scan2 = client.post(
        "/api/v1/gatepasses/verify-qr",
        json={"qr_token": qr_token_str},
        headers={"Authorization": f"Bearer {guard_token}"}
    )
    assert scan2.status_code == 409
    assert "REPLAY" in scan2.json()["error"]["message"]

    # Step 6: Guard records student return -> Pass moves to COMPLETED
    return_resp = client.post(
        f"/api/v1/gatepasses/{pass_id}/return",
        headers={"Authorization": f"Bearer {guard_token}"}
    )
    assert return_resp.status_code == 200
    assert return_resp.json()["status"] == "COMPLETED"
    assert return_resp.json()["actual_in_time"] is not None


# ==============================================================================
# INTEGRATION JOURNEY 3: HELP-A-FRIEND PROXY & OTP WORKFLOW
# ==============================================================================

def test_journey_3_help_a_friend_proxy_flow(client):
    """
    STUDENT A -> HELP A FRIEND -> BENEFICIARY RESOLUTION -> OTP DISPATCH -> VERIFY -> PROXY COMPLAINT
    """
    student_a_token = get_token(client, "priya.sharma@bput.ac.in")

    # Step 1: Student A initiates request for Student B (Sanjay Soren, roll 2201019)
    init_resp = client.post(
        "/api/v1/help-a-friend/initiate",
        json={"beneficiary_roll_number": "2201019"},
        headers={"Authorization": f"Bearer {student_a_token}"}
    )
    assert init_resp.status_code == 200
    assert init_resp.json()["status"] == "OTP_SENT"
    assert init_resp.json()["beneficiary_roll_number"] == "2201019"

    # Step 2: Retrieve the dispatched mock OTP from prototype SMS ledger
    db = TestingSessionLocal()
    from app.models.notification import SMSNotification
    sms = db.query(SMSNotification).filter(SMSNotification.trigger_event == "OTP_DISPATCH").order_by(SMSNotification.dispatched_at.desc()).first()
    import re
    otp_code = re.search(r"\b(\d{6})\b", sms.message_body).group(1)
    db.close()

    # Step 3: Student A verifies OTP
    verify_resp = client.post(
        "/api/v1/help-a-friend/verify-otp",
        json={
            "beneficiary_roll_number": "2201019",
            "otp_code": otp_code
        },
        headers={"Authorization": f"Bearer {student_a_token}"}
    )
    assert verify_resp.status_code == 200
    otp_ver_id = verify_resp.json()["otp_verification_id"]

    # Step 4: Student A submits proxy complaint on behalf of Student B
    submit_resp = client.post(
        "/api/v1/help-a-friend/submit",
        json={
            "otp_verification_id": otp_ver_id,
            "complaint": {
                "title": "Broken study desk leg in Room B-108",
                "description": "Desk is tilted and unstable.",
                "location_type": "Hostel",
                "location_details": "Hostel Block B, Room B-108",
                "priority": "NORMAL"
            }
        },
        headers={"Authorization": f"Bearer {student_a_token}"}
    )
    assert submit_resp.status_code == 201
    proxy_cmp = submit_resp.json()

    # Verify ticket belongs to Student B (beneficiary), NOT Student A
    db = TestingSessionLocal()
    student_b = db.query(Student).filter(Student.roll_number == "2201019").first()
    assert proxy_cmp["student_id"] == str(student_b.id)

    # Verify proxy linkage persisted
    proxy_link = db.query(ProxyRequest).filter(ProxyRequest.entity_id == uuid.UUID(proxy_cmp["id"])).first()
    assert proxy_link is not None
    assert proxy_link.beneficiary_student_id == student_b.id
    db.close()


# ==============================================================================
# INTEGRATION JOURNEY 4: DOCUMENT REQUEST & CERTIFICATE GENERATION
# ==============================================================================

def test_journey_4_document_request_and_pdf_generation(client):
    """
    STUDENT -> DOCUMENT REQUEST -> DUES CLEARANCE -> REPORTLAB PDF -> DOWNLOAD
    """
    student_token = get_token(client, "priya.sharma@bput.ac.in")
    admin_token = get_token(client, "dean.admin@bput.ac.in")

    # Step 1: Student creates document request
    doc_resp = client.post(
        "/api/v1/documents",
        json={
            "document_type": "BONAFIDE",
            "purpose": "State government merit-cum-means scholarship application"
        },
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert doc_resp.status_code == 201
    doc_id = doc_resp.json()["id"]

    # Step 2: Admin reviews & approves request (triggers ReportLab PDF & Segno QR generation)
    appr_resp = client.patch(
        f"/api/v1/documents/{doc_id}/approve",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert appr_resp.status_code == 200
    appr_data = appr_resp.json()
    assert appr_data["status"] == "APPROVED"
    assert appr_data["document_url"] is not None
    assert appr_data["verification_hash"] is not None

    # Step 3: Student downloads institutional PDF certificate
    dl_resp = client.get(
        f"/api/v1/documents/{doc_id}/download",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert dl_resp.status_code == 200
    assert dl_resp.headers["content-type"] == "application/pdf"
    assert dl_resp.content.startswith(b"%PDF")


# ==============================================================================
# INTEGRATION JOURNEY 5: TEACHER ATTENDANCE, NOTICES & STUDY MATERIALS
# ==============================================================================

def test_journey_5_academic_attendance_notices_and_materials(client):
    """
    TEACHER -> ATTENDANCE SESSION -> ATTENDANCE RECORDS -> NOTICES -> STUDY MATERIALS
    """
    teacher_token = get_token(client, "prof.mohanty@bput.ac.in")
    student_token = get_token(client, "priya.sharma@bput.ac.in")

    # Step 1: Teacher creates session and marks student PRESENT
    sess_resp = client.post(
        "/api/v1/attendance/sessions",
        json={
            "subject": "Operating Systems (CS603)",
            "branch": "Computer Science & Engineering",
            "batch_year": 2022,
            "section": "A"
        },
        headers={"Authorization": f"Bearer {teacher_token}"}
    )
    assert sess_resp.status_code == 201
    sess_id = sess_resp.json()["id"]

    db = TestingSessionLocal()
    student = db.query(Student).filter(Student.roll_number == "2201042").first()
    db.close()

    att_resp = client.post(
        f"/api/v1/attendance/sessions/{sess_id}/records",
        json=[{"student_id": str(student.id), "status": "PRESENT"}],
        headers={"Authorization": f"Bearer {teacher_token}"}
    )
    assert att_resp.status_code == 201

    # Step 2: Student retrieves attendance percentage
    my_att = client.get("/api/v1/attendance/my-attendance", headers={"Authorization": f"Bearer {student_token}"})
    assert my_att.status_code == 200
    assert my_att.json()["attendance_percentage"] > 0

    # Step 3: Teacher publishes targeted notice
    notice_resp = client.post(
        "/api/v1/class-notices",
        json={
            "notice_type": "ROOM_CHANGED",
            "target_branch": "Computer Science & Engineering",
            "target_year": 2022,
            "target_semester": 6,
            "target_section": "A",
            "subject": "Operating Systems",
            "class_date": datetime.now(timezone.utc).isoformat(),
            "period": "03:00 PM - 04:00 PM",
            "details": "Class shifted to CS Lab 2."
        },
        headers={"Authorization": f"Bearer {teacher_token}"}
    )
    assert notice_resp.status_code == 201

    # Step 4: Student in target cohort sees notice
    notices = client.get("/api/v1/class-notices", headers={"Authorization": f"Bearer {student_token}"}).json()
    assert any(n["subject"] == "Operating Systems" for n in notices)


# ==============================================================================
# INTEGRATION JOURNEY 6: LAB & WORKSHOP REQUISITION STATE MACHINE
# ==============================================================================

def test_journey_6_lab_equipment_and_requisition_lifecycle(client):
    """
    LAB ASSISTANT -> EQUIPMENT -> REQUISITION -> SUBMISSION -> APPROVAL -> ORDER -> COMPLETION
    """
    lab_token = get_token(client, "ramesh.lab@bput.ac.in")
    admin_token = get_token(client, "dean.admin@bput.ac.in")

    # Step 1: Register equipment
    eq_resp = client.post(
        "/api/v1/lab/equipment",
        json={
            "equipment_id": "EQ-DRILL-INT-01",
            "name": "Heavy Duty Bench Drill Press",
            "category": "Drilling Machines",
            "lab_name": "Mechanical Workshop",
            "total_quantity": 3,
            "available_quantity": 3,
            "damaged_quantity": 0,
            "working_status": "FUNCTIONAL"
        },
        headers={"Authorization": f"Bearer {lab_token}"}
    )
    assert eq_resp.status_code == 201

    # Step 2: Create DRAFT requisition & add item
    req_resp = client.post(
        "/api/v1/lab/requisitions",
        json={"lab_name": "Mechanical Workshop"},
        headers={"Authorization": f"Bearer {lab_token}"}
    )
    assert req_resp.status_code == 201
    req_id = req_resp.json()["id"]

    item_resp = client.post(
        f"/api/v1/lab/requisitions/{req_id}/items",
        json={
            "item_name": "Drill Chuck Key & Spare Arbor",
            "quantity": 5,
            "unit": "sets",
            "justification": "Replacement parts for workshop drills"
        },
        headers={"Authorization": f"Bearer {lab_token}"}
    )
    assert item_resp.status_code == 201

    # Step 3: Submit requisition
    sub_resp = client.post(f"/api/v1/lab/requisitions/{req_id}/submit", headers={"Authorization": f"Bearer {lab_token}"})
    assert sub_resp.status_code == 200
    assert sub_resp.json()["status"] == "SUBMITTED"

    # Step 4: Admin approves
    appr_resp = client.post(
        f"/api/v1/lab/requisitions/{req_id}/review",
        json={"status": "APPROVED"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert appr_resp.status_code == 200
    assert appr_resp.json()["status"] == "APPROVED"

    # Step 5: Advance APPROVED -> ORDERED -> COMPLETED
    ord_resp = client.post(f"/api/v1/lab/requisitions/{req_id}/order", headers={"Authorization": f"Bearer {admin_token}"})
    assert ord_resp.status_code == 200
    assert ord_resp.json()["status"] == "ORDERED"

    comp_resp = client.post(f"/api/v1/lab/requisitions/{req_id}/complete", headers={"Authorization": f"Bearer {admin_token}"})
    assert comp_resp.status_code == 200
    assert comp_resp.json()["status"] == "COMPLETED"


# ==============================================================================
# INTEGRATION JOURNEY 7: ADMIN CONTROL TOWER & AUDIT TRAIL VISIBILITY
# ==============================================================================

def test_journey_7_admin_control_tower_and_audit_telemetry(client):
    """
    ADMIN -> CONTROL TOWER METRICS -> SLA BREACHES -> RECURRING HOTSPOTS -> AUDIT LOGS
    """
    admin_token = get_token(client, "dean.admin@bput.ac.in")

    # Step 1: Retrieve Control Tower metrics
    metrics = client.get("/api/v1/admin/control-tower/metrics", headers={"Authorization": f"Bearer {admin_token}"})
    assert metrics.status_code == 200
    m_data = metrics.json()
    assert m_data["total_complaints"] >= 1
    assert "complaints_by_status" in m_data
    assert "staff_workload" in m_data

    # Step 2: Query SLA breaches
    breaches = client.get("/api/v1/admin/control-tower/sla-breaches", headers={"Authorization": f"Bearer {admin_token}"})
    assert breaches.status_code == 200
    assert isinstance(breaches.json(), list)

    # Step 3: Query recurring hotspots
    recurring = client.get("/api/v1/admin/control-tower/recurring-complaints", headers={"Authorization": f"Bearer {admin_token}"})
    assert recurring.status_code == 200
    assert isinstance(recurring.json(), list)

    # Step 4: Query audit trail
    audit_logs = client.get("/api/v1/admin/audit-logs", headers={"Authorization": f"Bearer {admin_token}"})
    assert audit_logs.status_code == 200
    assert len(audit_logs.json()) >= 1


# ==============================================================================
# INTEGRATION JOURNEY 8: SECURITY & RBAC REGRESSION MATRIX
# ==============================================================================

def test_journey_8_rbac_security_matrix(client):
    """
    Strictly verifies cross-role authorization fences:
    - Student cannot access Control Tower (403)
    - Student cannot approve Gate Passes (403)
    - Teacher cannot review Lab Requisitions (403)
    - Guard cannot approve Gate Passes (403)
    - Maintenance Staff cannot post class notices (403)
    """
    student_token = get_token(client, "priya.sharma@bput.ac.in")
    teacher_token = get_token(client, "prof.mohanty@bput.ac.in")
    guard_token = get_token(client, "guard.gate1@bput.ac.in")
    staff_token = get_token(client, "ramesh.estate@bput.ac.in")

    # 1. Student blocked from Control Tower
    r1 = client.get("/api/v1/admin/control-tower/metrics", headers={"Authorization": f"Bearer {student_token}"})
    assert r1.status_code == 403

    # 2. Student blocked from approving gate passes
    r2 = client.patch(
        f"/api/v1/gatepasses/{uuid.uuid4()}/approve",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert r2.status_code == 403

    # 3. Guard blocked from approving gate passes (Can only scan QR)
    r3 = client.patch(
        f"/api/v1/gatepasses/{uuid.uuid4()}/approve",
        headers={"Authorization": f"Bearer {guard_token}"}
    )
    assert r3.status_code == 403

    # 4. Teacher blocked from reviewing lab requisitions
    r4 = client.post(
        f"/api/v1/lab/requisitions/{uuid.uuid4()}/review",
        json={"status": "APPROVED"},
        headers={"Authorization": f"Bearer {teacher_token}"}
    )
    assert r4.status_code == 403

    # 5. Maintenance staff blocked from publishing class notices
    r5 = client.post(
        "/api/v1/class-notices",
        json={
            "notice_type": "CANCELLED",
            "target_branch": "Computer Science & Engineering",
            "target_year": 2022,
            "target_semester": 6,
            "target_section": "A",
            "subject": "CS601",
            "class_date": datetime.now(timezone.utc).isoformat(),
            "period": "1st",
            "details": "Unauthorized"
        },
        headers={"Authorization": f"Bearer {staff_token}"}
    )
    assert r5.status_code == 403


# ==============================================================================
# INTEGRATION JOURNEY 9: NOTIFICATION DELIVERY & READ STATE
# ==============================================================================

def test_journey_9_notification_delivery_and_read_state(client):
    """
    Validates in-app notification retrieval, unread badge count, and read state synchronization.
    """
    student_token = get_token(client, "priya.sharma@bput.ac.in")

    # Step 1: Student retrieves transactional notifications
    resp = client.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "unread_count" in data
    assert "notifications" in data
    assert len(data["notifications"]) >= 1

    first_notif = data["notifications"][0]
    notif_id = first_notif["id"]

    # Step 2: Mark notification as read
    read_resp = client.patch(
        f"/api/v1/notifications/{notif_id}/read",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert read_resp.status_code == 200
    assert read_resp.json()["is_read"] is True

    # Step 3: Verify unread count decremented
    resp2 = client.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert resp2.status_code == 200
    assert resp2.json()["unread_count"] == data["unread_count"] - (1 if not first_notif["is_read"] else 0)

