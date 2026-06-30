from typing import Any

from pydantic import BaseModel, Field


class NurosyncTelemetryIn(BaseModel):
    raw_line: str | None = None
    parsed: dict[str, Any] = Field(default_factory=dict)
    session_id: str = "current"


class NurosyncCommandRequest(BaseModel):
    command: str
    source: str = "backend"


class NurosyncStatus(BaseModel):
    engine: str = "nurosync"
    mode: str = "hardware-protocol-proxy"
    message: str

