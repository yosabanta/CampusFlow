import os
import segno


def generate_qr_data_uri(content: str, scale: int = 5) -> str:
    """
    Generate a base64 encoded PNG data URI for a given content string.
    Suitable for inline rendering in HTML <img> tags.
    """
    qr = segno.make(content, error="m")
    return qr.png_data_uri(scale=scale)


def generate_qr_image_file(content: str, output_path: str, scale: int = 5) -> str:
    """
    Generate and save a PNG QR code image to the specified output file path.
    Creates parent directories if necessary.
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    qr = segno.make(content, error="m")
    qr.save(output_path, scale=scale)
    return output_path
