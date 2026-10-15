# SDR-Recorder NVR

<p align="center">
  <img src="docs/assets/logo.jpg" alt="SDR-Recorder Logo" width="220" style="border-radius: 20px; box-shadow: 0 4px 20px rgba(62, 207, 142, 0.25);" />
</p>

<h1 align="center">SDR-Recorder NVR</h1>

<p align="center">
  <strong>CCTV Network Video Recorder (NVR) architecture applied to Radio Communications.</strong><br>
  Continuous 24/7 radio monitoring, intelligent squelch indexing, real-time spectrum analysis, and historical playback for Airband & VHF/UHF.
</p>

<p align="center">
  <a href="https://fastapi.tiangolo.com"><img src="https://img.shields.io/badge/FastAPI-0.110+-009688.svg?logo=fastapi" alt="FastAPI"></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-18.x-61DAFB.svg?logo=react" alt="React"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?logo=typescript" alt="TypeScript"></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/TailwindCSS-3.x-38B2AC.svg?logo=tailwind-css" alt="Tailwind CSS"></a>
  <a href="https://www.docker.com"><img src="https://img.shields.io/badge/Docker-Enabled-2496ED.svg?logo=docker" alt="Docker"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-3ecf8e.svg" alt="License: MIT"></a>
</p>

---

## Table of Contents

- [Overview & Architecture](#overview--architecture)
- [Key Features](#key-features)
- [Default Credentials](#default-credentials)
- [Quickstart Setup & Commands](#quickstart-setup--commands)
- [Deploy to VPS with Docker](#deploy-to-vps-with-docker)
- [Hardware SDR Configuration](#hardware-sdr-configuration)
- [24-Hour Timeline Scrubber & Continuous Playback](#24-hour-timeline-scrubber--continuous-playback)
- [Mock SDR Simulator Mode](#mock-sdr-simulator-mode)
- [Storage Auto-Retention Engine](#storage-auto-retention-engine)
- [API Reference](#api-reference)
- [Automated Testing](#automated-testing)

---

## Overview & Architecture

Traditional SDR tools either record continuous raw baseband IQ data (wasting gigabytes per minute of static noise) or stream unbuffered audio directly to speakers. **SDR-Recorder** treats radio monitoring like modern surveillance CCTV / NVR systems:

```
+-----------------------------------------------------------------------------------+
| RTL-SDR Dongle (USB) OR Mock SDR Simulator (Looping Radio WAV with RF noise floor) |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼ Subprocess Pipe
                         `rtl_fm -f <freq> -M <am|fm> -s 24k`
                                         │ Raw PCM 16-bit 24kHz Mono (50ms chunks)
                                         ▼
+-----------------------------------------------------------------------------------+
| AUDIO & SQUELCH PROCESSING PIPELINE (Python Async Engine)                         |
|                                                                                   |
| 1. Compute RMS Power: RSSI_dBFS = 20 * log10(RMS / 32768.0)                      |
| 2. Broadcast RSSI & Squelch state to WebSocket (/ws/live) at 10 Hz                |
| 3. Compare RSSI against Squelch Threshold (Manual or Auto-Squelch Calibrated):    |
|                                                                                   |
|    [ Squelch CLOSED: RSSI < Threshold ]                                           |
|    - Append audio chunk to In-Memory Circular Pre-Roll Buffer (Capacity: 500ms)  |
|    - If active recording was in progress:                                        |
|      - Decrement Hang Time Counter (800ms)                                        |
|      - When Hang Time expires -> Finalize file write & register to SQLite         |
|                                                                                   |
|    [ Squelch OPEN: RSSI >= Threshold ]                                            |
|    - If new transmission:                                                         |
|      - Flush 500ms Pre-Roll Buffer into new Audio File stream                     |
|      - Reset Hang Time Counter to 800ms                                           |
|      - Record transmission start_time & peak RSSI                                 |
|    - Write current audio chunk to active file stream                              |
|    - If Live Audio Listener is connected -> push audio chunk to WebSocket client  |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼ Finalized Transmission
                  Audio File: `storage/recordings/YYYY-MM-DD/ch_<id>_<ts>.opus`
                  Metadata: Insert into SQLite `transmissions` table (WAL Mode)
```

### Core Architecture Components

1. **RTL-SDR Subprocess Ingest Engine:** Reads 16-bit 24 kHz mono raw PCM audio stream from `rtl_fm`. Automatically falls back to internal Mock SDR Simulator when hardware is unplugged.
2. **DSP Squelch Evaluator:** Evaluates signal root-mean-square (RMS) power in 50ms windows, converting to dBFS (-100 to 0 dBFS). Includes 1-click **Auto-Squelch** hardware noise calibration.
3. **In-Memory Pre-Roll Ring Buffer:** Thread-safe circular buffer holding 500ms (configurable 100ms - 1000ms) of pre-squelch audio. When squelch opens, pre-roll audio is prepended to the recording to guarantee callsigns and initial syllables are never truncated.
4. **Hang Time Tail Buffer:** Holds squelch open for 800ms after signal drops below threshold to avoid file fragmentation during natural speech pauses.
5. **SQLite WAL Mode Database:** High-performance database with Write-Ahead Logging (`PRAGMA journal_mode = WAL`) enabling concurrent reading and writing without database locks.
6. **Supabase Dark Theme Web UI:** Responsive UI crafted according to modern dark theme design tokens (Obsidian `#121212`, Charcoal `#2e2e2e`, Phosphor Green `#3ecf8e`).

---

## Key Features

- **Automated Squelch & Zero-Truncation Recording:** Discards dead air; indexes active transmissions into chronological call logs with pre-roll audio buffers.
- **One-Click Auto-Squelch Calibration:** Automatically samples active channel noise floor and sets optimal squelch threshold (+6 dB above noise floor) with manual override anytime.
- **Live SDR Spectrum Visualizer:** Real-time audio spectrum analyzer positioned directly above the timeline for immediate visual feedback of active radio traffic.
- **24-Hour Zoomable Canvas Timeline Scrubber:** High-performance HTML5 Canvas renderer displaying 24-hour days with zoom presets (`24h`, `6h`, `1h`, `15m`), wheel zoom, playhead dragging, and Phosphor Green transmission blocks.
- **Chronological Playback & Continuous Auto-Play:**
  - Transport bar with **Next (`⏭`)** and **Prev (`⏮`)** navigation that advances chronologically forward and backward in time.
  - Pressing the main **Play (`▶`)** button enables continuous auto-play, seamlessly advancing to the next call in the archive once the current call finishes.
- **Instant Stop Button in Call History:** Right sidebar call log allows instant stop (`■`) of any currently playing transmission without waiting for audio completion.
- **Historical Multi-Day Calendar Picker:** Interactive calendar popover highlighting days that contain recorded transmissions with phosphor green dots (`●`).
- **Web Audio DSP Voice Filter:** Client-side 300 Hz – 3000 Hz Biquad bandpass filter to eliminate low-frequency hum and high-frequency static hiss.
- **Unified Multi-Tab Settings Modal:** Consolidated management of SDR Dongle parameters (PPM, Gain, Bias-T, Direct Sampling), Channel Presets, Storage Quotas, and Admin Password.
- **Real-Time Storage & Server Health:** Single-line storage capacity indicator connected directly to real filesystem metrics, plus host-synchronized timezone clock.
- **Star Protection & Auto-Retention:** Background retention worker automatically prunes expired recordings or FIFO frees space when disk exceeds quota, while starred calls remain protected forever.

---

## Default Credentials

The system initializes an admin account upon first boot:

| Field | Value |
|---|---|
| **Username** | `admin` |
| **Password** | `12345` |

> *Tip: You can change the admin password at any time via the user menu in the top right corner (`admin ▾` -> Settings -> Password).*

---

## Quickstart Setup & Commands

### Prerequisites

- Linux or macOS
- Python 3.11+
- Node.js 18+ & npm
- `rtl_fm` (from `rtl-sdr` package) and `ffmpeg`

```bash
# Ubuntu / Debian
sudo apt-get update
sudo apt-get install -y rtl-sdr ffmpeg python3-venv nodejs npm
```

### Installation & Launch

1. **Clone the repository:**
   ```bash
   git clone https://github.com/aeroslubis/sdr-recorder.git
   cd sdr-recorder
   ```

2. **One-Command Startup:**
   ```bash
   ./scripts/start.sh
   ```
   *This script verifies the Python virtual environment, compiles the frontend bundle, and launches the server on `http://localhost:8000`.*

3. **Development Mode (Separate Frontend & Backend):**
   ```bash
   # Terminal 1: Backend
   source .venv/bin/activate
   python backend/run.py --reload --simulator

   # Terminal 2: Frontend (Vite Dev Server)
   cd frontend
   npm run dev
   ```

---

## Deploy to VPS with Docker

Deploying to a Linux VPS with Docker and Docker Compose takes only 2 steps:

### 1. Prerequisites on VPS

Ensure Docker and Docker Compose are installed:
```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2
```

*(Optional - if physical RTL-SDR dongle is plugged into VPS)*: Prevent the Linux kernel DVB-T driver from claiming the dongle:
```bash
echo 'blacklist dvb_usb_rtl28xxu' | sudo tee /etc/modprobe.d/blacklist-rtlsdr.conf
sudo rmmod dvb_usb_rtl28xxu 2>/dev/null || true
```

### 2. Configure & Start

```bash
# Clone the repository
git clone https://github.com/aeroslubis/sdr-recorder.git
cd sdr-recorder

# Build and start container in detached mode
docker compose up -d --build
```

### 3. Verification & Monitoring

```bash
# Check container status
docker compose ps

# View live container logs
docker compose logs -f

# Check health endpoint
curl http://localhost:8000/api/health
```

The application will be accessible at `http://<your-vps-ip>:8000` with default credentials `admin` / `12345`. All database data and audio recordings are persisted in `./storage` on the host.

---

## Hardware SDR Configuration

SDR-Recorder includes extensive hardware controls accessible via **`admin ▾` -> Settings -> Dongle Configuration**:

- **Device Selection:** Auto-detects connected RTL2832U devices (`Device 0: Realtek...`).
- **Frequency Calibration (PPM Offset):** Crystal oscillator error correction (-100 to +100 PPM).
- **RF Gain Modes:**
  - `Manual`: Fine-grained selection from 0.0 dB to 49.6 dB across standard R820T/R828D gain stages.
  - `Auto AGC`: Automatic Gain Control managed by RTL-SDR tuner.
- **RTL2832 Digital AGC:** Toggles digital automatic gain stage in the demodulator.
- **Hardware Bias-Tee (4.5V DC):** Software toggle to supply phantom power over coaxial cable for active GPS/LNA antennas (supported on RTL-SDR Blog V3/V4).
- **Direct Sampling Modes:**
  - `0`: Disabled (Quadrature, VHF/UHF reception).
  - `1`: Direct Sampling I-branch (HF reception 0 - 24 MHz).
  - `2`: Direct Sampling Q-branch.
- **Audio Engine Buffers:**
  - **Pre-Roll Duration:** 100 ms to 1000 ms (default: 500 ms).
  - **Squelch Hang Time:** 200 ms to 2000 ms (default: 800 ms).

---

## 24-Hour Timeline Scrubber & Continuous Playback

The timeline scrubber renders 24 hours of recorded activity onto an HTML5 Canvas:
- **Navigation & Scrubbing:** Click or drag anywhere along the timeline ruler to reposition the playhead.
- **Zoom Presets:**
  - `24h`: Full day overview.
  - `6h`: 6-hour quadrant inspection.
  - `1h`: Hourly breakdown of busy flight corridors or shift handovers.
  - `15m`: High-resolution call-by-call view.
- **Interactive Call Blocks:** Transmission blocks highlight in Phosphor Green (`#3ecf8e`). Clicking any block immediately seeks the playhead and loads the transmission for playback.
- **Continuous Auto-Play:** Pressing the bottom Play button initiates continuous playback through historical calls chronologically.
- **Instant Call Stop:** History call cards feature an active Stop button (`■`) for immediate interruption.
- **Audio Seeking with HTTP 206 Partial Content:** Native `Range: bytes=start-end` support enables instantaneous seeking without buffering entire files.

---

## Mock SDR Simulator Mode

No RTL-SDR hardware? No problem. SDR-Recorder includes an integrated **Mock SDR Simulator**:

- Generates realistic Gaussian RF noise floor at `-65 dBFS`.
- Synthesizes periodic airband/radio speech bursts at `-25 to -38 dBFS` with human voice formant harmonics (300 Hz – 2.5 kHz) and syllabic amplitude modulation.
- To force simulator mode:
  ```bash
  python backend/run.py --simulator
  # Or via environment variable:
  export SDR_FORCE_SIMULATOR=1
  ./scripts/start.sh
  ```
- If no RTL-SDR device is detected on USB upon launch, the system automatically falls back to Simulator Mode seamlessly without crashing.

---

## Storage Auto-Retention Engine

To prevent disk saturation during months of unattended 24/7 monitoring, a background worker runs hourly:
1. **Expiration Purge:** Deletes unstarred recordings older than `retention_days` (default: 14 days).
2. **Quota FIFO Purge:** If disk usage exceeds `max_disk_usage_percent` (default: 90%), older unstarred files are pruned in FIFO order until disk utilization drops below 80%.
3. **Star Protection:** Starred transmissions (`is_starred = 1`) are locked and exempt from automated cleanup.

---

## API Reference

### Authentication
- `POST /api/auth/login`: Authenticate with username and password, returns JWT token.
- `GET /api/auth/me`: Get current authenticated user details.
- `POST /api/auth/logout`: Revoke active session token.
- `POST /api/auth/change-password`: Update account password.

### Radio Tuning & Hardware
- `GET /api/radio/status`: Current frequency, modulation, squelch, and hardware metrics.
- `POST /api/radio/tune`: Adjust frequency, modulation, squelch threshold, or gain.
- `POST /api/radio/auto-squelch`: Trigger automated RF noise floor calibration.
- `POST /api/radio/dongle-config`: Configure PPM, Bias-T, Direct Sampling, and pre-roll buffers.
- `GET /api/radio/presets`: List saved channel presets.
- `POST /api/radio/presets`: Save a new frequency preset.
- `PUT /api/radio/presets/{id}`: Update an existing frequency preset.
- `DELETE /api/radio/presets/{id}`: Delete a saved preset.

### NVR Recordings & Archive
- `GET /api/recordings/timeline?date=YYYY-MM-DD`: Transmission intervals for canvas scrubber.
- `GET /api/recordings/active-dates?month=YYYY-MM`: Calendar dates with recorded calls.
- `GET /api/recordings`: Filtered paginated call log.
- `GET /api/recordings/{id}/audio`: Audio file stream (supports HTTP 206 Partial Content).
- `GET /api/recordings/{id}/download`: Download transmission audio file.
- `POST /api/recordings/{id}/star`: Toggle star protection against retention deletion.
- `POST /api/recordings/{id}/notes`: Update call notes/callsigns.
- `DELETE /api/recordings/{id}`: Permanently delete transmission and audio file.

### System & Live Telemetry
- `GET /api/system/stats`: Hardware status, CPU load, RAM usage, storage metrics.
- `GET /api/system/devices`: List detected USB RTL-SDR devices.
- `GET /api/system/time`: Host server time and timezone info.
- `WS /ws/live`: Real-time 10 Hz RSSI telemetry and live unsquelched audio streaming.

---

## Automated Testing

Run the complete test suite across backend unit tests, frontend components, and end-to-end integration:

```bash
# 1. Run all Python unit & E2E integration tests
.venv/bin/pytest tests/ backend/tests/ -v

# 2. Run React frontend Vitest suite
cd frontend && npm test -- --run
```
