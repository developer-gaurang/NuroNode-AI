from fastapi import APIRouter, Depends

from backend.auth.dependencies import get_current_user
from backend.schemas.common import CurrentUser
from backend.schemas.nurosync import NurosyncCommandRequest, NurosyncStatus, NurosyncTelemetryIn
from backend.services.nurosync_service import NurosyncService

router = APIRouter()


@router.get("/status", response_model=NurosyncStatus)
async def status():
    return NurosyncStatus(message="Backend is ready to proxy existing Nurosync telemetry and commands.")


@router.post("/telemetry")
async def ingest_telemetry(request: NurosyncTelemetryIn, user: CurrentUser = Depends(get_current_user)):
    return NurosyncService().ingest(user.uid, request)


@router.post("/command")
async def command(request: NurosyncCommandRequest, user: CurrentUser = Depends(get_current_user)):
    return NurosyncService().command(user.uid, request)

