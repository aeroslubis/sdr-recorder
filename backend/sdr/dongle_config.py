"""SDR Hardware and Dongle Configuration Model (BrowSDR compatible)."""
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field, ConfigDict


class DongleConfig(BaseModel):
    """Configuration model for RTL-SDR dongle hardware parameters and audio engine."""
    model_config = ConfigDict(from_attributes=True, validate_assignment=True)

    frequency_hz: int = Field(default=118200000, ge=100000, le=2000000000, description="Center frequency in Hz")
    modulation: str = Field(default="AM", description="Demodulation mode: AM, NFM, WFM, USB, LSB")
    squelch_threshold: float = Field(default=-42.0, ge=-100.0, le=0.0, description="Software squelch trigger threshold in dBFS")
    rf_gain: float = Field(default=38.6, ge=0.0, le=50.0, description="Manual RF tuner gain in dB")
    gain_mode: str = Field(default="manual", description="Gain mode: 'manual' or 'auto'")
    ppm_offset: int = Field(default=0, ge=-100, le=100, description="Crystal oscillator PPM frequency error correction")
    bias_tee: int = Field(default=0, ge=0, le=1, description="4.5V DC Bias-Tee power toggle (0=disabled, 1=enabled)")
    direct_sampling: int = Field(default=0, ge=0, le=2, description="Direct sampling: 0=off (VHF/UHF), 1=I (HF), 2=Q")
    device_index: int = Field(default=0, ge=0, description="Target RTL-SDR USB device index")
    sample_rate: int = Field(default=2048000, ge=250000, le=3200000, description="Hardware intermediate sample rate in S/s")
    pre_roll_ms: int = Field(default=500, ge=100, le=2000, description="Circular audio pre-roll buffer window in ms")
    hang_time_ms: int = Field(default=800, ge=100, le=3000, description="Squelch closure hang time delay in ms")

    def to_dict(self) -> Dict[str, Any]:
        """Return dict representation."""
        return self.model_dump()

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DongleConfig":
        """Construct from dict, filtering out unknown keys."""
        valid_fields = cls.model_fields.keys()
        filtered = {k: v for k, v in data.items() if k in valid_fields}
        return cls(**filtered)

    def update_from_dict(self, data: Dict[str, Any]) -> "DongleConfig":
        """Update fields from dictionary."""
        for k, v in data.items():
            if hasattr(self, k) and v is not None:
                setattr(self, k, v)
        return self
