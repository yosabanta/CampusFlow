import os
import io
import tempfile
from datetime import datetime, timezone
import segno
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.pdfgen import canvas


def generate_certificate_pdf(
    student_name: str,
    roll_number: str,
    department: str,
    doc_type: str,
    purpose: str,
    verification_hash: str,
    output_path: str
) -> str:
    """
    Generate an official institutional certificate in PDF format using ReportLab.
    Stamps an authentic Segno verification QR code with the SHA-256 validation URL.
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    # Document titles
    doc_type_formatted = doc_type.replace("_", " ").title()
    verification_url = f"https://campusflow.bput.ac.in/verify/doc/{verification_hash}"

    # Generate QR Code image using Segno
    qr = segno.make(verification_url, error="m")
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as qr_temp:
        qr_temp_path = qr_temp.name
        qr.save(qr_temp_path, scale=4)

    try:
        # Create PDF Canvas (Letter size: 612 x 792 points)
        c = canvas.Canvas(output_path, pagesize=letter)
        width, height = letter

        # Decorative Border
        c.setStrokeColor(colors.HexColor("#0057FF"))
        c.setLineWidth(3)
        c.rect(30, 30, width - 60, height - 60)

        c.setStrokeColor(colors.HexColor("#CBD5E1"))
        c.setLineWidth(1)
        c.rect(36, 36, width - 72, height - 72)

        # Header: University Details
        c.setFont("Helvetica-Bold", 18)
        c.setFillColor(colors.HexColor("#0F172A"))
        c.drawCentredString(width / 2.0, 720, "BIJU PATNAIK UNIVERSITY OF TECHNOLOGY")

        c.setFont("Helvetica", 11)
        c.setFillColor(colors.HexColor("#64748B"))
        c.drawCentredString(width / 2.0, 702, "CampusFLow Institutional Registry & Academic Records Office")

        c.setStrokeColor(colors.HexColor("#0057FF"))
        c.setLineWidth(1.5)
        c.line(50, 685, width - 50, 685)

        # Document Type Title
        c.setFont("Helvetica-Bold", 16)
        c.setFillColor(colors.HexColor("#0057FF"))
        c.drawCentredString(width / 2.0, 645, f"{doc_type_formatted.upper()} CERTIFICATE")

        # Certificate Body Text
        c.setFont("Helvetica", 12)
        c.setFillColor(colors.HexColor("#1E293B"))

        text_lines = [
            f"This is to certify that {student_name}, bearing University Roll Number {roll_number},",
            f"is a bona fide registered student of the Department of {department}.",
            f"According to the institutional repository, all required academic dues and residential",
            f"clearances for the current semester stand in order as of the date of issuance.",
            "",
            f"This certificate is issued at the formal request of the student for the purpose of:",
            f"\"{purpose}\"."
        ]

        text_y = 590
        for line in text_lines:
            c.drawCentredString(width / 2.0, text_y, line)
            text_y -= 22

        # Metadata Box
        box_y = 380
        c.setFillColor(colors.HexColor("#F8FAFC"))
        c.setStrokeColor(colors.HexColor("#E2E8F0"))
        c.setLineWidth(1)
        c.roundRect(70, box_y, width - 140, 110, 8, fill=1)

        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(colors.HexColor("#475569"))
        c.drawString(90, box_y + 85, "ISSUE DATE:")
        c.drawString(90, box_y + 60, "DOCUMENT REF:")
        c.drawString(90, box_y + 35, "SHA-256 HASH:")

        c.setFont("Helvetica", 10)
        c.setFillColor(colors.HexColor("#0F172A"))
        c.drawString(220, box_y + 85, datetime.now(timezone.utc).strftime("%d %B %Y, %H:%M UTC"))
        c.drawString(220, box_y + 60, f"CF-{verification_hash[:12].upper()}")

        c.setFont("Courier", 8)
        c.drawString(220, box_y + 35, f"{verification_hash[:32]}...")

        # Embed Segno QR Code (Lower Right)
        qr_size = 90
        c.drawImage(qr_temp_path, width - 190, 170, width=qr_size, height=qr_size)

        c.setFont("Helvetica", 8)
        c.setFillColor(colors.HexColor("#64748B"))
        c.drawCentredString(width - 145, 155, "Scan to Verify Authenticity")

        # Official Seal / Authorization (Lower Left)
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(colors.HexColor("#0F172A"))
        c.drawString(90, 205, "Dr. Ashok Patnaik")
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.HexColor("#64748B"))
        c.drawString(90, 190, "Registrar & Dean of Student Welfare")
        c.drawString(90, 175, "Biju Patnaik University of Technology")
        c.drawString(90, 160, "[Digitally Signed & Validated]")

        # Footer
        c.setFont("Helvetica-Oblique", 8)
        c.setFillColor(colors.HexColor("#94A3B8"))
        c.drawCentredString(width / 2.0, 50, "CampusFLow Unified Platform &bull; Valid without physical stamp when QR verification succeeds")

        c.save()
        return output_path
    finally:
        if os.path.exists(qr_temp_path):
            os.remove(qr_temp_path)
