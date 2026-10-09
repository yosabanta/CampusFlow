import os
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Central application configuration loaded from environment variables or .env file.
    Follows Phase 1 foundation specifications.
    """
    APP_NAME: str = "CampusFLow"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database Configuration (Neon PostgreSQL connection string)
    # Default to a placeholder if not set; validated during database initialization
    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/campusflow"

    # JWT Authentication
    JWT_SECRET: str = "campusflow_default_secret_key_for_hackathon_mvp_2026"
    JWT_EXPIRY: int = 86400  # 24 hours in seconds

    # File Storage Configuration
    UPLOAD_DIR: str = "uploads"

    # Cross-Origin Resource Sharing (CORS)
    ALLOWED_ORIGINS: str = "https://campusflow-frontend-khaki.vercel.app,http://localhost:3000,http://localhost:5500,http://127.0.0.1:5500,http://localhost:8000,http://127.0.0.1:8000,http://localhost:8080"

    # SMS Provider Mode ('mock', 'console', 'live')
    SMS_PROVIDER_MODE: str = "console"

    # Twilio Verify Service Configuration
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_VERIFY_SERVICE_SID: Optional[str] = None

    # Demo & Non-Production Features
    ENABLE_QUICK_DEMO_LOGIN: bool = True
    ENABLE_DEMO_OTP_FALLBACK: bool = False

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def is_quick_demo_login_allowed(self) -> bool:
        """Quick demo login is strictly disabled in production environments."""
        return self.ENABLE_QUICK_DEMO_LOGIN and self.ENVIRONMENT.strip().lower() != "production"


    @property
    def cors_origins(self) -> List[str]:
        """Parse comma-separated ALLOWED_ORIGINS string into a list of origins."""
        if not self.ALLOWED_ORIGINS:
            return ["*"]
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]


# Global cached settings instance
settings = Settings()
