"""SDR Ingest Engine managing RTL-SDR subprocess or Mock SDR Simulator fallback."""
import asyncio
import inspect
import logging
import re
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

from backend.dsp.squelch import SquelchEvaluator, SquelchResult, SquelchState
from backend.sdr.dongle_config import DongleConfig
from backend.sdr.simulator import MockSDRSimulator

logger = logging.getLogger(__name__)


def is_hardware_available(device_index: int = 0) -> bool:
    """
    Checks if RTL-SDR hardware is physically connected and accessible via USB.
    Uses rtl_fm and rtl_test binaries.
    """
    if not shutil.which("rtl_fm"):
        return False

    rtl_test_bin = shutil.which("rtl_test")
    if rtl_test_bin:
        try:
            res = subprocess.run(
                [rtl_test_bin, "-d", str(device_index), "-t"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=2.0,
            )
            output = (res.stdout + res.stderr).decode("utf-8", errors="ignore")
            if "No matching devices found" in output:
                return False
            if "Found" in output and "device(s)" in output:
                return True
            return res.returncode == 0
        except Exception:
            return False

    return False


def get_available_devices() -> List[Dict[str, Any]]:
    """
    Enumerate RTL-SDR hardware devices connected to the host using rtl_test.
    Returns a list of device dictionaries: [{"index": int, "name": str, "available": bool}].
    If no devices are detected or rtl_test is unavailable, returns a fallback Virtual Simulator device.
    """
    rtl_test_bin = shutil.which("rtl_test")
    devices: List[Dict[str, Any]] = []

    if rtl_test_bin:
        try:
            res = subprocess.run(
                [rtl_test_bin, "-t"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=1.5,
            )
            output = (res.stdout + res.stderr).decode("utf-8", errors="ignore")
            for line in output.splitlines():
                match = re.match(r"^\s*(\d+):\s*(.+)$", line)
                if match:
                    idx = int(match.group(1))
                    name = match.group(2).strip()
                    devices.append({
                        "index": idx,
                        "name": f"Device {idx}: {name}",
                        "available": True,
                    })
        except Exception as e:
            logger.debug(f"Device enumeration exception: {e}")

    if not devices:
        devices.append({
            "index": 0,
            "name": "Mock SDR Simulator (Virtual)",
            "available": True,
        })

    return devices



@dataclass
class TransmissionEvent:
    """Encapsulates a completed radio transmission."""
    audio_data: bytes
    start_time: datetime
    end_time: datetime
    duration_sec: float
    peak_rssi_dbfs: float
    frequency_hz: int
    modulation: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "audio_data": self.audio_data,
            "start_time": self.start_time.isoformat() if hasattr(self.start_time, "isoformat") else str(self.start_time),
            "end_time": self.end_time.isoformat() if hasattr(self.end_time, "isoformat") else str(self.end_time),
            "duration_sec": self.duration_sec,
            "peak_rssi_dbfs": self.peak_rssi_dbfs,
            "frequency_hz": self.frequency_hz,
            "modulation": self.modulation,
        }

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def __iter__(self):
        """Allows unpacking as (audio_data, metadata_dict)."""
        yield self.audio_data
        yield self.to_dict()


class SDRReceiver:
    """
    Orchestrates real-time audio ingestion from RTL-SDR hardware or MockSDRSimulator.
    Processes audio through SquelchEvaluator and dispatches chunk & transmission callbacks.
    """

    def __init__(
        self,
        config: Optional[DongleConfig] = None,
        on_chunk_callback: Optional[Callable] = None,
        on_transmission_end_callback: Optional[Callable] = None,
        force_simulator: bool = False,
        sample_rate: int = 24000,
        chunk_ms: int = 50,
    ):
        self.config = config or DongleConfig()
        self.on_chunk_callback = on_chunk_callback
        self.on_transmission_end_callback = on_transmission_end_callback
        self.force_simulator = force_simulator

        self.sample_rate = int(sample_rate)
        self.chunk_ms = int(chunk_ms)
        self.chunk_bytes = int(self.sample_rate * (self.chunk_ms / 1000.0) * 2)

        # Initialize DSP Squelch Evaluator
        self.squelch_evaluator = SquelchEvaluator(
            threshold_dbfs=self.config.squelch_threshold,
            hang_time_ms=self.config.hang_time_ms,
            pre_roll_ms=self.config.pre_roll_ms,
            sample_rate=self.sample_rate,
        )

        # Initialize Mock Simulator
        self.simulator = MockSDRSimulator(
            sample_rate=self.sample_rate,
            chunk_ms=self.chunk_ms,
            realtime=True,
        )

        # Hardware mode detection
        self._is_simulator = self.force_simulator or not is_hardware_available(self.config.device_index)

        # State tracking
        self._running = False
        self._loop_task: Optional[asyncio.Task] = None
        self._process: Optional[asyncio.subprocess.Process] = None
        self._last_rssi: float = -100.0

        # Active transmission accumulation
        self._current_transmission_chunks: List[bytes] = []
        self._current_transmission_start: Optional[datetime] = None
        self._current_transmission_peak_rssi: float = -100.0

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def is_simulator(self) -> bool:
        return self._is_simulator

    @property
    def state(self) -> SquelchState:
        return self.squelch_evaluator.state

    @property
    def last_rssi(self) -> float:
        return self._last_rssi

    def build_rtl_fm_command(self) -> List[str]:
        """Constructs the command line invocation for rtl_fm."""
        mod = self.config.modulation.lower()
        if mod in ["nfm", "fm"]:
            mod_arg = "fm"
        elif mod in ["wfm", "wbfm"]:
            mod_arg = "wbfm"
        elif mod in ["am", "usb", "lsb", "raw"]:
            mod_arg = mod
        else:
            mod_arg = "am"

        # Determine squelch parameter for rtl_fm:
        # In FM mode, discriminator noise without squelch is ~9000 RMS (-11 dBFS).
        # We map squelch_threshold (-100 to 0 dBFS) to rtl_fm -l level.
        if mod_arg in ["fm", "wbfm"]:
            if self.config.squelch_threshold <= -95.0:
                squelch_l = "0"
            else:
                # Maps -90..0 dBFS to rtl_fm squelch level (e.g. -50 dBFS -> 70, -42 dBFS -> 81)
                l_val = max(1, min(300, int((self.config.squelch_threshold + 100.0) * 1.4)))
                squelch_l = str(l_val)
        else:
            squelch_l = "0"

        cmd = [
            "rtl_fm",
            "-f", str(self.config.frequency_hz),
            "-M", mod_arg,
            "-s", "24k",
            "-d", str(self.config.device_index),
            "-l", squelch_l,
        ]

        if self.config.gain_mode == "manual":
            cmd.extend(["-g", str(self.config.rf_gain)])

        if self.config.ppm_offset != 0:
            cmd.extend(["-p", str(self.config.ppm_offset)])

        if self.config.bias_tee == 1:
            cmd.append("-T")

        if self.config.direct_sampling == 1:
            cmd.extend(["-E", "direct"])
        elif self.config.direct_sampling == 2:
            cmd.extend(["-E", "direct2"])

        # Output to stdout
        cmd.append("-")
        return cmd

    async def _read_hardware_chunk(self) -> bytes:
        """Reads exactly self.chunk_bytes from rtl_fm stdout, or returns silence on squelch timeout."""
        if not self._process or not self._process.stdout:
            return b"\x00" * self.chunk_bytes

        buf = bytearray()
        while len(buf) < self.chunk_bytes:
            needed = self.chunk_bytes - len(buf)
            try:
                part = await asyncio.wait_for(
                    self._process.stdout.read(needed),
                    timeout=0.08,
                )
                if not part:
                    # EOF from subprocess
                    break
                buf.extend(part)
            except asyncio.TimeoutError:
                # No data from rtl_fm within 80ms (squelch is active)
                break

        if len(buf) == 0:
            return b"\x00" * self.chunk_bytes
        if len(buf) < self.chunk_bytes:
            buf.extend(b"\x00" * (self.chunk_bytes - len(buf)))
        return bytes(buf)

    async def _safe_call(self, callback: Optional[Callable], *args) -> None:
        """Safely invokes an async or sync callback with flexible signature matching."""
        if callback is None:
            return
        try:
            sig = inspect.signature(callback)
            num_params = len(sig.parameters)
            if num_params == 0:
                res = callback()
            elif num_params <= len(args):
                res = callback(*args[:num_params])
            else:
                res = callback(*args)

            if inspect.isawaitable(res):
                await res
        except Exception as e:
            logger.error(f"Error executing callback {callback}: {e}", exc_info=True)

    async def _process_audio_chunk(self, chunk: bytes) -> None:
        """Evaluates chunk with SquelchEvaluator and handles transmission recording."""
        result = self.squelch_evaluator.process(chunk)
        self._last_rssi = result.rssi_dbfs

        # Handle transmission opened
        if result.transition == "opened":
            self._current_transmission_start = datetime.now(timezone.utc)
            self._current_transmission_chunks = []
            if result.pre_roll:
                self._current_transmission_chunks.append(result.pre_roll)
            self._current_transmission_chunks.append(chunk)
            self._current_transmission_peak_rssi = result.rssi_dbfs
        elif result.is_open:
            if not self._current_transmission_chunks:
                self._current_transmission_start = datetime.now(timezone.utc)
            self._current_transmission_chunks.append(chunk)
            self._current_transmission_peak_rssi = max(
                self._current_transmission_peak_rssi, result.rssi_dbfs
            )

        # Handle transmission closed
        if result.transition == "closed" or (self._current_transmission_chunks and not result.is_open):
            if self._current_transmission_chunks:
                end_time = datetime.now(timezone.utc)
                start_time = self._current_transmission_start or end_time
                audio_data = b"".join(self._current_transmission_chunks)
                duration_sec = len(audio_data) / float(self.sample_rate * 2)

                event = TransmissionEvent(
                    audio_data=audio_data,
                    start_time=start_time,
                    end_time=end_time,
                    duration_sec=duration_sec,
                    peak_rssi_dbfs=self._current_transmission_peak_rssi,
                    frequency_hz=self.config.frequency_hz,
                    modulation=self.config.modulation,
                )

                self._current_transmission_chunks = []
                self._current_transmission_start = None
                self._current_transmission_peak_rssi = -100.0

                await self._safe_call(self.on_transmission_end_callback, event)

        # Dispatch chunk callback
        await self._safe_call(self.on_chunk_callback, chunk, result)

    async def _run_loop(self) -> None:
        """Main ingestion loop reading chunks from either rtl_fm subprocess or simulator."""
        if not self._is_simulator:
            cmd = self.build_rtl_fm_command()
            try:
                self._process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                )
            except Exception as e:
                logger.warning(f"Failed to spawn rtl_fm ({e}), falling back to MockSDRSimulator.")
                self._is_simulator = True

        while self._running:
            try:
                if self._is_simulator:
                    chunk = await self.simulator.read_chunk()
                else:
                    assert self._process is not None
                    chunk = await self._read_hardware_chunk()

                if not chunk:
                    break

                await self._process_audio_chunk(chunk)

            except asyncio.IncompleteReadError:
                logger.warning("RTL-SDR stream reached EOF. Restarting or terminating.")
                break
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in SDR ingestion loop: {e}", exc_info=True)
                await asyncio.sleep(0.05)

    async def start(self) -> None:
        """Starts the audio receiver ingestion loop."""
        if self._running:
            return

        # Re-check hardware unless explicitly forced to simulator
        if not self.force_simulator:
            self._is_simulator = not is_hardware_available(self.config.device_index)

        self._running = True
        self._loop_task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        """Stops the audio receiver and cleans up background processes."""
        self._running = False
        if self._loop_task and not self._loop_task.done():
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
            self._loop_task = None

        if self._process:
            try:
                self._process.terminate()
                await asyncio.wait_for(self._process.wait(), timeout=1.0)
            except Exception:
                try:
                    self._process.kill()
                except Exception:
                    pass
            self._process = None

        # Reset active transmission tracking
        self._current_transmission_chunks = []
        self._current_transmission_start = None

    async def restart(self) -> None:
        """Restarts the receiver engine."""
        await self.stop()
        await self.start()

    async def update_config(self, new_config: DongleConfig) -> None:
        """
        Updates the receiver configuration.
        Updates DSP squelch parameters dynamically, and restarts subprocess if RF parameters changed.
        """
        rf_changed = (
            new_config.frequency_hz != self.config.frequency_hz
            or new_config.modulation != self.config.modulation
            or new_config.rf_gain != self.config.rf_gain
            or new_config.gain_mode != self.config.gain_mode
            or new_config.ppm_offset != self.config.ppm_offset
            or new_config.bias_tee != self.config.bias_tee
            or new_config.direct_sampling != self.config.direct_sampling
            or new_config.device_index != self.config.device_index
        )

        self.config = new_config
        self.squelch_evaluator.threshold_dbfs = new_config.squelch_threshold
        self.squelch_evaluator.hang_time_ms = new_config.hang_time_ms
        self.squelch_evaluator.pre_roll_ms = new_config.pre_roll_ms

        if rf_changed and self._running and not self._is_simulator:
            await self.restart()

    async def __aenter__(self) -> "SDRReceiver":
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.stop()
