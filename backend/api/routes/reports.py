from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, Response

from backend.auth.dependencies import get_current_user
from backend.schemas.common import CurrentUser
from backend.schemas.reports import ReportRequest
from backend.services.report_service import ReportService

router = APIRouter()


@router.post("/generate")
async def generate_report(request: ReportRequest, user: CurrentUser = Depends(get_current_user)):
    service = ReportService()
    payload = service.build_payload(user.uid, request)
    if request.format == "json":
        return JSONResponse(payload)
    if request.format == "csv":
        return Response(
            content=service.as_csv_bytes(payload),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="nuronode-session-report.csv"'},
        )
    return Response(
        content=service.as_pdf_bytes(payload),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="nuronode-session-report.pdf"'},
    )

