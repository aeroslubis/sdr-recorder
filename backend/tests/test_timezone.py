from datetime import datetime
from zoneinfo import ZoneInfo
import pytest

from backend.utils.timezone import get_active_timezone, get_server_time_info, get_system_timezone_name


def test_get_system_timezone_name_returns_valid_string():
    tz_name = get_system_timezone_name()
    assert isinstance(tz_name, str)
    assert len(tz_name) > 0


def test_get_active_timezone_handles_auto_and_custom():
    tz_auto = get_active_timezone("auto")
    assert isinstance(tz_auto, ZoneInfo)

    tz_wib = get_active_timezone("Asia/Jakarta")
    assert tz_wib.key == "Asia/Jakarta"

    tz_wit = get_active_timezone("Asia/Jayapura")
    assert tz_wit.key == "Asia/Jayapura"

    # Invalid timezone fallback
    tz_invalid = get_active_timezone("NonExistent/Timezone")
    assert isinstance(tz_invalid, ZoneInfo)


def test_get_server_time_info_structure():
    info = get_server_time_info("Asia/Jayapura")
    assert info["timezone"] == "Asia/Jayapura"
    assert info["tz_abbreviation"] == "WIT"
    assert info["utc_offset_seconds"] == 32400
    assert "+09:00" in info["utc_offset_str"]
    assert "supported_timezones" in info
    assert "Asia/Jakarta" in info["supported_timezones"]
