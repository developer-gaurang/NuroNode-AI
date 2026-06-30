from typing import Any

from pydantic import BaseModel, Field


class AiSummaryRequest(BaseModel):
    patient_id: str = "primary"
    session_metrics: dict[str, Any] = Field(default_factory=dict)
    question: str | None = None


class AiSummaryResponse(BaseModel):
    summary: str
    provider: str

