from fastapi import APIRouter

from backend.api.routes import ai, auth, automation, medical, nurosync, reports, sos

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(medical.router, tags=["medical profiles"])
api_router.include_router(sos.router, prefix="/sos", tags=["sos"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(ai.router, prefix="/ai", tags=["ai"])
api_router.include_router(nurosync.router, prefix="/nurosync", tags=["nurosync"])
api_router.include_router(automation.router, prefix="/automation", tags=["home automation"])

