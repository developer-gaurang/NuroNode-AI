from uuid import uuid4

from backend.database import get_store
from backend.schemas.automation import AutomationCommandRequest, DevicePairRequest


class AutomationService:
    def __init__(self) -> None:
        self.store = get_store()

    def pair(self, uid: str, request: DevicePairRequest) -> dict:
        device_id = str(uuid4())
        return self.store.save_automation_device(
            uid,
            device_id,
            {
                "device_name": request.device_name,
                "device_type": request.device_type,
                "room": request.room,
                "blink_command": request.blink_command,
                "status": "paired",
                "state": "unknown",
            },
        )

    def command(self, uid: str, request: AutomationCommandRequest) -> dict:
        allowed = {
            "LIGHT_ON",
            "LIGHT_OFF",
            "FAN_ON",
            "FAN_OFF",
            "RELAY_ON",
            "RELAY_OFF",
            "ALL_ON",
            "ALL_OFF",
            "STATUS",
            "PING",
            "STOP",
            "EMERGENCY_STOP",
        }
        if request.command not in allowed:
            return {"accepted": False, "reason": "Unsupported automation command"}
        return {
            "accepted": True,
            "device_id": request.device_id,
            "command": request.command,
            "source": request.source,
            "note": "Future ESP8266/NodeMCU transport hook; follows Nurosync blink-command architecture.",
        }

    def status(self, uid: str) -> dict:
        return {"devices": self.store.list_automation_devices(uid)}
