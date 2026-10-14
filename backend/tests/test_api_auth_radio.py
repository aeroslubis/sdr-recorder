"""Tests for Authentication and Radio Control REST Endpoints."""
import os
import pytest
from fastapi.testclient import TestClient
from backend.main import create_app


@pytest.fixture
def client(tmp_path):
    test_db = str(tmp_path / "test_api.db")
    app = create_app(db_path=test_db, force_simulator=True, test_mode=True)
    with TestClient(app) as test_client:
        yield test_client


def test_login_success_and_failure(client):
    # Wrong password
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401
    assert "detail" in resp.json()

    # Non-existent user
    resp = client.post("/api/auth/login", json={"username": "nonexistent", "password": "wrong"})
    assert resp.status_code == 401

    # Correct default credentials
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "12345"})
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data.get("token_type") == "bearer"
    assert data["user"]["username"] == "admin"

    token = data["token"]

    # Authenticated radio status
    resp = client.get("/api/radio/status", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    status_data = resp.json()
    assert "frequency_hz" in status_data
    assert "modulation" in status_data
    assert "squelch_threshold" in status_data
    assert "is_simulator" in status_data


def test_auth_me_and_logout(client):
    # Unauthenticated me
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401

    # Login to get token
    login_resp = client.post("/api/auth/login", json={"username": "admin", "password": "12345"})
    assert login_resp.status_code == 200
    token = login_resp.json()["token"]

    # Authenticated me
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    user_data = resp.json()
    assert user_data["username"] == "admin"
    assert "id" in user_data

    # Logout
    resp = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


def test_change_password(client):
    # Login to get token
    login_resp = client.post("/api/auth/login", json={"username": "admin", "password": "12345"})
    assert login_resp.status_code == 200
    token = login_resp.json()["token"]

    # Try change password with wrong old password
    resp = client.post(
        "/api/auth/change-password",
        json={"old_password": "bad_password", "new_password": "new_secret_123"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400

    # Change password with valid old password
    resp = client.post(
        "/api/auth/change-password",
        json={"old_password": "12345", "new_password": "new_secret_123"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    # Old password should no longer work
    old_login = client.post("/api/auth/login", json={"username": "admin", "password": "12345"})
    assert old_login.status_code == 401

    # New password should work
    new_login = client.post("/api/auth/login", json={"username": "admin", "password": "new_secret_123"})
    assert new_login.status_code == 200
    assert "token" in new_login.json()


def test_radio_endpoints_require_auth(client):
    resp = client.get("/api/radio/status")
    assert resp.status_code == 401

    resp = client.post("/api/radio/tune", json={"frequency_hz": 121500000})
    assert resp.status_code == 401

    resp = client.get("/api/radio/presets")
    assert resp.status_code == 401


def test_radio_tune_and_dongle_config(client):
    # Login
    login_resp = client.post("/api/auth/login", json={"username": "admin", "password": "12345"})
    token = login_resp.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Radio Tune
    tune_payload = {
        "frequency_hz": 121500000,
        "modulation": "AM",
        "squelch_threshold": -36.5,
        "rf_gain": 42.0,
        "gain_mode": "manual",
        "ppm_offset": 2,
    }
    resp = client.post("/api/radio/tune", json=tune_payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["frequency_hz"] == 121500000
    assert data["modulation"] == "AM"
    assert data["squelch_threshold"] == -36.5

    # Check /api/radio/status reflects the changes
    status_resp = client.get("/api/radio/status", headers=headers)
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert status_data["frequency_hz"] == 121500000
    assert status_data["modulation"] == "AM"
    assert status_data["squelch_threshold"] == -36.5
    assert status_data["rf_gain"] == 42.0
    assert status_data["gain_mode"] == "manual"
    assert status_data["ppm_offset"] == 2

    # Dongle Reconfiguration
    dongle_payload = {
        "bias_tee": 1,
        "direct_sampling": 0,
        "sample_rate": 2048000,
        "pre_roll_ms": 600,
        "hang_time_ms": 1000,
        "rf_gain": 45.0,
    }
    resp = client.post("/api/radio/dongle-config", json=dongle_payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["bias_tee"] == 1
    assert data["pre_roll_ms"] == 600
    assert data["hang_time_ms"] == 1000
    assert data["rf_gain"] == 45.0


def test_radio_presets_crud(client):
    # Login
    login_resp = client.post("/api/auth/login", json={"username": "admin", "password": "12345"})
    token = login_resp.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Initial presets list
    resp = client.get("/api/radio/presets", headers=headers)
    assert resp.status_code == 200
    presets = resp.json()
    assert isinstance(presets, list)
    initial_count = len(presets)

    # Create new preset
    new_preset = {
        "name": "Tower Channel",
        "frequency_hz": 118200000,
        "modulation": "AM",
        "squelch_threshold": -40.0,
        "category": "Aviation",
    }
    resp = client.post("/api/radio/presets", json=new_preset, headers=headers)
    assert resp.status_code == 200
    created = resp.json()
    assert created["name"] == "Tower Channel"
    assert created["frequency_hz"] == 118200000
    assert "id" in created
    preset_id = created["id"]

    # Verify preset in list
    resp = client.get("/api/radio/presets", headers=headers)
    assert resp.status_code == 200
    presets = resp.json()
    assert len(presets) == initial_count + 1
    assert any(p["id"] == preset_id for p in presets)

    # Update preset (PUT)
    update_payload = {
        "name": "Tower Channel Updated",
        "frequency_hz": 119100000,
        "modulation": "AM",
        "squelch_threshold": -45.0,
        "category": "Airband",
    }
    put_resp = client.put(f"/api/radio/presets/{preset_id}", json=update_payload, headers=headers)
    assert put_resp.status_code == 200
    updated = put_resp.json()
    assert updated["name"] == "Tower Channel Updated"
    assert updated["frequency_hz"] == 119100000

    # Delete preset
    del_resp = client.delete(f"/api/radio/presets/{preset_id}", headers=headers)
    assert del_resp.status_code == 200

    # Delete again -> 404
    del_resp404 = client.delete(f"/api/radio/presets/{preset_id}", headers=headers)
    assert del_resp404.status_code == 404
