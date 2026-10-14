"""REST API endpoints for NVR recordings, timeline intervals, audio streaming, and call management."""
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import FileResponse

from backend import config
from backend.auth import get_current_user
from backend.database import get_db
from backend.models import TimelineItem, TransmissionModel, UpdateNotesRequest
from backend.storage.retention import _parse_datetime

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/timeline", response_model=List[TimelineItem])
def get_timeline(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format (defaults to today UTC)"),
    db: sqlite3.Connection = Depends(get_db),
) -> List[TimelineItem]:
    """
    Returns array of transmission intervals for 24h canvas scrubber rendering.
    Calculates start_ms and end_ms relative to the start of the day.
    """
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    try:
        day_start = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date format, expected YYYY-MM-DD",
        )

    cursor = db.cursor()
    cursor.execute(
        """
        SELECT id, start_time, end_time, duration_sec, frequency_hz, modulation, peak_rssi_dbfs, is_starred
        FROM transmissions
        WHERE substr(start_time, 1, 10) = ?
        ORDER BY start_time ASC
        """,
        (date,),
    )
    rows = cursor.fetchall()

    results: List[TimelineItem] = []
    for r in rows:
        rec_start = _parse_datetime(r["start_time"])
        start_ms = max(0, int((rec_start - day_start).total_seconds() * 1000))
        duration_sec = float(r["duration_sec"])
        end_ms = start_ms + int(duration_sec * 1000)

        results.append(
            TimelineItem(
                id=r["id"],
                start_ms=start_ms,
                end_ms=end_ms,
                duration_sec=duration_sec,
                peak_rssi_dbfs=float(r["peak_rssi_dbfs"]),
                peak_rssi=float(r["peak_rssi_dbfs"]),
                frequency_hz=int(r["frequency_hz"]),
                modulation=str(r["modulation"]),
                is_starred=int(r["is_starred"]),
            )
        )

    return results


@router.get("/active-dates", response_model=List[str])
def get_active_dates(
    month: Optional[str] = Query(None, description="Month in YYYY-MM format"),
    db: sqlite3.Connection = Depends(get_db),
) -> List[str]:
    """Returns list of distinct YYYY-MM-DD dates having recordings for calendar dots."""
    cursor = db.cursor()
    if month:
        cursor.execute(
            """
            SELECT DISTINCT substr(start_time, 1, 10) as dt
            FROM transmissions
            WHERE substr(start_time, 1, 7) = ?
            ORDER BY dt ASC
            """,
            (month,),
        )
    else:
        cursor.execute(
            """
            SELECT DISTINCT substr(start_time, 1, 10) as dt
            FROM transmissions
            ORDER BY dt ASC
            """
        )
    rows = cursor.fetchall()
    return [r["dt"] for r in rows if r["dt"]]


@router.get("", response_model=List[TransmissionModel])
def list_recordings(
    response: Response,
    date: Optional[str] = Query(None, description="Filter by date YYYY-MM-DD"),
    frequency: Optional[int] = Query(None, description="Filter by frequency Hz"),
    starred: Optional[bool] = Query(None, description="Filter by starred status"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: sqlite3.Connection = Depends(get_db),
) -> List[TransmissionModel]:
    """Paginated list of transmissions with filtering by date, frequency, and starred status."""
    conditions = []
    params: List[Any] = []

    if date:
        conditions.append("substr(start_time, 1, 10) = ?")
        params.append(date)

    if frequency is not None:
        conditions.append("frequency_hz = ?")
        params.append(frequency)

    if starred is not None:
        conditions.append("is_starred = ?")
        params.append(1 if starred else 0)

    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    cursor = db.cursor()
    # Total count for pagination headers
    cursor.execute(f"SELECT COUNT(*) as cnt FROM transmissions {where_sql}", tuple(params))
    total_count = cursor.fetchone()["cnt"]
    response.headers["X-Total-Count"] = str(total_count)

    # Paginated rows
    query_sql = f"SELECT * FROM transmissions {where_sql} ORDER BY start_time DESC LIMIT ? OFFSET ?"
    query_params = tuple(params + [limit, offset])
    cursor.execute(query_sql, query_params)
    rows = cursor.fetchall()

    return [TransmissionModel.model_validate(dict(r)) for r in rows]


@router.get("/{id}/audio")
def get_recording_audio(
    id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> Response:
    """
    Streams audio recording file with HTTP 206 Partial Content Range support
    for scrubbing and instant HTML5 audio playback.
    """
    cursor = db.cursor()
    cursor.execute("SELECT file_path FROM transmissions WHERE id = ?", (id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")

    file_path = Path(row["file_path"])
    if not file_path.is_absolute():
        file_path = Path(config.STORAGE_DIR) / file_path

    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audio file not found on disk",
        )

    file_size = file_path.stat().st_size
    suffix = file_path.suffix.lower()
    if suffix == ".wav":
        content_type = "audio/wav"
    elif suffix in [".opus", ".ogg"]:
        content_type = "audio/ogg; codecs=opus"
    elif suffix == ".mp3":
        content_type = "audio/mpeg"
    else:
        content_type = "audio/octet-stream"

    range_header = request.headers.get("Range")
    if not range_header:
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": content_type,
        }
        return FileResponse(path=str(file_path), media_type=content_type, headers=headers)

    # Parse Range Header: bytes=start-end
    range_val = range_header.strip().lower()
    if not range_val.startswith("bytes="):
        return FileResponse(path=str(file_path), media_type=content_type)

    range_spec = range_val[len("bytes="):]
    parts = range_spec.split("-")
    start_str = parts[0].strip()
    end_str = parts[1].strip() if len(parts) > 1 else ""

    try:
        if not start_str and end_str:
            # Suffix range: -500 (last 500 bytes)
            suffix_len = int(end_str)
            start = max(0, file_size - suffix_len)
            end = file_size - 1
        elif start_str and not end_str:
            start = int(start_str)
            end = file_size - 1
        elif start_str and end_str:
            start = int(start_str)
            end = int(end_str)
        else:
            start = 0
            end = file_size - 1
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
            detail="Invalid range request",
        )

    if start > end or start >= file_size:
        return Response(
            status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    end = min(end, file_size - 1)
    chunk_length = end - start + 1

    with open(file_path, "rb") as f:
        f.seek(start)
        data = f.read(chunk_length)

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(chunk_length),
        "Content-Type": content_type,
    }
    return Response(
        content=data,
        status_code=status.HTTP_206_PARTIAL_CONTENT,
        headers=headers,
    )


@router.post("/{id}/star")
def toggle_star_recording(
    id: int,
    db: sqlite3.Connection = Depends(get_db),
) -> Dict[str, Any]:
    """Toggles starred status (0 <-> 1) to protect recording from auto-retention."""
    cursor = db.cursor()
    cursor.execute("SELECT is_starred FROM transmissions WHERE id = ?", (id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")

    new_starred = 0 if row["is_starred"] == 1 else 1
    cursor.execute("UPDATE transmissions SET is_starred = ? WHERE id = ?", (new_starred, id))
    db.commit()
    return {"id": id, "is_starred": new_starred}


@router.post("/{id}/notes")
def update_recording_notes(
    id: int,
    payload: UpdateNotesRequest,
    db: sqlite3.Connection = Depends(get_db),
) -> Dict[str, Any]:
    """Updates call tags / notes."""
    cursor = db.cursor()
    cursor.execute("SELECT id FROM transmissions WHERE id = ?", (id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")

    cursor.execute("UPDATE transmissions SET notes = ? WHERE id = ?", (payload.notes, id))
    db.commit()
    return {"id": id, "notes": payload.notes}


@router.delete("/{id}")
def delete_recording(
    id: int,
    db: sqlite3.Connection = Depends(get_db),
) -> Dict[str, Any]:
    """Deletes recording record and audio file from disk."""
    cursor = db.cursor()
    cursor.execute("SELECT file_path FROM transmissions WHERE id = ?", (id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")

    file_path = Path(row["file_path"])
    if not file_path.is_absolute():
        file_path = Path(config.STORAGE_DIR) / file_path

    try:
        if file_path.exists():
            file_path.unlink()
    except OSError as e:
        logger.warning(f"Could not remove audio file {file_path}: {e}")

    cursor.execute("DELETE FROM transmissions WHERE id = ?", (id,))
    db.commit()
    return {"success": True, "id": id}
