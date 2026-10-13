"""Tests for RTL-SDR hardware device enumeration and system settings API."""
import pytest
from fastapi.testclient import TestClient
from backend.main import create_app
from backend.sdr.receiver import get_available_devices


def test_get_available_devices_returns_list():
    devices = get_available_devices()
    assert isinstance(devices, list)
    assert len(devices) >= 1
    assert "index" in devices[0]
    assert "name" in devices[0]
    assert "available" in devices[0]


def test_system_settings_and_devices_api(tmp_path):
    test_db = str(tmp_path / "test_settings.db")
    app = create_app(db_path=test_db, force_simulator=True, test_mode=True)
    with TestClient(app) as client:
        # Login
        login_res = client.post("/api/auth/login", json={"username": "admin", "password": "12345"})
        assert login_res.status_code == 200
        token = login_res.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # GET /api/radio/devices
        dev_res = client.get("/api/radio/devices", headers=headers)
        assert dev_res.status_code == 200
        devices = dev_res.json()
        assert isinstance(devices, list)
        assert len(devices) >= 1
        assert "name" in devices[0]

        # GET /api/system/settings
        get_res = client.get("/api/system/settings", headers=headers)
        assert get_res.status_code == 200
        data = get_res.json()
        assert "retention_days" in data
        assert "max_disk_usage_percent" in data

        # POST /api/system/settings
        update_res = client.post(
            "/api/system/settings",
            json={"retention_days": 30, "max_disk_usage_percent": 85, "audio_format": "opus"},
            headers=headers,
        )
        assert update_res.status_code == 200
        updated = update_res.json()
        assert updated["retention_days"] == 30
        assert updated["max_disk_usage_percent"] == 85
        assert updated["audio_format"] == "opus"

        # Verify persisted via GET
        get_res2 = client.get("/api/system/settings", headers=headers)
        assert get_res2.status_code == 200
        assert get_res2.json()["retention_days"] == 30
