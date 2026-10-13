"""Tests for WebSocket live telemetry and audio streaming (/ws/live)."""
import asyncio
import pytest
from fastapi.testclient import TestClient

from backend.auth import create_access_token
from backend.dsp.squelch import SquelchResult, SquelchState
from backend.main import create_app


def test_websocket_telemetry_flow():
    app = create_app(test_mode=True)
    client = TestClient(app)
    with client.websocket_connect("/ws/live") as websocket:
        data = websocket.receive_json()
        assert data["type"] == "telemetry"
        assert "rssi_dbfs" in data
        assert "squelch_open" in data
        assert "recording" in data
        assert "state" in data
        assert "frequency_hz" in data
        assert "modulation" in data


def test_websocket_auth_flow():
    app = create_app(test_mode=True)
    client = TestClient(app)
    valid_token = create_access_token({"sub": "admin"})

    # 1. Connect with valid token query parameter
    with client.websocket_connect(f"/ws/live?token={valid_token}") as websocket:
        data = websocket.receive_json()
        assert data["type"] == "telemetry"

    # 2. In-band authentication via WebSocket message
    with client.websocket_connect("/ws/live") as websocket:
        initial = websocket.receive_json()
        assert initial["type"] == "telemetry"

        # Send valid auth message
        websocket.send_json({"type": "auth", "token": valid_token})
        ack = websocket.receive_json()
        assert ack["type"] == "auth_ok"
        assert ack["authenticated"] is True
        assert ack["user"] == "admin"

        # Send invalid auth message
        websocket.send_json({"type": "auth", "token": "invalid_jwt_token"})
        err = websocket.receive_json()
        assert err["type"] == "auth_error"


def test_websocket_audio_streaming_on_squelch_open():
    app = create_app(test_mode=True)
    client = TestClient(app)

    with client.websocket_connect("/ws/live") as websocket:
        initial = websocket.receive_json()
        assert initial["type"] == "telemetry"

        audio_payload = b"\x01\x02\x03\x04" * 100
        open_result = SquelchResult(
            state=SquelchState.OPEN,
            rssi_dbfs=-35.0,
            is_open=True,
            transition="opened",
        )

        # Trigger receiver chunk callback with open squelch
        assert app.state.receiver.on_chunk_callback is not None
        asyncio.run(app.state.receiver.on_chunk_callback(audio_payload, open_result))

        # Client receives telemetry or audio
        # Note: both telemetry and audio might be sent, let's receive
        msg1 = websocket.receive()
        if "text" in msg1:
            # Telemetry frame received, next should be bytes
            msg2 = websocket.receive()
            assert msg2.get("bytes") == audio_payload
        else:
            assert msg1.get("bytes") == audio_payload


def test_websocket_unsquelched_mode():
    app = create_app(test_mode=True)
    client = TestClient(app)

    with client.websocket_connect("/ws/live") as websocket:
        initial = websocket.receive_json()
        assert initial["type"] == "telemetry"

        # Enable unsquelched monitor
        websocket.send_json({"type": "listen", "unsquelched": True})
        ack = websocket.receive_json()
        assert ack["type"] == "listen_status"
        assert ack["unsquelched"] is True

        audio_noise = b"\x00\x11\x22\x33" * 50
        closed_result = SquelchResult(
            state=SquelchState.CLOSED,
            rssi_dbfs=-75.0,
            is_open=False,
            transition=None,
        )

        # Trigger receiver chunk callback with closed squelch
        asyncio.run(app.state.receiver.on_chunk_callback(audio_noise, closed_result))

        # Because unsquelched is True, client receives the audio chunk anyway
        msg = websocket.receive()
        if "text" in msg:
            msg = websocket.receive()
        assert msg.get("bytes") == audio_noise


def test_websocket_disconnect_clean():
    app = create_app(test_mode=True)
    ws_mgr = getattr(app.state, "ws_manager", None)
    client = TestClient(app)

    assert ws_mgr is not None
    assert len(ws_mgr.active_connections) == 0

    with client.websocket_connect("/ws/live") as websocket:
        data = websocket.receive_json()
        assert data["type"] == "telemetry"
        assert len(ws_mgr.active_connections) == 1

    # After exiting context manager, client is cleanly removed
    assert len(ws_mgr.active_connections) == 0


def test_websocket_ping_pong():
    app = create_app(test_mode=True)
    client = TestClient(app)

    with client.websocket_connect("/ws/live") as websocket:
        initial = websocket.receive_json()
        assert initial["type"] == "telemetry"

        websocket.send_json({"type": "ping"})
        pong = websocket.receive_json()
        assert pong["type"] == "pong"


def test_websocket_telemetry_throttling():
    app = create_app(test_mode=True)
    ws_mgr = getattr(app.state, "ws_manager", None)
    assert ws_mgr is not None

    client = TestClient(app)
    with client.websocket_connect("/ws/live") as websocket:
        initial = websocket.receive_json()
        assert initial["type"] == "telemetry"

        res = SquelchResult(
            state=SquelchState.CLOSED,
            rssi_dbfs=-60.0,
            is_open=False,
            transition=None,
        )

        # Force last telemetry time to now
        import time
        ws_mgr._last_telemetry_time = time.monotonic()
        ws_mgr._last_state = "CLOSED"

        # Rapidly send 5 chunks when squelch is closed and state unchanged
        for _ in range(5):
            asyncio.run(ws_mgr.handle_chunk(b"\x00" * 100, res))

        # Because squelch is closed, no audio is broadcast, and telemetry was throttled,
        # so no extra message should be sent immediately
        # We can verify by sending a ping and receiving pong immediately
        websocket.send_json({"type": "ping"})
        msg = websocket.receive_json()
        assert msg["type"] == "pong"

