from fastapi import APIRouter, Depends

from backend.auth.dependencies import get_current_user
from backend.schemas.ai import AiSummaryRequest, AiSummaryResponse
from backend.schemas.common import CurrentUser
from backend.services.ai_service import AiService

router = APIRouter()


@router.post("/session-summary", response_model=AiSummaryResponse)
async def session_summary(request: AiSummaryRequest, user: CurrentUser = Depends(get_current_user)):
    return AiService().summarize_session(request)

