from fastapi import APIRouter, Depends

from backend.auth.dependencies import get_current_user
from backend.schemas.automation import AutomationCommandRequest, DevicePairRequest
from backend.schemas.common import CurrentUser
from backend.services.automation_service import AutomationService

router = APIRouter()


@router.post("/pair")
async def pair_device(request: DevicePairRequest, user: CurrentUser = Depends(get_current_user)):
    return AutomationService().pair(user.uid, request)


@router.post("/command")
async def send_command(request: AutomationCommandRequest, user: CurrentUser = Depends(get_current_user)):
    return AutomationService().command(user.uid, request)


@router.get("/status")
async def room_status(user: CurrentUser = Depends(get_current_user)):
    return AutomationService().status(user.uid)

