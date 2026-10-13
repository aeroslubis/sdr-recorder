"""NVR Storage Retention Engine and automatic FIFO disk quota cleanup."""
import asyncio
import logging
import os
import shutil
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Union

from backend import config
from backend.database import get_connection

logger = logging.getLogger(__name__)


def _parse_datetime(ts_str: str) -> datetime:
    """Parses ISO or standard datetime strings into UTC datetime."""
    clean = ts_str.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(clean)
    except Exception:
        # Fallback for '%Y-%m-%d %H:%M:%S'
        try:
            dt = datetime.strptime(clean[:19], "%Y-%m-%d %H:%M:%S")
        except Exception:
            return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def run_retention_purge(
    db_conn: sqlite3.Connection,
    storage_dir: Union[str, Path],
    max_days: int = 14,
    max_disk_percent: float = 90.0,
) -> int:
    """
    Enforces retention policy and storage quotas:
    1. Purges unstarred transmissions older than max_days.
    2. If disk usage exceeds max_disk_percent, purges oldest unstarred transmissions in FIFO order.
    3. Strictly preserves starred transmissions (is_starred = 1).
    Returns total number of deleted transmission records.
    """
    purged_count = 0
    storage_path = Path(storage_dir)
    storage_path.mkdir(parents=True, exist_ok=True)
    cursor = db_conn.cursor()

    now = datetime.now(timezone.utc)
    cutoff_dt = now - timedelta(days=max_days)

    # 1. Purge unstarred transmissions older than max_days
    cursor.execute("SELECT id, start_time, file_path, file_size_bytes FROM transmissions WHERE is_starred = 0")
    unstarred_records = cursor.fetchall()

    for row in unstarred_records:
        rec_dt = _parse_datetime(row["start_time"])
        if rec_dt < cutoff_dt:
            file_path = Path(row["file_path"])
            if not file_path.is_absolute():
                file_path = storage_path / file_path
            try:
                if file_path.exists():
                    file_path.unlink()
            except OSError as e:
                logger.warning(f"Failed to delete audio file {file_path}: {e}")

            cursor.execute("DELETE FROM transmissions WHERE id = ?", (row["id"],))
            purged_count += 1

    db_conn.commit()

    # 2. Check disk utilization and purge in FIFO order if exceeding max_disk_percent
    try:
        usage = shutil.disk_usage(str(storage_path))
        used_percent = (usage.used / usage.total) * 100.0 if usage.total > 0 else 0.0
    except OSError:
        used_percent = 0.0

    if used_percent > max_disk_percent:
        cursor.execute(
            "SELECT id, start_time, file_path, file_size_bytes FROM transmissions WHERE is_starred = 0 ORDER BY start_time ASC"
        )
        fifo_records = cursor.fetchall()

        simulated_freed = 0
        for row in fifo_records:
            if used_percent <= max_disk_percent:
                break

            file_path = Path(row["file_path"])
            if not file_path.is_absolute():
                file_path = storage_path / file_path
            file_size = row["file_size_bytes"] or 0
            try:
                if file_path.exists():
                    file_size = file_path.stat().st_size
                    file_path.unlink()
            except OSError as e:
                logger.warning(f"Failed to delete audio file {file_path}: {e}")

            cursor.execute("DELETE FROM transmissions WHERE id = ?", (row["id"],))
            purged_count += 1
            simulated_freed += file_size

            # Re-evaluate disk usage
            try:
                cur_usage = shutil.disk_usage(str(storage_path))
                actual_percent = (cur_usage.used / cur_usage.total) * 100.0 if cur_usage.total > 0 else 0.0
                calc_percent = (
                    ((usage.used - simulated_freed) / usage.total) * 100.0 if usage.total > 0 else 0.0
                )
                used_percent = min(actual_percent, calc_percent)
            except OSError:
                break

        db_conn.commit()

    # Clean up any empty day directories
    try:
        for parent_dir, dirs, files in os.walk(str(storage_path), topdown=False):
            if not dirs and not files and parent_dir != str(storage_path):
                try:
                    os.rmdir(parent_dir)
                except OSError:
                    pass
    except Exception:
        pass

    return purged_count


async def retention_worker(
    db_path: Optional[str] = None,
    storage_dir: Optional[Union[str, Path]] = None,
    interval_seconds: int = 3600,
) -> None:
    """Async background worker task that runs periodic retention purges."""
    resolved_db = db_path or config.DB_PATH
    resolved_storage = Path(storage_dir or config.STORAGE_DIR)

    logger.info(f"Starting retention worker with {interval_seconds}s interval.")
    while True:
        try:
            conn = get_connection(resolved_db)
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT retention_days, max_disk_usage_percent FROM system_settings WHERE id = 1")
                settings_row = cursor.fetchone()
                retention_days = (
                    settings_row["retention_days"] if settings_row else config.DEFAULT_RETENTION_DAYS
                )
                max_disk = (
                    settings_row["max_disk_usage_percent"]
                    if settings_row
                    else config.DEFAULT_MAX_DISK_USAGE_PERCENT
                )

                purged = run_retention_purge(
                    conn,
                    storage_dir=resolved_storage,
                    max_days=retention_days,
                    max_disk_percent=float(max_disk),
                )
                if purged > 0:
                    logger.info(f"Retention purge deleted {purged} old/excess recordings.")
            finally:
                conn.close()
        except asyncio.CancelledError:
            logger.info("Retention worker canceled.")
            break
        except Exception as e:
            logger.error(f"Error during retention worker cycle: {e}", exc_info=True)

        await asyncio.sleep(interval_seconds)
