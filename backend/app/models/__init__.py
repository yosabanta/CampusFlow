"""
SQLAlchemy 2.0 ORM Models for CampusFLow
Re-exports all 24 entities and enums for Alembic discovery and application use.
"""
from app.models.base import Base, TimestampMixin
from app.models.user import User, Student, Staff, UserRole
from app.models.hostel import Hostel
from app.models.complaint import Complaint, ComplaintAttachment, ComplaintStatus
from app.models.document_request import DocumentRequest, DocumentType, DocumentRequestStatus
from app.models.gate_pass import GatePass, GatePassQRToken, GatePassType, GatePassStatus, DecisionStatus, QRTokenStatus
from app.models.notification import InAppNotification, SMSNotification
from app.models.proxy_request import ProxyRequest, OTPVerification
from app.models.announcement import Announcement, AnnouncementRead, AnnouncementPriority
from app.models.academic import ClassNotice, ClassNoticeType, AttendanceSession, AttendanceRecord, AttendanceStatus
from app.models.material import StudyMaterial, StudyMaterialTarget
from app.models.lab import LabEquipment, LabRequisition, LabRequisitionItem, EquipmentWorkingStatus, LabRequisitionStatus
from app.models.audit import AuditLog

__all__ = [
    "Base",
    "TimestampMixin",
    # 24 Entities
    "User",
    "Student",
    "Staff",
    "Hostel",
    "Complaint",
    "ComplaintAttachment",
    "DocumentRequest",
    "GatePass",
    "GatePassQRToken",
    "InAppNotification",
    "ProxyRequest",
    "OTPVerification",
    "SMSNotification",
    "Announcement",
    "AnnouncementRead",
    "ClassNotice",
    "AttendanceSession",
    "AttendanceRecord",
    "StudyMaterial",
    "StudyMaterialTarget",
    "LabEquipment",
    "LabRequisition",
    "LabRequisitionItem",
    "AuditLog",
    # Enums
    "UserRole",
    "ComplaintStatus",
    "DocumentType",
    "DocumentRequestStatus",
    "GatePassType",
    "GatePassStatus",
    "DecisionStatus",
    "QRTokenStatus",
    "AnnouncementPriority",
    "ClassNoticeType",
    "AttendanceStatus",
    "EquipmentWorkingStatus",
    "LabRequisitionStatus",
]
