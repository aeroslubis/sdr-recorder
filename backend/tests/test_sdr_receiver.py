import asyncio
import numpy as np
import pytest

from backend.dsp.squelch import calculate_rssi_dbfs, SquelchState
from backend.sdr.dongle_config import DongleConfig
from backend.sdr.simulator import MockSDRSimulator
from backend.sdr.receiver import SDRReceiver, is_hardware_available


@pytest.mark.asyncio
async def test_simulator_generates_pcm_chunks():
    sim = MockSDRSimulator(sample_rate=24000, chunk_ms=50, realtime=False)
    chunk = await sim.read_chunk()
    assert len(chunk) == 2400  # 50ms at 24000 samples/sec * 2 bytes/sample


def test_dongle_config_parameters_and_defaults():
    config = DongleConfig()
    assert config.frequency_hz == 118200000
    assert config.modulation == "AM"
    assert config.squelch_threshold == -42.0
    assert config.rf_gain == 38.6
    assert config.gain_mode == "manual"
    assert config.ppm_offset == 0
    assert config.bias_tee == 0
    assert config.direct_sampling == 0
    assert config.device_index == 0
    assert config.sample_rate == 2048000
    assert config.pre_roll_ms == 500
    assert config.hang_time_ms == 800

    # Custom configuration
    custom = DongleConfig(
        frequency_hz=145500000,
        modulation="NFM",
        squelch_threshold=-35.0,
        rf_gain=42.0,
        gain_mode="auto",
        ppm_offset=15,
        bias_tee=1,
        direct_sampling=1,
        device_index=1,
        sample_rate=2400000,
        pre_roll_ms=600,
        hang_time_ms=1000,
    )
    assert custom.frequency_hz == 145500000
    assert custom.modulation == "NFM"
    assert custom.bias_tee == 1
    assert custom.ppm_offset == 15


@pytest.mark.asyncio
async def test_simulator_noise_floor_and_voice_burst_levels():
    sim = MockSDRSimulator(sample_rate=24000, chunk_ms=50, realtime=False)

    # Noise floor chunk: should be ~ -65 dBFS (allow between -75 and -55 dBFS)
    noise_chunk = sim.generate_noise_chunk()
    assert len(noise_chunk) == 2400
    noise_rssi = calculate_rssi_dbfs(noise_chunk)
    assert -75.0 <= noise_rssi <= -55.0

    # Voice burst chunk: simulated radio bursts between -38 and -25 dBFS
    burst_chunk = sim.generate_burst_chunk()
    assert len(burst_chunk) == 2400
    burst_rssi = calculate_rssi_dbfs(burst_chunk)
    assert -39.0 <= burst_rssi <= -24.0


@pytest.mark.asyncio
async def test_simulator_periodic_pattern_and_manual_triggers():
    sim = MockSDRSimulator(sample_rate=24000, chunk_ms=50, realtime=False)
    
    # By default, simulator is in noise mode until burst occurs or triggered
    sim.trigger_noise()
    chunk1 = await sim.read_chunk()
    rssi1 = calculate_rssi_dbfs(chunk1)
    assert rssi1 < -45.0

    # Trigger burst
    sim.trigger_burst(duration_ms=200)
    burst_chunks = []
    for _ in range(3):
        burst_chunks.append(await sim.read_chunk())
    
    # Verify burst chunks are above typical squelch threshold
    burst_rssis = [calculate_rssi_dbfs(c) for c in burst_chunks]
    assert any(r > -42.0 for r in burst_rssis)


def test_build_rtl_fm_command():
    config = DongleConfig(
        frequency_hz=121500000,
        modulation="AM",
        gain_mode="manual",
        rf_gain=28.0,
        ppm_offset=5,
        bias_tee=1,
        direct_sampling=1,
        device_index=0,
    )
    receiver = SDRReceiver(config=config, force_simulator=True)
    cmd = receiver.build_rtl_fm_command()
    
    assert "rtl_fm" in cmd[0]
    assert "-f" in cmd
    assert "121500000" in cmd
    assert "-M" in cmd
    assert "am" in cmd
    assert "-s" in cmd
    assert "24k" in cmd
    assert "-g" in cmd
    assert "28.0" in cmd
    assert "-p" in cmd
    assert "5" in cmd
    assert "-T" in cmd
    assert "-E" in cmd
    assert "direct" in cmd


@pytest.mark.asyncio
async def test_sdr_receiver_stops_recording_when_hardware_disconnected():
    chunks_received = []
    transmissions_recorded = []

    def on_chunk(chunk, result):
        chunks_received.append((chunk, result))

    def on_transmission_end(event):
        transmissions_recorded.append(event)

    config = DongleConfig(
        squelch_threshold=-42.0,
        hang_time_ms=100,
        pre_roll_ms=100,
    )
    receiver = SDRReceiver(
        config=config,
        on_chunk_callback=on_chunk,
        on_transmission_end_callback=on_transmission_end,
    )
    assert receiver.is_simulator is False
    assert receiver.is_hardware_connected is False

    # Start receiver
    await receiver.start()
    assert receiver.is_running is True

    # Let loop tick briefly while disconnected
    await asyncio.sleep(0.12)

    await receiver.stop()
    assert receiver.is_running is False
    assert len(chunks_received) > 0
    # When hardware is disconnected: radio recording is stopped completely (0 transmissions)
    assert len(transmissions_recorded) == 0
    for _chunk, result in chunks_received:
        assert result.is_open is False
        assert result.rssi_dbfs == -100.0
