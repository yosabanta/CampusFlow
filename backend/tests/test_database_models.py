import pytest
from sqlalchemy import create_engine, inspect
from app.models import (
    Base,
    User, Student, Staff, Hostel,
    Complaint, ComplaintAttachment, DocumentRequest,
    GatePass, GatePassQRToken, InAppNotification,
    ProxyRequest, OTPVerification, SMSNotification,
    Announcement, AnnouncementRead, ClassNotice,
    AttendanceSession, AttendanceRecord,
    StudyMaterial, StudyMaterialTarget,
    LabEquipment, LabRequisition, LabRequisitionItem,
    AuditLog,
    UserRole, ComplaintStatus, DocumentType, DocumentRequestStatus,
    GatePassType, GatePassStatus, DecisionStatus, QRTokenStatus,
    AnnouncementPriority, ClassNoticeType, AttendanceStatus,
    EquipmentWorkingStatus, LabRequisitionStatus
)

EXPECTED_24_TABLES = {
    "users",
    "students",
    "staff",
    "hostels",
    "complaints",
    "complaint_attachments",
    "document_requests",
    "gate_passes",
    "gate_pass_qr_tokens",
    "in_app_notifications",
    "proxy_requests",
    "otp_verifications",
    "sms_notifications",
    "announcements",
    "announcement_reads",
    "class_notices",
    "attendance_sessions",
    "attendance_records",
    "study_materials",
    "study_material_targets",
    "lab_equipment",
    "lab_requisitions",
    "lab_requisition_items",
    "audit_logs",
}


def test_all_24_models_imported():
    """Verify all 24 models and their class references are defined and available."""
    models = [
        User, Student, Staff, Hostel,
        Complaint, ComplaintAttachment, DocumentRequest,
        GatePass, GatePassQRToken, InAppNotification,
        ProxyRequest, OTPVerification, SMSNotification,
        Announcement, AnnouncementRead, ClassNotice,
        AttendanceSession, AttendanceRecord,
        StudyMaterial, StudyMaterialTarget,
        LabEquipment, LabRequisition, LabRequisitionItem,
        AuditLog
    ]
    assert len(models) == 24


def test_metadata_contains_exactly_24_tables():
    """Verify Base.metadata has exactly the 24 approved entities, no more, no less."""
    table_names = set(Base.metadata.tables.keys())
    assert table_names == EXPECTED_24_TABLES
    assert len(table_names) == 24


def test_database_schema_creation_in_memory():
    """Verify all tables, columns, and foreign keys compile and create cleanly in SQLite."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    inspector = inspect(engine)
    created_tables = set(inspector.get_table_names())
    assert created_tables == EXPECTED_24_TABLES


def test_all_8_approved_roles():
    """Verify exactly the 8 approved institutional roles are defined in UserRole enum."""
    roles = {r.value for r in UserRole}
    expected_roles = {
        "STUDENT",
        "ADMIN",
        "WARDEN",
        "HOSTEL_FACULTY",
        "TEACHER",
        "LAB_ASSISTANT",
        "STAFF",
        "GUARD",
    }
    assert roles == expected_roles
    assert len(roles) == 8


def test_gate_pass_status_and_timestamps():
    """Verify GatePass has all frozen PRD statuses and explicit decision/transit timestamps."""
    gp_table = Base.metadata.tables["gate_passes"]
    cols = gp_table.c

    # Check explicit timestamps required by Fix 2
    assert "created_at" in cols
    assert "decision_at" in cols
    assert "decision_by" in cols
    assert "decision_status" in cols
    assert "rejection_reason" in cols
    assert "actual_out_time" in cols
    assert "actual_in_time" in cols
    assert "pin_code" in cols

    # Check approved statuses
    gp_statuses = {s.value for s in GatePassStatus}
    expected_statuses = {"PENDING", "APPROVED", "REJECTED", "CHECKED_OUT", "COMPLETED", "OVERDUE"}
    assert gp_statuses == expected_statuses

    # Check decision statuses
    dec_statuses = {s.value for s in DecisionStatus}
    assert dec_statuses == {"PENDING", "APPROVED", "REJECTED"}


def test_single_use_qr_token_design():
    """Verify GatePassQRToken has required single-use fields and states."""
    qr_table = Base.metadata.tables["gate_pass_qr_tokens"]
    cols = qr_table.c

    assert "qr_token" in cols
    assert "expires_at" in cols
    assert "used_at" in cols
    assert "used_by_guard_id" in cols
    assert "status" in cols

    qr_statuses = {s.value for s in QRTokenStatus}
    assert qr_statuses == {"ACTIVE", "USED", "EXPIRED"}


def test_help_a_friend_otp_verification_schema():
    """Verify OTP verification has 5-minute expiry, hash storage, and attempt counter."""
    otp_table = Base.metadata.tables["otp_verifications"]
    cols = otp_table.c

    assert "beneficiary_student_id" in cols
    assert "phone_number" in cols
    assert "otp_code_hash" in cols
    assert "expires_at" in cols
    assert "is_verified" in cols
    assert "attempts" in cols

    proxy_table = Base.metadata.tables["proxy_requests"]
    proxy_cols = proxy_table.c
    assert "proxy_student_id" in proxy_cols
    assert "beneficiary_student_id" in proxy_cols
    assert "otp_verification_id" in proxy_cols


def test_complaint_statuses_and_rating_constraint():
    """Verify complaint lifecycle statuses and rating bounds."""
    statuses = {s.value for s in ComplaintStatus}
    expected = {"OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED", "COMPLETED"}
    assert statuses == expected

    complaints_table = Base.metadata.tables["complaints"]
    cols = complaints_table.c
    assert "is_recurring" in cols
    assert "sla_deadline" in cols
    assert "rating" in cols


def test_lab_requisition_lifecycle():
    """Verify lab requisition 7-stage state machine statuses."""
    statuses = {s.value for s in LabRequisitionStatus}
    expected = {"DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "ORDERED", "COMPLETED"}
    assert statuses == expected


def test_unique_constraints_exist():
    """Verify critical compound and individual uniqueness constraints."""
    ar_table = Base.metadata.tables["announcement_reads"]
    att_table = Base.metadata.tables["attendance_records"]

    # Announcement read compound uniqueness
    ar_uqs = [c.name for c in ar_table.constraints if hasattr(c, "columns") and len(c.columns) == 2]
    assert "uq_announcement_student_read" in ar_uqs

    # Attendance record compound uniqueness
    att_uqs = [c.name for c in att_table.constraints if hasattr(c, "columns") and len(c.columns) == 2]
    assert "uq_session_student_attendance" in att_uqs
