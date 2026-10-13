import inspect
from dataclasses import dataclass
from enum import Enum
from typing import Callable, Optional, Union

import numpy as np

from backend.dsp.ring_buffer import AudioRingBuffer


class SquelchState(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    CLOSING = "CLOSING"


@dataclass
class SquelchResult:
    state: SquelchState
    rssi_dbfs: float
    is_open: bool
    transition: Optional[str] = None
    pre_roll: bytes = b""

    @property
    def squelch_open(self) -> bool:
        return self.is_open

    def __iter__(self):
        yield self.state
        yield self.rssi_dbfs

    def __getitem__(self, item: str):
        return getattr(self, item)


def calculate_rssi_dbfs(pcm_chunk: Union[bytes, bytearray, np.ndarray]) -> float:
    """
    Computes vectorised RMS power and dBFS for 16-bit signed mono PCM audio.
    Clamped to a floor of -100.0 dBFS and ceiling of 0.0 dBFS.
    Formula: 20 * log10(RMS / 32768.0)
    """
    if isinstance(pcm_chunk, np.ndarray):
        samples = pcm_chunk.astype(np.float64)
    else:
        if not pcm_chunk or len(pcm_chunk) < 2:
            return -100.0
        # Truncate any odd trailing byte to ensure 16-bit alignment
        valid_len = len(pcm_chunk) - (len(pcm_chunk) % 2)
        samples = np.frombuffer(pcm_chunk[:valid_len], dtype=np.int16).astype(np.float64)

    if len(samples) == 0:
        return -100.0

    mean_sq = np.mean(samples ** 2)
    if mean_sq <= 1e-12:
        return -100.0

    rms = np.sqrt(mean_sq)
    if rms <= 1e-6:
        return -100.0

    dbfs = 20.0 * np.log10(rms / 32768.0)
    if dbfs < -100.0:
        dbfs = -100.0
    elif dbfs > 0.0:
        dbfs = 0.0

    return float(round(dbfs, 2))


class SquelchEvaluator:
    """
    Stateful squelch detector and pre-roll manager for radio ingestion.

    States:
      - CLOSED: Signal below threshold. Audio is buffered into circular pre-roll.
      - OPEN: Signal meets or exceeds threshold. Pre-roll is flushed, hang time reset.
      - CLOSING: Signal dropped below threshold. Hang time countdown in progress.
                 If speech resumes, transitions back to OPEN.
                 If hang time reaches 0, transitions to CLOSED.
    """

    CLOSED = SquelchState.CLOSED
    OPEN = SquelchState.OPEN
    CLOSING = SquelchState.CLOSING

    def __init__(
        self,
        threshold_dbfs: float = -42.0,
        hang_time_ms: int = 800,
        pre_roll_ms: int = 500,
        sample_rate: int = 24000,
        on_open: Optional[Callable] = None,
        on_close: Optional[Callable] = None,
        on_closing: Optional[Callable] = None,
    ):
        self._threshold_dbfs = float(threshold_dbfs)
        self._hang_time_ms = int(hang_time_ms)
        self._pre_roll_ms = int(pre_roll_ms)
        self._sample_rate = int(sample_rate)

        self.on_open = on_open
        self.on_close = on_close
        self.on_closing = on_closing

        self._state = SquelchState.CLOSED
        self._hang_time_remaining_ms = 0.0

        # Pre-roll capacity in bytes: 16-bit mono = 2 bytes/sample
        capacity_bytes = max(1, int((self._pre_roll_ms * self._sample_rate * 2) / 1000))
        self.ring_buffer = AudioRingBuffer(capacity_bytes=capacity_bytes)

    @property
    def state(self) -> SquelchState:
        return self._state

    @property
    def is_open(self) -> bool:
        return self._state in (SquelchState.OPEN, SquelchState.CLOSING)

    @property
    def threshold_dbfs(self) -> float:
        return self._threshold_dbfs

    @threshold_dbfs.setter
    def threshold_dbfs(self, value: float) -> None:
        self._threshold_dbfs = float(value)

    @property
    def hang_time_ms(self) -> int:
        return self._hang_time_ms

    @hang_time_ms.setter
    def hang_time_ms(self, value: int) -> None:
        self._hang_time_ms = int(value)

    @property
    def pre_roll_ms(self) -> int:
        return self._pre_roll_ms

    @pre_roll_ms.setter
    def pre_roll_ms(self, value: int) -> None:
        self._pre_roll_ms = int(value)
        new_capacity = max(1, int((self._pre_roll_ms * self._sample_rate * 2) / 1000))
        current_data = self.ring_buffer.read_all()
        self.ring_buffer = AudioRingBuffer(capacity_bytes=new_capacity)
        self.ring_buffer.write(current_data)

    @property
    def sample_rate(self) -> int:
        return self._sample_rate

    @property
    def hang_time_remaining_ms(self) -> float:
        return self._hang_time_remaining_ms

    def get_pre_roll(self) -> bytes:
        """Reads existing pre-roll buffer without clearing."""
        return self.ring_buffer.read_all()

    def flush_pre_roll(self) -> bytes:
        """Retrieves and clears the pre-roll buffer."""
        data = self.ring_buffer.read_all()
        self.ring_buffer.clear()
        return data

    def reset(self) -> None:
        """Resets the evaluator to CLOSED state and clears buffers."""
        self._state = SquelchState.CLOSED
        self._hang_time_remaining_ms = 0.0
        self.ring_buffer.clear()

    def process(self, pcm_chunk: bytes) -> SquelchResult:
        """
        Evaluates an incoming 16-bit signed PCM mono audio chunk.
        Calculates RSSI, updates state, decrements hang time, and triggers transitions/callbacks.
        """
        rssi = calculate_rssi_dbfs(pcm_chunk)
        num_samples = len(pcm_chunk) // 2
        chunk_ms = (num_samples / self._sample_rate) * 1000.0 if self._sample_rate > 0 else 0.0

        if self._state == SquelchState.CLOSED:
            if rssi >= self._threshold_dbfs:
                # Squelch opens!
                self._state = SquelchState.OPEN
                self._hang_time_remaining_ms = float(self._hang_time_ms)
                pre_roll = self.flush_pre_roll()
                self._fire_callback(self.on_open, pre_roll, pcm_chunk)
                return SquelchResult(
                    state=self._state,
                    rssi_dbfs=rssi,
                    is_open=True,
                    transition="opened",
                    pre_roll=pre_roll,
                )
            else:
                # Squelch remains closed; buffer into pre-roll ring buffer
                self.ring_buffer.write(pcm_chunk)
                return SquelchResult(
                    state=self._state,
                    rssi_dbfs=rssi,
                    is_open=False,
                    transition=None,
                    pre_roll=b"",
                )

        elif self._state == SquelchState.OPEN:
            if rssi >= self._threshold_dbfs:
                # Active transmission continues
                self._hang_time_remaining_ms = float(self._hang_time_ms)
                return SquelchResult(
                    state=self._state,
                    rssi_dbfs=rssi,
                    is_open=True,
                    transition=None,
                    pre_roll=b"",
                )
            else:
                # Silence detected; begin or trigger closing
                if self._hang_time_ms <= 0:
                    self._state = SquelchState.CLOSED
                    self._hang_time_remaining_ms = 0.0
                    self.ring_buffer.write(pcm_chunk)
                    self._fire_callback(self.on_close, pcm_chunk)
                    return SquelchResult(
                        state=self._state,
                        rssi_dbfs=rssi,
                        is_open=False,
                        transition="closed",
                        pre_roll=b"",
                    )
                else:
                    self._hang_time_remaining_ms = float(self._hang_time_ms) - chunk_ms
                    if self._hang_time_remaining_ms <= 0.0:
                        self._state = SquelchState.CLOSED
                        self._hang_time_remaining_ms = 0.0
                        self.ring_buffer.write(pcm_chunk)
                        self._fire_callback(self.on_close, pcm_chunk)
                        return SquelchResult(
                            state=self._state,
                            rssi_dbfs=rssi,
                            is_open=False,
                            transition="closed",
                            pre_roll=b"",
                        )
                    else:
                        self._state = SquelchState.CLOSING
                        self._fire_callback(self.on_closing, pcm_chunk)
                        return SquelchResult(
                            state=self._state,
                            rssi_dbfs=rssi,
                            is_open=True,
                            transition="closing",
                            pre_roll=b"",
                        )

        else:  # SquelchState.CLOSING
            if rssi >= self._threshold_dbfs:
                # Speech resumed before hang time expired!
                self._state = SquelchState.OPEN
                self._hang_time_remaining_ms = float(self._hang_time_ms)
                return SquelchResult(
                    state=self._state,
                    rssi_dbfs=rssi,
                    is_open=True,
                    transition="reopened",
                    pre_roll=b"",
                )
            else:
                # Ongoing silence during hang time
                self._hang_time_remaining_ms -= chunk_ms
                if self._hang_time_remaining_ms <= 0.0:
                    # Hang time expired; squelch closes
                    self._state = SquelchState.CLOSED
                    self._hang_time_remaining_ms = 0.0
                    self.ring_buffer.write(pcm_chunk)
                    self._fire_callback(self.on_close, pcm_chunk)
                    return SquelchResult(
                        state=self._state,
                        rssi_dbfs=rssi,
                        is_open=False,
                        transition="closed",
                        pre_roll=b"",
                    )
                else:
                    # Still in hang time
                    return SquelchResult(
                        state=self._state,
                        rssi_dbfs=rssi,
                        is_open=True,
                        transition=None,
                        pre_roll=b"",
                    )

    process_chunk = process
    evaluate = process

    def _fire_callback(self, callback: Optional[Callable], *args) -> None:
        if callback is None:
            return
        try:
            sig = inspect.signature(callback)
            num_params = len(sig.parameters)
            if num_params == 0:
                callback()
            elif num_params <= len(args):
                callback(*args[:num_params])
            else:
                callback(*args)
        except Exception:
            try:
                callback(*args)
            except TypeError:
                try:
                    callback()
                except Exception:
                    pass
