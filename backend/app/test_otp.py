"""Manual, ad-hoc smoke test for the MSG91 OTP sender.

Not part of the test suite or the deployed app — run directly with:
    TEST_PHONE=+91XXXXXXXXXX python -m backend.app.test_otp

Requires MSG91_AUTH_KEY / MSG91_TEMPLATE_ID to be set (see .env.example).
No real phone number or OTP is hardcoded here — provide your own via the
TEST_PHONE env var.
"""
import asyncio
import os
import secrets

from backend.app.services import send_msg91_otp, is_msg91_configured


async def main():
    phone = os.getenv("TEST_PHONE")
    if not phone:
        print("Set TEST_PHONE=+91XXXXXXXXXX in your environment before running this script.")
        return
    if not is_msg91_configured():
        print("MSG91 is not configured (MSG91_AUTH_KEY/MSG91_TEMPLATE_ID). Nothing to test.")
        return

    code = f"{secrets.randbelow(1_000_000):06d}"
    print(f"Sending test OTP {code} to {phone} ...")
    result = await send_msg91_otp(phone, code)
    print("Result:", result)


if __name__ == "__main__":
    asyncio.run(main())
