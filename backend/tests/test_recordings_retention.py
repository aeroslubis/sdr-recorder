"""Unit and integration tests for NVR recordings archive, timeline API, and auto-retention."""
import io
import os
import shutil
import sqlite3
import wave
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.database import get_connection, init_db
from backend.main import create_app
from backend.models import hash_password
from backend.sdr.receiver import TransmissionEvent
from backend.storage.audio_writer import save_transmission
from backend.storage.retention import run_retention_purge


def create_dummy_wav(path: Path, duration_sec: float = 1.0, sample_rate: int = 24000) -> None:
    """Create a minimal valid mono 16-bit PCM WAV file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    num_samples = int(duration_sec * sample_rate)
    data = b"\x00\x00" * num_samples
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(data)


def test_retention_purge_protects_starred_and_purges_old(tmp_path):
    db_file = str(tmp_path / "test_ret.db")
    init_db(db_file)
    storage_dir = tmp_path / "recordings"
    storage_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.now(timezone.utc)
    old_time = (now - timedelta(days=20)).isoformat()
    recent_time = (now - timedelta(days=2)).isoformat()

    file_old_unstarred = storage_dir / "old_unstarred.wav"
    file_old_starred = storage_dir / "old_starred.wav"
    file_recent = storage_dir / "recent.wav"

    create_dummy_wav(file_old_unstarred)
    create_dummy_wav(file_old_starred)
    create_dummy_wav(file_recent)

    conn = get_connection(db_file)
    cursor = conn.cursor()
    # 1: old unstarred
    cursor.execute(
        """
        INSERT INTO transmissions (start_time, end_time, duration_sec, frequency_hz, modulation, peak_rssi_dbfs, file_path, file_size_bytes, is_starred)
        VALUES (?, ?, 1.0, 118200000, 'AM', -35.0, ?, ?, 0)
        """,
        (old_time, old_time, str(file_old_unstarred), file_old_unstarred.stat().st_size),
    )
    # 2: old starred
    cursor.execute(
        """
        INSERT INTO transmissions (start_time, end_time, duration_sec, frequency_hz, modulation, peak_rssi_dbfs, file_path, file_size_bytes, is_starred)
        VALUES (?, ?, 1.0, 118200000, 'AM', -30.0, ?, ?, 1)
        """,
        (old_time, old_time, str(file_old_starred), file_old_starred.stat().st_size),
    )
    # 3: recent unstarred
    cursor.execute(
        """
        INSERT INTO transmissions (start_time, end_time, duration_sec, frequency_hz, modulation, peak_rssi_dbfs, file_path, file_size_bytes, is_starred)
        VALUES (?, ?, 1.0, 118200000, 'AM', -28.0, ?, ?, 0)
        """,
        (recent_time, recent_time, str(file_recent), file_recent.stat().st_size),
    )
    conn.commit()

    # Run retention with max_days=14 and disk usage threshold 95%
    purged = run_retention_purge(conn, storage_dir, max_days=14, max_disk_percent=95.0)
    assert purged == 1

    # Verify old unstarred is deleted from DB and disk
    cursor.execute("SELECT id, file_path FROM transmissions ORDER BY id ASC")
    remaining = cursor.fetchall()
    assert len(remaining) == 2
    remaining_paths = [r["file_path"] for r in remaining]
    assert str(file_old_unstarred) not in remaining_paths
    assert not file_old_unstarred.exists()

    # Verify old starred and recent still exist
    assert str(file_old_starred) in remaining_paths
    assert file_old_starred.exists()
    assert str(file_recent) in remaining_paths
    assert file_recent.exists()
    conn.close()


def test_retention_purge_fifo_on_disk_full(tmp_path):
    db_file = str(tmp_path / "test_fifo.db")
    init_db(db_file)
    storage_dir = tmp_path / "recordings"
    storage_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.now(timezone.utc)
    t1 = (now - timedelta(hours=3)).isoformat()
    t2 = (now - timedelta(hours=2)).isoformat()
    t3 = (now - timedelta(hours=1)).isoformat()

    f1 = storage_dir / "f1.wav"
    f2 = storage_dir / "f2.wav"
    f3 = storage_dir / "f3.wav"
    create_dummy_wav(f1)
    create_dummy_wav(f2)
    create_dummy_wav(f3)

    conn = get_connection(db_file)
    cur = conn.cursor()
    # f1: oldest unstarred
    cur.execute(
        "INSERT INTO transmissions (start_time, end_time, duration_sec, frequency_hz, modulation, peak_rssi_dbfs, file_path, file_size_bytes, is_starred) VALUES (?, ?, 1.0, 118200000, 'AM', -35.0, ?, ?, 0)",
        (t1, t1, str(f1), f1.stat().st_size),
    )
    # f2: starred (must never be deleted)
    cur.execute(
        "INSERT INTO transmissions (start_time, end_time, duration_sec, frequency_hz, modulation, peak_rssi_dbfs, file_path, file_size_bytes, is_starred) VALUES (?, ?, 1.0, 118200000, 'AM', -35.0, ?, ?, 1)",
        (t2, t2, str(f2), f2.stat().st_size),
    )
    # f3: newer unstarred
    cur.execute(
        "INSERT INTO transmissions (start_time, end_time, duration_sec, frequency_hz, modulation, peak_rssi_dbfs, file_path, file_size_bytes, is_starred) VALUES (?, ?, 1.0, 118200000, 'AM', -35.0, ?, ?, 0)",
        (t3, t3, str(f3), f3.stat().st_size),
    )
    conn.commit()

    # Simulate disk usage at 95%, max_disk_percent at 90%
    # First purge will remove f1 (oldest unstarred), bringing usage down
    disk_call_count = 0
    from collections import namedtuple
    Usage = namedtuple("Usage", ["total", "used", "free"])

    def mock_disk_usage(path):
        nonlocal disk_call_count
        disk_call_count += 1
        # 1st and 2nd checks: 95% full (exceeds 90%)
        # 3rd check: drops to 85% full
        if disk_call_count <= 2:
            return Usage(total=1000, used=950, free=50)
        return Usage(total=1000, used=850, free=150)

    with patch("shutil.disk_usage", side_effect=mock_disk_usage):
        # max_days=30 so age check alone won't delete anything
        purged = run_retention_purge(conn, storage_dir, max_days=30, max_disk_percent=90.0)

    assert purged == 1
    assert not f1.exists()
    assert f2.exists()
    assert f3.exists()

    cur.execute("SELECT id, file_path, is_starred FROM transmissions")
    rows = cur.fetchall()
    assert len(rows) == 2
    paths = [r["file_path"] for r in rows]
    assert str(f1) not in paths
    assert str(f2) in paths
    assert str(f3) in paths
    conn.close()


def test_audio_writer_saves_transmission(tmp_path):
    db_file = str(tmp_path / "test_writer.db")
    init_db(db_file)
    storage_dir = tmp_path / "storage"
    storage_dir.mkdir(parents=True, exist_ok=True)

    start_dt = datetime(2026, 10, 13, 14, 30, 0, tzinfo=timezone.utc)
    end_dt = datetime(2026, 10, 13, 14, 30, 3, tzinfo=timezone.utc)
    raw_pcm = b"\x00\x00" * (24000 * 3)  # 3 seconds of silence

    event = TransmissionEvent(
        audio_data=raw_pcm,
        start_time=start_dt,
        end_time=end_dt,
        duration_sec=3.0,
        peak_rssi_dbfs=-34.5,
        frequency_hz=118200000,
        modulation="AM",
    )

    conn = get_connection(db_file)
    result = save_transmission(conn, storage_dir, event, audio_format="wav")
    assert result["id"] is not None
    assert result["duration_sec"] == 3.0
    assert result["frequency_hz"] == 118200000
    assert Path(result["file_path"]).exists()

    # Verify db entry
    cur = conn.cursor()
    cur.execute("SELECT * FROM transmissions WHERE id = ?", (result["id"],))
    row = cur.fetchone()
    assert row is not None
    assert row["modulation"] == "AM"
    assert row["peak_rssi_dbfs"] == -34.5
    assert row["is_starred"] == 0
    conn.close()


@pytest.fixture
def api_client(tmp_path):
    test_db = str(tmp_path / "test_api_rec.db")
    app = create_app(db_path=test_db, force_simulator=True, test_mode=True)
    with TestClient(app) as client:
        # Authenticate admin user
        login_resp = client.post("/api/auth/login", json={"username": "admin", "password": "12345"})
        token = login_resp.json()["token"]
        client.headers.update({"Authorization": f"Bearer {token}"})
        yield client, test_db, tmp_path


def test_recordings_api_endpoints(api_client):
    client, db_path, tmp_path = api_client
    conn = get_connection(db_path)
    cur = conn.cursor()

    rec_dir = tmp_path / "storage" / "recordings" / "2026-10-13"
    rec_dir.mkdir(parents=True, exist_ok=True)
    audio_file1 = rec_dir / "ch_118200000_1.wav"
    audio_file2 = rec_dir / "ch_121500000_2.wav"
    create_dummy_wav(audio_file1, duration_sec=2.0)
    create_dummy_wav(audio_file2, duration_sec=5.0)

    cur.execute(
        """
        INSERT INTO transmissions (start_time, end_time, duration_sec, frequency_hz, modulation, peak_rssi_dbfs, file_path, file_size_bytes, is_starred, notes)
        VALUES ('2026-10-13T10:00:00Z', '2026-10-13T10:00:02Z', 2.0, 118200000, 'AM', -32.0, ?, ?, 0, 'Initial call')
        """,
        (str(audio_file1), audio_file1.stat().st_size),
    )
    rec1_id = cur.lastrowid

    cur.execute(
        """
        INSERT INTO transmissions (start_time, end_time, duration_sec, frequency_hz, modulation, peak_rssi_dbfs, file_path, file_size_bytes, is_starred, notes)
        VALUES ('2026-10-13T11:30:00Z', '2026-10-13T11:30:05Z', 5.0, 121500000, 'AM', -24.0, ?, ?, 1, 'Emergency guard')
        """,
        (str(audio_file2), audio_file2.stat().st_size),
    )
    rec2_id = cur.lastrowid
    conn.commit()
    conn.close()

    # 1. Active dates
    resp = client.get("/api/recordings/active-dates?month=2026-10")
    assert resp.status_code == 200
    dates = resp.json()
    assert "2026-10-13" in dates

    # 2. Timeline intervals
    resp = client.get("/api/recordings/timeline?date=2026-10-13")
    assert resp.status_code == 200
    timeline = resp.json()
    assert len(timeline) == 2
    # 10:00:00 is 10 * 3600 * 1000 = 36000000 ms
    item1 = next(t for t in timeline if t["id"] == rec1_id)
    assert item1["start_ms"] == 36000000
    assert item1["end_ms"] == 36002000
    assert item1["duration_sec"] == 2.0
    assert item1["frequency_hz"] == 118200000
    assert item1["peak_rssi_dbfs"] == -32.0

    # 3. Paginated list and filters
    resp = client.get("/api/recordings?date=2026-10-13&limit=10&offset=0")
    assert resp.status_code == 200
    recs = resp.json()
    assert len(recs) == 2

    # Filter by starred
    resp_starred = client.get("/api/recordings?starred=true")
    assert resp_starred.status_code == 200
    recs_starred = resp_starred.json()
    assert len(recs_starred) == 1
    assert recs_starred[0]["id"] == rec2_id

    # Filter by frequency
    resp_freq = client.get("/api/recordings?frequency=118200000")
    assert resp_freq.status_code == 200
    assert len(resp_freq.json()) == 1

    # 4. Star toggle
    resp_star = client.post(f"/api/recordings/{rec1_id}/star")
    assert resp_star.status_code == 200
    assert resp_star.json()["is_starred"] == 1

    # Toggle back
    resp_unstar = client.post(f"/api/recordings/{rec1_id}/star")
    assert resp_unstar.status_code == 200
    assert resp_unstar.json()["is_starred"] == 0

    # 5. Update notes
    resp_notes = client.post(f"/api/recordings/{rec1_id}/notes", json={"notes": "Updated note"})
    assert resp_notes.status_code == 200
    assert resp_notes.json()["notes"] == "Updated note"

    # 6. Audio playback with Range header (HTTP 206)
    audio_full = client.get(f"/api/recordings/{rec1_id}/audio")
    assert audio_full.status_code == 200
    assert "audio/" in audio_full.headers["content-type"]
    assert audio_full.headers.get("accept-ranges") == "bytes"
    total_size = len(audio_full.content)

    # Partial range request
    audio_range = client.get(
        f"/api/recordings/{rec1_id}/audio",
        headers={"Range": "bytes=0-99"},
    )
    assert audio_range.status_code == 206
    assert len(audio_range.content) == 100
    assert audio_range.headers["content-range"] == f"bytes 0-99/{total_size}"

    # 7. Delete recording
    resp_del = client.delete(f"/api/recordings/{rec1_id}")
    assert resp_del.status_code == 200
    assert not audio_file1.exists()

    resp_after = client.get(f"/api/recordings/{rec1_id}/audio")
    assert resp_after.status_code == 404
