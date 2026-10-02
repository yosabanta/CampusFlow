"""
FastAPI APIRouters for CampusFLow
"""
from app.routers import (
    auth, complaints, gatepasses, help_a_friend, documents,
    attendance, class_notices, materials, lab, admin
)

__all__ = [
    "auth",
    "complaints",
    "gatepasses",
    "help_a_friend",
    "documents",
    "attendance",
    "class_notices",
    "materials",
    "lab",
    "admin"
]
