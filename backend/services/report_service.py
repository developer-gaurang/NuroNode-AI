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
            "wellness_summary": session.get("wellness_summary", {}),
            "wellness_timeline": session.get("wellness_timeline", []),
            "doctor_notes": session["doctor_notes"],
            "recommendations": session["recommendations"],
            "disclaimer": "These values are experimental wellness indicators based on eye movement (EOG) signals and are not intended for medical diagnosis.",
            "footer": "NeuroNode AI | Powered by Oryen Dynamics",
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
        pdf.setFont("Helvetica-Bold", 18)
        pdf.drawString(54, y, "NeuroNode AI Wellness Report")
        y -= 16
        pdf.setFont("Helvetica", 9)
        pdf.drawString(54, y, "Powered by Oryen Dynamics")
        y -= 26

        def draw_section(title: str, value: Any) -> None:
            nonlocal y
            if y < 90:
                pdf.showPage()
                y = height - 54
            pdf.setFont("Helvetica-Bold", 12)
            pdf.drawString(54, y, title)
            y -= 16
            pdf.setFont("Helvetica", 9)
            lines = json.dumps(value, indent=2, default=str).splitlines() if not isinstance(value, str) else value.splitlines()
            for line in lines:
                if y < 70:
                    pdf.showPage()
                    y = height - 54
                    pdf.setFont("Helvetica", 9)
                pdf.drawString(64, y, line[:100])
                y -= 11
            y -= 8

        draw_section("Patient Information", payload.get("patient", {}))
        draw_section("Session Information", payload.get("session", {}))
        draw_section("Signal Analysis", {
            "signal_graph_summary": payload.get("signal_graph_summary", {}),
            "blink_statistics": payload.get("blink_statistics", {}),
            "reliability_score": payload.get("reliability_score"),
            "signal_quality": payload.get("signal_quality"),
        })
        draw_section("Wellness Insights", payload.get("wellness_summary", {}))
        draw_section("Charts", payload.get("wellness_timeline", [])[:12])
        draw_section("Recommendations", payload.get("recommendations", []))
        draw_section("Disclaimer", payload.get("disclaimer", ""))
        if y < 80:
            pdf.showPage()
            y = height - 54
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawString(54, 42, "NeuroNode AI")
        pdf.setFont("Helvetica", 9)
        pdf.drawRightString(width - 54, 42, "Powered by Oryen Dynamics")
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
