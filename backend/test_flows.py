import asyncio
import os
import sys
import time
import secrets
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import text

sys.path.insert(0, os.path.dirname(__file__))

from app.main import app
from app.database import SessionLocal

async def test_session_restoration_and_webhook():
    stamp = int(time.time())
    phone = f"999999{stamp % 10000:04d}"
    shop_name = f"Test Shop {stamp}"
    
    # 1. Register a test merchant
    # Endpoint: POST /api/merchant/register
    async with AsyncClient(app=app, base_url="http://test") as ac:
        payload = {
            "shopName": shop_name,
            "ownerName": "Test Owner",
            "legalName": "Test Legal",
            "tradeName": "Test Trade",
            "businessType": "Retail",
            "email": f"test_{stamp}@example.com",
            "phone": phone,
            "mpin": "1234",
            "gstin": "09AAAAA0000A1Z1",
            "pan": "AAAAA0000A",
            "address": "123 Test St",
            "state": "Uttar Pradesh",
            "city": "Noida",
            "pincode": "201301",
            "bankName": "Test Bank",
            "accountType": "Savings",
            "accountNumber": "1234567890",
            "ifsc": "SBIN0000001",
            "signatureDataUrl": "data:image/png;base64,abc",
            "upiId": "test@upi",
            "invoicePrefix": "TST"
        }
        resp = await ac.post("/api/merchant/register", json=payload)
        assert resp.status_code == 200, f"Register failed: {resp.text}"
        data = resp.json()
        assert data["ok"] is True
        token = data["token"]
        merchant_id = data["merchant"]["id"]
        print(f"[PASS] Merchant registered successfully. ID: {merchant_id}")

        # 2. Verify Session Restoration API (GET /api/merchant/me)
        # Happy path: using valid token
        resp_me = await ac.get("/api/merchant/me", headers={"Authorization": f"Bearer {token}"})
        assert resp_me.status_code == 200, f"Session restoration failed: {resp_me.text}"
        me_data = resp_me.json()
        assert me_data["phone"] == f"+91{phone}"
        print("[PASS] Session restoration (GET /me) verified with valid token.")

        # Sad path: using invalid token
        resp_me_bad = await ac.get("/api/merchant/me", headers={"Authorization": "Bearer badtoken"})
        assert resp_me_bad.status_code == 401
        print("[PASS] Session restoration correctly rejects invalid token (401).")

        # 3. Create a payment order to test Razorpay webhook integration
        # We call /api/merchant/create-order
        order_payload = {
            "purpose": "addon",
            "itemId": "addon_validity_50"
        }
        resp_order = await ac.post("/api/merchant/create-order", json=order_payload, headers={"Authorization": f"Bearer {token}"})
        assert resp_order.status_code == 200, f"Create order failed: {resp_order.text}"
        order_data = resp_order.json()
        assert order_data["ok"] is True
        order_id = order_data["orderId"]
        provider_order_id = order_data["providerOrderId"]
        print(f"[PASS] Payment order created successfully. Local ID: {order_id}, Provider ID: {provider_order_id}")

        # Simulate production flow by mocking the providerOrderId in the database
        mock_provider_order_id = "order_rzp_test_12345"
        async with SessionLocal() as db:
            await db.execute(
                text('update public.payment_orders set "providerOrderId" = :prov where id = :oid'),
                {"prov": mock_provider_order_id, "oid": order_id}
            )
            await db.commit()
        print(f"[PASS] Mocked providerOrderId '{mock_provider_order_id}' in the database.")

        # 4. Trigger Razorpay Webhook capture (simulating event from Razorpay production)
        # If settings.razorpay_webhook_secret is set, we sign the body. Otherwise use dummy.
        from app.config import settings
        webhook_secret = settings.razorpay_webhook_secret
        
        # Build event payload matching Razorpay's production structure for payment.captured or order.paid
        webhook_payload = {
            "entity": "event",
            "account_id": "acc_test",
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_test_payment_id",
                        "entity": "payment",
                        "amount": 5000,
                        "currency": "INR",
                        "status": "captured",
                        "order_id": mock_provider_order_id
                    }
                }
            },
            "created_at": int(time.time())
        }
        import json
        body_bytes = json.dumps(webhook_payload).encode("utf-8")
        
        headers = {}
        if webhook_secret:
            import hmac
            import hashlib
            sig = hmac.new(webhook_secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
            headers["X-Razorpay-Signature"] = sig
        else:
            headers["X-Razorpay-Signature"] = "webhook_signature"

        resp_webhook = await ac.post("/api/public/payments/webhook", content=body_bytes, headers=headers)
        assert resp_webhook.status_code == 200, f"Webhook failed: {resp_webhook.text}"
        assert resp_webhook.json() == {"status": "ok"}
        print("[PASS] Razorpay Webhook endpoint responded with 200 OK.")

        # 5. Verify the order's status was changed to 'paid' in the database
        async with SessionLocal() as db:
            res = await db.execute(
                text('select status, "providerPaymentId" from public.payment_orders where id = :oid'),
                {"oid": order_id}
            )
            row = res.fetchone()
            assert row is not None
            status, prov_pay_id = row
            assert status == "paid", f"Order status is {status}, expected 'paid'"
            assert prov_pay_id == "pay_test_payment_id", f"Provider payment ID is {prov_pay_id}, expected 'pay_test_payment_id'"
            print("[PASS] Razorpay production flow successfully marked order as paid in the database!")

            # 6. Cleanup test records from database
            await db.execute(text('delete from public.payment_orders where "merchantId" = :mid'), {"mid": merchant_id})
            await db.execute(text("delete from public.merchants where id = :mid"), {"mid": merchant_id})
            await db.commit()
            print("[PASS] Database cleaned up. Test merchant and payment orders deleted.")

if __name__ == "__main__":
    asyncio.run(test_session_restoration_and_webhook())
