from pydantic import BaseModel, Field


class SosContact(BaseModel):
    name: str
    phone: str
    relation: str | None = None


class SosSendRequest(BaseModel):
    patient_id: str = Field(default="primary")
    triggered_by: str = Field(default="Manual", alias="triggeredBy")
    message: str | None = None
    contacts: list[SosContact] = Field(default_factory=list)
    location: str | None = None

    model_config = {"populate_by_name": True}


class SosDelivery(BaseModel):
    contact: SosContact
    sid: str | None = None
    delivery_status: str = "queued"
    failed_reason: str | None = None
    timestamp: str


class SosEventResponse(BaseModel):
    id: str
    patient_id: str
    triggered_by: str
    timestamp: str
    message: str
    deliveries: list[SosDelivery]

