from __future__ import annotations

from copy import deepcopy
from functools import lru_cache
from uuid import uuid4

from backend.firebase.client import FirebaseUnavailable, firestore_client
from backend.utils.time import utc_now_iso


class BaseStore:
    def save_user_profile(self, uid: str, data: dict) -> dict:
        raise NotImplementedError

    def get_user_profile(self, uid: str) -> dict | None:
        raise NotImplementedError

    def save_patient(self, uid: str, patient_id: str, data: dict) -> dict:
        raise NotImplementedError

    def get_patient(self, uid: str, patient_id: str) -> dict | None:
        raise NotImplementedError

    def get_public_patient(self, patient_id: str) -> dict | None:
        raise NotImplementedError

    def save_sos_event(self, uid: str, data: dict) -> dict:
        raise NotImplementedError

    def list_sos_events(self, uid: str, limit: int = 50) -> list[dict]:
        raise NotImplementedError

    def save_session(self, uid: str, data: dict) -> dict:
        raise NotImplementedError

    def get_session(self, uid: str, session_id: str) -> dict | None:
        raise NotImplementedError

    def list_sessions(self, uid: str, limit: int = 20) -> list[dict]:
        raise NotImplementedError

    def save_automation_device(self, uid: str, device_id: str, data: dict) -> dict:
        raise NotImplementedError

    def list_automation_devices(self, uid: str) -> list[dict]:
        raise NotImplementedError


class FirestoreStore(BaseStore):
    def __init__(self) -> None:
        self.db = firestore_client()

    def _user_doc(self, uid: str):
        return self.db.collection("users").document(uid)

    def _subdoc(self, uid: str, collection: str, doc_id: str):
        return self._user_doc(uid).collection(collection).document(doc_id)

    def save_user_profile(self, uid: str, data: dict) -> dict:
        payload = {**deepcopy(data), "uid": uid, "updated_at": utc_now_iso()}
        self._user_doc(uid).set(payload, merge=True)
        return payload

    def get_user_profile(self, uid: str) -> dict | None:
        snap = self._user_doc(uid).get()
        return snap.to_dict() if snap.exists else None

    def save_patient(self, uid: str, patient_id: str, data: dict) -> dict:
        payload = {**deepcopy(data), "id": patient_id, "owner_uid": uid, "updated_at": utc_now_iso()}
        self._subdoc(uid, "patients", patient_id).set(payload, merge=True)
        self.db.collection("public_medical_profiles").document(patient_id).set(
            {key: value for key, value in payload.items() if key != "owner_uid"},
            merge=True,
        )
        return payload

    def get_patient(self, uid: str, patient_id: str) -> dict | None:
        snap = self._subdoc(uid, "patients", patient_id).get()
        return snap.to_dict() if snap.exists else None

    def get_public_patient(self, patient_id: str) -> dict | None:
        snap = self.db.collection("public_medical_profiles").document(patient_id).get()
        return snap.to_dict() if snap.exists else None

    def save_sos_event(self, uid: str, data: dict) -> dict:
        event_id = data.get("id") or str(uuid4())
        payload = {**deepcopy(data), "id": event_id, "owner_uid": uid, "timestamp": data.get("timestamp") or utc_now_iso()}
        self._subdoc(uid, "sos_events", event_id).set(payload, merge=True)
        return payload

    def list_sos_events(self, uid: str, limit: int = 50) -> list[dict]:
        docs = self._user_doc(uid).collection("sos_events").order_by("timestamp", direction="DESCENDING").limit(limit).stream()
        return [doc.to_dict() for doc in docs]

    def save_session(self, uid: str, data: dict) -> dict:
        session_id = data.get("id") or data.get("session_id") or str(uuid4())
        payload = {**deepcopy(data), "id": session_id, "owner_uid": uid, "updated_at": utc_now_iso()}
        self._subdoc(uid, "sessions", session_id).set(payload, merge=True)
        return payload

    def get_session(self, uid: str, session_id: str) -> dict | None:
        snap = self._subdoc(uid, "sessions", session_id).get()
        return snap.to_dict() if snap.exists else None

    def list_sessions(self, uid: str, limit: int = 20) -> list[dict]:
        docs = self._user_doc(uid).collection("sessions").order_by("updated_at", direction="DESCENDING").limit(limit).stream()
        return [doc.to_dict() for doc in docs]

    def save_automation_device(self, uid: str, device_id: str, data: dict) -> dict:
        payload = {**deepcopy(data), "id": device_id, "owner_uid": uid, "updated_at": utc_now_iso()}
        self._subdoc(uid, "automation_devices", device_id).set(payload, merge=True)
        return payload

    def list_automation_devices(self, uid: str) -> list[dict]:
        docs = self._user_doc(uid).collection("automation_devices").stream()
        return [doc.to_dict() for doc in docs]


@lru_cache
def get_store() -> BaseStore:
    return FirestoreStore()
