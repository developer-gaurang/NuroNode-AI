# NuroNode AI Backend

FastAPI backend for NuroNode AI. This service is the server-side control plane for authentication, Firestore persistence, Twilio SOS delivery, Gemini AI requests, report generation, Nurosync telemetry, and future ESP8266 automation.

## Run

```powershell
python -m pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
```

Swagger/OpenAPI docs are available at:

```text
http://localhost:8000/docs
```

## Configuration

Copy `backend/.env.example` to `backend/.env` or provide the same variables in your deployment environment.

Required for production:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_FILE`
- `FIREBASE_WEB_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `GEMINI_API_KEY`

Never expose the Twilio auth token, Firebase service account, or Gemini key to React.

## User Data Isolation

Authenticated user data is stored under:

```text
users/{uid}/patients/{patient_id}
users/{uid}/sos_events/{event_id}
users/{uid}/sessions/{session_id}
users/{uid}/automation_devices/{device_id}
```

Public QR medical profiles are written as sanitized documents under:

```text
public_medical_profiles/{patient_id}
```

This keeps private account data user-scoped while still allowing emergency QR scans to open `/medical-profile/{patient_id}`.

## Main APIs

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/password-reset`
- `POST /api/auth/email-verification`
- `GET /api/auth/session`
- `PUT /api/patients/{patient_id}`
- `GET /api/patients/{patient_id}`
- `GET /medical-profile/{patient_id}`
- `GET /medical-profile/{patient_id}/pdf`
- `POST /api/sos/send`
- `POST /api/sos/test`
- `POST /api/sos/history`
- `POST /api/reports/generate`
- `POST /api/ai/session-summary`
- `GET /api/nurosync/status`
- `POST /api/nurosync/telemetry`
- `POST /api/nurosync/command`
- `POST /api/automation/pair`
- `POST /api/automation/command`
- `GET /api/automation/status`
- `WS /ws/nurosync`

## Nurosync Boundary

This backend does not replace Nurosync blink detection, calibration, serial communication, or firmware protocol. It records telemetry, validates API access, and prepares command payloads while the existing Nurosync engine remains responsible for hardware behavior.

