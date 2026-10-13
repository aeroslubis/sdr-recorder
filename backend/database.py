"""Database management and SQLite initialization for SDR-Recorder NVR."""
import os
import sqlite3
from pathlib import Path
from typing import Any, Generator, Optional
from fastapi import Request
from backend import config
from backend.models import hash_password

SCHEMA_SQL = """
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS radio_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    frequency_hz INTEGER NOT NULL DEFAULT 118200000,
    modulation TEXT NOT NULL DEFAULT 'AM',
    squelch_threshold REAL NOT NULL DEFAULT -42.0,
    rf_gain REAL NOT NULL DEFAULT 38.6,
    gain_mode TEXT NOT NULL DEFAULT 'manual',
    ppm_offset INTEGER NOT NULL DEFAULT 0,
    bias_tee INTEGER NOT NULL DEFAULT 0,
    direct_sampling INTEGER NOT NULL DEFAULT 0,
    device_index INTEGER NOT NULL DEFAULT 0,
    sample_rate INTEGER NOT NULL DEFAULT 2048000,
    pre_roll_ms INTEGER NOT NULL DEFAULT 500,
    hang_time_ms INTEGER NOT NULL DEFAULT 800,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    frequency_hz INTEGER NOT NULL,
    modulation TEXT NOT NULL,
    squelch_threshold REAL,
    category TEXT DEFAULT 'General',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transmissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    duration_sec REAL NOT NULL,
    frequency_hz INTEGER NOT NULL,
    modulation TEXT NOT NULL,
    peak_rssi_dbfs REAL NOT NULL,
    file_path TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    is_starred INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transmissions_start ON transmissions(start_time);
CREATE INDEX IF NOT EXISTS idx_transmissions_freq ON transmissions(frequency_hz);
CREATE INDEX IF NOT EXISTS idx_transmissions_starred ON transmissions(is_starred);

CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    retention_days INTEGER NOT NULL DEFAULT 14,
    max_disk_usage_percent INTEGER NOT NULL DEFAULT 90,
    audio_format TEXT NOT NULL DEFAULT 'opus'
);
"""


def get_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Return a new SQLite connection with sqlite3.Row row_factory."""
    path = db_path or config.DB_PATH
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Initialize database schema, WAL mode, and seed default admin and config."""
    path = db_path or config.DB_PATH
    db_file = Path(path)
    db_file.parent.mkdir(parents=True, exist_ok=True)

    conn = get_connection(str(db_file))
    try:
        cursor = conn.cursor()
        cursor.executescript(SCHEMA_SQL)

        # Seed default admin user if not exists
        cursor.execute("SELECT id FROM users WHERE username = ?", (config.DEFAULT_ADMIN_USERNAME,))
        if cursor.fetchone() is None:
            admin_hash = hash_password(config.DEFAULT_ADMIN_PASSWORD)
            cursor.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (config.DEFAULT_ADMIN_USERNAME, admin_hash),
            )

        # Seed default radio_config if not exists
        cursor.execute("SELECT id FROM radio_config WHERE id = 1")
        if cursor.fetchone() is None:
            cursor.execute(
                """
                INSERT INTO radio_config (
                    id, frequency_hz, modulation, squelch_threshold, rf_gain,
                    gain_mode, ppm_offset, bias_tee, direct_sampling,
                    device_index, sample_rate, pre_roll_ms, hang_time_ms
                ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    config.DEFAULT_FREQUENCY_HZ,
                    config.DEFAULT_MODULATION,
                    config.DEFAULT_SQUELCH_THRESHOLD,
                    config.DEFAULT_RF_GAIN,
                    config.DEFAULT_GAIN_MODE,
                    config.DEFAULT_PPM_OFFSET,
                    config.DEFAULT_BIAS_TEE,
                    config.DEFAULT_DIRECT_SAMPLING,
                    config.DEFAULT_DEVICE_INDEX,
                    config.DEFAULT_SAMPLE_RATE,
                    config.DEFAULT_PRE_ROLL_MS,
                    config.DEFAULT_HANG_TIME_MS,
                ),
            )

        # Seed default system_settings if not exists
        cursor.execute("SELECT id FROM system_settings WHERE id = 1")
        if cursor.fetchone() is None:
            cursor.execute(
                """
                INSERT INTO system_settings (
                    id, retention_days, max_disk_usage_percent, audio_format
                ) VALUES (1, ?, ?, ?)
                """,
                (
                    config.DEFAULT_RETENTION_DAYS,
                    config.DEFAULT_MAX_DISK_USAGE_PERCENT,
                    config.DEFAULT_AUDIO_FORMAT,
                ),
            )

        conn.commit()
    finally:
        conn.close()


def get_db(request: Request = None) -> Generator[sqlite3.Connection, None, None]:
    """FastAPI dependency to yield a database connection."""
    db_path = None
    if request is not None and hasattr(request, "app") and hasattr(request.app.state, "db_path"):
        db_path = request.app.state.db_path
    conn = get_connection(db_path)
    try:
        yield conn
    finally:
        conn.close()
