from pydantic import BaseModel, Field


class SosContact(BaseModel):
    name: str
    phone: str
    relation: str | None = Field(default=None, alias="relationship")

    model_config = {"populate_by_name": True}


class SosSendRequest(BaseModel):
    patient_id: str = Field(default="primary")
    triggered_by: str = Field(default="Manual", alias="triggeredBy")
    message: str | None = None
    contacts: list[SosContact] = Field(default_factory=list)
    location: str | None = None
    stress: str | int | float | None = None
    blink: str | int | float | None = None
    heart_rate: str | int | float | None = Field(default=None, alias="heartRate")
    battery: str | int | float | None = None
    status: dict = Field(default_factory=dict)

    model_config = {"populate_by_name": True}
