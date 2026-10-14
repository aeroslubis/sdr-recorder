import numpy as np
import pytest

from backend.dsp.filter import VoiceBandpassFilter


def test_voice_bandpass_filter_attenuates_low_and_high_frequencies():
    fs = 24000
    t = np.linspace(0, 0.5, 12000, endpoint=False)
    
    # 50 Hz sub-audible hum
    tone_50 = (np.sin(2 * np.pi * 50 * t) * 10000).astype(np.int16).tobytes()
    # 1000 Hz speech frequency
    tone_1000 = (np.sin(2 * np.pi * 1000 * t) * 10000).astype(np.int16).tobytes()
    # 8000 Hz high hiss
    tone_8000 = (np.sin(2 * np.pi * 8000 * t) * 10000).astype(np.int16).tobytes()

    vf = VoiceBandpassFilter(fs)
    out_50 = np.frombuffer(vf.process(tone_50), dtype=np.int16)
    
    vf = VoiceBandpassFilter(fs)
    out_1000 = np.frombuffer(vf.process(tone_1000), dtype=np.int16)
    
    vf = VoiceBandpassFilter(fs)
    out_8000 = np.frombuffer(vf.process(tone_8000), dtype=np.int16)

    # 1000 Hz speech should pass with virtually 0 dB loss (> 9000 amplitude)
    max_1000 = np.max(np.abs(out_1000[6000:]))
    assert max_1000 > 9500

    # 50 Hz hum should be attenuated by > 20 dB (< 1000 amplitude)
    max_50 = np.max(np.abs(out_50[6000:]))
    assert max_50 < 500

    # 8000 Hz hiss should be attenuated by > 15 dB (< 1500 amplitude)
    max_8000 = np.max(np.abs(out_8000[6000:]))
    assert max_8000 < 1000


def test_voice_bandpass_filter_chunk_continuity():
    # Process 2 consecutive chunks and verify no NaN or crash
    vf = VoiceBandpassFilter(24000)
    chunk1 = (np.ones(1200, dtype=np.int16) * 1000).tobytes()
    chunk2 = (np.ones(1200, dtype=np.int16) * 1000).tobytes()
    
    res1 = vf.process(chunk1)
    res2 = vf.process(chunk2)
    assert len(res1) == 2400
    assert len(res2) == 2400
