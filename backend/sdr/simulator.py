"""Mock SDR Simulator for offline development and hardware-free CI/testing."""
import asyncio
import time
from typing import Optional
import numpy as np


class MockSDRSimulator:
    """
    Synthesizes 16-bit 24kHz mono PCM audio chunks emulating an RTL-SDR receiver.
    Generates realistic RF noise floor (~ -65 dBFS) and periodic simulated voice bursts (-25 to -38 dBFS)
    with speech-like formant harmonics and syllabic amplitude modulation.
    """

    def __init__(
        self,
        sample_rate: int = 24000,
        chunk_ms: int = 50,
        realtime: bool = True,
        auto_periodic: bool = True,
        noise_period_sec: float = 4.0,
        burst_duration_sec: float = 2.5,
    ):
        self.sample_rate = int(sample_rate)
        self.chunk_ms = int(chunk_ms)
        self.samples_per_chunk = int(self.sample_rate * (self.chunk_ms / 1000.0))
        self.chunk_bytes = self.samples_per_chunk * 2  # 16-bit mono = 2 bytes per sample
        self.realtime = bool(realtime)

        self.auto_periodic = bool(auto_periodic)
        self.noise_period_sec = float(noise_period_sec)
        self.burst_duration_sec = float(burst_duration_sec)

        # Internal state
        self._is_bursting = False
        self._state_remaining_ms = float(self.noise_period_sec * 1000.0)
        self._phase = 0.0
        self._speech_phase = 0.0
        self._burst_target_dbfs = -32.0

    @property
    def is_bursting(self) -> bool:
        return self._is_bursting

    def trigger_burst(self, duration_ms: Optional[float] = None) -> None:
        """Immediately triggers a simulated voice burst."""
        self._is_bursting = True
        dur = duration_ms if duration_ms is not None else (self.burst_duration_sec * 1000.0)
        self._state_remaining_ms = float(dur)
        # Randomize target burst dBFS within realistic speech range [-35, -28]
        self._burst_target_dbfs = float(np.random.uniform(-35.0, -28.0))

    def trigger_noise(self, duration_ms: Optional[float] = None) -> None:
        """Immediately reverts to baseline noise floor."""
        self._is_bursting = False
        dur = duration_ms if duration_ms is not None else (self.noise_period_sec * 1000.0)
        self._state_remaining_ms = float(dur)

    def set_burst_mode(self, active: bool) -> None:
        """Manually toggle burst mode on or off indefinitely."""
        self._is_bursting = active
        self._state_remaining_ms = 999999.0

    def generate_noise_chunk(self, target_dbfs: float = -65.0) -> bytes:
        """
        Generates a 16-bit signed PCM chunk of Gaussian RF noise floor.
        Clamped around target dBFS (default -65 dBFS).
        """
        rms = 32768.0 * (10.0 ** (target_dbfs / 20.0))
        # Add slight random flutter (+/- 1.5 dB)
        flutter = np.random.uniform(0.85, 1.15)
        samples = np.random.normal(0, rms * flutter, self.samples_per_chunk)
        samples = np.clip(samples, -32768, 32767).astype(np.int16)
        return samples.tobytes()

    def generate_burst_chunk(self, target_dbfs: Optional[float] = None) -> bytes:
        """
        Generates a 16-bit signed PCM chunk containing voice-like speech formants
        with syllabic amplitude modulation and RF carrier warmth.
        """
        if target_dbfs is None:
            target_dbfs = self._burst_target_dbfs

        t = (np.arange(self.samples_per_chunk) + self._phase) / self.sample_rate
        self._phase += self.samples_per_chunk

        # Speech formants (F1, F2, F3 frequencies typical in radio speech)
        f1 = np.sin(2.0 * np.pi * 500.0 * t)
        f2 = 0.7 * np.sin(2.0 * np.pi * 1200.0 * t)
        f3 = 0.4 * np.sin(2.0 * np.pi * 2400.0 * t)
        f4 = 0.2 * np.sin(2.0 * np.pi * 3200.0 * t)

        # Syllabic envelope modulation (approx 4 Hz rhythm of human speech)
        syllabic_env = 0.70 + 0.30 * np.sin(2.0 * np.pi * 4.0 * t)

        speech = (f1 + f2 + f3 + f4) * syllabic_env

        # Add background radio static / channel noise
        noise = np.random.normal(0, 0.1, self.samples_per_chunk)
        combined = speech + noise

        # Normalize to target dBFS
        rms_current = np.sqrt(np.mean(combined ** 2))
        if rms_current > 1e-6:
            target_rms = 32768.0 * (10.0 ** (target_dbfs / 20.0))
            combined = combined * (target_rms / rms_current)

        samples = np.clip(combined, -32768, 32767).astype(np.int16)
        return samples.tobytes()

    async def read_chunk(self) -> bytes:
        """
        Asynchronously reads the next 50ms (2400-byte) raw PCM audio chunk.
        Paces at real-time if realtime=True.
        """
        if self.realtime:
            await asyncio.sleep(self.chunk_ms / 1000.0)
        else:
            await asyncio.sleep(0)

        # Update periodic state machine
        if self.auto_periodic:
            self._state_remaining_ms -= float(self.chunk_ms)
            if self._state_remaining_ms <= 0.0:
                if self._is_bursting:
                    # Burst finished -> switch to noise
                    self._is_bursting = False
                    self._state_remaining_ms = self.noise_period_sec * 1000.0
                else:
                    # Noise period finished -> trigger burst
                    self._is_bursting = True
                    self._state_remaining_ms = self.burst_duration_sec * 1000.0
                    self._burst_target_dbfs = float(np.random.uniform(-35.0, -28.0))

        if self._is_bursting:
            return self.generate_burst_chunk()
        else:
            return self.generate_noise_chunk()
