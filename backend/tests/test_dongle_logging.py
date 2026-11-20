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
