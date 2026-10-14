"""System monitoring and telemetry endpoints for SDR-Recorder NVR."""
import os
import shutil
import sqlite3
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from backend import config
from backend.auth import get_current_user
from backend.database import get_db

router = APIRouter(dependencies=[Depends(get_current_user)])


class SystemSettingsUpdate(BaseModel):
    retention_days: Optional[int] = Field(None, ge=1, le=365)
    max_disk_usage_percent: Optional[int] = Field(None, ge=10, le=99)
    audio_format: Optional[str] = Field(None, pattern="^(wav|opus)$")



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


@router.get("/settings")
def get_system_settings(db: sqlite3.Connection = Depends(get_db)) -> Dict[str, Any]:
    """Retrieve system retention and storage limits."""
    cursor = db.cursor()
    cursor.execute("SELECT retention_days, max_disk_usage_percent, audio_format FROM system_settings WHERE id = 1")
    row = cursor.fetchone()
    if not row:
        return {"retention_days": 14, "max_disk_usage_percent": 90, "audio_format": "opus"}
    return dict(row)


@router.post("/settings")
def update_system_settings(
    payload: SystemSettingsUpdate,
    db: sqlite3.Connection = Depends(get_db),
) -> Dict[str, Any]:
    """Update system retention and storage quota settings."""
    cursor = db.cursor()
    cursor.execute("SELECT retention_days, max_disk_usage_percent, audio_format FROM system_settings WHERE id = 1")
    row = cursor.fetchone()
    current = dict(row) if row else {"retention_days": 14, "max_disk_usage_percent": 90, "audio_format": "opus"}

    new_retention = payload.retention_days if payload.retention_days is not None else current["retention_days"]
    new_disk = payload.max_disk_usage_percent if payload.max_disk_usage_percent is not None else current["max_disk_usage_percent"]
    new_format = payload.audio_format if payload.audio_format is not None else current["audio_format"]

    cursor.execute(
        """
        INSERT INTO system_settings (id, retention_days, max_disk_usage_percent, audio_format)
        VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            retention_days = excluded.retention_days,
            max_disk_usage_percent = excluded.max_disk_usage_percent,
            audio_format = excluded.audio_format
        """,
        (new_retention, new_disk, new_format),
    )
    db.commit()

    return {
        "retention_days": new_retention,
        "max_disk_usage_percent": new_disk,
        "audio_format": new_format,
    }

