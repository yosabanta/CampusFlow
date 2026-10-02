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
from app.models.academic import AttendanceSession, AttendanceRecord, AttendanceStatus, ClassNoticeType
from app.models.lab import EquipmentWorkingStatus, LabRequisitionStatus
from app.models.complaint import Complaint, ComplaintStatus
from app.models.audit import AuditLog
from seed import seed_demo_users, DEMO_PASSWORD

TEST_DB_PATH = "test_phase5.db"
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

    # Seed an unrelated student (Mechanical Engineering, 2023, Sem 4)
    from app.core.security import hash_password
    student_b_user = User(
        email="rahul.mech@bput.ac.in",
        phone_number="9876544999",
        password_hash=hash_password(DEMO_PASSWORD),
        role=UserRole.STUDENT,
        first_name="Rahul",
        last_name="Verma",
        theme_preference="light",
        is_active=True
    )
    db.add(student_b_user)
    db.flush()

    student_b = Student(
        id=student_b_user.id,
        roll_number="2301088",
        department="Mechanical Engineering",
        batch_year=2023,
        semester=4,
        section="B",
        dues_cleared=True,
        has_smartphone=True
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
# WORKFLOW A: ATTENDANCE TESTS (1 - 6)
# ==============================================================================

def test_01_teacher_creates_attendance_session(client):
    """Test 1: Teacher creates an attendance session."""
    teacher_token = get_token(client, "prof.mohanty@bput.ac.in")
    resp = client.post(
        "/api/v1/attendance/sessions",
        json={
            "subject": "Cloud Computing (CS601)",
            "branch": "Computer Science & Engineering",
            "batch_year": 2022,
            "section": "A"
        },
        headers={"Authorization": f"Bearer {teacher_token}"}
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["subject"] == "Cloud Computing (CS601)"
    assert data["section"] == "A"
    assert "id" in data


def test_02_teacher_records_attendance(client):
    """Test 2: Teacher records attendance entries for students in the session."""
    teacher_token = get_token(client, "prof.mohanty@bput.ac.in")

    db = TestingSessionLocal()
    session = db.query(AttendanceSession).first()
    student = db.query(Student).filter(Student.roll_number == "2201042").first()
    db.close()

    resp = client.post(
        f"/api/v1/attendance/sessions/{session.id}/records",
        json=[
            {
                "student_id": str(student.id),
                "status": "PRESENT"
            }
        ],
        headers={"Authorization": f"Bearer {teacher_token}"}
    )
    assert resp.status_code == 201
    records = resp.json()
    assert len(records) == 1
    assert records[0]["status"] == "PRESENT"
    assert records[0]["student_id"] == str(student.id)


def test_03_duplicate_student_attendance_is_rejected(client):
    """Test 3: Duplicate attendance entry for the same student in the same session is rejected with 409 Conflict."""
    teacher_token = get_token(client, "prof.mohanty@bput.ac.in")

    db = TestingSessionLocal()
    session = db.query(AttendanceSession).first()
    student = db.query(Student).filter(Student.roll_number == "2201042").first()
    db.close()

    resp = client.post(
        f"/api/v1/attendance/sessions/{session.id}/records",
        json=[
            {
                "student_id": str(student.id),
                "status": "LATE"
            }
        ],
        headers={"Authorization": f"Bearer {teacher_token}"}
    )
    assert resp.status_code == 409


def test_04_student_can_retrieve_own_attendance(client):
    """Test 4: Student retrieves their personal attendance summary and records."""
    student_token = get_token(client, "priya.sharma@bput.ac.in")
    resp = client.get("/api/v1/attendance/my-attendance", headers={"Authorization": f"Bearer {student_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_sessions"] >= 1
    assert data["present_count"] >= 1
    assert len(data["records"]) >= 1


def test_05_student_cannot_retrieve_another_students_private_attendance(client):
    """Test 5: Student cannot retrieve another student's attendance records (403 Forbidden)."""
    student_a_token = get_token(client, "priya.sharma@bput.ac.in")

    db = TestingSessionLocal()
    student_b = db.query(Student).filter(Student.roll_number == "2301088").first()
    db.close()

    resp = client.get(
        f"/api/v1/attendance/student/{student_b.id}",
        headers={"Authorization": f"Bearer {student_a_token}"}
    )
    assert resp.status_code == 403


def test_06_attendance_percentage_calculation_works(client):
    """Test 6: Attendance percentage is accurately calculated."""
    teacher_token = get_token(client, "prof.mohanty@bput.ac.in")
    student_token = get_token(client, "priya.sharma@bput.ac.in")

    # Create session 2 and mark student ABSENT
    s2_resp = client.post(
        "/api/v1/attendance/sessions",
        json={
            "subject": "Data Structures",
            "branch": "Computer Science & Engineering",
            "batch_year": 2022,
            "section": "A"
        },
        headers={"Authorization": f"Bearer {teacher_token}"}
    )
    s2_id = s2_resp.json()["id"]

    db = TestingSessionLocal()
    student = db.query(Student).filter(Student.roll_number == "2201042").first()
    db.close()

    client.post(
        f"/api/v1/attendance/sessions/{s2_id}/records",
        json=[{"student_id": str(student.id), "status": "ABSENT"}],
        headers={"Authorization": f"Bearer {teacher_token}"}
    )

    # Now Priya has 2 sessions: 1 PRESENT, 1 ABSENT -> 50.0%
    att_resp = client.get("/api/v1/attendance/my-attendance", headers={"Authorization": f"Bearer {student_token}"})
    assert att_resp.status_code == 200
    data = att_resp.json()
    assert data["total_sessions"] == 2
    assert data["present_count"] == 1
    assert data["absent_count"] == 1
    assert data["attendance_percentage"] == 50.0


# ==============================================================================
# WORKFLOW B: CLASS NOTICES TESTS (7 - 10)
# ==============================================================================

def test_07_teacher_creates_class_notice(client):
    """Test 7: Teacher publishes an academic class notice."""
    teacher_token = get_token(client, "prof.mohanty@bput.ac.in")
    dt = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    resp = client.post(
        "/api/v1/class-notices",
        json={
            "notice_type": "RESCHEDULED",
            "target_branch": "Computer Science & Engineering",
            "target_year": 2022,
            "target_semester": 6,
            "target_section": "A",
            "subject": "Cloud Computing (CS601)",
            "class_date": dt,
            "period": "10:00 AM - 11:00 AM",
            "details": "Class shifted to Room 402 due to lab maintenance."
        },
        headers={"Authorization": f"Bearer {teacher_token}"}
    )
    assert resp.status_code == 201
    assert resp.json()["notice_type"] == "RESCHEDULED"
    assert resp.json()["target_section"] == "A"


def test_08_invalid_notice_type_is_rejected(client):
    """Test 8: Invalid notice type is rejected with 422."""
    teacher_token = get_token(client, "prof.mohanty@bput.ac.in")
    dt = datetime.now(timezone.utc).isoformat()
    resp = client.post(
        "/api/v1/class-notices",
        json={
            "notice_type": "PARTY_INVITATION",
            "target_branch": "Computer Science & Engineering",
            "target_year": 2022,
            "target_semester": 6,
            "target_section": "A",
            "subject": "CS601",
            "class_date": dt,
            "period": "1st Period",
            "details": "Invalid notice."
        },
        headers={"Authorization": f"Bearer {teacher_token}"}
    )
    assert resp.status_code == 422


def test_09_applicable_student_can_retrieve_notice(client):
    """Test 9: Applicable student receives targeted class notices."""
    student_token = get_token(client, "priya.sharma@bput.ac.in")
    resp = client.get("/api/v1/class-notices", headers={"Authorization": f"Bearer {student_token}"})
    assert resp.status_code == 200
    notices = resp.json()
    assert len(notices) >= 1
    assert notices[0]["subject"] == "Cloud Computing (CS601)"


def test_10_unauthorized_role_cannot_create_notices(client):
    """Test 10: Unauthorized role (STUDENT) cannot publish class notices (403 Forbidden)."""
    student_token = get_token(client, "priya.sharma@bput.ac.in")
    resp = client.post(
        "/api/v1/class-notices",
        json={
            "notice_type": "CANCELLED",
            "target_branch": "Computer Science & Engineering",
            "target_year": 2022,
            "target_semester": 6,
            "target_section": "A",
            "subject": "CS601",
            "class_date": datetime.now(timezone.utc).isoformat(),
            "period": "2nd Period",
            "details": "Class cancelled."
        },
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert resp.status_code == 403


# ==============================================================================
# WORKFLOW C: STUDY MATERIALS & TARGETING TESTS (11 - 14)
# ==============================================================================

def test_11_12_teacher_creates_material_and_assigns_targets(client):
    """Test 11 & 12: Teacher uploads course material and defines cohort targets."""
    teacher_token = get_token(client, "prof.mohanty@bput.ac.in")
    resp = client.post(
        "/api/v1/materials",
        json={
            "title": "Module 3: Virtualization & Containers",
            "description": "Comprehensive notes covering Docker and Hypervisors.",
            "file_url": "/uploads/materials/cs601_mod3.pdf",
            "file_type": "application/pdf",
            "targets": [
                {
                    "branch": "Computer Science & Engineering",
                    "batch_year": 2022,
                    "semester": 6,
                    "section": "A",
                    "subject": "Cloud Computing"
                }
            ]
        },
        headers={"Authorization": f"Bearer {teacher_token}"}
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Module 3: Virtualization & Containers"
    assert len(data["targets"]) == 1
    assert data["targets"][0]["branch"] == "Computer Science & Engineering"


def test_13_applicable_student_can_retrieve_material(client):
    """Test 13: Student in targeted cohort can retrieve study materials."""
    student_token = get_token(client, "priya.sharma@bput.ac.in")
    resp = client.get("/api/v1/materials", headers={"Authorization": f"Bearer {student_token}"})
    assert resp.status_code == 200
    materials = resp.json()
    assert len(materials) >= 1
    assert any(m["title"] == "Module 3: Virtualization & Containers" for m in materials)


def test_14_unrelated_student_cannot_retrieve_targeted_material(client):
    """Test 14: Student from unrelated cohort (Mechanical Eng) does NOT see CSE materials."""
    mech_student_token = get_token(client, "rahul.mech@bput.ac.in")
    resp = client.get("/api/v1/materials", headers={"Authorization": f"Bearer {mech_student_token}"})
    assert resp.status_code == 200
    materials = resp.json()
    # Mechanical student must not see CSE Cloud Computing materials
    assert not any(m["title"] == "Module 3: Virtualization & Containers" for m in materials)


# ==============================================================================
# WORKFLOW D: LAB EQUIPMENT TESTS (15 - 17)
# ==============================================================================

def test_15_lab_assistant_creates_equipment(client):
    """Test 15: Lab Assistant registers workshop machinery."""
    lab_token = get_token(client, "ramesh.lab@bput.ac.in")
    resp = client.post(
        "/api/v1/lab/equipment",
        json={
            "equipment_id": "EQ-CNC-001",
            "name": "Heavy Duty Lathe CNC-500",
            "category": "Workshop Lathes",
            "lab_name": "Mechanical Workshop Lab 1",
            "total_quantity": 5,
            "available_quantity": 5,
            "damaged_quantity": 0,
            "working_status": "FUNCTIONAL",
            "maintenance_status": "Annual servicing done"
        },
        headers={"Authorization": f"Bearer {lab_token}"}
    )
    assert resp.status_code == 201
    assert resp.json()["equipment_id"] == "EQ-CNC-001"
    assert resp.json()["working_status"] == "FUNCTIONAL"


def test_16_lab_assistant_updates_equipment(client):
    """Test 16: Lab Assistant updates equipment working status and maintenance notes."""
    lab_token = get_token(client, "ramesh.lab@bput.ac.in")

    db = TestingSessionLocal()
    from app.models.lab import LabEquipment
    eq = db.query(LabEquipment).filter(LabEquipment.equipment_id == "EQ-CNC-001").first()
    eq_id = eq.id
    db.close()

    resp = client.patch(
        f"/api/v1/lab/equipment/{eq_id}",
        json={
            "working_status": "NEEDS_REPAIR",
            "damaged_quantity": 1,
            "available_quantity": 4,
            "maintenance_status": "Motor bearing noise detected, scheduled for inspection."
        },
        headers={"Authorization": f"Bearer {lab_token}"}
    )
    assert resp.status_code == 200
    assert resp.json()["working_status"] == "NEEDS_REPAIR"
    assert resp.json()["damaged_quantity"] == 1


def test_17_invalid_equipment_status_is_rejected(client):
    """Test 17: Invalid equipment status is rejected with 422."""
    lab_token = get_token(client, "ramesh.lab@bput.ac.in")

    db = TestingSessionLocal()
    from app.models.lab import LabEquipment
    eq = db.query(LabEquipment).filter(LabEquipment.equipment_id == "EQ-CNC-001").first()
    eq_id = eq.id
    db.close()

    resp = client.patch(
        f"/api/v1/lab/equipment/{eq_id}",
        json={"working_status": "TOTALLY_DESTROYED"},
        headers={"Authorization": f"Bearer {lab_token}"}
    )
    assert resp.status_code == 422


# ==============================================================================
# WORKFLOW E: LAB REQUISITIONS TESTS (18 - 25)
# ==============================================================================

def test_18_19_20_lab_assistant_drafts_adds_items_and_submits_requisition(client):
    """Test 18, 19, 20: Lab assistant creates DRAFT requisition, adds item, and submits."""
    lab_token = get_token(client, "ramesh.lab@bput.ac.in")

    # Step 1: Create in DRAFT
    create_resp = client.post(
        "/api/v1/lab/requisitions",
        json={"lab_name": "Mechanical Workshop Lab 1"},
        headers={"Authorization": f"Bearer {lab_token}"}
    )
    assert create_resp.status_code == 201
    req_id = create_resp.json()["id"]
    assert create_resp.json()["status"] == "DRAFT"

    # Step 2: Add item to DRAFT
    item_resp = client.post(
        f"/api/v1/lab/requisitions/{req_id}/items",
        json={
            "item_name": "High Speed Steel Lathe Cutters",
            "specifications": "12mm square shank, grade HSS-E",
            "quantity": 20,
            "unit": "pieces",
            "justification": "Required for 4th semester manufacturing lab."
        },
        headers={"Authorization": f"Bearer {lab_token}"}
    )
    assert item_resp.status_code == 201
    assert item_resp.json()["quantity"] == 20

    # Step 3: Submit requisition
    submit_resp = client.post(
        f"/api/v1/lab/requisitions/{req_id}/submit",
        headers={"Authorization": f"Bearer {lab_token}"}
    )
    assert submit_resp.status_code == 200
    assert submit_resp.json()["status"] == "SUBMITTED"


def test_21_22_authorized_reviewer_rejects_with_reason_and_approves(client):
    """Test 21 & 22: Reviewer rejects invalid attempt (missing reason) and approves submitted requisition."""
    admin_token = get_token(client, "dean.admin@bput.ac.in")
    lab_token = get_token(client, "ramesh.lab@bput.ac.in")

    # Create another requisition to test rejection
    r2 = client.post(
        "/api/v1/lab/requisitions",
        json={"lab_name": "Electrical Lab"},
        headers={"Authorization": f"Bearer {lab_token}"}
    ).json()
    client.post(f"/api/v1/lab/requisitions/{r2['id']}/submit", headers={"Authorization": f"Bearer {lab_token}"})

    # Test rejection without reason -> 422
    rej_fail = client.post(
        f"/api/v1/lab/requisitions/{r2['id']}/review",
        json={"status": "REJECTED", "rejection_reason": ""},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert rej_fail.status_code == 422

    # Test rejection with valid reason -> 200
    rej_success = client.post(
        f"/api/v1/lab/requisitions/{r2['id']}/review",
        json={"status": "REJECTED", "rejection_reason": "Budget exhausted for current fiscal quarter."},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert rej_success.status_code == 200
    assert rej_success.json()["status"] == "REJECTED"
    assert rej_success.json()["rejection_reason"] == "Budget exhausted for current fiscal quarter."

    # Now approve the first submitted requisition
    db = TestingSessionLocal()
    from app.models.lab import LabRequisition
    first_req = db.query(LabRequisition).filter(LabRequisition.status == LabRequisitionStatus.SUBMITTED).first()
    first_id = first_req.id
    db.close()

    app_resp = client.post(
        f"/api/v1/lab/requisitions/{first_id}/review",
        json={"status": "APPROVED"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert app_resp.status_code == 200
    assert app_resp.json()["status"] == "APPROVED"


def test_23_24_approved_moves_to_ordered_and_completed(client):
    """Test 23 & 24: Requisition transitions APPROVED -> ORDERED -> COMPLETED."""
    admin_token = get_token(client, "dean.admin@bput.ac.in")

    db = TestingSessionLocal()
    from app.models.lab import LabRequisition
    req = db.query(LabRequisition).filter(LabRequisition.status == LabRequisitionStatus.APPROVED).first()
    req_id = req.id
    db.close()

    # Move APPROVED -> ORDERED
    order_resp = client.post(
        f"/api/v1/lab/requisitions/{req_id}/order",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert order_resp.status_code == 200
    assert order_resp.json()["status"] == "ORDERED"

    # Move ORDERED -> COMPLETED
    comp_resp = client.post(
        f"/api/v1/lab/requisitions/{req_id}/complete",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert comp_resp.status_code == 200
    assert comp_resp.json()["status"] == "COMPLETED"


def test_25_invalid_requisition_state_transitions_rejected(client):
    """Test 25: Invalid state transitions (e.g. DRAFT directly to ORDERED) are rejected."""
    lab_token = get_token(client, "ramesh.lab@bput.ac.in")
    admin_token = get_token(client, "dean.admin@bput.ac.in")

    # Create fresh DRAFT
    fresh = client.post(
        "/api/v1/lab/requisitions",
        json={"lab_name": "Physics Lab"},
        headers={"Authorization": f"Bearer {lab_token}"}
    ).json()

    # Attempt to order DRAFT -> 409
    resp = client.post(
        f"/api/v1/lab/requisitions/{fresh['id']}/order",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 409


# ==============================================================================
# WORKFLOW F & G: ADMIN CONTROL TOWER & AUDIT TESTS (26 - 31)
# ==============================================================================

def test_26_admin_can_retrieve_operational_metrics(client):
    """Test 26: Campus Admin retrieves Control Tower telemetry metrics."""
    admin_token = get_token(client, "dean.admin@bput.ac.in")
    resp = client.get("/api/v1/admin/control-tower/metrics", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "total_complaints" in data
    assert "complaints_by_status" in data
    assert "sla_breaches_count" in data
    assert "recurring_hotspots_count" in data
    assert "gate_passes_by_status" in data
    assert "total_audit_events" in data


def test_27_non_admin_cannot_access_control_tower_endpoints(client):
    """Test 27: Non-admin users (e.g. Student) are rejected from Control Tower (403 Forbidden)."""
    student_token = get_token(client, "priya.sharma@bput.ac.in")
    resp = client.get("/api/v1/admin/control-tower/metrics", headers={"Authorization": f"Bearer {student_token}"})
    assert resp.status_code == 403


def test_28_admin_can_retrieve_audit_records(client):
    """Test 28: Campus Admin can query append-only audit trail logs."""
    admin_token = get_token(client, "dean.admin@bput.ac.in")
    resp = client.get("/api/v1/admin/audit-logs", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    logs = resp.json()
    assert len(logs) >= 1
    assert "action" in logs[0]
    assert "entity_type" in logs[0]


def test_29_non_admin_cannot_access_audit_records(client):
    """Test 29: Non-admin users are rejected from audit trail (403 Forbidden)."""
    student_token = get_token(client, "priya.sharma@bput.ac.in")
    resp = client.get("/api/v1/admin/audit-logs", headers={"Authorization": f"Bearer {student_token}"})
    assert resp.status_code == 403


def test_30_sla_breach_query_returns_appropriate_complaints(client):
    """Test 30: Control Tower SLA breach endpoint returns complaints past deadline."""
    admin_token = get_token(client, "dean.admin@bput.ac.in")

    # Seed an overdue complaint
    db = TestingSessionLocal()
    student = db.query(Student).filter(Student.roll_number == "2201042").first()
    past_deadline = datetime.now(timezone.utc) - timedelta(hours=5)

    overdue_cmp = Complaint(
        ticket_number="CMP-OVERDUE-01",
        student_id=student.id,
        category_id="plumbing",
        location_type="Hostel",
        location_details="Hostel B Wing 1",
        title="Overflowing water tank",
        description="Water continuously overflowing from main overhead tank.",
        status=ComplaintStatus.OPEN,
        priority="HIGH",
        sla_deadline=past_deadline,
        is_recurring=False
    )
    db.add(overdue_cmp)
    db.commit()
    db.close()

    resp = client.get("/api/v1/admin/control-tower/sla-breaches", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    breaches = resp.json()
    assert len(breaches) >= 1
    assert any(b["ticket_number"] == "CMP-OVERDUE-01" for b in breaches)


def test_31_recurring_complaint_query_returns_appropriate_records(client):
    """Test 31: Control Tower recurring complaint query returns recurring hotspot records."""
    admin_token = get_token(client, "dean.admin@bput.ac.in")

    # Seed a recurring complaint
    db = TestingSessionLocal()
    student = db.query(Student).filter(Student.roll_number == "2201042").first()

    rec_cmp = Complaint(
        ticket_number="CMP-RECURRING-01",
        student_id=student.id,
        category_id="electrical",
        location_type="Hostel",
        location_details="Hostel B Wing 2",
        title="Sparks from corridor panel",
        description="Repeated spark and fuse blowout in the hallway.",
        status=ComplaintStatus.OPEN,
        priority="EMERGENCY",
        is_recurring=True
    )
    db.add(rec_cmp)
    db.commit()
    db.close()

    resp = client.get("/api/v1/admin/control-tower/recurring-complaints", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    recurring = resp.json()
    assert len(recurring) >= 1
    assert any(r["ticket_number"] == "CMP-RECURRING-01" for r in recurring)
