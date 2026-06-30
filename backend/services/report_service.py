import csv
import io
import json
from typing import Any

from backend.database import get_store
from backend.schemas.reports import ReportRequest


class ReportService:
    def __init__(self) -> None:
        self.store = get_store()

    def build_payload(self, uid: str, request: ReportRequest) -> dict[str, Any]:
        patient = self.store.get_patient(uid, request.patient_id) or {"id": request.patient_id, "patient_name": "Unknown patient"}
        session = request.session.model_dump()
        return {
            "patient": patient,
            "session": session,
            "signal_graph_summary": session["signal_graph_summary"],
            "blink_statistics": session["blink_statistics"],
            "command_history": session["command_history"],
            "emergency_events": session["emergency_events"],
            "reliability_score": session["reliability_score"],
            "signal_quality": session["signal_quality"],
            "doctor_notes": session["doctor_notes"],
            "recommendations": session["recommendations"],
        }

    def as_json_bytes(self, payload: dict) -> bytes:
        return json.dumps(payload, indent=2, default=str).encode("utf-8")

    def as_csv_bytes(self, payload: dict) -> bytes:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["section", "key", "value"])
        for section, value in payload.items():
            if isinstance(value, dict):
                for key, item in value.items():
                    writer.writerow([section, key, json.dumps(item, default=str)])
            elif isinstance(value, list):
                for index, item in enumerate(value):
                    writer.writerow([section, index, json.dumps(item, default=str)])
            else:
                writer.writerow([section, "", value])
        return output.getvalue().encode("utf-8")

    def as_pdf_bytes(self, payload: dict) -> bytes:
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.pdfgen import canvas
        except ImportError:
            return self._minimal_pdf(payload)

        buffer = io.BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter
        y = height - 54
        pdf.setFont("Helvetica-Bold", 16)
        pdf.drawString(54, y, "NuroNode AI Nurosync Clinical Report")
        y -= 28
        pdf.setFont("Helvetica", 10)
        for line in json.dumps(payload, indent=2, default=str).splitlines():
            if y < 54:
                pdf.showPage()
                pdf.setFont("Helvetica", 10)
                y = height - 54
            pdf.drawString(54, y, line[:105])
            y -= 13
        pdf.save()
        buffer.seek(0)
        return buffer.read()

    def _minimal_pdf(self, payload: dict) -> bytes:
        text = json.dumps(payload, indent=2, default=str).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream = f"BT /F1 10 Tf 40 760 Td ({text[:2500]}) Tj ET"
        return (
            b"%PDF-1.4\n"
            b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
            b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
            b"3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >> endobj\n"
            b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
            + f"5 0 obj << /Length {len(stream)} >> stream\n{stream}\nendstream endobj\n".encode("utf-8")
            + b"xref\n0 6\n0000000000 65535 f \ntrailer << /Root 1 0 R /Size 6 >>\nstartxref\n0\n%%EOF"
        )

