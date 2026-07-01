from fastapi import APIRouter, Depends

from backend.auth.dependencies import get_current_user
from backend.schemas.common import CurrentUser
from backend.schemas.sos import SosSendRequest
from backend.services.sos_service import SosService

router = APIRouter()


@router.post("/send")
async def send_sos(request: SosSendRequest, user: CurrentUser = Depends(get_current_user)):
    return await SosService().send_sos(user.uid, request)


@router.post("/test")
async def test_sos(request: SosSendRequest, user: CurrentUser = Depends(get_current_user)):
    return await SosService().send_sos(user.uid, request)


@router.post("/history")
async def sos_history(user: CurrentUser = Depends(get_current_user)):
    return {"events": SosService().history(user.uid)}


@router.get("/history")
async def get_sos_history(user: CurrentUser = Depends(get_current_user)):
    return {"events": SosService().history(user.uid)}
