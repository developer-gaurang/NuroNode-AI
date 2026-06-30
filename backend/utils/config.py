import json
import os
from functools import lru_cache

from dotenv import load_dotenv


BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
PROJECT_DIR = os.path.dirname(BACKEND_DIR)

load_dotenv(os.path.join(PROJECT_DIR, ".env"))
load_dotenv(os.path.join(BACKEND_DIR, ".env"))


class Settings:
    def __init__(self) -> None:
        self.app_env = os.getenv("APP_ENV", "development")
        self.api_base_url = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")
        self.frontend_origins = os.getenv(
            "FRONTEND_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        )
        self.firebase_project_id = os.getenv("FIREBASE_PROJECT_ID", "")
        self.firebase_storage_bucket = os.getenv("FIREBASE_STORAGE_BUCKET", "nuronode-ai.firebasestorage.app")
        self.firebase_service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "")
        self.firebase_service_account_file = os.getenv("FIREBASE_SERVICE_ACCOUNT_FILE", "")
        self.firebase_web_api_key = os.getenv("FIREBASE_WEB_API_KEY", "")
        self.session_cookie_name = os.getenv("SESSION_COOKIE_NAME", "nuronode_session")
        self.twilio_account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
        self.twilio_auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
        self.twilio_from_number = os.getenv("TWILIO_FROM_NUMBER", "")
        self.gemini_api_key = (
            os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
            or os.getenv("GOOGLE_GEMINI_API_KEY")
            or ""
        )
        self.gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]

    @property
    def firebase_service_account(self) -> dict | None:
        if not self.firebase_service_account_json:
            return None
        try:
            return json.loads(self.firebase_service_account_json)
        except json.JSONDecodeError:
            return None


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
