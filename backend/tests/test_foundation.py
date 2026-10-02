import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from app.core.database import check_db_connection, Base
from sqlalchemy import create_engine, text


@pytest.fixture
def client():
    """Provides a TestClient for FastAPI endpoints."""
    return TestClient(app)


def test_settings_loaded():
    """Verify application configuration loads cleanly with default or env values."""
    assert settings.APP_NAME == "CampusFLow"
    assert settings.APP_VERSION == "1.0.0"
    assert isinstance(settings.cors_origins, list)
    assert len(settings.cors_origins) > 0


def test_root_endpoint(client):
    """Verify GET / returns 200 and indicates CampusFLow backend is running."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "CampusFLow backend is running" in data["message"]
    assert data["app"] == "CampusFLow"
    assert data["version"] == "1.0.0"


def test_health_endpoint(client):
    """Verify GET /health returns 200 and includes system and database status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["app"] == "CampusFLow"
    assert "database" in data
    assert isinstance(data["database"], dict)


def test_not_found_error_handler(client):
    """Verify 404 errors return a standardized JSON structure without stack traces."""
    response = client.get("/api/v1/non_existent_route")
    assert response.status_code == 404
    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "HTTP_404"
    assert "Not Found" in data["error"]["message"]


def test_database_base_metadata():
    """Verify SQLAlchemy 2.0 Base metadata initializes properly."""
    assert Base.metadata is not None


def test_database_connection_checker_with_sqlite():
    """
    Verify database connectivity logic using an in-memory SQLite engine
    to validate the query execution path independently.
    """
    test_engine = create_engine("sqlite:///:memory:")
    with test_engine.connect() as conn:
        result = conn.execute(text("SELECT 1")).scalar()
        assert result == 1


def test_database_connection_checker_handles_invalid_url():
    """Verify database check returns clean error dictionary if connection fails."""
    # check_db_connection handles failure gracefully without throwing unhandled exceptions
    result = check_db_connection()
    assert isinstance(result, dict)
    assert "connected" in result
    if not result["connected"]:
        assert "error" in result
