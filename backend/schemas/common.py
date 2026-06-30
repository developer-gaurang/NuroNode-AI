from typing import Any

from pydantic import BaseModel, Field


class ApiMessage(BaseModel):
    ok: bool = True
    message: str


class CurrentUser(BaseModel):
    uid: str
    email: str | None = None
    email_verified: bool = False
    claims: dict[str, Any] = Field(default_factory=dict)

