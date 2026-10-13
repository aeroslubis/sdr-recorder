import threading
import numpy as np
import pytest

from backend.dsp.squelch import calculate_rssi_dbfs, SquelchEvaluator, SquelchState
from backend.dsp.ring_buffer import AudioRingBuffer


def test_calculate_rssi_dbfs_full_scale_and_silence():
    # Full scale 16-bit sine wave -> ~0 dBFS
    t = np.linspace(0, 1, 24000, False)
    tone = (np.sin(2 * np.pi * 1000 * t) * 32767).astype(np.int16).tobytes()
    rssi = calculate_rssi_dbfs(tone)
    assert -4.0 <= rssi <= 0.0

    # Total silence -> -100 dBFS floor
    silence = np.zeros(2400, dtype=np.int16).tobytes()
    assert calculate_rssi_dbfs(silence) <= -90.0


def test_calculate_rssi_dbfs_edge_cases():
    # Empty chunk
    assert calculate_rssi_dbfs(b"") == -100.0

    # Odd number of bytes (should truncate last stray byte without error)
    silence_odd = np.zeros(100, dtype=np.int16).tobytes() + b"\x01"
    assert calculate_rssi_dbfs(silence_odd) <= -90.0

    # Half amplitude tone (-6 dB relative to full scale, so ~ -9.0 dBFS)
    t = np.linspace(0, 1, 24000, False)
    half_tone = (np.sin(2 * np.pi * 1000 * t) * (32767 / 2)).astype(np.int16).tobytes()
    half_rssi = calculate_rssi_dbfs(half_tone)
    assert -10.0 <= half_rssi <= -8.0


def test_ring_buffer_fifo():
    buf = AudioRingBuffer(capacity_bytes=100)
    buf.write(b"A" * 60)
    buf.write(b"B" * 60)
    out = buf.read_all()
    assert len(out) == 100
    assert out == (b"A" * 40) + (b"B" * 60)


def test_ring_buffer_operations():
    buf = AudioRingBuffer(capacity_bytes=10)
    assert len(buf) == 0
    assert buf.read_all() == b""

    # Partial write
    buf.write(b"12345")
    assert len(buf) == 5
    assert buf.read_all() == b"12345"

    # Write exceeding capacity in single call
    buf.write(b"abcdefghijklmnop")
    assert len(buf) == 10
    assert buf.read_all() == b"ghijklmnop"

    # Clear
    buf.clear()
    assert len(buf) == 0
    assert buf.read_all() == b""


def test_ring_buffer_thread_safety():
    buf = AudioRingBuffer(capacity_bytes=500)

    def writer(char: bytes):
        for _ in range(50):
            buf.write(char * 10)

    threads = [threading.Thread(target=writer, args=(bytes([65 + i]),)) for i in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    out = buf.read_all()
    assert len(out) <= 500
    assert len(out) > 0


def test_squelch_evaluator_state_transitions():
    # 50ms at 24000 Hz, 16-bit mono -> 1200 samples * 2 bytes = 2400 bytes
    sample_rate = 24000
    chunk_samples = 1200
    t = np.linspace(0, 0.05, chunk_samples, False)

    tone_chunk = (np.sin(2 * np.pi * 1000 * t) * 32767).astype(np.int16).tobytes()
    silence_chunk = np.zeros(chunk_samples, dtype=np.int16).tobytes()

    opened_events = []
    closing_events = []
    closed_events = []

    evaluator = SquelchEvaluator(
        threshold_dbfs=-40.0,
        hang_time_ms=100,  # 100ms hang time = 2 silence chunks of 50ms
        pre_roll_ms=200,   # 200ms pre-roll = 4 chunks
        sample_rate=sample_rate,
        on_open=lambda pre_roll: opened_events.append(pre_roll),
        on_closing=lambda: closing_events.append(True),
        on_close=lambda: closed_events.append(True),
    )

    # Initial state should be CLOSED
    assert evaluator.state == SquelchState.CLOSED
    assert not evaluator.is_open

    # 1. Feed 3 silence chunks while CLOSED -> buffers into pre-roll
    for i in range(3):
        res = evaluator.process(silence_chunk)
        assert res.state == SquelchState.CLOSED
        assert not res.is_open
        assert res.transition is None

    # Pre-roll should hold 3 silence chunks (3 * 2400 = 7200 bytes)
    assert len(evaluator.ring_buffer) == 3 * 2400

    # 2. Feed loud tone chunk -> squelch transitions CLOSED -> OPEN
    res = evaluator.process(tone_chunk)
    assert res.state == SquelchState.OPEN
    assert res.is_open
    assert res.transition == "opened"
    # Flushed pre-roll should equal 7200 bytes
    assert len(res.pre_roll) == 3 * 2400
    assert len(opened_events) == 1
    assert opened_events[0] == res.pre_roll
    # Pre-roll ring buffer in evaluator should be cleared upon opening
    assert len(evaluator.ring_buffer) == 0

    # 3. Tone continues -> stays OPEN
    res2 = evaluator.process(tone_chunk)
    assert res2.state == SquelchState.OPEN
    assert res2.is_open
    assert res2.transition is None
    assert evaluator.hang_time_remaining_ms == 100

    # 4. Silence chunk 1 (50ms) -> transitions OPEN -> CLOSING (50ms left)
    res3 = evaluator.process(silence_chunk)
    assert res3.state == SquelchState.CLOSING
    assert res3.is_open
    assert res3.transition == "closing"
    assert len(closing_events) == 1
    assert 49.0 <= evaluator.hang_time_remaining_ms <= 51.0

    # 5. Silence chunk 2 (50ms) -> hang time expires -> transitions CLOSING -> CLOSED
    res4 = evaluator.process(silence_chunk)
    assert res4.state == SquelchState.CLOSED
    assert not res4.is_open
    assert res4.transition == "closed"
    assert len(closed_events) == 1
    assert evaluator.hang_time_remaining_ms == 0.0


def test_squelch_evaluator_resumes_open_during_closing():
    sample_rate = 24000
    chunk_samples = 1200
    t = np.linspace(0, 0.05, chunk_samples, False)

    tone_chunk = (np.sin(2 * np.pi * 1000 * t) * 32767).astype(np.int16).tobytes()
    silence_chunk = np.zeros(chunk_samples, dtype=np.int16).tobytes()

    evaluator = SquelchEvaluator(
        threshold_dbfs=-40.0,
        hang_time_ms=200,
        pre_roll_ms=200,
        sample_rate=sample_rate,
    )

    # Open with tone
    evaluator.process(tone_chunk)
    assert evaluator.state == SquelchState.OPEN

    # 1 silence chunk -> CLOSING
    evaluator.process(silence_chunk)
    assert evaluator.state == SquelchState.CLOSING

    # Tone resumes before hang time expires -> returns to OPEN
    res = evaluator.process(tone_chunk)
    assert res.state == SquelchState.OPEN
    assert evaluator.state == SquelchState.OPEN
    assert evaluator.hang_time_remaining_ms == 200
