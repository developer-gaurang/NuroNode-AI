from fastapi import HTTPException, status

from backend.schemas.ai import AiSummaryRequest, AiSummaryResponse
from backend.utils.config import settings


class AiService:
    def summarize_session(self, request: AiSummaryRequest) -> AiSummaryResponse:
        if not settings.gemini_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Gemini API key is not configured on the backend. Set GEMINI_API_KEY in backend/.env or the deployment environment.",
            )

        prompt = f"""
You are NuroNode Health Intelligence, a premium biomedical assistive intelligence layer around the Nurosync EOG hardware engine.

Use the supplied session data to generate a caregiver-facing insight report. Do not diagnose. Do not claim medical certainty. Keep it concise, specific, and operational.

Return these sections with clear headings:
1. Session Summary
2. Fatigue Analysis
3. Signal Analysis
4. Calibration Advice
5. Mobility Recommendation
6. Risk Assessment
7. Emergency Suggestions

Nurosync inputs:
{request.session_metrics}

Caregiver question:
{request.question or "Generate full AI Health Insights for this session."}
"""
        try:
            from google import genai

            client = genai.Client(api_key=settings.gemini_api_key)
            response = client.models.generate_content(model=settings.gemini_model, contents=prompt)
            text = response.text or ""
            if not text.strip():
                raise RuntimeError("Gemini returned an empty response.")
            return AiSummaryResponse(provider=settings.gemini_model, summary=text)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gemini request failed: {exc}",
            ) from exc
