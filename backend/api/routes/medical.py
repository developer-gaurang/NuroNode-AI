from html import escape

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, Response

from backend.auth.dependencies import get_current_user
from backend.database import get_store
from backend.schemas.common import CurrentUser
from backend.schemas.medical import PatientProfile
from backend.schemas.reports import ReportRequest, SessionSummary
from backend.services.report_service import ReportService

router = APIRouter()
public_router = APIRouter()


@router.put("/patients/{patient_id}")
async def save_patient(patient_id: str, request: PatientProfile, user: CurrentUser = Depends(get_current_user)):
    payload = request.model_dump(by_alias=False)
    return get_store().save_patient(user.uid, patient_id, payload)


@router.get("/patients/{patient_id}")
async def get_patient(patient_id: str, user: CurrentUser = Depends(get_current_user)):
    patient = get_store().get_patient(user.uid, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    return patient


@router.get("/patients/{patient_id}/qr-url")
async def patient_qr_url(patient_id: str, user: CurrentUser = Depends(get_current_user)):
    if not get_store().get_patient(user.uid, patient_id):
        raise HTTPException(status_code=404, detail="Patient profile not found")
    return {"url": f"/medical-profile/{patient_id}"}


@public_router.get("/medical-profile/{patient_id}", response_class=HTMLResponse)
async def public_medical_profile(patient_id: str):
    patient = get_store().get_public_patient(patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Medical profile not found")
    return HTMLResponse(_medical_html(patient_id, patient))


@public_router.get("/medical-profile/{patient_id}/pdf")
async def public_medical_pdf(patient_id: str):
    patient = get_store().get_public_patient(patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Medical profile not found")
    payload = ReportService().build_payload(
        uid=patient.get("owner_uid", "public"),
        request=ReportRequest(patient_id=patient_id, session=SessionSummary()),
    )
    payload["patient"] = patient
    return Response(
        content=ReportService().as_pdf_bytes(payload),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="nuronode-medical-{patient_id}.pdf"'},
    )


def _list(values: list | None) -> str:
    if isinstance(values, str):
        items = [item.strip() for item in values.split(",") if item.strip()]
    else:
        items = values or ["Not provided"]
    return "".join(f"<li>{escape(str(item))}</li>" for item in items)


def _contacts(values: list | None) -> str:
    contacts = values or []
    if not contacts:
        return "<li>Not provided</li>"
    return "".join(
        f"<li><strong>{escape(str(item.get('name', 'Contact')))}</strong><span>{escape(str(item.get('phone', '')))} {escape(str(item.get('relationship') or item.get('relation') or ''))}</span></li>"
        for item in contacts
    )


def _medical_html(patient_id: str, patient: dict) -> str:
    doctor = patient.get("doctor") or {}
    name = escape(str(patient.get("fullName") or patient.get("patient_name") or patient.get("patientName") or "NuroNode Patient"))
    condition = escape(str(patient.get("medical_condition") or patient.get("medicalCondition") or "Medical condition not provided"))
    blood = escape(str(patient.get("blood_group") or patient.get("bloodGroup") or "Not provided"))
    age = escape(str(patient.get("age") or "Not provided"))
    photo = escape(str(patient.get("profilePhoto") or ""))
    disability = escape(str(patient.get("disabilityType") or patient.get("disability") or "Not provided"))
    notes = escape(str(patient.get("medical_notes") or patient.get("medicalNotes") or "No notes provided"))
    doctor_text = escape(" / ".join(filter(None, [doctor.get("name") or patient.get("doctorName"), doctor.get("hospital") or patient.get("hospital"), doctor.get("phone") or patient.get("doctorPhone")])) or "Not provided")
    caregiver_phone = escape(str(patient.get("caregiverPhone") or ""))
    doctor_phone = escape(str(patient.get("doctorPhone") or ""))
    location = escape(str(patient.get("locationUrl") or "https://www.google.com/maps/search/?api=1&query=nearest%20hospital"))
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NuroNode Medical Profile - {name}</title>
  <style>
    body {{ margin: 0; font-family: Inter, Arial, sans-serif; background: #050816; color: #f8fafc; }}
    main {{ max-width: 920px; margin: 0 auto; padding: 22px; }}
    .card {{ background: rgba(12,19,39,.86); border: 1px solid rgba(148,163,184,.18); border-radius: 22px; overflow: hidden; box-shadow: 0 24px 70px rgba(0,0,0,.34); }}
    header {{ background: linear-gradient(135deg, rgba(0,212,255,.18), transparent 50%), #0f172a; color: white; padding: 28px; display: flex; justify-content: space-between; gap: 18px; align-items: center; }}
    img {{ width: 96px; height: 96px; border-radius: 22px; object-fit: cover; border: 1px solid rgba(0,212,255,.38); }}
    h1 {{ margin: 0 0 8px; font-size: 2rem; }}
    .alert {{ background: rgba(239,68,68,.08); color: #fecaca; border-bottom: 1px solid rgba(148,163,184,.16); padding: 16px 28px; font-weight: 700; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; padding: 24px; }}
    section {{ border: 1px solid rgba(148,163,184,.16); border-radius: 14px; padding: 16px; background: rgba(5,8,22,.38); }}
    h2 {{ margin: 0 0 10px; font-size: 1rem; color: #00d4ff; }}
    ul {{ margin: 0; padding-left: 18px; }}
    li {{ margin: 6px 0; }}
    p, li span {{ color: #cbd5e1; }}
    li span {{ display: block; font-size: .92rem; }}
    .actions {{ display: flex; flex-wrap: wrap; gap: 10px; padding: 0 24px 24px; }}
    a, button {{ border: 0; border-radius: 6px; padding: 12px 16px; font-weight: 700; text-decoration: none; cursor: pointer; }}
    .sos {{ background: #c62828; color: white; }}
    .pdf {{ background: #00d4ff; color: #03131a; }}
  </style>
</head>
<body>
  <main>
    <article class="card">
      <header><div><h1>{name}</h1><p>Emergency medical profile ID: {escape(patient_id)}</p></div>{f'<img src="{photo}" alt="{name}" />' if photo else ''}</header>
      <div class="alert">{condition}</div>
      <div class="grid">
        <section><h2>Age</h2><p>{age}</p></section>
        <section><h2>Blood Group</h2><p>{blood}</p></section>
        <section><h2>Disability</h2><p>{disability}</p></section>
        <section><h2>Allergies</h2><ul>{_list(patient.get("allergies"))}</ul></section>
        <section><h2>Medications</h2><ul>{_list(patient.get("medications"))}</ul></section>
        <section><h2>Emergency Contacts</h2><ul>{_contacts(patient.get("emergency_contacts") or patient.get("emergencyContacts"))}</ul></section>
        <section><h2>Doctor</h2><p>{doctor_text}</p></section>
        <section><h2>Medical Notes</h2><p>{notes}</p></section>
      </div>
      <div class="actions">
        {f'<a class="sos" href="tel:{caregiver_phone}">Call Caregiver</a>' if caregiver_phone else ''}
        {f'<a class="sos" href="tel:{doctor_phone}">Call Doctor</a>' if doctor_phone else ''}
        <a class="pdf" href="{location}">Open Google Maps</a>
        <a class="pdf" href="/medical-profile/{escape(patient_id)}/pdf">Download Medical PDF</a>
      </div>
    </article>
  </main>
</body>
</html>"""
