"""
Safe Role Seeder for CampusFlow
Adds institutional accounts for WARDEN, TEACHER, HOSTEL_FACULTY, LAB_ASSISTANT, STAFF, and GUARD
without touching or wiping existing student or admin accounts.
"""

import sys
import os
import uuid
from datetime import datetime, timedelta, timezone

# Add backend directory to sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import (
    User, Student, Staff, UserRole, Hostel,
    GatePass, GatePassQRToken, GatePassType, GatePassStatus, DecisionStatus, QRTokenStatus,
    Complaint, ComplaintStatus,
    AttendanceSession, AttendanceRecord, AttendanceStatus, ClassNotice, ClassNoticeType,
    StudyMaterial, StudyMaterialTarget,
    LabEquipment, EquipmentWorkingStatus, LabRequisition, LabRequisitionItem, LabRequisitionStatus
)

DEMO_PASSWORD = "CampusFlow@2026"

def seed_roles():
    db = SessionLocal()
    try:
        hashed_pwd = hash_password(DEMO_PASSWORD)
        now = datetime.now(timezone.utc)

        print("=== 1. Ensuring Hostels Exist (H1 — Boys Hostel & H2 — Girls Hostel) ===")
        hostel_h1 = db.query(Hostel).filter(Hostel.code == "H1").first()
        if not hostel_h1:
            hostel_h1 = Hostel(name="H1 — Boys Hostel", code="H1", total_rooms=120, allocation="Boys")
            db.add(hostel_h1)
            db.flush()

        hostel_h2 = db.query(Hostel).filter(Hostel.code == "H2").first()
        if not hostel_h2:
            hostel_h2 = Hostel(name="H2 — Girls Hostel", code="H2", total_rooms=120, allocation="Girls")
            db.add(hostel_h2)
            db.flush()

        print("=== 2. Provisioning Institutional Accounts ===")
        accounts_to_create = [
            {
                "role": UserRole.WARDEN,
                "email": "warden.sharma@campusflow.in",
                "phone_number": "9876543212",
                "first_name": "Sunil",
                "last_name": "Sharma",
                "staff_profile": {
                    "department_id": "Hostel Administration",
                    "designation": "Chief Warden (H1 — Boys Hostel)"
                }
            },
            {
                "role": UserRole.WARDEN,
                "email": "warden.girls@campusflow.in",
                "phone_number": "9876543218",
                "first_name": "Minati",
                "last_name": "Patnaik",
                "staff_profile": {
                    "department_id": "Hostel Administration",
                    "designation": "Chief Warden (H2 — Girls Hostel)"
                }
            },
            {
                "role": UserRole.HOSTEL_FACULTY,
                "email": "dr.mishra.hostel@campusflow.in",
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
                "email": "prof.mohanty@campusflow.in",
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
                "email": "ramesh.lab@campusflow.in",
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
                "email": "ramesh.estate@campusflow.in",
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
                "email": "guard.gate1@campusflow.in",
                "phone_number": "9876543217",
                "first_name": "Dhaneswar",
                "last_name": "Pradhan",
                "staff_profile": {
                    "department_id": "Perimeter Security",
                    "designation": "Main Gate Officer"
                }
            }
        ]

        created_users = {}
        for acc in accounts_to_create:
            existing = db.query(User).filter(User.email == acc["email"]).first()
            if not existing:
                u = User(
                    email=acc["email"],
                    phone_number=acc["phone_number"],
                    password_hash=hashed_pwd,
                    role=acc["role"],
                    first_name=acc["first_name"],
                    last_name=acc["last_name"],
                    theme_preference="light",
                    is_active=True
                )
                db.add(u)
                db.flush()
                st = acc["staff_profile"]
                staff = Staff(
                    id=u.id,
                    department_id=st["department_id"],
                    designation=st["designation"],
                    assigned_lab_id=st.get("assigned_lab_id")
                )
                db.add(staff)
                created_users[acc["role"].value] = u
                print(f"  [+] Created {acc['role'].value}: {acc['email']} ({acc['first_name']} {acc['last_name']})")
            else:
                created_users[acc["role"].value] = existing
                print(f"  [~] Already exists: {acc['email']}")

        warden1_user = db.query(User).filter(User.email == "warden.sharma@campusflow.in").first()
        if warden1_user and hostel_h1:
            hostel_h1.warden_id = warden1_user.id

        warden2_user = db.query(User).filter(User.email == "warden.girls@campusflow.in").first()
        if warden2_user and hostel_h2:
            hostel_h2.warden_id = warden2_user.id

        db.commit()
        print("\nAll institutional roles successfully provisioned with password: " + DEMO_PASSWORD)
        print("Hostels configured:")
        print(f"  H1 — Boys Hostel: Warden {warden1_user.email if warden1_user else 'None'}")
        print(f"  H2 — Girls Hostel: Warden {warden2_user.email if warden2_user else 'None'}")

    except Exception as e:
        db.rollback()
        print("Error seeding roles:", e)
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_roles()
