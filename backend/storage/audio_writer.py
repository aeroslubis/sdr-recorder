"""Audio encoding, file storage, and transmission persistence for SDR-Recorder NVR."""
import logging
import os
import shutil
import sqlite3
import subprocess
import wave
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Union

from backend.sdr.receiver import TransmissionEvent

logger = logging.getLogger(__name__)


def save_transmission(
    db_conn: sqlite3.Connection,
    storage_dir: Union[str, Path],
    event: TransmissionEvent,
    audio_format: str = "wav",
    sample_rate: int = 24000,
) -> Dict[str, Any]:
    """
    Saves raw PCM transmission audio to file and indexes metadata in the transmissions table.
    File hierarchy: storage_dir/recordings/YYYY-MM-DD/ch_<freq>_<ts>.wav (or opus/mp3).
    """
    base_dir = Path(storage_dir)
    if base_dir.name == "recordings":
        recordings_dir = base_dir
    else:
        recordings_dir = base_dir / "recordings"

    date_str = event.start_time.strftime("%Y-%m-%d")
    target_dir = recordings_dir / date_str
    target_dir.mkdir(parents=True, exist_ok=True)

    ts_str = event.start_time.strftime("%Y%m%d_%H%M%S")
    base_name = f"ch_{event.frequency_hz}_{ts_str}"
    ext = audio_format.lower().lstrip(".")

    wav_file = target_dir / f"{base_name}.wav"
    counter = 1
    while wav_file.exists():
        wav_file = target_dir / f"{base_name}_{counter}.wav"
        counter += 1

    # Write uncompressed 16-bit mono PCM WAV
    with wave.open(str(wav_file), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(event.audio_data)

    final_file = wav_file

    # If requested format is opus or mp3 and ffmpeg is available, compress it
    if ext in ["opus", "mp3", "ogg"] and shutil.which("ffmpeg"):
        converted_file = wav_file.with_suffix(f".{ext}")
        cmd = [
            "ffmpeg",
            "-y",
            "-i", str(wav_file),
            "-af", "highpass=f=250,lowpass=f=3500",
            "-c:a", "libopus" if ext in ["opus", "ogg"] else "libmp3lame",
            "-b:a", "24k",
            str(converted_file),
        ]
        try:
            res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5.0)
            if res.returncode == 0 and converted_file.exists():
                wav_file.unlink(missing_ok=True)
                final_file = converted_file
        except Exception as e:
            logger.warning(f"Audio conversion with ffmpeg failed ({e}), keeping WAV file.")

    file_size_bytes = final_file.stat().st_size
    start_time_iso = (
        event.start_time.isoformat() if hasattr(event.start_time, "isoformat") else str(event.start_time)
    )
    end_time_iso = (
        event.end_time.isoformat() if hasattr(event.end_time, "isoformat") else str(event.end_time)
    )

    cursor = db_conn.cursor()
    cursor.execute(
        """
        INSERT INTO transmissions (
            start_time, end_time, duration_sec, frequency_hz, modulation,
            peak_rssi_dbfs, file_path, file_size_bytes, is_starred, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
        """,
        (
            start_time_iso,
            end_time_iso,
            float(event.duration_sec),
            int(event.frequency_hz),
            str(event.modulation),
            float(event.peak_rssi_dbfs),
            str(final_file),
            int(file_size_bytes),
        ),
    )
    rec_id = cursor.lastrowid
    db_conn.commit()

    return {
        "id": rec_id,
        "start_time": start_time_iso,
        "end_time": end_time_iso,
        "duration_sec": float(event.duration_sec),
        "frequency_hz": int(event.frequency_hz),
        "modulation": str(event.modulation),
        "peak_rssi_dbfs": float(event.peak_rssi_dbfs),
        "file_path": str(final_file),
        "file_size_bytes": int(file_size_bytes),
        "is_starred": 0,
        "notes": None,
    }
