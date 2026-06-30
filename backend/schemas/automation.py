from pydantic import BaseModel, Field


class DevicePairRequest(BaseModel):
    device_name: str = Field(alias="deviceName")
    device_type: str = Field(alias="deviceType")
    room: str | None = None
    blink_command: str | None = Field(default=None, alias="blinkCommand")

    model_config = {"populate_by_name": True}


class AutomationCommandRequest(BaseModel):
    device_id: str = Field(alias="deviceId")
    command: str
    source: str = "blink-command"

    model_config = {"populate_by_name": True}
