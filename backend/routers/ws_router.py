"""WebSocket Live Telemetry and Audio Streaming Router for SDR-Recorder NVR."""
import json
import logging
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from backend.auth import decode_access_token
from backend.dsp.squelch import SquelchState

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    """Manages active WebSocket client connections, telemetry broadcasts, and audio streaming."""

    def __init__(self) -> None:
        # Maps active WebSocket instances to their client state dictionary:
        # {"unsquelched": bool, "authenticated": bool, "user": Optional[Dict]}
        self.active_connections: Dict[WebSocket, Dict[str, Any]] = {}
        self._last_telemetry_time: float = 0.0
        self._last_state: Optional[str] = None
        self._latest_telemetry: Optional[Dict[str, Any]] = None

    async def connect(self, websocket: WebSocket, token: Optional[str] = None) -> None:
        """Accepts a WebSocket connection, evaluates optional token, and sends initial telemetry."""
        await websocket.accept()

        is_authenticated = False
        user_info = None

        if token:
            try:
                user_info = decode_access_token(token)
                is_authenticated = True
            except Exception as e:
                logger.debug(f"Optional token validation failed on connect: {e}")

        self.active_connections[websocket] = {
            "unsquelched": False,
            "authenticated": is_authenticated,
            "user": user_info,
        }

        # Send immediate telemetry snapshot upon connection
        snapshot = self.get_telemetry_snapshot(getattr(websocket, "app", None))
        try:
            await websocket.send_json(snapshot)
        except Exception:
            await self.disconnect(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        """Cleanly removes a WebSocket connection without leaking resources."""
        if websocket in self.active_connections:
            del self.active_connections[websocket]
        try:
            await websocket.close()
        except Exception:
            pass

    def get_telemetry_snapshot(self, app: Optional[Any] = None) -> Dict[str, Any]:
        """Builds a current telemetry snapshot from cached state or receiver state."""
        if self._latest_telemetry is not None:
            return dict(self._latest_telemetry)

        rssi_dbfs = -100.0
        squelch_open = False
        recording = False
        state_str = "CLOSED"
        frequency_hz = 118200000
        modulation = "AM"

        is_simulator = False
        hardware_connected = True

        if app is not None and hasattr(app, "state"):
            receiver = getattr(app.state, "receiver", None)
            if receiver is not None:
                rssi_dbfs = getattr(receiver, "last_rssi", -100.0)
                state = getattr(receiver, "state", SquelchState.CLOSED)
                squelch_open = state == SquelchState.OPEN
                state_str = state.value if hasattr(state, "value") else str(state)
                chunks = getattr(receiver, "_current_transmission_chunks", [])
                recording = squelch_open or (len(chunks) > 0)
                is_simulator = getattr(receiver, "is_simulator", False)
                hardware_connected = getattr(receiver, "is_hardware_connected", not is_simulator)
                if hasattr(receiver, "config"):
                    frequency_hz = getattr(receiver.config, "frequency_hz", frequency_hz)
                    modulation = getattr(receiver.config, "modulation", modulation)

        return {
            "type": "telemetry",
            "rssi_dbfs": round(float(rssi_dbfs), 2),
            "squelch_open": bool(squelch_open),
            "recording": bool(recording),
            "state": state_str,
            "frequency_hz": int(frequency_hz),
            "modulation": str(modulation),
            "is_simulator": bool(is_simulator),
            "hardware_connected": bool(hardware_connected),
        }

    async def handle_client_message(self, websocket: WebSocket, message: Dict[str, Any]) -> None:
        """Processes control messages received from a connected client."""
        msg_type = message.get("type", "")

        # Authentication message handling
        if msg_type in ("auth", "authenticate"):
            token = message.get("token")
            if token:
                try:
                    payload = decode_access_token(token)
                    if websocket in self.active_connections:
                        self.active_connections[websocket]["authenticated"] = True
                        self.active_connections[websocket]["user"] = payload
                    await websocket.send_json({
                        "type": "auth_ok",
                        "authenticated": True,
                        "user": payload.get("sub") or payload.get("username", "admin"),
                    })
                except Exception as e:
                    await websocket.send_json({
                        "type": "auth_error",
                        "detail": f"Authentication failed: {e}",
                    })
            else:
                await websocket.send_json({
                    "type": "auth_error",
                    "detail": "Token is required for authentication",
                })
            return

        # Squelch bypass / live listen mode toggle
        if msg_type in ("listen", "set_unsquelched", "unmute") or "unsquelched" in message:
            unsquelched = message.get("unsquelched", True)
            if websocket in self.active_connections:
                self.active_connections[websocket]["unsquelched"] = bool(unsquelched)
                await websocket.send_json({
                    "type": "listen_status",
                    "unsquelched": self.active_connections[websocket]["unsquelched"],
                })
            return

        # Keepalive / ping
        if msg_type == "ping":
            await websocket.send_json({"type": "pong"})
            return

    async def broadcast_telemetry(self, telemetry: Dict[str, Any]) -> None:
        """Broadcasts a JSON telemetry frame to all active clients."""
        if not self.active_connections:
            return

        disconnected = []
        for ws in list(self.active_connections.keys()):
            try:
                await ws.send_json(telemetry)
            except Exception:
                disconnected.append(ws)

        for ws in disconnected:
            await self.disconnect(ws)

    async def broadcast_audio(self, chunk: bytes, is_open: bool) -> None:
        """Broadcasts binary audio PCM bytes to eligible clients."""
        if not self.active_connections or not chunk:
            return

        disconnected = []
        for ws, info in list(self.active_connections.items()):
            if is_open or info.get("unsquelched", False):
                try:
                    await ws.send_bytes(chunk)
                except Exception:
                    disconnected.append(ws)

        for ws in disconnected:
            await self.disconnect(ws)

    async def handle_chunk(
        self,
        chunk: bytes,
        result: Any,
        receiver: Optional[Any] = None,
    ) -> None:
        """
        Ingests a processed audio chunk & squelch evaluation result.
        Broadcasts throttled telemetry at ~10 Hz and PCM audio chunks.
        """
        # Extract RSSI and squelch status
        if hasattr(result, "rssi_dbfs"):
            rssi_dbfs = result.rssi_dbfs
            squelch_open = result.is_open
            state_str = result.state.value if hasattr(result.state, "value") else str(result.state)
        elif isinstance(result, dict):
            rssi_dbfs = result.get("rssi_dbfs", -100.0)
            squelch_open = result.get("is_open", False) or result.get("squelch_open", False)
            state_str = str(result.get("state", "CLOSED"))
        else:
            rssi_dbfs = -100.0
            squelch_open = False
            state_str = "CLOSED"

        # Extract radio details
        frequency_hz = 118200000
        modulation = "AM"
        recording = squelch_open

        is_simulator = False
        hardware_connected = True
        if receiver is not None:
            if hasattr(receiver, "config"):
                frequency_hz = getattr(receiver.config, "frequency_hz", frequency_hz)
                modulation = getattr(receiver.config, "modulation", modulation)
            chunks = getattr(receiver, "_current_transmission_chunks", [])
            recording = squelch_open or (len(chunks) > 0)
            is_simulator = getattr(receiver, "is_simulator", False)
            hardware_connected = getattr(receiver, "is_hardware_connected", not is_simulator)

        telemetry = {
            "type": "telemetry",
            "rssi_dbfs": round(float(rssi_dbfs), 2),
            "squelch_open": bool(squelch_open),
            "recording": bool(recording),
            "state": state_str,
            "frequency_hz": int(frequency_hz),
            "modulation": str(modulation),
            "is_simulator": bool(is_simulator),
            "hardware_connected": bool(hardware_connected),
        }
        self._latest_telemetry = telemetry

        # Broadcast telemetry throttled at ~10 Hz (every 100ms) or on squelch state change
        now = time.monotonic()
        state_changed = self._last_state != state_str
        if (now - self._last_telemetry_time >= 0.10) or state_changed:
            self._last_telemetry_time = now
            self._last_state = state_str
            await self.broadcast_telemetry(telemetry)

        # Broadcast binary audio bytes if squelch open or client requested unsquelched listen
        if chunk:
            await self.broadcast_audio(chunk, is_open=squelch_open)


# Global default connection manager instance
default_ws_manager = ConnectionManager()
ws_manager = default_ws_manager


@router.websocket("/ws/live")
@router.websocket("/live")
async def websocket_live_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
) -> None:
    """WebSocket endpoint pushing real-time RSSI telemetry and live audio stream."""
    manager: ConnectionManager = getattr(
        getattr(websocket, "app", None), "state", None
    ) and getattr(websocket.app.state, "ws_manager", default_ws_manager) or default_ws_manager

    await manager.connect(websocket, token=token)
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            if message.get("type") == "websocket.receive":
                if "text" in message:
                    try:
                        data = json.loads(message["text"])
                        if isinstance(data, dict):
                            await manager.handle_client_message(websocket, data)
                    except json.JSONDecodeError:
                        pass
                elif "bytes" in message:
                    pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug(f"Exception in live websocket endpoint: {e}")
    finally:
        await manager.disconnect(websocket)
