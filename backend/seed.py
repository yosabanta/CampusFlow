import sys
import os
import argparse
import logging
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

# Add backend directory to sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.core.security import hash_password
from app.models.base import Base
from app.models import (
    User, Student, Staff, UserRole, Hostel,
    Complaint, ComplaintAttachment, ComplaintStatus,
    GatePass, GatePassQRToken, GatePassType, GatePassStatus, DecisionStatus, QRTokenStatus,
    DocumentRequest, DocumentType, DocumentRequestStatus,
    OTPVerification, ProxyRequest,
    InAppNotification, SMSNotification,
    AttendanceSession, AttendanceRecord, AttendanceStatus,
    ClassNotice, ClassNoticeType,
    StudyMaterial, StudyMaterialTarget,
    LabEquipment, EquipmentWorkingStatus,
    LabRequisition, LabRequisitionItem, LabRequisitionStatus,
    AuditLog
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("campusflow.seed")

DEMO_PASSWORD = "CampusFlow@2026"


def seed_demo_users(db: Session) -> dict:
    """
    Populate representative demo users for all 8 approved institutional roles.
    """
    logger.info("Seeding institutional demo users for all 8 roles...")
    hashed_pwd = hash_password(DEMO_PASSWORD)

    # 1. Create Demo Hostel Facility
    hostel = db.query(Hostel).filter(Hostel.code == "H-B").first()
    if not hostel:
        hostel = Hostel(
            name="Hostel Block B (Senior Boys)",
            code="H-B",
            total_rooms=120
        )
        db.add(hostel)
        db.flush()

    hostel_c = db.query(Hostel).filter(Hostel.code == "H-C").first()
    if not hostel_c:
        hostel_c = Hostel(
            name="Hostel Block C (Junior Boys)",
            code="H-C",
            total_rooms=100
        )
        db.add(hostel_c)
        db.flush()

    # Define user profiles for all 8 approved roles + additional cohort students
    demo_accounts = [
        {
            "role": UserRole.STUDENT,
            "email": "priya.sharma@bput.ac.in",
            "phone_number": "9876543210",
            "first_name": "Priya",
            "last_name": "Sharma",
            "student_profile": {
                "roll_number": "2201042",
                "department": "Computer Science & Engineering",
                "batch_year": 2022,
                "semester": 6,
                "section": "A",
                "hostel_id": hostel.id,
                "room_number": "B-304",
                "dues_cleared": True,
                "has_smartphone": True,
                "parent_phone": "9876500001"
            }
        },
        {
            "role": UserRole.ADMIN,
            "email": "dean.admin@bput.ac.in",
            "phone_number": "9876543211",
            "first_name": "Ashok",
            "last_name": "Patnaik",
        },
        {
            "role": UserRole.WARDEN,
            "email": "warden.sharma@bput.ac.in",
            "phone_number": "9876543212",
            "first_name": "Sunil",
            "last_name": "Sharma",
            "staff_profile": {
                "department_id": "Hostel Administration",
                "designation": "Chief Warden (Block B)"
            }
        },
        {
            "role": UserRole.HOSTEL_FACULTY,
            "email": "dr.mishra.hostel@bput.ac.in",
            "phone_number": "9876543213",
            "first_name": "Bijoy",
            "last_name": "Mishra",
            "staff_profile": {
                "department_id": "Hostel Affairs Board",
                "designation": "Faculty Advisor"
            }
        },
        {
            "role": UserRole.TEACHER,
            "email": "prof.mohanty@bput.ac.in",
            "phone_number": "9876543214",
            "first_name": "Subhashree",
            "last_name": "Mohanty",
            "staff_profile": {
                "department_id": "Computer Science & Engineering",
                "designation": "Associate Professor"
            }
        },
        {
            "role": UserRole.LAB_ASSISTANT,
            "email": "ramesh.lab@bput.ac.in",
            "phone_number": "9876543215",
            "first_name": "Ramesh",
            "last_name": "Nayak",
            "staff_profile": {
                "department_id": "Mechanical Engineering",
                "designation": "Workshop Lathe Assistant",
                "assigned_lab_id": "LAB-MECH-LATHE-01"
            }
        },
        {
            "role": UserRole.STAFF,
            "email": "ramesh.estate@bput.ac.in",
            "phone_number": "9876543216",
            "first_name": "Kailash",
            "last_name": "Sahoo",
            "staff_profile": {
                "department_id": "Estate & Maintenance",
                "designation": "Senior Maintenance Supervisor"
            }
        },
        {
            "role": UserRole.GUARD,
            "email": "guard.gate1@bput.ac.in",
            "phone_number": "9876543217",
            "first_name": "Dhaneswar",
            "last_name": "Pradhan",
            "staff_profile": {
                "department_id": "Perimeter Security",
                "designation": "Main Gate Officer"
            }
        }
    ]

    users = {}
    for account in demo_accounts:
        user = db.query(User).filter(User.email == account["email"]).first()
        if not user:
            user = User(
                email=account["email"],
                phone_number=account["phone_number"],
                password_hash=hashed_pwd,
                role=account["role"],
                first_name=account["first_name"],
                last_name=account["last_name"],
                theme_preference="light",
                is_active=True
            )
            db.add(user)
            db.flush()

            if "student_profile" in account:
                sp = account["student_profile"]
                acc_type = sp.get("accommodation_type") or ("HOSTELER" if sp.get("hostel_id") or sp.get("room_number") else "DAY_SCHOLAR")
                student = Student(
                    id=user.id,
                    roll_number=sp["roll_number"],
                    accommodation_type=acc_type,
                    department=sp["department"],
                    batch_year=sp["batch_year"],
                    semester=sp["semester"],
                    section=sp["section"],
                    hostel_id=sp.get("hostel_id"),
                    room_number=sp.get("room_number"),
                    dues_cleared=sp.get("dues_cleared", True),
                    has_smartphone=sp.get("has_smartphone", True),
                    parent_phone=sp.get("parent_phone")
                )
                db.add(student)

            if "staff_profile" in account:
                st = account["staff_profile"]
                staff = Staff(
                    id=user.id,
                    department_id=st["department_id"],
                    designation=st["designation"],
                    assigned_lab_id=st.get("assigned_lab_id")
                )
                db.add(staff)

            if account["role"] == UserRole.WARDEN:
                hostel.warden_id = user.id

            logger.info(f"Created demo user: {user.email} (Role: {user.role.value})")
        else:
            user.password_hash = hashed_pwd

        users[account["email"]] = user

    db.commit()
    return users


def seed_cross_module_data(db: Session, users: dict):
    """
    Populate realistic cross-module demo records for all workflows.
    """
    logger.info("Seeding cross-module demo records...")
    now = datetime.now(timezone.utc)

    # Ensure secondary student accounts exist for cross-cohort and proxy flows
    sanjay_user = db.query(User).filter(User.email == "sanjay.soren@bput.ac.in").first()
    if not sanjay_user:
        sanjay_user = User(
            email="sanjay.soren@bput.ac.in",
            phone_number="9876544102",
            password_hash=users["priya.sharma@bput.ac.in"].password_hash,
            role=UserRole.STUDENT,
            first_name="Sanjay",
            last_name="Soren",
            theme_preference="light",
            is_active=True
        )
        db.add(sanjay_user)
        db.flush()
        hostel_b = db.query(Hostel).filter(Hostel.name.like("%Block B%")).first()
        student_s = Student(
            id=sanjay_user.id,
            roll_number="2201019",
            department="Computer Science & Engineering",
            batch_year=2022,
            semester=6,
            section="B",
            hostel_id=hostel_b.id if hostel_b else None,
            room_number="B-108",
            dues_cleared=False,
            has_smartphone=False,
            parent_phone="9876500002"
        )
        db.add(student_s)
        db.commit()
    users["sanjay.soren@bput.ac.in"] = sanjay_user

    rahul_user = db.query(User).filter(User.email == "rahul.mech@bput.ac.in").first()
    if not rahul_user:
        rahul_user = User(
            email="rahul.mech@bput.ac.in",
            phone_number="9876544999",
            password_hash=users["priya.sharma@bput.ac.in"].password_hash,
            role=UserRole.STUDENT,
            first_name="Rahul",
            last_name="Verma",
            theme_preference="light",
            is_active=True
        )
        db.add(rahul_user)
        db.flush()
        student_r = Student(
            id=rahul_user.id,
            roll_number="2301088",
            department="Mechanical Engineering",
            batch_year=2023,
            semester=4,
            section="A",
            hostel_id=None,
            room_number=None,
            dues_cleared=True,
            has_smartphone=True,
            parent_phone="9876500003"
        )
        db.add(student_r)
        db.commit()
    users["rahul.mech@bput.ac.in"] = rahul_user

    student_priya = users["priya.sharma@bput.ac.in"]
    student_sanjay = users["sanjay.soren@bput.ac.in"]
    admin = users["dean.admin@bput.ac.in"]
    warden = users["warden.sharma@bput.ac.in"]
    teacher = users["prof.mohanty@bput.ac.in"]
    lab_asst = users.get("ramesh.lab@bput.ac.in") or users.get("lab.physics@bput.ac.in")
    maintenance = users["ramesh.estate@bput.ac.in"]
    guard = users["guard.gate1@bput.ac.in"]

    # ==========================================================================
    # 1. COMPLAINTS & RECURRING HOTSPOT
    # ==========================================================================
    if db.query(Complaint).count() == 0:
        # A. Open Complaint
        c_open = Complaint(
            ticket_number="CMP-2026-00101",
            student_id=student_priya.id,
            category_id="plumbing",
            location_type="Hostel",
            location_details="Hostel Block B, 3rd Floor Washroom",
            title="Broken washbasin tap dripping continuously",
            description="The tap handle is loose and water is leaking constantly.",
            status=ComplaintStatus.OPEN,
            priority="HIGH",
            sla_deadline=now + timedelta(hours=36),
            is_recurring=False
        )
        db.add(c_open)

        # B. Assigned Complaint
        c_assigned = Complaint(
            ticket_number="CMP-2026-00102",
            student_id=student_priya.id,
            category_id="electrical",
            location_type="Hostel",
            location_details="Hostel Block B, Room B-304",
            title="Tube light flickering in study room",
            description="Tube light starter is making humming noise and flickering.",
            status=ComplaintStatus.ASSIGNED,
            priority="NORMAL",
            assigned_staff_id=maintenance.id,
            sla_deadline=now + timedelta(hours=24),
            is_recurring=False
        )
        db.add(c_assigned)

        # C. Resolved Complaint
        c_resolved = Complaint(
            ticket_number="CMP-2026-00103",
            student_id=student_priya.id,
            category_id="carpentry",
            location_type="Hostel",
            location_details="Hostel Block B, Room B-304",
            title="Wardrobe door hinge loose",
            description="Left wooden door is detached from upper hinge frame.",
            status=ComplaintStatus.RESOLVED,
            priority="LOW",
            assigned_staff_id=maintenance.id,
            resolved_at=now - timedelta(hours=4),
            sla_deadline=now + timedelta(hours=48),
            is_recurring=False
        )
        db.add(c_resolved)

        # D. Recurring Infrastructure Hotspot
        c_recurring = Complaint(
            ticket_number="CMP-2026-00104",
            student_id=student_priya.id,
            category_id="electrical",
            location_type="Hostel",
            location_details="Hostel Block B Wing 2 Corridor",
            title="Corridor switchboard fuse tripped repeatedly",
            description="Third time this week the main circuit breaker tripped.",
            status=ComplaintStatus.OPEN,
            priority="EMERGENCY",
            sla_deadline=now + timedelta(hours=12),
            is_recurring=True
        )
        db.add(c_recurring)

        # E. Overdue / SLA Breached Complaint
        c_overdue = Complaint(
            ticket_number="CMP-2026-00105",
            student_id=student_priya.id,
            category_id="internet",
            location_type="Hostel",
            location_details="Hostel Block B 3rd Floor",
            title="Wi-Fi Access Point 3B offline",
            description="No signal on the entire west wing corridor.",
            status=ComplaintStatus.OPEN,
            priority="HIGH",
            sla_deadline=now - timedelta(hours=8),  # SLA breached
            is_recurring=False
        )
        db.add(c_overdue)
        db.flush()

        # Audit logs for complaints
        db.add(AuditLog(
            entity_type="COMPLAINT",
            entity_id=c_open.id,
            action="CREATE",
            actor_id=student_priya.id,
            new_state={"ticket_number": c_open.ticket_number, "status": "OPEN"}
        ))
        db.add(AuditLog(
            entity_type="COMPLAINT",
            entity_id=c_assigned.id,
            action="ASSIGNED",
            actor_id=admin.id,
            new_state={"assigned_staff_id": str(maintenance.id), "status": "ASSIGNED"}
        ))

    # ==========================================================================
    # 2. GATE PASSES & ONE-TIME QR TOKENS
    # ==========================================================================
    if db.query(GatePass).count() == 0:
        # A. Pending Gate Pass
        gp_pending = GatePass(
            pass_number="GP-2026-00041",
            student_id=student_priya.id,
            pass_type=GatePassType.DAY_OUTING,
            purpose="Purchasing engineering drawing instruments & project books",
            destination="City Center Market, Bhubaneswar",
            out_time=now + timedelta(hours=2),
            expected_in_time=now + timedelta(hours=6),
            pin_code="1234",
            status=GatePassStatus.PENDING,
            decision_status=DecisionStatus.PENDING
        )
        db.add(gp_pending)

        # B. Approved Gate Pass with Active Single-Use QR Token
        gp_approved = GatePass(
            pass_number="GP-2026-00042",
            student_id=student_priya.id,
            pass_type=GatePassType.DAY_OUTING,
            purpose="Medical appointment at Apollo Hospital",
            destination="Apollo Hospital, Sainik School Road",
            out_time=now + timedelta(hours=1),
            expected_in_time=now + timedelta(hours=5),
            pin_code="1234",
            status=GatePassStatus.APPROVED,
            decision_status=DecisionStatus.APPROVED,
            decision_by=warden.id,
            decision_at=now - timedelta(minutes=20)
        )
        db.add(gp_approved)
        db.flush()

        active_qr = GatePassQRToken(
            gate_pass_id=gp_approved.id,
            student_id=student_priya.id,
            qr_token=f"CF-GP-ACTIVE-{uuid.uuid4().hex[:12].upper()}",
            status=QRTokenStatus.ACTIVE,
            expires_at=gp_approved.expected_in_time
        )
        db.add(active_qr)

        # C. Rejected Gate Pass
        gp_rejected = GatePass(
            pass_number="GP-2026-00043",
            student_id=student_priya.id,
            pass_type=GatePassType.HOME_LEAVE,
            purpose="Weekend trip without parent confirmation letter",
            destination="Rourkela",
            out_time=now + timedelta(days=1),
            expected_in_time=now + timedelta(days=3),
            pin_code="1234",
            status=GatePassStatus.REJECTED,
            decision_status=DecisionStatus.REJECTED,
            decision_by=warden.id,
            decision_at=now - timedelta(hours=1),
            rejection_reason="Parent consent letter not submitted to warden office."
        )
        db.add(gp_rejected)

        # D. Completed Gate Pass (Already checked out and returned)
        gp_completed = GatePass(
            pass_number="GP-2026-00040",
            student_id=student_priya.id,
            pass_type=GatePassType.DAY_OUTING,
            purpose="Library study session at Central Library",
            destination="Central University Library",
            out_time=now - timedelta(hours=8),
            expected_in_time=now - timedelta(hours=3),
            actual_out_time=now - timedelta(hours=7, minutes=50),
            actual_in_time=now - timedelta(hours=3, minutes=15),
            pin_code="1234",
            status=GatePassStatus.COMPLETED,
            decision_status=DecisionStatus.APPROVED,
            decision_by=warden.id,
            decision_at=now - timedelta(hours=9)
        )
        db.add(gp_completed)
        db.flush()

        consumed_qr = GatePassQRToken(
            gate_pass_id=gp_completed.id,
            student_id=student_priya.id,
            qr_token=f"CF-GP-CONSUMED-{uuid.uuid4().hex[:12].upper()}",
            status=QRTokenStatus.USED,
            expires_at=gp_completed.expected_in_time,
            used_at=gp_completed.actual_out_time,
            used_by_guard_id=guard.id
        )
        db.add(consumed_qr)

    # ==========================================================================
    # 3. HELP-A-FRIEND PROXY WORKFLOW
    # ==========================================================================
    if db.query(ProxyRequest).count() == 0:
        # Seed completed Help-a-Friend complaint on behalf of Sanjay Soren
        c_proxy = Complaint(
            ticket_number="CMP-2026-00109",
            student_id=student_sanjay.id,  # Associated with beneficiary
            category_id="plumbing",
            location_type="Hostel",
            location_details="Hostel Block B, Room B-108",
            title="Broken shower knob in ground floor common bathroom",
            description="Filed by peer on behalf of Sanjay Soren (no smartphone). Water pressure valve stuck.",
            status=ComplaintStatus.OPEN,
            priority="NORMAL",
            sla_deadline=now + timedelta(hours=48),
            is_recurring=False
        )
        db.add(c_proxy)
        db.flush()

        otp_rec = OTPVerification(
            beneficiary_student_id=student_sanjay.id,
            phone_number=student_sanjay.phone_number,
            otp_code_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            purpose="HELP_A_FRIEND",
            expires_at=now + timedelta(minutes=5),
            attempts=1,
            is_verified=True
        )
        db.add(otp_rec)
        db.flush()

        proxy_req = ProxyRequest(
            entity_type="COMPLAINT",
            entity_id=c_proxy.id,
            proxy_student_id=student_priya.id,
            beneficiary_student_id=student_sanjay.id,
            otp_verification_id=otp_rec.id
        )
        db.add(proxy_req)

    # ==========================================================================
    # 4. DOCUMENT REQUEST & VERIFIED CERTIFICATE
    # ==========================================================================
    if db.query(DocumentRequest).count() == 0:
        doc_gen = DocumentRequest(
            request_number="DOC-2026-00018",
            student_id=student_priya.id,
            document_type=DocumentType.BONAFIDE,
            purpose="Passport renewal application at Regional Passport Office",
            status=DocumentRequestStatus.COMPLETED,
            document_url="/uploads/documents/bonafide_2201042.pdf",
            verification_hash=f"CF-VERIFY-{uuid.uuid4().hex[:12].upper()}"
        )
        db.add(doc_gen)

        doc_pend = DocumentRequest(
            request_number="DOC-2026-00019",
            student_id=student_priya.id,
            document_type=DocumentType.FEE_ESTIMATE,
            purpose="Education bank loan subsidy renewal",
            status=DocumentRequestStatus.SUBMITTED
        )
        db.add(doc_pend)

    # ==========================================================================
    # 5. ATTENDANCE SESSIONS & RECORDS
    # ==========================================================================
    if db.query(AttendanceSession).count() == 0:
        s1 = AttendanceSession(
            teacher_id=teacher.id,
            subject="Cloud Computing (CS601)",
            branch="Computer Science & Engineering",
            batch_year=2022,
            section="A",
            session_date=now - timedelta(days=2)
        )
        s2 = AttendanceSession(
            teacher_id=teacher.id,
            subject="Cloud Computing (CS601)",
            branch="Computer Science & Engineering",
            batch_year=2022,
            section="A",
            session_date=now - timedelta(days=1)
        )
        s3 = AttendanceSession(
            teacher_id=teacher.id,
            subject="Cloud Computing (CS601)",
            branch="Computer Science & Engineering",
            batch_year=2022,
            section="A",
            session_date=now
        )
        db.add_all([s1, s2, s3])
        db.flush()

        # Records for Priya: 2 PRESENT, 1 LATE -> 100% attendance rate
        db.add(AttendanceRecord(session_id=s1.id, student_id=student_priya.id, status=AttendanceStatus.PRESENT))
        db.add(AttendanceRecord(session_id=s2.id, student_id=student_priya.id, status=AttendanceStatus.PRESENT))
        db.add(AttendanceRecord(session_id=s3.id, student_id=student_priya.id, status=AttendanceStatus.LATE))

    # ==========================================================================
    # 6. CLASS NOTICES
    # ==========================================================================
    if db.query(ClassNotice).count() == 0:
        n1 = ClassNotice(
            teacher_id=teacher.id,
            notice_type=ClassNoticeType.RESCHEDULED,
            target_branch="Computer Science & Engineering",
            target_year=2022,
            target_semester=6,
            target_section="A",
            subject="Cloud Computing (CS601)",
            class_date=now + timedelta(days=1),
            period="10:00 AM - 11:00 AM",
            details="Class shifted to Room 402 due to Department Seminar."
        )
        n2 = ClassNotice(
            teacher_id=teacher.id,
            notice_type=ClassNoticeType.CANCELLED,
            target_branch="Computer Science & Engineering",
            target_year=2022,
            target_semester=6,
            target_section="A",
            subject="Compiler Design Lab (CS602)",
            class_date=now + timedelta(days=2),
            period="02:00 PM - 05:00 PM",
            details="Lab session cancelled due to power maintenance in Server Room."
        )
        db.add_all([n1, n2])

    # ==========================================================================
    # 7. STUDY MATERIALS & COHORT TARGETS
    # ==========================================================================
    if db.query(StudyMaterial).count() == 0:
        m1 = StudyMaterial(
            teacher_id=teacher.id,
            title="Module 1: Cloud Architecture & Deployment Models",
            description="Lecture slides covering IaaS, PaaS, SaaS, and OpenStack deployment.",
            file_url="/uploads/materials/cs601_module1.pdf",
            file_type="application/pdf"
        )
        db.add(m1)
        db.flush()

        t1 = StudyMaterialTarget(
            material_id=m1.id,
            branch="Computer Science & Engineering",
            batch_year=2022,
            semester=6,
            section="A",
            subject="Cloud Computing"
        )
        db.add(t1)

    # ==========================================================================
    # 8. LAB EQUIPMENT INVENTORY
    # ==========================================================================
    if db.query(LabEquipment).count() == 0:
        eq1 = LabEquipment(
            equipment_id="EQ-MECH-LATHE-01",
            name="Heavy Duty Precision Lathe (HMT-300)",
            category="Machine Tools",
            lab_name="Mechanical Workshop Lab 1",
            total_quantity=6,
            available_quantity=6,
            damaged_quantity=0,
            working_status=EquipmentWorkingStatus.FUNCTIONAL,
            maintenance_status="Annual preventative maintenance certified."
        )
        eq2 = LabEquipment(
            equipment_id="EQ-MECH-MILL-02",
            name="Universal Milling Machine (UMM-50)",
            category="Machine Tools",
            lab_name="Mechanical Workshop Lab 1",
            total_quantity=4,
            available_quantity=3,
            damaged_quantity=1,
            working_status=EquipmentWorkingStatus.NEEDS_REPAIR,
            maintenance_status="Coolant pump valve replacement scheduled."
        )
        eq3 = LabEquipment(
            equipment_id="EQ-MECH-DRILL-03",
            name="Radial Drilling Machine (RDM-25)",
            category="Drilling Equipment",
            lab_name="Mechanical Workshop Lab 2",
            total_quantity=2,
            available_quantity=0,
            damaged_quantity=2,
            working_status=EquipmentWorkingStatus.NON_FUNCTIONAL,
            maintenance_status="Motor burnt out. Requisition pending."
        )
        db.add_all([eq1, eq2, eq3])

    # ==========================================================================
    # 9. LAB REQUISITIONS LIFECYCLE
    # ==========================================================================
    if db.query(LabRequisition).count() == 0:
        # A. Draft Requisition
        r_draft = LabRequisition(
            requisition_number="REQ-2026-0001",
            assistant_id=lab_asst.id,
            lab_name="Mechanical Workshop Lab 1",
            status=LabRequisitionStatus.DRAFT
        )
        db.add(r_draft)
        db.flush()
        db.add(LabRequisitionItem(
            requisition_id=r_draft.id,
            item_name="Carbide Cutting Tips 16mm",
            specifications="Grade P20/P30 for turning mild steel",
            quantity=50,
            unit="box",
            justification="Quarterly stock replenishment for student lathe projects."
        ))

        # B. Submitted Requisition
        r_sub = LabRequisition(
            requisition_number="REQ-2026-0002",
            assistant_id=lab_asst.id,
            lab_name="Mechanical Workshop Lab 2",
            status=LabRequisitionStatus.SUBMITTED
        )
        db.add(r_sub)
        db.flush()
        db.add(LabRequisitionItem(
            requisition_id=r_sub.id,
            item_name="Coolant Oil Drums (20L)",
            specifications="Water-soluble cutting fluid, IS 1115 compliant",
            quantity=4,
            unit="drums",
            justification="Lubrication for high speed drilling & milling machines."
        ))

        # C. Approved Requisition
        r_app = LabRequisition(
            requisition_number="REQ-2026-0003",
            assistant_id=lab_asst.id,
            lab_name="Mechanical Workshop Lab 1",
            status=LabRequisitionStatus.APPROVED,
            approved_by=admin.id
        )
        db.add(r_app)

        # D. Ordered Requisition
        r_ord = LabRequisition(
            requisition_number="REQ-2026-0004",
            assistant_id=lab_asst.id,
            lab_name="Mechanical Workshop Lab 1",
            status=LabRequisitionStatus.ORDERED,
            approved_by=admin.id
        )
        db.add(r_ord)

        # E. Completed Requisition
        r_comp = LabRequisition(
            requisition_number="REQ-2026-0005",
            assistant_id=lab_asst.id,
            lab_name="Mechanical Workshop Lab 1",
            status=LabRequisitionStatus.COMPLETED,
            approved_by=admin.id
        )
        db.add(r_comp)

        # F. Rejected Requisition
        r_rej = LabRequisition(
            requisition_number="REQ-2026-0006",
            assistant_id=lab_asst.id,
            lab_name="Mechanical Workshop Lab 2",
            status=LabRequisitionStatus.REJECTED,
            approved_by=admin.id,
            rejection_reason="Item cost exceeds departmental consumable threshold. Please reroute via capital budget."
        )
        db.add(r_rej)

    # ==========================================================================
    # 10. IN-APP NOTIFICATIONS
    # ==========================================================================
    if db.query(InAppNotification).count() == 0:
        db.add(InAppNotification(
            user_id=student_priya.id,
            title="Gate Pass Approved",
            message="Your local outing pass GP-2026-00042 has been approved by the Warden.",
            type="GATE_PASS_APPROVED",
            is_read=False
        ))
        db.add(InAppNotification(
            user_id=student_priya.id,
            title="Complaint Assigned",
            message="Ticket CMP-2026-00102 has been assigned to Maintenance Supervisor Kailash Sahoo.",
            type="COMPLAINT_ASSIGNED",
            is_read=True
        ))
        db.add(InAppNotification(
            user_id=student_sanjay.id,
            title="Proxy Complaint Filed",
            message="Complaint CMP-2026-00109 registered on your behalf via Help-a-Friend.",
            type="PROXY_COMPLAINT",
            is_read=False
        ))

    # ==========================================================================
    # 11. AUDIT LOG LEDGER ENTRIES
    # ==========================================================================
    if db.query(AuditLog).count() == 0:
        db.add(AuditLog(
            entity_type="SYSTEM",
            entity_id=uuid.uuid4(),
            action="INITIAL_SEED",
            actor_id=admin.id,
            new_state={"version": settings.APP_VERSION, "environment": settings.ENVIRONMENT}
        ))
        db.add(AuditLog(
            entity_type="GATE_PASS",
            entity_id=uuid.uuid4(),
            action="DECISION_APPROVED",
            actor_id=warden.id,
            new_state={"pass_number": "GP-2026-00042", "status": "APPROVED"}
        ))
        db.add(AuditLog(
            entity_type="LAB_REQUISITION",
            entity_id=uuid.uuid4(),
            action="REQUISITION_APPROVED",
            actor_id=admin.id,
            new_state={"requisition_number": "REQ-2026-0003", "status": "APPROVED"}
        ))

    db.commit()
    logger.info("Cross-module demo records successfully seeded.")


from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def reset_and_seed_database(target_engine=None, session_factory=None):
    """
    Safely reset development database and re-populate deterministic seed data.
    """
    if settings.ENVIRONMENT.lower() == "production":
        logger.error("DANGER: Database reset is strictly prohibited in PRODUCTION environment.")
        sys.exit(1)

    eng = target_engine or engine
    sess_maker = session_factory or SessionLocal

    logger.warning("Initiating development database reset...")
    Base.metadata.drop_all(bind=eng)
    Base.metadata.create_all(bind=eng)
    logger.info("Recreated clean database schema with all 24 entities.")

    with sess_maker() as db:
        users = seed_demo_users(db)
        seed_cross_module_data(db, users)
    logger.info("Database reset & seeding successfully finished.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CampusFlow Demo Database Seeder (TESTING ONLY)")
    parser.add_argument(
        "--confirm-seed-demo-data",
        action="store_true",
        help="Explicit confirmation required to seed demo records into a test database."
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Drop all development tables, recreate schema, and seed fresh demo records."
    )
    parser.add_argument(
        "--db-url",
        type=str,
        default=None,
        help="Target database URL (e.g. sqlite:///campusflow_test_sandbox.db)"
    )
    args = parser.parse_args()

    if not args.confirm_seed_demo_data:
        logger.error(
            "ACCIDENTAL SEED PREVENTION: Normal operation does not permit unconfirmed seeding. "
            "To seed an isolated test/demo sandbox, you must explicitly pass '--confirm-seed-demo-data'."
        )
        sys.exit(1)

    active_engine = engine
    active_session_maker = SessionLocal

    if args.db_url:
        connect_args = {"check_same_thread": False} if "sqlite" in args.db_url else {}
        active_engine = create_engine(args.db_url, connect_args=connect_args)
        active_session_maker = sessionmaker(autocommit=False, autoflush=False, bind=active_engine)

    if active_session_maker is None:
        logger.error("Database connection not configured. Check DATABASE_URL or pass --db-url.")
        sys.exit(1)

    if args.reset:
        reset_and_seed_database(target_engine=active_engine, session_factory=active_session_maker)
    else:
        with active_session_maker() as session:
            demo_users = seed_demo_users(session)
            seed_cross_module_data(session, demo_users)


