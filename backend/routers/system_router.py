"""System monitoring and telemetry endpoints for SDR-Recorder NVR."""
import os
import shutil
from typing import Any, Dict

from fastapi import APIRouter, Depends, Request

from backend import config
from backend.auth import get_current_user

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
    Returns hardware status, simulator status, CPU, RAM, storage,
    and active recording state.
    """
    receiver = getattr(request.app.state, "receiver", None)
    is_simulator = getattr(receiver, "is_simulator", True) if receiver else True
    is_recording = getattr(receiver, "is_recording", False) if receiver else False
    is_running = getattr(receiver, "is_running", False) if receiver else False

    return {
        "simulator_mode": is_simulator,
        "is_hardware_connected": not is_simulator,
        "is_running": is_running,
        "is_recording": is_recording,
        "cpu_percent": _get_cpu_percent(),
        "memory": _get_memory_info(),
        "storage": _get_storage_info(),
    }
