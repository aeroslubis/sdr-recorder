# SDR-Recorder NVR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an NVR CCTV-style radio recording and live monitoring web application using RTL-SDR (with Airband AM, VHF/UHF NFM support), featuring squelch-gated voice recording with 500ms pre-roll, a 24-hour zoomable HTML5 canvas scrubber, BrowSDR-inspired hardware configuration, multi-day historical archive calendar, and a Supabase-themed dark UI with default credentials `admin` / `12345`.

**Architecture:** Python FastAPI backend with an asynchronous DSP/squelch pipeline, SQLite WAL database, and FFmpeg/PyAV audio encoding, coupled with a React/Vite/TypeScript frontend utilizing HTML5 Canvas for the 24h timeline scrubber, WebSockets for live audio and telemetry, and Web Audio API for playback DSP.

**Tech Stack:** Python 3.11+, FastAPI, Uvicorn, NumPy, SQLite, FFmpeg, React 18, Vite, TypeScript, Tailwind CSS, Lucide React.

**Spec:** [docs/superpowers/specs/2026-10-13-sdr-recorder-nvr-design.md](file:///home/aeros/workspace/agy/sdr-recorder/docs/superpowers/specs/2026-10-13-sdr-recorder-nvr-design.md)

## Global Constraints

- Default authentication credentials: username `admin`, password `12345`.
- WebUI language: English throughout all components, labels, and dialogs.
- WebUI style tokens: Supabase midnight theme from `supabase.md` (Obsidian `#121212`, Ash `#242424`, Charcoal `#2e2e2e`, Phosphor Green `#3ecf8e`, Mint Pulse `#00c573`).
- Single tuned channel architecture with automatic modulation preset (AM for 118–137 MHz, NFM for 137–470 MHz).
- Audio pre-roll buffer: 500ms circular ring buffer in memory; squelch hang time: 800ms.
- Auto-fallback to Mock SDR Simulator mode if physical RTL-SDR dongle is absent.

## Review Focus

1. **Pre-roll buffer boundary underflow on rapid squelch triggers:** Squelch opening and closing within <100ms must not crash the ring buffer or generate 0-byte corrupt audio files.
2. **24-hour timeline coordinate mapping across zoom levels:** Zooming from 24h to 15m must maintain exact time alignment between canvas pixels and millisecond timestamps without floating-point drift.
3. **HTTP Range requests for audio scrubbing:** Seeking across recorded audio clips via browser audio element must support partial content (`206 Partial Content`) cleanly without dropping playback.
4. **Auto-retention storage limit race conditions:** Rapid bursts of incoming transmissions when disk is near the 90% threshold must safely purge old unstarred files without deleting actively recording files.
5. **WebSocket disconnect recovery:** Client network blips or page reloads must cleanly detach and reattach WebSocket audio listeners without leaving zombie streaming tasks on the backend.

---

### Task 1: Backend Foundation, Configuration & Database Models

**Files:**
- Create: `backend/config.py`
- Create: `backend/database.py`
- Create: `backend/models.py`
- Test: `backend/tests/test_database.py`

**Interfaces:**
- Produces: `init_db(db_path: str) -> None`, `get_db() -> Generator[sqlite3.Connection, None, None]`, `hash_password(raw: str) -> str`, `verify_password(raw: str, hashed: str) -> bool`.
- Tables created: `users`, `radio_config`, `presets`, `transmissions`, `system_settings`.

- [ ] **Step 1: Write failing test for database initialization, seeding default admin, and default radio config**

```python
# backend/tests/test_database.py
import os
import sqlite3
import pytest
from backend.database import init_db, get_connection
from backend.models import verify_password

def test_init_db_creates_tables_and_seeds_admin(tmp_path):
    db_file = str(tmp_path / "test_sdr.db")
    init_db(db_file)
    conn = get_connection(db_file)
    cursor = conn.cursor()
    
    # Check default admin user
    cursor.execute("SELECT username, password_hash FROM users WHERE username = 'admin'")
    row = cursor.fetchone()
    assert row is not None
    assert row[0] == "admin"
    assert verify_password("12345", row[1]) is True
    
    # Check default radio_config
    cursor.execute("SELECT frequency_hz, modulation, squelch_threshold FROM radio_config WHERE id = 1")
    config = cursor.fetchone()
    assert config is not None
    assert config[0] == 118200000
    assert config[1] == "AM"
    assert config[2] == -42.0
    conn.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_database.py -v`
Expected: FAIL with ModuleNotFoundError: No module named 'backend'

- [ ] **Step 3: Implement database schema, password hashing with bcrypt/hashlib, and seeds in `backend/database.py` and `backend/models.py`**

Create `backend/database.py` and `backend/models.py` with SQLite WAL mode initialization, default table definitions matching spec Section 6, and password verification.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_database.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat(backend): add database schema, models, and default admin seed"
```

---

### Task 2: Audio DSP, Squelch Evaluator & Pre-Roll Ring Buffer

**Files:**
- Create: `backend/dsp/squelch.py`
- Create: `backend/dsp/ring_buffer.py`
- Test: `backend/tests/test_squelch.py`

**Interfaces:**
- Produces: `calculate_rssi_dbfs(pcm_chunk: bytes) -> float`, `AudioRingBuffer(capacity_bytes: int)`, `SquelchEvaluator(threshold_dbfs: float, hang_time_ms: int, pre_roll_ms: int)`.

- [ ] **Step 1: Write failing test for RMS/dBFS calculation and pre-roll ring buffer**

```python
# backend/tests/test_squelch.py
import numpy as np
import pytest
from backend.dsp.squelch import calculate_rssi_dbfs, SquelchEvaluator
from backend.dsp.ring_buffer import AudioRingBuffer

def test_calculate_rssi_dbfs_full_scale_and_silence():
    # Full scale 16-bit sine wave -> ~0 dBFS
    t = np.linspace(0, 1, 24000, False)
    tone = (np.sin(2 * np.pi * 1000 * t) * 32767).astype(np.int16).tobytes()
    rssi = calculate_rssi_dbfs(tone)
    assert -4.0 <= rssi <= 0.0

    # Total silence -> -100 dBFS floor
    silence = np.zeros(2400, dtype=np.int16).tobytes()
    assert calculate_rssi_dbfs(silence) <= -90.0

def test_ring_buffer_fifo():
    buf = AudioRingBuffer(capacity_bytes=100)
    buf.write(b"A" * 60)
    buf.write(b"B" * 60)
    out = buf.read_all()
    assert len(out) == 100
    assert out == (b"A" * 40) + (b"B" * 60)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_squelch.py -v`
Expected: FAIL

- [ ] **Step 3: Implement `calculate_rssi_dbfs`, `AudioRingBuffer`, and stateful `SquelchEvaluator`**

In `backend/dsp/squelch.py` and `backend/dsp/ring_buffer.py`, implement vectorised NumPy RMS calculation clamped to a -100 dBFS floor, circular byte buffer, and state transitions (`CLOSED` -> `OPEN` with pre-roll flush, `OPEN` -> `CLOSING` with hang-time countdown, `CLOSING` -> `CLOSED` trigger).

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_squelch.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/dsp/ backend/tests/test_squelch.py
git commit -m "feat(dsp): implement audio RSSI dBFS calculation and pre-roll ring buffer"
```

---

### Task 3: SDR Ingest Engine & Mock SDR Simulator

**Files:**
- Create: `backend/sdr/dongle_config.py`
- Create: `backend/sdr/simulator.py`
- Create: `backend/sdr/receiver.py`
- Test: `backend/tests/test_sdr_receiver.py`

**Interfaces:**
- Consumes: `AudioRingBuffer`, `SquelchEvaluator` from `backend/dsp`.
- Produces: `DongleConfig`, `MockSDRSimulator`, `SDRReceiver(config: DongleConfig, on_chunk_callback, on_transmission_end_callback)`.

- [ ] **Step 1: Write failing test for MockSDRSimulator generating bursts and SDRReceiver state**

```python
# backend/tests/test_sdr_receiver.py
import pytest
import asyncio
from backend.sdr.simulator import MockSDRSimulator
from backend.sdr.dongle_config import DongleConfig

@pytest.mark.asyncio
async def test_simulator_generates_pcm_chunks():
    sim = MockSDRSimulator(sample_rate=24000, chunk_ms=50)
    chunk = await sim.read_chunk()
    assert len(chunk) == 2400  # 50ms at 24000 samples/sec * 2 bytes/sample
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_sdr_receiver.py -v`
Expected: FAIL

- [ ] **Step 3: Implement `DongleConfig`, `MockSDRSimulator` (synthesizing noise + voice bursts), and `SDRReceiver` (managing `rtl_fm` process or simulator fallback)**

In `backend/sdr/dongle_config.py`, support all BrowSDR parameters: frequency, modulation, squelch, gain, gain_mode, PPM, bias_tee, direct_sampling, device_index.
In `backend/sdr/receiver.py`, check hardware existence using `shutil.which('rtl_fm')` and `rtl_test`. If missing or device fails, fallback to `MockSDRSimulator`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_sdr_receiver.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/sdr/ backend/tests/test_sdr_receiver.py
git commit -m "feat(sdr): add dongle hardware config, mock simulator, and receiver loop"
```

---

### Task 4: REST API, Authentication & Radio Control Endpoints

**Files:**
- Create: `backend/auth.py`
- Create: `backend/routers/auth_router.py`
- Create: `backend/routers/radio_router.py`
- Create: `backend/main.py`
- Test: `backend/tests/test_api_auth_radio.py`

**Interfaces:**
- Produces: FastAPI app with endpoints:
  - `POST /api/auth/login` (admin / 12345)
  - `GET /api/auth/me`
  - `GET /api/radio/status`
  - `POST /api/radio/tune`
  - `POST /api/radio/dongle-config`
  - `GET /api/radio/presets`
  - `POST /api/radio/presets`

- [ ] **Step 1: Write failing test for login authentication and radio tuning**

```python
# backend/tests/test_api_auth_radio.py
from fastapi.testclient import TestClient
from backend.main import create_app

def test_login_success_and_failure():
    app = create_app(test_mode=True)
    client = TestClient(app)
    
    # Wrong password
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401
    
    # Correct default credentials
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "12345"})
    assert resp.status_code == 200
    token = resp.json()["token"]
    assert token is not None
    
    # Authenticated radio status
    resp = client.get("/api/radio/status", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert "frequency_hz" in resp.json()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_api_auth_radio.py -v`
Expected: FAIL

- [ ] **Step 3: Implement auth router, radio control router, and FastAPI app**

Implement JWT/Session tokens in `backend/auth.py`, routes in `backend/routers/auth_router.py` and `backend/routers/radio_router.py`, wiring together in `backend/main.py`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_api_auth_radio.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/auth.py backend/routers/ backend/main.py backend/tests/test_api_auth_radio.py
git commit -m "feat(api): implement auth login with admin/12345 and radio control endpoints"
```

---

### Task 5: NVR Recordings Archive, Timeline API & Auto-Retention Worker

**Files:**
- Create: `backend/storage/retention.py`
- Create: `backend/routers/recordings_router.py`
- Test: `backend/tests/test_recordings_retention.py`

**Interfaces:**
- Produces:
  - `GET /api/recordings/timeline?date=YYYY-MM-DD`
  - `GET /api/recordings/active-dates?month=YYYY-MM`
  - `GET /api/recordings?date=&frequency=&starred=&limit=&offset=`
  - `GET /api/recordings/{id}/audio` (HTTP 206 Partial Content support)
  - `POST /api/recordings/{id}/star`
  - `run_retention_purge(db_conn, storage_dir, max_days, max_disk_percent) -> int`

- [ ] **Step 1: Write failing test for timeline interval queries, star toggling, and auto-retention purge**

```python
# backend/tests/test_recordings_retention.py
import pytest
from datetime import datetime, timedelta
from backend.storage.retention import run_retention_purge
from backend.database import get_connection

def test_retention_purge_protects_starred_and_purges_old(tmp_path):
    db_file = str(tmp_path / "test_ret.db")
    storage_dir = tmp_path / "recordings"
    storage_dir.mkdir()
    # Populate test transmissions: 1 old unstarred, 1 old starred, 1 recent
    # Verify run_retention_purge removes only the old unstarred record and file
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_recordings_retention.py -v`
Expected: FAIL

- [ ] **Step 3: Implement `run_retention_purge` in `backend/storage/retention.py` and endpoints in `backend/routers/recordings_router.py`**

Include HTTP range requests for `.opus` / `.mp3` / `.wav` audio streaming, star toggling, date-indexed timeline queries, and calendar active-dates endpoint.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_recordings_retention.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/storage/ backend/routers/recordings_router.py backend/tests/test_recordings_retention.py
git commit -m "feat(recordings): implement timeline api, calendar date query, and auto-retention worker"
```

---

### Task 6: WebSocket Live Telemetry & Audio Streaming

**Files:**
- Create: `backend/routers/ws_router.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_websocket_stream.py`

**Interfaces:**
- Produces: WebSocket route `/ws/live` pushing:
  - JSON telemetry frame at 10 Hz: `{ "type": "telemetry", "rssi_dbfs": float, "squelch_open": bool, "recording": bool }`
  - Binary audio chunk messages when squelch is open or user requests live listening.

- [ ] **Step 1: Write failing test for WebSocket telemetry and live stream subscription**

```python
# backend/tests/test_websocket_stream.py
from fastapi.testclient import TestClient
from backend.main import create_app

def test_websocket_telemetry_flow():
    app = create_app(test_mode=True)
    client = TestClient(app)
    with client.websocket_connect("/ws/live") as websocket:
        data = websocket.receive_json()
        assert data["type"] == "telemetry"
        assert "rssi_dbfs" in data
        assert "squelch_open" in data
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_websocket_stream.py -v`
Expected: FAIL

- [ ] **Step 3: Implement WebSocket connection manager and broadcast loop in `backend/routers/ws_router.py`**

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_websocket_stream.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routers/ws_router.py backend/main.py backend/tests/test_websocket_stream.py
git commit -m "feat(ws): implement real-time RSSI telemetry and live audio WebSocket stream"
```

---

### Task 7: Frontend Scaffolding, Supabase Theme & Authentication View

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/src/index.css`
- Create: `frontend/src/context/AuthContext.tsx`
- Create: `frontend/src/components/LoginView.tsx`
- Create: `frontend/src/App.tsx`
- Test: `frontend/src/__tests__/LoginView.test.tsx`

**Interfaces:**
- Produces: Complete Supabase dark theme tokens (`--color-obsidian: #121212`, `--color-ash: #242424`, `--color-charcoal: #2e2e2e`, `--color-phosphor-green: #3ecf8e`), LoginView component with `admin` / `12345` prefill/hint and English UI.

- [ ] **Step 1: Write failing component test for LoginView**

```tsx
// frontend/src/__tests__/LoginView.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { LoginView } from '../components/LoginView';

test('renders login view with default credentials hint in english', () => {
  render(<LoginView onLogin={jest.fn()} />);
  expect(screen.getByText(/Default credentials: admin \/ 12345/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test frontend/src/__tests__/LoginView.test.tsx`
Expected: FAIL

- [ ] **Step 3: Scaffold Vite React app, Tailwind CSS configuration with Supabase tokens, AuthContext, and LoginView**

Configure Tailwind theme colors according to `supabase.md`, create `LoginView` with clean inputs, Phosphor green buttons, and proper English copy.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test frontend/src/__tests__/LoginView.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): scaffold react vite app with supabase dark theme and login view"
```

---

### Task 8: Radio Tuning Panel, S-Meter & BrowSDR Dongle Configuration Modal

**Files:**
- Create: `frontend/src/components/RadioTuningPanel.tsx`
- Create: `frontend/src/components/SMeterBar.tsx`
- Create: `frontend/src/components/DongleConfigModal.tsx`
- Create: `frontend/src/components/TopBar.tsx`
- Test: `frontend/src/__tests__/RadioTuningPanel.test.tsx`

**Interfaces:**
- Produces:
  - `SMeterBar`: Real-time RSSI meter with draggable squelch needle.
  - `RadioTuningPanel`: Frequency input, step buttons, AM/NFM selector, preset list.
  - `DongleConfigModal`: BrowSDR settings (PPM calibration, RF gain mode, Bias-T, direct sampling, sample rate, buffers).
  - `TopBar`: Brand, hardware badge, storage quota, admin menu dropdown.

- [ ] **Step 1: Write failing component test for RadioTuningPanel and S-Meter**

```tsx
// frontend/src/__tests__/RadioTuningPanel.test.tsx
import { render, screen } from '@testing-library/react';
import { RadioTuningPanel } from '../components/RadioTuningPanel';

test('displays frequency controls, modulation buttons, and squelch slider', () => {
  render(<RadioTuningPanel frequencyHz={118200000} modulation="AM" squelchThreshold={-42.0} onTune={jest.fn()} />);
  expect(screen.getByText(/118.200.000/i)).toBeInTheDocument();
  expect(screen.getByText(/AM \(Airband\)/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test frontend/src/__tests__/RadioTuningPanel.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `SMeterBar`, `RadioTuningPanel`, `DongleConfigModal`, and `TopBar`**

Build the tuning panel, interactive S-meter with live CSS/SVG gradient, the admin modal carrying BrowSDR hardware settings, and top bar with storage and hardware badges.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test frontend/src/__tests__/RadioTuningPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/
git commit -m "feat(frontend): add radio tuning panel, s-meter squelch bar, and browsdr config modal"
```

---

### Task 9: 24-Hour Zoomable Canvas Scrubber & NVR Playback Engine

**Files:**
- Create: `frontend/src/components/TimelineScrubber.tsx`
- Create: `frontend/src/components/PlaybackControls.tsx`
- Create: `frontend/src/audio/WebAudioPlayer.ts`
- Test: `frontend/src/__tests__/TimelineScrubber.test.tsx`

**Interfaces:**
- Produces:
  - `TimelineScrubber`: HTML5 Canvas rendering 24h timeline ruler (00:00 - 24:00), phosphor green transmission blocks, zoom levels (24h, 6h, 1h, 15m), wheel zoom, playhead scrubber needle.
  - `PlaybackControls`: Play/Pause, Prev/Next transmission skip, speed selector (1.0x - 2.0x), clip export button.
  - `WebAudioPlayer`: AudioContext wrapper with 300Hz-3kHz bandpass biquad filter node and AGC gain node.

- [ ] **Step 1: Write failing test for timeline time-to-pixel coordinate projection math**

```typescript
// frontend/src/__tests__/TimelineScrubber.test.tsx
import { timeMsToCanvasX, canvasXToTimeMs } from '../components/timelineUtils';

test('projects 24h timestamps to canvas pixels reversibly', () => {
  const canvasWidth = 1200;
  const viewStartMs = 0;
  const viewEndMs = 86400000; // 24 hours in ms
  const testTime = 43200000; // Noon (12:00:00)
  
  const x = timeMsToCanvasX(testTime, viewStartMs, viewEndMs, canvasWidth);
  expect(x).toBeCloseTo(600, 1);
  const reverted = canvasXToTimeMs(x, viewStartMs, viewEndMs, canvasWidth);
  expect(reverted).toBeCloseTo(testTime, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test frontend/src/__tests__/TimelineScrubber.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `timelineUtils`, `TimelineScrubber` canvas renderer, `PlaybackControls`, and `WebAudioPlayer`**

Build high-performance 60fps canvas renderer, zoom presets (`24h`, `6h`, `1h`, `15m`), playhead dragging, and Web Audio API player with bandpass filtering.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test frontend/src/__tests__/TimelineScrubber.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TimelineScrubber.tsx frontend/src/components/timelineUtils.ts frontend/src/components/PlaybackControls.tsx frontend/src/audio/
git commit -m "feat(frontend): implement 24h canvas timeline scrubber and web audio dsp player"
```

---

### Task 10: Multi-Day Calendar Date Picker & Call Log History Panel

**Files:**
- Create: `frontend/src/components/HistoryDatePicker.tsx`
- Create: `frontend/src/components/CallLogPanel.tsx`
- Create: `frontend/src/components/DashboardLayout.tsx`
- Test: `frontend/src/__tests__/CallLogPanel.test.tsx`

**Interfaces:**
- Produces:
  - `HistoryDatePicker`: Calendar popover marking recording days with phosphor green dots (`●`), previous/next day buttons.
  - `CallLogPanel`: Right sidebar listing chronological call cards, search filter, starred filter, quick play, and download buttons.
  - `DashboardLayout`: Integrates TopBar, Left Panel, Center Scrubber, and Right Call Log into a responsive 3-column NVR layout.

- [ ] **Step 1: Write failing component test for CallLogPanel filtering and star toggle**

```tsx
// frontend/src/__tests__/CallLogPanel.test.tsx
import { render, screen } from '@testing-library/react';
import { CallLogPanel } from '../components/CallLogPanel';

const sampleCalls = [
  { id: 1, startTime: '14:32:10', durationSec: 4.2, frequencyHz: 118200000, peakRssi: -34, isStarred: true },
  { id: 2, startTime: '14:28:45', durationSec: 7.8, frequencyHz: 118200000, peakRssi: -28, isStarred: false }
];

test('renders call list and filters by starred', () => {
  render(<CallLogPanel calls={sampleCalls} onPlay={jest.fn()} onToggleStar={jest.fn()} />);
  expect(screen.getByText(/14:32:10/i)).toBeInTheDocument();
  expect(screen.getByText(/14:28:45/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test frontend/src/__tests__/CallLogPanel.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `HistoryDatePicker`, `CallLogPanel`, and assemble `DashboardLayout`**

Create calendar popover fetching `/api/recordings/active-dates`, call list cards with star toggling, and complete unified dashboard view in `DashboardLayout.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test frontend/src/__tests__/CallLogPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/
git commit -m "feat(frontend): add multi-day calendar date picker and call log history panel"
```

---

### Task 11: End-to-End Integration, Simulator Mode Verification & Packaging

**Files:**
- Create: `backend/run.py`
- Create: `scripts/start.sh`
- Create: `README.md`
- Test: `tests/e2e/test_full_system.py`

**Interfaces:**
- Produces: Single unified start script (`./scripts/start.sh`) running backend on port 8000 and serving built frontend or Vite dev server on port 3000, with automated E2E tests validating the complete recording pipeline under Mock SDR Simulator mode.

- [ ] **Step 1: Write failing end-to-end integration test**

```python
# tests/e2e/test_full_system.py
import pytest
import time
from fastapi.testclient import TestClient
from backend.main import create_app

def test_full_nvr_cycle_with_simulator():
    app = create_app(force_simulator=True)
    client = TestClient(app)
    
    # 1. Login with default admin / 12345
    login_res = client.post("/api/auth/login", json={"username": "admin", "password": "12345"})
    assert login_res.status_code == 200
    token = login_res.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Check simulator hardware status
    stats = client.get("/api/system/stats", headers=headers).json()
    assert stats["simulator_mode"] is True
    
    # 3. Tune radio
    tune_res = client.post("/api/radio/tune", json={
        "frequency_hz": 118200000,
        "modulation": "AM",
        "squelch_threshold": -45.0
    }, headers=headers)
    assert tune_res.status_code == 200
    
    # 4. Wait for simulated transmission to register and query timeline
    time.sleep(2.0)
    timeline_res = client.get("/api/recordings/timeline", headers=headers)
    assert timeline_res.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/e2e/test_full_system.py -v`
Expected: FAIL

- [ ] **Step 3: Implement entry point `backend/run.py`, start script `scripts/start.sh`, and documentation in `README.md`**

Ensure seamless local startup, static asset bundling, and clean error logs.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/e2e/test_full_system.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/run.py scripts/start.sh README.md tests/e2e/
git commit -m "chore: add startup script, comprehensive documentation, and e2e test suite"
```
