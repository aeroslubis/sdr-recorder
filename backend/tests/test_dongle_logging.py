import asyncio
import logging
import os
import tempfile
import pytest
from backend.utils.dongle_logger import setup_dongle_logger, DONGLE_LOGGER_NAME

def test_setup_dongle_logger_creates_directory_and_file():
    with tempfile.TemporaryDirectory() as tmpdir:
        logger = setup_dongle_logger(storage_dir=tmpdir, log_filename="dongle.log")
        assert logger.name == DONGLE_LOGGER_NAME
        
        # Test log emission
        test_msg = "RTL-SDR dongle connected on index 0"
        logger.info(test_msg)
        
        log_file_path = os.path.join(tmpdir, "logs", "dongle.log")
        assert os.path.exists(log_file_path)
        with open(log_file_path, "r", encoding="utf-8") as f:
            content = f.read()
        assert test_msg in content
        assert "[INFO]" in content
        assert f"[{DONGLE_LOGGER_NAME}]" in content

def test_setup_dongle_logger_rotation():
    with tempfile.TemporaryDirectory() as tmpdir:
        logger = setup_dongle_logger(storage_dir=tmpdir, log_filename="dongle_rotate.log")
        
        # Verify RotatingFileHandler configured with 5MB and 3 backups
        file_handlers = [h for h in logger.handlers if isinstance(h, logging.handlers.RotatingFileHandler)]
        assert len(file_handlers) >= 1
        rfh = file_handlers[0]
        assert rfh.maxBytes == 5 * 1024 * 1024
        assert rfh.backupCount == 3

@pytest.mark.asyncio
async def test_dongle_connect_and_disconnect_logs_emitted(monkeypatch):
    from unittest.mock import MagicMock, AsyncMock, patch
    from backend.sdr.receiver import SDRReceiver
    from backend.sdr.dongle_config import DongleConfig
    import backend.sdr.receiver as rx_mod

    with tempfile.TemporaryDirectory() as tmpdir:
        setup_dongle_logger(storage_dir=tmpdir, log_filename="dongle_test.log")
        log_file_path = os.path.join(tmpdir, "logs", "dongle_test.log")

        # Mock is_hardware_available
        monkeypatch.setattr(rx_mod, "is_hardware_available", lambda idx=0: True)

        cfg = DongleConfig(frequency_hz=118200000, modulation="AM", squelch_threshold=-42.0, device_index=0)
        receiver = SDRReceiver(config=cfg)

        # Check probe log
        with open(log_file_path, "r", encoding="utf-8") as f:
            content = f.read()
        assert "RTL-SDR dongle probe: device_index=0, available=True" in content

        # Mock subprocess
        mock_proc = MagicMock()
        mock_proc.pid = 12345
        mock_proc.returncode = None
        mock_proc.stdout = AsyncMock()

        read_count = 0
        hw_avail = True

        monkeypatch.setattr(rx_mod, "is_hardware_available", lambda idx=0: hw_avail)

        async def mock_readexactly(n):
            nonlocal read_count, hw_avail
            read_count += 1
            if read_count == 1:
                return b"\x00" * n
            # Trigger disconnect on second read
            hw_avail = False
            mock_proc.returncode = 1
            raise asyncio.IncompleteReadError(b"", n)

        mock_proc.stdout.readexactly = mock_readexactly

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
            receiver._running = True
            loop_task = asyncio.create_task(receiver._run_loop())
            await asyncio.sleep(0.08)
            receiver._running = False
            loop_task.cancel()
            try:
                await loop_task
            except asyncio.CancelledError:
                pass

        with open(log_file_path, "r", encoding="utf-8") as f:
            content = f.read()
        assert "RTL-SDR dongle connected on device_index=0 (PID 12345, AM, 118.200 MHz, squelch=-42.0 dBFS)" in content
        assert "RTL-SDR dongle disconnected on device_index=0 (returncode=1, reason=stream EOF). Reconnection worker active." in content

@pytest.mark.asyncio
async def test_dongle_restart_and_tuning_logs_emitted(monkeypatch):
    from unittest.mock import MagicMock, AsyncMock, patch
    from backend.sdr.receiver import SDRReceiver
    from backend.sdr.dongle_config import DongleConfig
    import backend.sdr.receiver as rx_mod

    with tempfile.TemporaryDirectory() as tmpdir:
        setup_dongle_logger(storage_dir=tmpdir, log_filename="dongle_test2.log")
        log_file_path = os.path.join(tmpdir, "logs", "dongle_test2.log")

        monkeypatch.setattr(rx_mod, "is_hardware_available", lambda idx=0: True)
        cfg = DongleConfig(frequency_hz=118200000, modulation="AM", squelch_threshold=-42.0, device_index=0)
        receiver = SDRReceiver(config=cfg)

        # Trigger restart
        with patch.object(receiver, "stop", new_callable=AsyncMock), \
             patch.object(receiver, "start", new_callable=AsyncMock):
            await receiver.restart(reset_usb=False)

        # Trigger tune
        new_cfg = DongleConfig(frequency_hz=121500000, modulation="AM", squelch_threshold=-40.0, device_index=0)
        with patch.object(receiver, "restart", new_callable=AsyncMock):
            await receiver.update_config(new_cfg)

        with open(log_file_path, "r", encoding="utf-8") as f:
            content = f.read()
        assert "RTL-SDR dongle restart requested via API for device_index=0" in content
        assert "RTL-SDR dongle tuned to 121.500 MHz (AM, squelch=-40.0 dBFS)" in content

