from uuid import uuid4

from backend.database import get_store
from backend.schemas.sos import SosContact, SosDelivery, SosSendRequest
from backend.twilio.client import TwilioNotConfigured, get_twilio_client
from backend.utils.config import settings
from backend.utils.time import utc_now_iso


class SosService:
    def __init__(self) -> None:
        self.store = get_store()

    def send_sos(self, uid: str, request: SosSendRequest, test_mode: bool = False) -> dict:
        contacts = request.contacts or self._contacts_from_patient(uid, request.patient_id)
        message = request.message or self._default_message(request)
        deliveries = [self._send_to_contact(contact, message, test_mode) for contact in contacts]
        event = {
            "id": str(uuid4()),
            "patient_id": request.patient_id,
            "triggered_by": request.triggered_by,
            "message": message,
            "location": request.location,
            "timestamp": utc_now_iso(),
            "deliveries": [delivery.model_dump() for delivery in deliveries],
        }
        return self.store.save_sos_event(uid, event)

    def history(self, uid: str) -> list[dict]:
        return self.store.list_sos_events(uid)

    def _contacts_from_patient(self, uid: str, patient_id: str) -> list[SosContact]:
        patient = self.store.get_patient(uid, patient_id) or {}
        contacts = patient.get("emergency_contacts") or patient.get("emergencyContacts") or []
        return [SosContact(**contact) for contact in contacts]

    def _default_message(self, request: SosSendRequest) -> str:
        profile_url = f"{settings.api_base_url}/medical-profile/{request.patient_id}"
        return f"NuroNode SOS triggered by {request.triggered_by}. Medical profile: {profile_url}"

    def _send_to_contact(self, contact: SosContact, message: str, test_mode: bool) -> SosDelivery:
        timestamp = utc_now_iso()
        if test_mode:
            return SosDelivery(contact=contact, sid=None, delivery_status="test", failed_reason=None, timestamp=timestamp)
        try:
            client = get_twilio_client()
            sent = client.messages.create(body=message, from_=settings.twilio_from_number, to=contact.phone)
            return SosDelivery(contact=contact, sid=sent.sid, delivery_status=getattr(sent, "status", "queued"), timestamp=timestamp)
        except TwilioNotConfigured as exc:
            return SosDelivery(contact=contact, delivery_status="not_configured", failed_reason=str(exc), timestamp=timestamp)
        except Exception as exc:
            return SosDelivery(contact=contact, delivery_status="failed", failed_reason=str(exc), timestamp=timestamp)

