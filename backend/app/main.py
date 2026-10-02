import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.database import check_db_connection

# Configure structured logging for application lifecycle
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("campusflow.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager handling startup and shutdown procedures.
    """
    logger.info(f"=== Starting {settings.APP_NAME} v{settings.APP_VERSION} ({settings.ENVIRONMENT}) ===")
    logger.info(f"CORS Allowed Origins: {settings.cors_origins}")
    logger.info(f"Upload Directory: {settings.UPLOAD_DIR}")

    # Check database connectivity on startup
    db_check = check_db_connection()
    if db_check.get("connected"):
        logger.info(f"Database connectivity confirmed (Engine: {db_check.get('engine')})")
    else:
        logger.warning(
            f"Database connectivity check failed on startup: {db_check.get('error')}. "
            "Please ensure DATABASE_URL in .env points to a valid Neon PostgreSQL instance."
        )

    yield

    logger.info(f"=== Shutting down {settings.APP_NAME} backend ===")


# Instantiate FastAPI Application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Unified Campus Operations Platform Backend — Built for BPUT Hackathon 2026",
    lifespan=lifespan
)

# Configure Cross-Origin Resource Sharing (CORS) for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# Global Exception Handlers for Clean, Standardized API Error Responses
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Handles standard HTTPExceptions cleanly without leaking internals."""
    logger.warning(f"HTTP {exc.status_code} at {request.method} {request.url.path}: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": f"HTTP_{exc.status_code}",
                "message": exc.detail
            }
        }
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handles Pydantic v2 422 Request Validation Errors with readable field errors."""
    logger.warning(f"Validation error at {request.method} {request.url.path}: {exc.errors()}")
    formatted_errors = [
        {"field": " -> ".join(str(loc) for loc in err["loc"]), "message": err["msg"]}
        for err in exc.errors()
    ]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request payload validation failed",
                "details": formatted_errors
            }
        }
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catches all unhandled exceptions, logs full stack trace, and returns clean 500 JSON."""
    logger.error(f"Unhandled exception at {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected server error occurred. Please contact the administrator."
            }
        }
    )


# Root and Health Check Endpoints
@app.get("/", tags=["General"])
async def root():
    """Root endpoint confirming CampusFLow backend is operational."""
    return {
        "message": "CampusFLow backend is running",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT
    }


@app.get("/health", tags=["Monitoring"])
async def health_check():
    """
    Health check endpoint returning system status and database connectivity.
    Suitable for frontend polling, load balancers, and uptime monitors.
    """
    db_status = check_db_connection()
    overall_status = "ok" if db_status.get("connected") else "degraded"

    return {
        "status": overall_status,
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "database": db_status
    }


# Register Routers
from app.routers import (
    auth, complaints, gatepasses, help_a_friend, documents,
    attendance, class_notices, materials, lab, admin, notifications
)
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(complaints.router, prefix="/api/v1/complaints", tags=["Complaints"])
app.include_router(gatepasses.router, prefix="/api/v1/gatepasses", tags=["Gate Passes"])
app.include_router(help_a_friend.router, prefix="/api/v1/help-a-friend", tags=["Help-a-Friend OTP"])
app.include_router(documents.router, prefix="/api/v1/documents", tags=["Documents & Certificates"])
app.include_router(attendance.router, prefix="/api/v1/attendance", tags=["Attendance"])
app.include_router(class_notices.router, prefix="/api/v1/class-notices", tags=["Class Notices"])
app.include_router(materials.router, prefix="/api/v1/materials", tags=["Study Materials"])
app.include_router(lab.router, prefix="/api/v1/lab", tags=["Lab & Workshop"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin Control Tower & Audit"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["Notifications"])

