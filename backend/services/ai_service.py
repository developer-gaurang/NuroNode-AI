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
            attempted_models = []
            model_candidates = [settings.gemini_model, "gemini-2.5-flash", "gemini-2.0-flash"]
            last_error: Exception | None = None

            for model in dict.fromkeys(item for item in model_candidates if item):
                attempted_models.append(model)
                try:
                    response = client.models.generate_content(model=model, contents=prompt)
                    text = self._extract_text(response)
                    if not text.strip():
                        raise RuntimeError("Gemini returned an empty response.")
                    return AiSummaryResponse(provider=model, summary=text)
                except Exception as exc:
                    last_error = exc

            raise RuntimeError(f"Gemini request failed for models {', '.join(attempted_models)}: {last_error}")
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gemini request failed: {exc}",
            ) from exc

    @staticmethod
    def _extract_text(response) -> str:
        try:
            return response.text or ""
        except Exception:
            parts = []
            for candidate in getattr(response, "candidates", []) or []:
                content = getattr(candidate, "content", None)
                for part in getattr(content, "parts", []) or []:
                    text = getattr(part, "text", "")
                    if text:
                        parts.append(text)
            return "\n".join(parts)
