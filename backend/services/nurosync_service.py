from backend.database import get_store
from backend.schemas.nurosync import NurosyncCommandRequest, NurosyncTelemetryIn
from backend.utils.time import utc_now_iso


ALLOWED_COMMANDS = {
    "F": "FORWARD",
    "B": "BACKWARD",
    "L": "LEFT",
    "R": "RIGHT",
    "S": "STOP",
    "E": "EMERGENCY_STOP",
    "C": "CALIBRATE",
}


class NurosyncService:
    def __init__(self) -> None:
        self.store = get_store()

    def ingest(self, uid: str, telemetry: NurosyncTelemetryIn) -> dict:
        session = self.store.get_session(uid, telemetry.session_id) or {"id": telemetry.session_id, "events": []}
        event = {"timestamp": utc_now_iso(), "raw_line": telemetry.raw_line, "parsed": telemetry.parsed}
        session["events"] = [*session.get("events", [])[-499:], event]
        return self.store.save_session(uid, session)

    def command(self, uid: str, request: NurosyncCommandRequest) -> dict:
        command = request.command.strip()
        if not (command in ALLOWED_COMMANDS or command.startswith("T:")):
            return {"accepted": False, "reason": "Unsupported Nurosync command"}
        return {
            "accepted": True,
            "command": command,
            "meaning": ALLOWED_COMMANDS.get(command, "MANUAL_THRESHOLD"),
            "source": request.source,
            "note": "Send this command through the existing Nurosync serial/Web Serial transport.",
        }

