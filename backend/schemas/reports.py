from typing import Any

from pydantic import BaseModel, Field


class SessionSummary(BaseModel):
    id: str = Field(default="current")
    signal_graph_summary: dict[str, Any] = Field(default_factory=dict)
    blink_statistics: dict[str, Any] = Field(default_factory=dict)
    command_history: list[dict[str, Any]] = Field(default_factory=list)
    emergency_events: list[dict[str, Any]] = Field(default_factory=list)
    reliability_score: float | None = None
    signal_quality: str | None = None
    doctor_notes: str | None = None
    recommendations: list[str] = Field(default_factory=list)


class ReportRequest(BaseModel):
    patient_id: str = "primary"
    session: SessionSummary = Field(default_factory=SessionSummary)
    format: str = Field(default="json", pattern="^(json|csv|pdf)$")

