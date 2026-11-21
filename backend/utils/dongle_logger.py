"""Dongle activity logging facility with stdout and rotating file handlers."""
import logging
import os
import sys
from logging.handlers import RotatingFileHandler

DONGLE_LOGGER_NAME = "backend.sdr.dongle"


def setup_dongle_logger(storage_dir: str, log_filename: str = "dongle.log") -> logging.Logger:
    """
    Configures and returns the dedicated logger for SDR dongle activities.
    Attaches a stdout StreamHandler and a RotatingFileHandler to storage/logs/dongle.log.
    """
    logger = logging.getLogger(DONGLE_LOGGER_NAME)
    logger.setLevel(logging.INFO)
    logger.propagate = False  # Avoid duplicate output to root logger

    # Ensure storage/logs directory exists
    logs_dir = os.path.join(storage_dir, "logs")
    os.makedirs(logs_dir, exist_ok=True)
    log_path = os.path.join(logs_dir, log_filename)

    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Attach stdout handler if not already present
    has_stream = any(
        isinstance(h, logging.StreamHandler) and not isinstance(h, RotatingFileHandler)
        for h in logger.handlers
    )
    if not has_stream:
        sh = logging.StreamHandler(sys.stdout)
        sh.setLevel(logging.INFO)
        sh.setFormatter(formatter)
        logger.addHandler(sh)

    # Remove any existing RotatingFileHandler pointing to a different path
    existing_file_handlers = [h for h in logger.handlers if isinstance(h, RotatingFileHandler)]
    for h in existing_file_handlers:
        if os.path.abspath(getattr(h, "baseFilename", "")) != os.path.abspath(log_path):
            h.close()
            logger.removeHandler(h)

    # Attach RotatingFileHandler if not already present
    has_file = any(
        isinstance(h, RotatingFileHandler) and os.path.abspath(getattr(h, "baseFilename", "")) == os.path.abspath(log_path)
        for h in logger.handlers
    )
    if not has_file:
        rfh = RotatingFileHandler(
            log_path,
            maxBytes=5 * 1024 * 1024,
            backupCount=3,
            encoding="utf-8",
        )
        rfh.setLevel(logging.INFO)
        rfh.setFormatter(formatter)
        logger.addHandler(rfh)

    return logger
