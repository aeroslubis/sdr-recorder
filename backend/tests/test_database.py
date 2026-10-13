import os
import sqlite3
import pytest
from backend.database import init_db, get_connection, get_db
from backend.models import (
    hash_password,
    verify_password,
    UserCreate,
    RadioConfigModel,
    PresetModel,
    TransmissionModel,
    SystemSettingsModel,
)


def test_init_db_creates_tables_and_seeds_admin(tmp_path):
    db_file = str(tmp_path / "test_sdr.db")
    init_db(db_file)
    conn = get_connection(db_file)
    cursor = conn.cursor()

    # Check default admin user
    cursor.execute("SELECT username, password_hash FROM users WHERE username = 'admin'")
    row = cursor.fetchone()
    assert row is not None
    assert row[0] == "admin"
    assert verify_password("12345", row[1]) is True

    # Check default radio_config
    cursor.execute(
        "SELECT frequency_hz, modulation, squelch_threshold, rf_gain, gain_mode, ppm_offset, bias_tee, direct_sampling, device_index, sample_rate, pre_roll_ms, hang_time_ms FROM radio_config WHERE id = 1"
    )
    config = cursor.fetchone()
    assert config is not None
    assert config[0] == 118200000
    assert config[1] == "AM"
    assert config[2] == -42.0
    assert config[3] == 38.6
    assert config[4] == "manual"
    assert config[5] == 0
    assert config[6] == 0
    assert config[7] == 0
    assert config[8] == 0
    assert config[9] == 2048000
    assert config[10] == 500
    assert config[11] == 800

    # Check default system_settings
    cursor.execute(
        "SELECT retention_days, max_disk_usage_percent, audio_format FROM system_settings WHERE id = 1"
    )
    sys_settings = cursor.fetchone()
    assert sys_settings is not None
    assert sys_settings[0] == 14
    assert sys_settings[1] == 90
    assert sys_settings[2] == "opus"

    # Check presets and transmissions tables exist
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='presets'")
    assert cursor.fetchone() is not None

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='transmissions'")
    assert cursor.fetchone() is not None

    # Check WAL mode
    cursor.execute("PRAGMA journal_mode")
    journal_mode = cursor.fetchone()[0]
    assert journal_mode.lower() == "wal"

    conn.close()


def test_init_db_is_idempotent(tmp_path):
    db_file = str(tmp_path / "test_sdr.db")
    init_db(db_file)
    # Calling init_db again should not throw errors or insert duplicate rows
    init_db(db_file)
    conn = get_connection(db_file)
    cursor = conn.cursor()

    cursor.execute("SELECT count(*) FROM users WHERE username = 'admin'")
    assert cursor.fetchone()[0] == 1

    cursor.execute("SELECT count(*) FROM radio_config")
    assert cursor.fetchone()[0] == 1

    cursor.execute("SELECT count(*) FROM system_settings")
    assert cursor.fetchone()[0] == 1

    conn.close()


def test_password_hashing():
    raw = "12345"
    hashed = hash_password(raw)
    assert hashed != raw
    assert verify_password("12345", hashed) is True
    assert verify_password("wrong_password", hashed) is False


def test_get_db_generator(tmp_path, monkeypatch):
    from backend import config
    db_file = str(tmp_path / "test_get_db.db")
    monkeypatch.setattr(config, "DB_PATH", db_file)
    init_db(db_file)

    gen = get_db()
    conn = next(gen)
    assert isinstance(conn, sqlite3.Connection)
    cursor = conn.cursor()
    cursor.execute("SELECT 1")
    assert cursor.fetchone()[0] == 1

    with pytest.raises(StopIteration):
        next(gen)


def test_models_validation():
    user = UserCreate(username="admin", password="password123")
    assert user.username == "admin"
    assert user.password == "password123"

    radio = RadioConfigModel(
        frequency_hz=118200000,
        modulation="AM",
        squelch_threshold=-42.0,
    )
    assert radio.frequency_hz == 118200000
    assert radio.modulation == "AM"

    preset = PresetModel(
        name="Tower",
        frequency_hz=118200000,
        modulation="AM",
        squelch_threshold=-40.0,
        category="Airband",
    )
    assert preset.name == "Tower"

    tx = TransmissionModel(
        start_time="2026-10-13 12:00:00",
        end_time="2026-10-13 12:00:05",
        duration_sec=5.0,
        frequency_hz=118200000,
        modulation="AM",
        peak_rssi_dbfs=-32.5,
        file_path="/storage/recordings/test.opus",
        file_size_bytes=15000,
    )
    assert tx.duration_sec == 5.0
    assert tx.is_starred == 0

    settings = SystemSettingsModel(
        retention_days=14,
        max_disk_usage_percent=90,
        audio_format="opus",
    )
    assert settings.retention_days == 14
