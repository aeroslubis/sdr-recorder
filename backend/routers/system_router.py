"""System monitoring and telemetry endpoints for SDR-Recorder NVR."""
import os
import shutil
import sqlite3
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Request

from backend import config
from backend.auth import get_current_user
from backend.database import get_db
from backend.models import SystemSettingsUpdate
from backend.utils.timezone import get_server_time_info

router = APIRouter(dependencies=[Depends(get_current_user)])



def _get_cpu_percent() -> float:
    """Read CPU load average from /proc/loadavg or return 0.0."""
    try:
        load1, _, _ = os.getloadavg()
        # Estimate percentage across CPU cores
        cpu_count = os.cpu_count() or 1
        return round(min(100.0, (load1 / cpu_count) * 100.0), 1)
    except Exception:
        return 0.0


def _get_memory_info() -> Dict[str, Any]:
    """Read RAM usage from /proc/meminfo or return estimated metrics."""
    try:
        meminfo: Dict[str, int] = {}
        with open("/proc/meminfo", "r") as f:
            for line in f:
                parts = line.split(":")
                if len(parts) == 2:
                    key = parts[0].strip()
                    val = parts[1].strip().split()[0]
                    if val.isdigit():
                        meminfo[key] = int(val) * 1024  # kB to bytes

        total = meminfo.get("MemTotal", 1024 * 1024 * 1024)
        available = meminfo.get("MemAvailable", total // 2)
        used = total - available
        percent = round((used / total) * 100.0, 1) if total > 0 else 0.0
        return {
            "total_bytes": total,
            "used_bytes": used,
            "available_bytes": available,
            "percent": percent,
        }
    except Exception:
        return {
            "total_bytes": 0,
            "used_bytes": 0,
            "available_bytes": 0,
            "percent": 0.0,
        }


def _get_storage_info() -> Dict[str, Any]:
    """Calculate storage usage for the SDR storage directory."""
    try:
        storage_path = str(config.STORAGE_DIR)
        if not os.path.exists(storage_path):
            os.makedirs(storage_path, exist_ok=True)
        usage = shutil.disk_usage(storage_path)
        percent = round((usage.used / usage.total) * 100.0, 1) if usage.total > 0 else 0.0
        return {
            "total_bytes": usage.total,
            "used_bytes": usage.used,
            "free_bytes": usage.free,
            "percent": percent,
        }
    except Exception:
        return {
            "total_bytes": 0,
            "used_bytes": 0,
            "free_bytes": 0,
            "percent": 0.0,
        }


@router.get("/stats")
def get_system_stats(request: Request) -> Dict[str, Any]:
    """
    Returns hardware status, CPU, RAM, storage,
    and active recording state.
    """
    receiver = getattr(request.app.state, "receiver", None)
    is_hw = receiver.is_hardware_connected if receiver else False
    is_recording = getattr(receiver, "is_recording", False) if receiver else False
    is_running = getattr(receiver, "is_running", False) if receiver else False

    return {
        "hardware_connected": is_hw,
        "is_hardware_connected": is_hw,
        "is_running": is_running,
        "is_recording": is_recording,
        "cpu_percent": _get_cpu_percent(),
        "memory": _get_memory_info(),
        "storage": _get_storage_info(),
    }


@router.get("/time")
def get_system_time(db: sqlite3.Connection = Depends(get_db)) -> Dict[str, Any]:
    """Retrieve active server timezone and clock information."""
    cursor = db.cursor()
    cursor.execute("SELECT server_timezone FROM system_settings WHERE id = 1")
    row = cursor.fetchone()
    configured_tz = row["server_timezone"] if row and "server_timezone" in row.keys() else "auto"
    return get_server_time_info(configured_tz)


@router.get("/settings")
def get_system_settings(db: sqlite3.Connection = Depends(get_db)) -> Dict[str, Any]:
    """Retrieve system retention, recording parameters, and timezone settings."""
    cursor = db.cursor()
    cursor.execute("SELECT * FROM system_settings WHERE id = 1")
    row = cursor.fetchone()
    if not row:
        return {
            "retention_days": 14,
            "max_disk_usage_percent": 90,
            "audio_format": "opus",
            "min_speech_duration_ms": 300,
            "pre_roll_ms": 500,
            "hang_time_ms": 1000,
            "max_transmission_sec": 300,
            "enable_squelch_tail_suppression": 1,
            "server_timezone": "auto",
        }
    data = dict(row)
    # Remove primary key 'id' from response if desired or keep
    data.pop("id", None)
    return data


@router.post("/settings")
def update_system_settings(
    payload: SystemSettingsUpdate,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> Dict[str, Any]:
    """Update system retention, recording thresholds, and timezone settings."""
    cursor = db.cursor()
    cursor.execute("SELECT * FROM system_settings WHERE id = 1")
    row = cursor.fetchone()
    current = dict(row) if row else {
        "retention_days": 14,
        "max_disk_usage_percent": 90,
        "audio_format": "opus",
        "min_speech_duration_ms": 300,
        "pre_roll_ms": 500,
        "hang_time_ms": 1000,
        "max_transmission_sec": 300,
        "enable_squelch_tail_suppression": 1,
        "server_timezone": "auto",
    }

    new_retention = payload.retention_days if payload.retention_days is not None else current.get("retention_days", 14)
    new_disk = payload.max_disk_usage_percent if payload.max_disk_usage_percent is not None else current.get("max_disk_usage_percent", 90)
    new_format = payload.audio_format if payload.audio_format is not None else current.get("audio_format", "opus")
    new_min_speech = payload.min_speech_duration_ms if payload.min_speech_duration_ms is not None else current.get("min_speech_duration_ms", 300)
    new_pre_roll = payload.pre_roll_ms if payload.pre_roll_ms is not None else current.get("pre_roll_ms", 500)
    new_hang_time = payload.hang_time_ms if payload.hang_time_ms is not None else current.get("hang_time_ms", 1000)
    new_max_tx = payload.max_transmission_sec if payload.max_transmission_sec is not None else current.get("max_transmission_sec", 300)
    new_suppress = payload.enable_squelch_tail_suppression if payload.enable_squelch_tail_suppression is not None else current.get("enable_squelch_tail_suppression", 1)
    new_tz = payload.server_timezone if payload.server_timezone is not None else current.get("server_timezone", "auto")

    cursor.execute(
        """
        INSERT INTO system_settings (
            id, retention_days, max_disk_usage_percent, audio_format,
            min_speech_duration_ms, pre_roll_ms, hang_time_ms,
            max_transmission_sec, enable_squelch_tail_suppression, server_timezone
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            retention_days = excluded.retention_days,
            max_disk_usage_percent = excluded.max_disk_usage_percent,
            audio_format = excluded.audio_format,
            min_speech_duration_ms = excluded.min_speech_duration_ms,
            pre_roll_ms = excluded.pre_roll_ms,
            hang_time_ms = excluded.hang_time_ms,
            max_transmission_sec = excluded.max_transmission_sec,
            enable_squelch_tail_suppression = excluded.enable_squelch_tail_suppression,
            server_timezone = excluded.server_timezone
        """,
        (new_retention, new_disk, new_format, new_min_speech, new_pre_roll, new_hang_time, new_max_tx, new_suppress, new_tz),
    )
    db.commit()

    # Dynamically apply settings to active SDRReceiver if available
    receiver = getattr(request.app.state, "receiver", None) if hasattr(request, "app") else None
    if receiver:
        receiver.min_speech_duration_ms = int(new_min_speech)
        receiver.max_transmission_sec = int(new_max_tx)
        receiver.enable_squelch_tail_suppression = bool(new_suppress)
        if hasattr(receiver, "squelch_evaluator"):
            receiver.squelch_evaluator.hang_time_ms = int(new_hang_time)
            receiver.squelch_evaluator.pre_roll_ms = int(new_pre_roll)

    return {
        "retention_days": new_retention,
        "max_disk_usage_percent": new_disk,
        "audio_format": new_format,
        "min_speech_duration_ms": new_min_speech,
        "pre_roll_ms": new_pre_roll,
        "hang_time_ms": new_hang_time,
        "max_transmission_sec": new_max_tx,
        "enable_squelch_tail_suppression": new_suppress,
        "server_timezone": new_tz,
    }

