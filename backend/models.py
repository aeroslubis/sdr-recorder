"""Data models and password hashing for SDR-Recorder NVR."""
from typing import Optional
from datetime import datetime
import bcrypt
from pydantic import BaseModel, Field, ConfigDict


def hash_password(raw: str) -> str:
    """Hash a plaintext password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(raw.encode("utf-8"), salt).decode("utf-8")


def verify_password(raw: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(raw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# User Models
class UserBase(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)


class UserCreate(UserBase):
    password: str = Field(..., min_length=1)


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=1)


# Radio Configuration Models
class RadioConfigModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int = 1
    frequency_hz: int = Field(default=118200000, ge=100000, le=2000000000)
    modulation: str = Field(default="AM")  # AM, NFM
    squelch_threshold: float = Field(default=-42.0, ge=-100.0, le=0.0)
    rf_gain: float = Field(default=38.6, ge=0.0, le=50.0)
    gain_mode: str = Field(default="manual")  # manual, auto
    ppm_offset: int = Field(default=0, ge=-100, le=100)
    bias_tee: int = Field(default=0, ge=0, le=1)  # 0 or 1
    direct_sampling: int = Field(default=0, ge=0, le=2)  # 0: off, 1: I, 2: Q
    device_index: int = Field(default=0, ge=0)
    sample_rate: int = Field(default=2048000, ge=250000, le=3200000)
    pre_roll_ms: int = Field(default=500, ge=100, le=2000)
    hang_time_ms: int = Field(default=800, ge=100, le=3000)
    updated_at: Optional[str] = None


class RadioTuneRequest(BaseModel):
    frequency_hz: Optional[int] = None
    modulation: Optional[str] = None
    squelch_threshold: Optional[float] = None
    rf_gain: Optional[float] = None
    gain_mode: Optional[str] = None
    ppm_offset: Optional[int] = None


class DongleConfigRequest(BaseModel):
    device_index: Optional[int] = None
    ppm_offset: Optional[int] = None
    bias_tee: Optional[int] = None
    direct_sampling: Optional[int] = None
    sample_rate: Optional[int] = None
    pre_roll_ms: Optional[int] = None
    hang_time_ms: Optional[int] = None
    rf_gain: Optional[float] = None
    gain_mode: Optional[str] = None


# Preset Models
class PresetBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    frequency_hz: int = Field(..., ge=100000, le=2000000000)
    modulation: str = Field(..., min_length=2, max_length=10)
    squelch_threshold: Optional[float] = Field(default=None, ge=-100.0, le=0.0)
    category: str = Field(default="General", max_length=50)


class PresetCreate(PresetBase):
    pass


class PresetModel(PresetBase):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    created_at: Optional[str] = None


# Transmission Models
class TransmissionModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    start_time: str
    end_time: str
    duration_sec: float
    frequency_hz: int
    modulation: str
    peak_rssi_dbfs: float
    file_path: str
    file_size_bytes: int
    is_starred: int = 0
    notes: Optional[str] = None
    created_at: Optional[str] = None


class TimelineItem(BaseModel):
    id: int
    start_ms: int
    end_ms: int
    duration_sec: float
    peak_rssi_dbfs: float
    peak_rssi: Optional[float] = None
    frequency_hz: int = 0
    modulation: str = "AM"
    is_starred: int = 0


class UpdateNotesRequest(BaseModel):
    notes: Optional[str] = None


# System Settings Models
class SystemSettingsModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int = 1
    retention_days: int = Field(default=14, ge=1, le=365)
    max_disk_usage_percent: int = Field(default=90, ge=10, le=99)
    audio_format: str = Field(default="opus")
    min_speech_duration_ms: int = Field(default=300, ge=50, le=3000)
    pre_roll_ms: int = Field(default=500, ge=100, le=2000)
    hang_time_ms: int = Field(default=1000, ge=200, le=3000)
    max_transmission_sec: int = Field(default=300, ge=10, le=3600)
    enable_squelch_tail_suppression: int = Field(default=1, ge=0, le=1)
    server_timezone: str = Field(default="auto")


class SystemSettingsUpdate(BaseModel):
    retention_days: Optional[int] = Field(None, ge=1, le=365)
    max_disk_usage_percent: Optional[int] = Field(None, ge=10, le=99)
    audio_format: Optional[str] = Field(None, pattern="^(wav|opus)$")
    min_speech_duration_ms: Optional[int] = Field(None, ge=50, le=3000)
    pre_roll_ms: Optional[int] = Field(None, ge=100, le=2000)
    hang_time_ms: Optional[int] = Field(None, ge=200, le=3000)
    max_transmission_sec: Optional[int] = Field(None, ge=10, le=3600)
    enable_squelch_tail_suppression: Optional[int] = Field(None, ge=0, le=1)
    server_timezone: Optional[str] = None
