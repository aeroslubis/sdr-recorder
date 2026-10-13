"""Configuration management for SDR-Recorder NVR."""
import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = Path(os.environ.get("SDR_STORAGE_DIR", str(BASE_DIR / "storage")))
RECORDINGS_DIR = STORAGE_DIR / "recordings"
DB_PATH = os.environ.get("SDR_DB_PATH", str(STORAGE_DIR / "sdr_recorder.db"))

# Authentication & JWT
JWT_SECRET = os.environ.get("JWT_SECRET", "sdr-recorder-nvr-default-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = int(os.environ.get("JWT_EXPIRATION_HOURS", "24"))

DEFAULT_ADMIN_USERNAME = os.environ.get("DEFAULT_ADMIN_USERNAME", "admin")
DEFAULT_ADMIN_PASSWORD = os.environ.get("DEFAULT_ADMIN_PASSWORD", "12345")

# Radio Default Hardware Configuration
DEFAULT_FREQUENCY_HZ = int(os.environ.get("DEFAULT_FREQUENCY_HZ", "118200000"))
DEFAULT_MODULATION = os.environ.get("DEFAULT_MODULATION", "AM")
DEFAULT_SQUELCH_THRESHOLD = float(os.environ.get("DEFAULT_SQUELCH_THRESHOLD", "-42.0"))
DEFAULT_RF_GAIN = float(os.environ.get("DEFAULT_RF_GAIN", "38.6"))
DEFAULT_GAIN_MODE = os.environ.get("DEFAULT_GAIN_MODE", "manual")
DEFAULT_PPM_OFFSET = int(os.environ.get("DEFAULT_PPM_OFFSET", "0"))
DEFAULT_BIAS_TEE = int(os.environ.get("DEFAULT_BIAS_TEE", "0"))
DEFAULT_DIRECT_SAMPLING = int(os.environ.get("DEFAULT_DIRECT_SAMPLING", "0"))
DEFAULT_DEVICE_INDEX = int(os.environ.get("DEFAULT_DEVICE_INDEX", "0"))
DEFAULT_SAMPLE_RATE = int(os.environ.get("DEFAULT_SAMPLE_RATE", "2048000"))
DEFAULT_PRE_ROLL_MS = int(os.environ.get("DEFAULT_PRE_ROLL_MS", "500"))
DEFAULT_HANG_TIME_MS = int(os.environ.get("DEFAULT_HANG_TIME_MS", "800"))

# System Settings Defaults
DEFAULT_RETENTION_DAYS = int(os.environ.get("DEFAULT_RETENTION_DAYS", "14"))
DEFAULT_MAX_DISK_USAGE_PERCENT = int(os.environ.get("DEFAULT_MAX_DISK_USAGE_PERCENT", "90"))
DEFAULT_AUDIO_FORMAT = os.environ.get("DEFAULT_AUDIO_FORMAT", "opus")
