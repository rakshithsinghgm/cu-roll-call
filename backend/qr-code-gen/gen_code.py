import qrcode
import uuid

def generate_unique_qr(output_path: str = "qr_code.png") -> str:
    base_url = "https://cu-roll-call.vercel.app/"
    unique_token = uuid.uuid4().hex
    full_url = f"{base_url}?token={unique_token}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,  # better resilience
        box_size=10,
        border=4,
    )
    qr.add_data(full_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    img.save(output_path)

    return full_url  # return the full URL used

# Example usage:
if __name__ == "__main__":
    link = generate_unique_qr("cu_roll_call_qr.png")
    print("QR Code URL:", link)
