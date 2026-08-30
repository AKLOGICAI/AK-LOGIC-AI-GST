import importlib
import os


def test_allow_dev_admin_otp_defaults_to_false(monkeypatch):
    monkeypatch.delenv("ALLOW_DEV_ADMIN_OTP", raising=False)
    os.environ.pop("ALLOW_DEV_ADMIN_OTP", None)

    import app.config as config
    importlib.reload(config)

    assert config.settings.allow_dev_admin_otp is False
