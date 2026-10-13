"""Comprehensive End-to-End integration test suite for SDR-Recorder NVR.

Tests the entire system lifecycle under Mock SDR Simulator mode:
1. Default credentials login (admin / 12345)
2. System stats check (simulator mode / hardware mode)
3. Radio tuning and preset creation
4. Simulated voice burst recording & database insertion
5. Timeline query and audio streaming retrieval (HTTP 206)
6. Star protection and auto-retention validation
"""
import time
from datetime import datetime, timezone
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.main import create_app
from backend.sdr.receiver import TransmissionEvent
from backend.storage.audio_writer import save_transmission
from backend.database import get_connection
from backend.storage.retention import run_retention_purge


def test_full_nvr_cycle_with_simulator(tmp_path):
    # Set up test database and storage in tmp_path
    db_file = str(tmp_path / "e2e_test.db")
    storage_dir = tmp_path / "recordings"
    storage_dir.mkdir(parents=True, exist_ok=True)

    app = create_app(db_path=db_file, force_simulator=True, test_mode=True)
    client = TestClient(app)

    # 1. Login with default admin / 12345
    login_res = client.post("/api/auth/login", json={"username": "admin", "password": "12345"})
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    token = login_res.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Check simulator hardware status via /api/system/stats
    stats_res = client.get("/api/system/stats", headers=headers)
    assert stats_res.status_code == 200, f"Stats request failed: {stats_res.text}"
    stats = stats_res.json()
    assert stats["simulator_mode"] is True
    assert "cpu_percent" in stats
    assert "memory" in stats
    assert "storage" in stats

    # 3. Radio tuning and preset creation
    tune_res = client.post(
        "/api/radio/tune",
        json={
            "frequency_hz": 118200000,
            "modulation": "AM",
            "squelch_threshold": -45.0,
        },
        headers=headers,
    )
    assert tune_res.status_code == 200
    assert tune_res.json()["frequency_hz"] == 118200000

    preset_res = client.post(
        "/api/radio/presets",
        json={
            "name": "Tower 118.2",
            "frequency_hz": 118200000,
            "modulation": "AM",
            "squelch_threshold": -45.0,
            "category": "Airband",
        },
        headers=headers,
    )
    assert preset_res.status_code == 200
    preset_data = preset_res.json()
    assert preset_data["name"] == "Tower 118.2"

    # 4. Simulated voice burst recording & database insertion
    # Generate a realistic voice transmission event
    now = datetime.now(timezone.utc)
    sample_rate = 24000
    # 1 second of dummy PCM audio data
    pcm_bytes = b"\x10\x00" * sample_rate
    event = TransmissionEvent(
        audio_data=pcm_bytes,
        start_time=now,
        end_time=now,
        duration_sec=1.0,
        peak_rssi_dbfs=-32.5,
        frequency_hz=118200000,
        modulation="AM",
    )

    conn = get_connection(db_file)
    rec_dict = save_transmission(
        db_conn=conn,
        storage_dir=storage_dir,
        event=event,
        audio_format="wav",
        sample_rate=sample_rate,
    )
    rec_id = rec_dict["id"]
    conn.close()
    assert rec_id is not None

    # 5. Timeline query and audio streaming retrieval (HTTP 206)
    today_str = now.strftime("%Y-%m-%d")
    timeline_res = client.get(f"/api/recordings/timeline?date={today_str}", headers=headers)
    assert timeline_res.status_code == 200
    timeline = timeline_res.json()
    assert len(timeline) >= 1
    assert any(item["id"] == rec_id for item in timeline)

    # Audio stream with Range header
    audio_res = client.get(
        f"/api/recordings/{rec_id}/audio",
        headers={**headers, "Range": "bytes=0-99"},
    )
    assert audio_res.status_code == 206
    assert "Content-Range" in audio_res.headers
    assert len(audio_res.content) == 100

    # 6. Star protection and auto-retention validation
    star_res = client.post(f"/api/recordings/{rec_id}/star", headers=headers)
    assert star_res.status_code == 200
    assert star_res.json()["is_starred"] == 1

    # Insert an old unstarred recording to test purge
    old_time = datetime(2020, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    old_event = TransmissionEvent(
        audio_data=pcm_bytes,
        start_time=old_time,
        end_time=old_time,
        duration_sec=1.0,
        peak_rssi_dbfs=-35.0,
        frequency_hz=118200000,
        modulation="AM",
    )
    conn = get_connection(db_file)
    old_rec_dict = save_transmission(
        db_conn=conn,
        storage_dir=storage_dir,
        event=old_event,
        audio_format="wav",
        sample_rate=sample_rate,
    )
    old_rec_id = old_rec_dict["id"]
    conn.close()

    # Run retention purge with 14 days max retention
    conn = get_connection(db_file)
    purged_count = run_retention_purge(
        db_conn=conn,
        storage_dir=storage_dir,
        max_days=14,
        max_disk_percent=90.0,
    )
    conn.close()
    assert purged_count == 1

    # Verify that rec_id (starred) still exists, while old_rec_id was purged
    conn = get_connection(db_file)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM transmissions WHERE id = ?", (rec_id,))
    assert cursor.fetchone() is not None
    cursor.execute("SELECT id FROM transmissions WHERE id = ?", (old_rec_id,))
    assert cursor.fetchone() is None
    conn.close()
