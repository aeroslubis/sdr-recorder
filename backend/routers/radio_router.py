"""Radio Control and Channel Preset API endpoints for SDR-Recorder NVR."""
import sqlite3
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status

from backend.auth import get_current_user
from backend.database import get_db
from backend.models import (
    DongleConfigRequest,
    PresetCreate,
    PresetModel,
    RadioTuneRequest,
)
from backend.sdr.dongle_config import DongleConfig

router = APIRouter(dependencies=[Depends(get_current_user)])


def _get_receiver(request: Request):
    return getattr(request.app.state, "receiver", None)


@router.get("/devices")
def list_available_devices() -> List[Dict[str, Any]]:
    """Enumerate attached RTL-SDR USB dongles or return simulator."""
    from backend.sdr.receiver import get_available_devices
    return get_available_devices()


@router.get("/status")
def get_radio_status(request: Request, db: sqlite3.Connection = Depends(get_db)) -> Dict[str, Any]:
    """Return current radio tuning, hardware state, and DSP squelch metrics."""
    cursor = db.cursor()
    cursor.execute("SELECT * FROM radio_config WHERE id = 1")
    row = cursor.fetchone()
    db_config = dict(row) if row else {}

    receiver = _get_receiver(request)
    if receiver:
        cfg = receiver.config.to_dict()
        cfg["is_simulator"] = receiver.is_simulator
        cfg["is_running"] = receiver.is_running
        cfg["last_rssi"] = receiver.last_rssi
        cfg["squelch_state"] = (
            receiver.state.value if hasattr(receiver.state, "value") else str(receiver.state)
        )
        return cfg

    # Fallback to DB configuration if receiver is not attached
    db_config["is_simulator"] = True
    db_config["is_running"] = False
    db_config["last_rssi"] = -100.0
    db_config["squelch_state"] = "closed"
    return db_config


@router.post("/tune")
async def tune_radio(
    payload: RadioTuneRequest,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> Dict[str, Any]:
    """Update frequency, modulation, squelch, and RF gain parameters."""
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    cursor = db.cursor()

    if updates:
        set_clauses = [f"{k} = ?" for k in updates.keys()]
        sql = f"UPDATE radio_config SET {', '.join(set_clauses)}, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
        cursor.execute(sql, list(updates.values()))
        db.commit()

    receiver = _get_receiver(request)
    if receiver:
        cur_dict = receiver.config.to_dict()
        cur_dict.update(updates)
        new_cfg = DongleConfig.from_dict(cur_dict)
        await receiver.update_config(new_cfg)

    cursor.execute("SELECT * FROM radio_config WHERE id = 1")
    row = cursor.fetchone()
    return dict(row) if row else {}


@router.post("/dongle-config")
async def configure_dongle(
    payload: DongleConfigRequest,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> Dict[str, Any]:
    """Reconfigure RTL-SDR hardware parameters (direct sampling, bias-t, buffers, PPM)."""
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    cursor = db.cursor()

    if updates:
        set_clauses = [f"{k} = ?" for k in updates.keys()]
        sql = f"UPDATE radio_config SET {', '.join(set_clauses)}, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
        cursor.execute(sql, list(updates.values()))
        db.commit()

    receiver = _get_receiver(request)
    if receiver:
        cur_dict = receiver.config.to_dict()
        cur_dict.update(updates)
        new_cfg = DongleConfig.from_dict(cur_dict)
        await receiver.update_config(new_cfg)

    cursor.execute("SELECT * FROM radio_config WHERE id = 1")
    row = cursor.fetchone()
    return dict(row) if row else {}


@router.get("/presets", response_model=List[PresetModel])
def get_presets(db: sqlite3.Connection = Depends(get_db)) -> List[Dict[str, Any]]:
    """Get list of all saved channel presets."""
    cursor = db.cursor()
    cursor.execute("SELECT id, name, frequency_hz, modulation, squelch_threshold, category, created_at FROM presets ORDER BY id ASC")
    rows = cursor.fetchall()
    return [dict(r) for r in rows]


@router.post("/presets", response_model=PresetModel)
def create_preset(payload: PresetCreate, db: sqlite3.Connection = Depends(get_db)) -> Dict[str, Any]:
    """Create a new channel preset."""
    cursor = db.cursor()
    cursor.execute(
        """
        INSERT INTO presets (name, frequency_hz, modulation, squelch_threshold, category)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            payload.name,
            payload.frequency_hz,
            payload.modulation,
            payload.squelch_threshold,
            payload.category,
        ),
    )
    preset_id = cursor.lastrowid
    db.commit()

    cursor.execute("SELECT id, name, frequency_hz, modulation, squelch_threshold, category, created_at FROM presets WHERE id = ?", (preset_id,))
    row = cursor.fetchone()
    return dict(row)


@router.delete("/presets/{preset_id}")
def delete_preset(preset_id: int, db: sqlite3.Connection = Depends(get_db)) -> Dict[str, str]:
    """Delete a saved channel preset by ID."""
    cursor = db.cursor()
    cursor.execute("SELECT id FROM presets WHERE id = ?", (preset_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preset not found")

    cursor.execute("DELETE FROM presets WHERE id = ?", (preset_id,))
    db.commit()
    return {"message": "Preset deleted successfully"}
