import logging
from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from app.core.config import settings
from app.models.base import Base

logger = logging.getLogger(__name__)

# Neon Serverless PostgreSQL / SQLAlchemy 2.0 Engine Configuration
# pool_pre_ping=True checks connections before using them to prevent stale socket errors
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

try:
    engine = create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
        connect_args=connect_args,
        echo=settings.DEBUG and settings.ENVIRONMENT == "development"
    )
except Exception as e:
    logger.error(f"Failed to create SQLAlchemy engine with DATABASE_URL: {e}")
    engine = None

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) if engine else None


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency yielding a database session per request.
    Ensures session closure and rollback on exception.
    """
    if SessionLocal is None:
        raise RuntimeError("Database engine is not configured. Check DATABASE_URL in .env.")

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db_connection() -> dict:
    """
    Utility to test connectivity to the configured database.
    Returns status dictionary indicating connectivity and version info.
    """
    if engine is None:
        return {
            "connected": False,
            "error": "Engine initialization failed. Check DATABASE_URL."
        }

    try:
        with engine.connect() as connection:
            result = connection.execute(text("SELECT 1"))
            scalar = result.scalar()
            if scalar == 1:
                return {
                    "connected": True,
                    "engine": engine.dialect.name,
                    "message": "Database connection successful"
                }
            return {
                "connected": False,
                "error": "Unexpected scalar query response"
            }
    except OperationalError as oe:
        logger.error(f"Database operational error during health check: {oe}")
        return {
            "connected": False,
            "error": f"OperationalError: {str(oe)}"
        }
    except SQLAlchemyError as se:
        logger.error(f"SQLAlchemy error during health check: {se}")
        return {
            "connected": False,
            "error": f"SQLAlchemyError: {str(se)}"
        }
    except Exception as ex:
        logger.error(f"General error during database check: {ex}")
        return {
            "connected": False,
            "error": str(ex)
        }
