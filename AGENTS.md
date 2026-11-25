# AGENTS.md

Operational guide for AI agents and developers working in `sdr-recorder` (SDR-Recorder NVR).

> **Scope note:** This document reflects the repository as mapped without modifying source code. Keep it updated whenever architecture, commands, or conventions change.

---

## 1. Tech Stack & Architecture

**SDR-Recorder NVR** is a 24/7 radio communications monitoring and archiving platform modeled after CCTV NVR systems:

- **Backend:** Python 3.11+ (Docker uses `python:3.12-slim-bookworm`), FastAPI, Uvicorn, Pydantic v2, PyJWT, `bcrypt`, NumPy, `websockets`, `httpx`, SQLite 3 (stdlib `sqlite3` in `WAL` mode).
- **System / Media Binaries:** `rtl-sdr` (`rtl_fm`, `rtl_test`), `ffmpeg` (for `.opus` / `.mp3` encoding), `usbutils` (`lsusb`).
- **Frontend:** TypeScript (`strict: true`), React 18, Vite, Tailwind CSS, Lucide React, Web Audio API (`AudioContext`, `BiquadFilterNode`, `GainNode`, `AnalyserNode`), HTML5 Canvas (24h timeline scrubber & live spectrum visualizer).
- **Testing:** `pytest` + `pytest-asyncio` (FastAPI `TestClient`, E2E + backend unit tests), Vitest + Testing Library (`jsdom`) for frontend.
- **Container & CI:** Multi-stage `Dockerfile` (`node:20-slim` -> `python:3.12-slim-bookworm`), `docker-compose.yml`, and `.github/workflows/docker-publish.yml` (builds and pushes to Docker Hub on push to `master`).

---

## 2. Repository Structure

```text
sdr-recorder/
├── backend/
│   ├── main.py                 # create_app(), FastAPI lifespan, receiver/WS/retention wiring, /api/health
│   ├── run.py                  # CLI runner, --reload, --reset-password, SPA static serving (frontend/dist)
│   ├── config.py               # Environment variable loading and runtime defaults/paths
│   ├── database.py             # SQLite WAL schema, idempotent column migrations, seeding, get_db()
│   ├── models.py               # Pydantic request/response models & bcrypt password helpers
│   ├── auth.py                 # JWT token creation/validation/revocation & get_current_user()
│   ├── routers/
│   │   ├── auth_router.py      # /api/auth/{login,me,logout,change-password}
│   │   ├── radio_router.py     # /api/radio/{devices,status,auto-squelch,restart,tune,dongle-config,presets}
│   │   ├── recordings_router.py# /api/recordings/{timeline,active-dates,,{id}/audio,{id}/star,{id}/notes,{id}}
│   │   ├── system_router.py    # /api/system/{stats,time,settings}
│   │   └── ws_router.py        # ConnectionManager & WebSocket /ws/live (alias /live)
│   ├── sdr/
│   │   ├── receiver.py         # SDRReceiver, TransmissionEvent, rtl_fm/rtl_test & USB reconnect loop
│   │   └── dongle_config.py    # DongleConfig Pydantic model
│   ├── dsp/
│   │   ├── filter.py           # VoiceBandpassFilter (300 Hz - 3200 Hz IIR bandpass)
│   │   ├── ring_buffer.py      # Thread-safe AudioRingBuffer for pre-roll audio
│   │   └── squelch.py          # SquelchEvaluator (CLOSED/OPEN/CLOSING) & calculate_rssi_dbfs()
│   ├── storage/
│   │   ├── audio_writer.py     # Peak normalization, WAV write, ffmpeg opus/mp3 conversion, DB insert
│   │   └── retention.py        # run_retention_purge() & hourly retention_worker()
│   ├── utils/
│   │   ├── dongle_logger.py    # setup_dongle_logger() -> stdout + rotating storage/logs/dongle.log
│   │   └── timezone.py         # Host/configured ZoneInfo resolution and formatting
│   └── tests/                  # Backend unit & API tests
├── frontend/
│   ├── index.html
│   ├── package.json            # Scripts: dev, build, preview, test
│   ├── tsconfig.json           # Strict TypeScript config (vitest/globals, jest-dom)
│   ├── vite.config.ts          # Dev server on :3000 proxying /api and /ws to 127.0.0.1:8000
│   ├── tailwind.config.js      # Custom CSS-variable color tokens & typography
│   └── src/
│       ├── main.tsx            # React root mount
│       ├── App.tsx             # ThemeProvider -> UiSettingsProvider -> AuthProvider -> MainApp
│       ├── index.css           # Dark/light CSS color variables & design tokens
│       ├── setupTests.ts       # jsdom mocks (Canvas 2D, AudioContext, HTMLMediaElement, storage, jest alias)
│       ├── audio/WebAudioPlayer.ts
│       ├── context/            # AuthContext.tsx, ThemeContext.tsx, UiSettingsContext.tsx
│       ├── components/         # DashboardLayout, TopBar, RadioTuningPanel, LiveSpectrumVisualizer,
│       │                       # TimelineScrubber, PlaybackControls, CallLogPanel, HistoryDatePicker,
│       │                       # SMeterBar, SettingsModal, DongleConfigModal, NoDeviceModal, LoginView
│       └── __tests__/          # Vitest component & context test suites
├── tests/
│   └── e2e/test_full_system.py # End-to-end API, recording persistence, HTTP 206, and retention test
├── scripts/start.sh            # Unified launcher (.venv check, optional frontend build, backend/run.py)
├── docs/                       # Logo asset and design specs/plans under docs/superpowers/
├── supabase.md                 # Visual design token reference (Obsidian / Ash / Charcoal / Phosphor Green)
├── pytest.ini                  # pythonpath = ., asyncio_mode = auto
├── requirements.txt            # Backend runtime dependencies
├── .env.example                # Environment variable template (no real secrets)
├── Dockerfile                  # Multi-stage production container build
└── docker-compose.yml          # Production compose service definition
```

Runtime data (gitignored) is written under `SDR_STORAGE_DIR` (default `./storage`):
- `storage/sdr_recorder.db` (SQLite WAL database)
- `storage/recordings/YYYY-MM-DD/ch_<freq>_<YYYYMMDD_HHMMSS>.<ext>`
- `storage/logs/dongle.log` (rotating log, 5 MB max, 3 backups)

---

## 3. Entry Points & Core Workflows

### Entry Points
- **Full app (backend + built static SPA):** `python backend/run.py [--host 0.0.0.0] [--port 8000] [--reload] [--reset-password]` or `./scripts/start.sh`.
- **ASGI app / factory:** `backend.main:create_app` / `backend.main:app` (API only) and `backend.run:create_app_factory` (API + `frontend/dist` SPA fallback).
- **Frontend dev server:** `frontend/src/main.tsx` via `npm run dev` (port `3000`, proxies `/api` and `/ws` to `http://127.0.0.1:8000`).
- **Docker container:** `CMD ["python3", "backend/run.py", "--host", "0.0.0.0", "--port", "8000"]`.

### Main Runtime Workflows
1. **Startup & Lifespan (`backend/main.py`):**
   - Configures `dongle_logger`, runs `init_db()`, loads `radio_config` (`id = 1`), and instantiates `SDRReceiver` + WebSocket `ConnectionManager`.
   - When `test_mode=False`, lifespan starts the hourly `retention_worker` task and `receiver.start()`.
2. **SDR Ingest & DSP Pipeline (`backend/sdr/receiver.py`, `backend/dsp/*`):**
   - Probes dongle availability via `rtl_test -d <device_index> -t` and spawns `rtl_fm` streaming 16-bit signed mono 24 kHz PCM over stdout in 50 ms chunks.
   - If hardware disconnects/EOF occurs, `SDRReceiver` marks `is_hardware_connected = False`, clears active capture state without crashing, emits silence telemetry, and polls every ~1.5 s to respawn `rtl_fm` on reconnect.
   - Each chunk passes through `VoiceBandpassFilter` (300–3200 Hz) then `SquelchEvaluator`: buffers pre-roll in `AudioRingBuffer` while `CLOSED`, opens with pre-roll when RSSI meets `squelch_threshold`, holds for `hang_time_ms` during `CLOSING`, enforces `max_transmission_sec`, and suppresses short bursts below `min_speech_duration_ms`.
3. **Persistence & Retention (`backend/storage/*`):**
   - On transmission completion, `save_transmission()` normalizes voice audio, writes a WAV file, optionally converts to `.opus`/`.mp3` via `ffmpeg`, stores it under `recordings/YYYY-MM-DD/` in the configured server timezone, and inserts a row into `transmissions`.
   - `retention_worker` runs `run_retention_purge()` hourly to delete unstarred (`is_starred = 0`) recordings past `retention_days` or FIFO-evict unstarred files when disk usage exceeds `max_disk_usage_percent`. Starred recordings (`is_starred = 1`) are never purged.
4. **REST API, WebSocket & Web UI (`backend/routers/*`, `frontend/src/*`):**
   - REST endpoints under `/api/auth`, `/api/radio`, `/api/recordings`, and `/api/system` require Bearer JWT auth via `get_current_user` (except `/api/auth/login` and `/api/health`).
   - `/api/recordings/{id}/audio` supports HTTP `Range` (`206 Partial Content`) for scrubbing and `?download=true` for attachments.
   - `/ws/live` pushes ~10 Hz JSON telemetry (`rssi_dbfs`, `squelch_open`, `recording`, `state`, `frequency_hz`, `modulation`, `hardware_connected`) and binary PCM chunks when squelch is open or the client enables `unsquelched: true`.
   - Frontend renders `LoginView` until authenticated, then `DashboardLayout` connecting live WebSocket telemetry/audio, 24h Canvas `TimelineScrubber`, `LiveSpectrumVisualizer`, `WebAudioPlayer`, `CallLogPanel`, and `SettingsModal`.

---

## 4. Standard Commands

### System Prerequisites (Linux host for real hardware & audio encoding)
```bash
sudo apt-get update && sudo apt-get install -y rtl-sdr ffmpeg python3-venv python3-pip nodejs npm
```
*(Real RTL-SDR USB usage also requires blacklisting `dvb_usb_rtl28xxu` and udev permissions for `0bda:2838` / `0bda:2832`; see `README.md`.)*

### Install Dependencies
- **Backend runtime:**
  ```bash
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  ```
  > **Note:** `requirements.txt` contains runtime packages only. To run the Python test suite in a fresh virtualenv, also install test runners: `pip install pytest pytest-asyncio`.
- **Frontend:**
  ```bash
  cd frontend
  npm install   # or `npm ci` for lockfile-exact install
  ```

### Run Application
- **Unified local/production mode (serves built `frontend/dist` + backend on `:8000`):**
  ```bash
  cd frontend && npm run build && cd ..
  ./scripts/start.sh
  # or: .venv/bin/python backend/run.py --host 0.0.0.0 --port 8000
  ```
- **Development mode (2 terminals with hot reload):**
  ```bash
  # Terminal 1 (backend on :8000)
  source .venv/bin/activate && python backend/run.py --reload

  # Terminal 2 (frontend on :3000, proxies /api and /ws to :8000)
  cd frontend && npm run dev
  ```
- **Docker:**
  ```bash
  docker build -t sdr-recorder:local .
  # or: docker compose up -d
  ```

### Run Tests
- **Backend unit + E2E tests (run from repo root so `pytest.ini` applies):**
  ```bash
  .venv/bin/pytest tests/ backend/tests/ -v
  ```
- **Frontend unit/component tests:**
  ```bash
  cd frontend && npm test -- --run
  ```

### Lint & Typecheck
- **Frontend TypeScript typecheck & production build (`tsc && vite build`):**
  ```bash
  cd frontend && npm run build
  # typecheck only:
  cd frontend && npx tsc --noEmit
  ```
  `frontend/tsconfig.json` enforces `strict`, `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch`.
- **Linters / Python typecheck:** No standalone ESLint/Prettier config or Python linter/typechecker (`ruff`, `flake8`, `mypy`) is configured in this repository.

---

## 5. Rules & Conventions When Modifying Code

1. **Test Isolation (`test_mode=True`):** Always instantiate test apps with `create_app(db_path=..., test_mode=True)` so `retention_worker` and hardware `rtl_fm` subprocesses do not start automatically. Mock `shutil.which`, `subprocess.run`, or `is_hardware_available` when testing hardware paths.
2. **Single-Channel Stability:** Keep the receiver on the single-tuned channel architecture (`backend/sdr/receiver.py`). Multi-frequency hopping / scanner mode was intentionally removed to avoid USB dongle instability.
3. **RF & Preset Validation Parity:** Keep frequency validation synchronized between backend (`backend/routers/radio_router.py`, `backend/models.py`) and frontend (`validateFrequency()` in `frontend/src/components/SettingsModal.tsx`): max `450.000 MHz`; `Airband` `108.000–137.000 MHz`; `Ham` `144–148 MHz` or `420–450 MHz`.
4. **Receiver Dynamic vs Restart Updates:** Updating `pre_roll_ms`, `hang_time_ms`, or recording thresholds (`min_speech_duration_ms`, `max_transmission_sec`, `enable_squelch_tail_suppression`) updates `SDRReceiver` / `SquelchEvaluator` dynamically. Changing RF parameters (`frequency_hz`, `modulation`, `rf_gain`, `gain_mode`, `ppm_offset`, `bias_tee`, `direct_sampling`, `device_index`, `squelch_threshold`) restarts `rtl_fm` via `receiver.update_config()`.
5. **SQLite Schema & Migrations:** No ORM is used. Keep `WAL` mode enabled in `backend/database.py` and handle new columns on existing tables via `PRAGMA table_info(...)` + `ALTER TABLE` guards inside `init_db()`. Use `get_db` FastAPI dependency rather than hardcoding `config.DB_PATH` in routers.
6. **Timezone & Star Protection:** Use `backend/utils/timezone.py` (`get_server_timezone_from_db`, `get_active_timezone`) for recording paths and API date filtering. Never allow retention cleanup to delete rows where `is_starred = 1`.
7. **Dongle Logging (Backend-Only):** `backend.sdr.dongle` (`backend/utils/dongle_logger.py`) logs lifecycle events to `stdout` and `storage/logs/dongle.log`. Do **not** add a `Logs` tab or log-viewer UI to `SettingsModal.tsx` (current tabs: `dongle`, `channels`, `recording`, `storage`, `password`, `interface`).
8. **Frontend UI & Styling Conventions:**
   - All WebUI copy, labels, tooltips, code, and comments must be in **English**.
   - Use the design tokens in `frontend/src/index.css`, `frontend/tailwind.config.js`, and `supabase.md` (`obsidian`, `ash`, `charcoal`, `slate`, `graphite`, `smoke`, `silver-mist`, `snow`, `phosphor-green`, `mint-pulse`, `forest-depth`, `midnight-emerald`), preserving both dark and light theme CSS variables.
   - Keep the unified desktop dashboard layout (all 3 columns + `LiveSpectrumVisualizer` visible simultaneously; no mobile-only tab bars or column hiding), keep `LoginView` inputs empty by default (no credential auto-fill or `->` arrow symbol), and keep the `TopBar` admin menu button icon-only.
   - Respect `frontend/src/setupTests.ts` jsdom mocks when adding browser APIs (Canvas, Web Audio, Storage, Media elements).
9. **SPA Routing Guard:** In `backend/run.py`, unmatched `/api/*` and `/ws/*` paths must continue returning HTTP `404` rather than falling back to `frontend/dist/index.html`.
10. **Secrets & Environment Safety:** Configure `JWT_SECRET`, initial admin credentials, and runtime defaults strictly via environment variables (see `.env.example` and `backend/config.py`). Never commit `.env`, `storage/`, `*.db`, tokens, or real credentials to the repository or documentation.
