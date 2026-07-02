from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.router import api_router
from backend.api.routes.medical import public_router as medical_public_router
from backend.middleware.security import SecurityHeadersMiddleware
from backend.sockets.telemetry import router as telemetry_router
from backend.utils.config import settings


def create_app() -> FastAPI:
    app = FastAPI(
        title="NuroNode AI Backend",
        description="Secure backend brain for Firebase auth, Firestore SOS records, Gemini AI, Nurosync, and automation APIs.",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api")
    app.include_router(medical_public_router)
    app.include_router(telemetry_router)

    @app.get("/", tags=["health"])
    async def root() -> dict:
        return {
            "service": "NuroNode AI Backend",
            "status": "online",
            "docs": "/docs",
            "firebase": "configured" if settings.firebase_project_id else "credentials required",
        }

    @app.get("/health", tags=["health"])
    async def health() -> dict:
        return {
            "status": "ok",
            "environment": settings.app_env,
            "firebase_project_id": bool(settings.firebase_project_id),
            "firebase_service_account": bool(settings.firebase_service_account_json or settings.firebase_service_account_file),
            "firebase_web_api_key": bool(settings.firebase_web_api_key),
            "gemini": bool(settings.gemini_api_key),
            "cors_origins": settings.cors_origins,
        }

    return app


app = create_app()
