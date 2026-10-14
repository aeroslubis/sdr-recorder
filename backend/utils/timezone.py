"""Server timezone detection, conversion, and formatting for SDR-Recorder NVR."""
import os
import time
from datetime import datetime, timezone as py_timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo


def get_system_timezone_name() -> str:
    """
    Detects the host OS timezone name (e.g. 'Asia/Jayapura', 'Asia/Jakarta', 'UTC').
    """
    # 1. Try /etc/timezone (Debian/Ubuntu/Arch)
    try:
        if os.path.exists("/etc/timezone"):
            with open("/etc/timezone", "r") as f:
                tz = f.read().strip()
                if tz:
                    return tz
    except Exception:
        pass

    # 2. Try /etc/localtime symlink target
    try:
        if os.path.islink("/etc/localtime"):
            target = os.readlink("/etc/localtime")
            parts = target.split("zoneinfo/")
            if len(parts) > 1:
                return parts[1]
    except Exception:
        pass

    # 3. Fallback to standard library timezone
    local_tz = datetime.now().astimezone().tzinfo
    if hasattr(local_tz, "key") and local_tz.key:
        return local_tz.key
    tzname = datetime.now().astimezone().tzname()
    if tzname == "WIT":
        return "Asia/Jayapura"
    elif tzname == "WITA":
        return "Asia/Makassar"
    elif tzname == "WIB":
        return "Asia/Jakarta"
    return "UTC"


def get_active_timezone(configured_tz: str = "auto") -> ZoneInfo:
    """
    Returns ZoneInfo object for active server timezone.
    If configured_tz is 'auto' or empty, auto-detects from host system.
    """
    if not configured_tz or configured_tz.lower() == "auto":
        tz_name = get_system_timezone_name()
    else:
        tz_name = configured_tz

    try:
        return ZoneInfo(tz_name)
    except Exception:
        try:
            return ZoneInfo(get_system_timezone_name())
        except Exception:
            return ZoneInfo("UTC")


def get_server_timezone_from_db(db_conn: Optional[Any] = None) -> ZoneInfo:
    """Helper to extract configured server timezone from database system_settings table."""
    cfg_tz = "auto"
    if db_conn:
        try:
            cur = db_conn.cursor()
            cur.execute("SELECT server_timezone FROM system_settings WHERE id = 1")
            row = cur.fetchone()
            if row:
                if hasattr(row, "keys") and "server_timezone" in row.keys():
                    cfg_tz = row["server_timezone"] or "auto"
                elif isinstance(row, (list, tuple)) and len(row) > 0 and row[0]:
                    cfg_tz = row[0]
        except Exception:
            pass
    return get_active_timezone(cfg_tz)


def get_server_time_info(configured_tz: str = "auto") -> Dict[str, Any]:
    """Returns comprehensive server clock and timezone metadata."""
    tz = get_active_timezone(configured_tz)
    now_local = datetime.now(tz)
    offset_sec = int(now_local.utcoffset().total_seconds()) if now_local.utcoffset() else 0
    hours = offset_sec // 3600
    mins = abs(offset_sec % 3600) // 60
    sign = "+" if offset_sec >= 0 else "-"
    offset_str = f"UTC{sign}{abs(hours):02d}:{mins:02d}"

    tz_key = tz.key if hasattr(tz, "key") else str(tz)
    tz_abbr = now_local.tzname() or "UTC"

    return {
        "timezone": tz_key,
        "configured_timezone": configured_tz or "auto",
        "tz_abbreviation": tz_abbr,
        "utc_offset_seconds": offset_sec,
        "utc_offset_str": offset_str,
        "server_time_iso": now_local.isoformat(),
        "server_time_formatted": now_local.strftime("%Y-%m-%d %H:%M:%S"),
        "supported_timezones": [
            "auto",
            "Asia/Jakarta",
            "Asia/Makassar",
            "Asia/Jayapura",
            "UTC",
            "Asia/Singapore",
            "Asia/Bangkok",
            "Asia/Tokyo",
            "Australia/Sydney",
            "Europe/London",
            "America/New_York",
        ],
    }
