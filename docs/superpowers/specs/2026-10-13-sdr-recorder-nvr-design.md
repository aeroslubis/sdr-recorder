# SDR-Recorder NVR — System Design Specification

## 1. Overview & Objectives

**SDR-Recorder** is a radio communications archiving and monitoring platform modeled after **CCTV Network Video Recorders (NVR)**. Rather than continuously capturing gigabytes of static noise, SDR-Recorder selectively records and indexes voice transmissions based on real-time signal squelch evaluation from an **RTL-SDR** software-defined radio receiver.

### Core Capabilities:
* **NVR CCTV-Style Recording:** Automatically detects voice transmissions using a squelch threshold, capturing only active speech and discarding dead air / static noise.
* **Pre-roll & Hang Time Buffering:** An in-memory 500ms audio ring buffer guarantees the first syllable of a radio call (e.g., flight callsigns) is never cut off, while an 800ms hang time prevents fragmented files during natural speech pauses.
* **Single Tuned Channel Architecture:** Focused monitoring of Airband (AM), VHF (NFM/AM), and UHF (NFM) frequencies with low CPU utilization and high audio fidelity.
* **24-Hour Zoomable Timeline Scrubber:** Interactive HTML5 Canvas scrubber providing 24h, 6h, 1h, and 15m zoom levels with Phosphor Green blocks indicating active transmissions.
* **Historical Multi-Day Archive:** Interactive date picker marking active recording days with indicator dots, enabling instant review and scrubbing of past days.
* **Live Audio Listening & Web Audio DSP:** Low-latency (<200ms) audio streaming via WebSockets with an integrated voice bandpass filter (300 Hz – 3000 Hz) and AGC.
* **Hardware SDR Configuration (BrowSDR Reference):** Comprehensive dongle controls accessible via the Admin menu, including PPM crystal calibration, manual/automatic RF gain, Bias-Tee power toggle, direct sampling, and device selection.
* **Supabase Dark Theme UI:** Sleek midnight code-editor aesthetic following `supabase.md` tokens (Obsidian `#121212`, Charcoal `#2e2e2e`, Phosphor Green `#3ecf8e`), entirely in English.
* **Authentication:** Login protection with default credentials `admin` / `12345`.
* **Mock SDR Simulator Mode:** Seamless offline development and automated testing without requiring physical RTL-SDR hardware plugged in.

---

## 2. Technology Stack & System Architecture

### 2.1 Backend Stack
* **Language & Framework:** Python 3.11+ with **FastAPI** and `asyncio`.
* **SDR Ingestion:** `rtl_fm` (or fallback Mock SDR Simulator) streaming 16-bit 24 kHz mono raw PCM audio via standard subprocess pipe.
* **Audio DSP & Squelch Evaluation:** NumPy / Python audio buffer math calculating RMS (dBFS) per 50ms chunk; in-memory circular ring buffer for pre-roll.
* **Audio Encoding & Storage:** FFmpeg / PyAV encoding finished transmissions into compact mono Opus format (`.opus`, 24 kbps) or MP3.
* **Database:** SQLite with **WAL (Write-Ahead Logging)** mode for concurrent high-speed timeline queries and atomic writes.
* **WebSocket:** FastAPI WebSockets for real-time live audio and 10 Hz RSSI/S-Meter telemetry.

### 2.2 Frontend Stack
* **Framework:** React 18 / Vite with TypeScript.
* **Styling:** Tailwind CSS tailored to `supabase.md` color tokens and hairline borders.
* **Timeline Scrubber Engine:** High-performance HTML5 Canvas rendering for 24h timeline ruler and transmission blocks.
* **Audio Playback:** Web Audio API (`AudioContext`, BiquadFilterNode for 300Hz-3kHz bandpass, GainNode) supporting live WebSocket audio and HTTP Range requests for recorded playback.
* **Icons:** Lucide React.
* **Language:** English.

---

## 3. Detailed Data Flow & Ingestion Pipeline

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
| 3. Compare RSSI against User Squelch Threshold (e.g. -42 dBFS):                  |
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
                  Metadata: Insert into SQLite `transmissions` table
```

---

## 4. Hardware SDR Configuration (BrowSDR Integration)

Accessible via the Top Bar `admin ▾` menu under **"SDR Dongle Configuration"**:

1. **Device Index / Serial Number:** Support for selecting target RTL-SDR when multiple dongles are plugged in.
2. **Frequency Calibration (PPM Offset):** Adjustable crystal oscillator frequency correction (-100 to +100 PPM).
3. **RF Gain Settings:**
   * Tuner Gain Mode: `Manual` vs `Auto AGC`.
   * Manual Gain Range: 0.0 dB to 49.6 dB across standard 29 R820T/R828D gain steps.
   * RTL2832 Digital AGC: Toggle ON/OFF.
4. **Hardware Bias-Tee (4.5V DC):** Software toggle to inject DC power on coaxial cable for active antennas or Low Noise Amplifiers (LNAs) (supported on RTL-SDR Blog V3/V4).
5. **Direct Sampling Mode:**
   * `0`: Disabled (Quadrature, normal VHF/UHF operation).
   * `1`: Direct Sampling I-branch (HF reception 0-24 MHz).
   * `2`: Direct Sampling Q-branch.
6. **Sample Rate:** Default 2.048 MS/s (or 1.024 MS/s, 2.4 MS/s).
7. **Audio Engine Tuning:**
   * Pre-roll Buffer Duration: 100 ms – 1000 ms (default: 500 ms).
   * Squelch Hang Time: 200 ms – 2000 ms (default: 800 ms).

---

## 5. WebUI & UX Design (Supabase Dark Theme)

All UI text, labels, dialogs, and messages are in **English**.

### 5.1 Color Tokens & Typography
* **Canvas Background:** Obsidian `#121212`
* **Card & Elevated Surfaces:** Ash `#242424`
* **Borders & Dividers:** Charcoal `#2e2e2e` (hairline 1px)
* **Inputs & Form Controls:** Slate `#393939` border, Ash `#242424` background
* **Primary Accent & CTAs:** Phosphor Green `#3ecf8e`
* **Secondary Accent / Links:** Mint Pulse `#00c573`
* **Typography:**
  * UI Text: `Inter` / System Sans (weights: 400 regular, 500 medium)
  * Numbers, Frequencies & Timestamps: `JetBrains Mono` / Monospace

### 5.2 Application Layout

#### A. Login View (`/login`)
* Centered minimalist card with glowing Phosphor Green radio wave icon.
* Form fields: `Username` and `Password`.
* Pill button: `Sign In ->` in Phosphor Green.
* Subtitle hint: `Default credentials: admin / 12345`.

#### B. Main NVR Dashboard (`/`)
* **Top Bar (Header):**
  * Brand: `[●] SDR-NVR` with subtle green pulse.
  * Active Frequency & Mode Badge: `118.200.000 Hz · AM`.
  * Hardware Status Pill: `● RTL-SDR ONLINE` (or `● SIMULATOR MODE` in amber).
  * Storage Quota Indicator: `DISK: 14.8 GB / 100 GB (15%)` with slim progress bar.
  * User Menu Dropdown: `[admin ▾]` offering:
    * `⚙ SDR Dongle Configuration` (modal)
    * `🗄 Storage & Retention Manager`
    * `🔑 Change Password`
    * `🚪 Sign Out`

* **Left Panel — Radio Tuning & Presets (Width: 280px):**
  * Frequency input with step buttons (`±1 MHz`, `±100 kHz`, `±25 kHz`, `±8.33 kHz`).
  * Modulation selector: `AM (Airband)` | `NFM (VHF/UHF)`.
  * **Interactive S-Meter & Squelch Slider:** Real-time RSSI meter bar (-100 to 0 dBFS) with a draggable squelch indicator line.
  * RF Gain and PPM Offset quick dials.
  * Quick Presets list with category badges (Airband, Marine, Ham) and 1-click tuning.

* **Center Panel — Live Monitor & 24h NVR Timeline (Flex: 1):**
  * **Live Audio Header:**
    * `▶ Unmute Live Audio` toggle, Volume slider, and `Voice DSP Filter (300Hz-3kHz)` toggle.
    * Squelch state badge: `MUTED / QUIET` vs `ACTIVE / RECORDING`.
  * **24-Hour Zoomable Canvas Scrubber:**
    * Timeline navigation: Date label, Zoom buttons (`24h`, `6h`, `1h`, `15m`), and mouse-wheel zoom.
    * Canvas ruler rendering 00:00 to 24:00 with hour ticks and minute intervals.
    * Recorded transmissions displayed as crisp **Phosphor Green (`#3ecf8e`)** blocks with peak intensity variations.
    * Draggable playhead needle with real-time timestamp tooltip.
  * **NVR Playback Controls Bar:**
    * `⏮ Prev Call`, `▶ Play / Pause`, `⏭ Next Call`.
    * Playback speed selector (`1.0x`, `1.25x`, `1.5x`, `2.0x`).
    * `⭳ Export Audio Clip` for downloading the selected transmission or highlighted time range.

* **Right Panel — Call Log & Historical Search (Width: 340px):**
  * **Date Picker Popover:** Calendar view highlighting past days containing recordings with green indicator dots (`●`), plus quick shortcuts (`Yesterday`, `Last 7 Days`).
  * **Search & Filters:** Filter by frequency, duration (>5s), starred items (`★`), or keyword notes.
  * **Transmission Cards List:** Chronological card list showing Start Time, Duration, Frequency, Mode, Peak RSSI, Star button, Quick Play button, and Download button.

---

## 6. Database Schema (`sdr_recorder.db`)

SQLite database initialized in WAL mode:

```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS radio_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    frequency_hz INTEGER NOT NULL DEFAULT 118200000,
    modulation TEXT NOT NULL DEFAULT 'AM',
    squelch_threshold REAL NOT NULL DEFAULT -42.0,
    rf_gain REAL NOT NULL DEFAULT 38.6,
    gain_mode TEXT NOT NULL DEFAULT 'manual', -- 'manual' or 'auto'
    ppm_offset INTEGER NOT NULL DEFAULT 0,
    bias_tee INTEGER NOT NULL DEFAULT 0,      -- 0: Off, 1: On
    direct_sampling INTEGER NOT NULL DEFAULT 0, -- 0: Off, 1: I, 2: Q
    device_index INTEGER NOT NULL DEFAULT 0,
    sample_rate INTEGER NOT NULL DEFAULT 2048000,
    pre_roll_ms INTEGER NOT NULL DEFAULT 500,
    hang_time_ms INTEGER NOT NULL DEFAULT 800,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    frequency_hz INTEGER NOT NULL,
    modulation TEXT NOT NULL,
    squelch_threshold REAL,
    category TEXT DEFAULT 'General',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transmissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    duration_sec REAL NOT NULL,
    frequency_hz INTEGER NOT NULL,
    modulation TEXT NOT NULL,
    peak_rssi_dbfs REAL NOT NULL,
    file_path TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    is_starred INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_transmissions_start ON transmissions(start_time);
CREATE INDEX IF NOT EXISTS idx_transmissions_freq ON transmissions(frequency_hz);
CREATE INDEX IF NOT EXISTS idx_transmissions_starred ON transmissions(is_starred);

CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    retention_days INTEGER NOT NULL DEFAULT 14,
    max_disk_usage_percent INTEGER NOT NULL DEFAULT 90,
    audio_format TEXT NOT NULL DEFAULT 'opus'
);
```

---

## 7. REST & WebSocket API Specification

### 7.1 Authentication
* `POST /api/auth/login`: `{ username, password }` -> `{ token, user: { id, username } }`
* `GET /api/auth/me`: Validates session token.
* `POST /api/auth/logout`: Invalidates session.
* `POST /api/auth/change-password`: `{ old_password, new_password }`.

### 7.2 Radio Control & Tuning
* `GET /api/radio/status`: Returns current tuning, hardware status, and live RSSI.
* `POST /api/radio/tune`: `{ frequency_hz, modulation, squelch_threshold, rf_gain, gain_mode, ppm_offset }`.
* `POST /api/radio/dongle-config`: Full hardware reconfiguration (Bias-T, PPM, direct sampling, sample rate, buffers).
* `GET /api/radio/presets`: Returns list of saved channel presets.
* `POST /api/radio/presets`: `{ name, frequency_hz, modulation, squelch_threshold, category }`.
* `DELETE /api/radio/presets/{id}`: Deletes a preset.

### 7.3 NVR Playback & Archive
* `GET /api/recordings/timeline?date=YYYY-MM-DD`: Returns array of transmission intervals `[{ id, start_ms, end_ms, peak_rssi, duration_sec }]` for instant 24h canvas scrubber rendering.
* `GET /api/recordings/active-dates?month=YYYY-MM`: Returns array of dates `['2026-10-07', '2026-10-08', ...]` containing recordings (for calendar indicator dots).
* `GET /api/recordings`: Filtered paginated calls `?date=YYYY-MM-DD&frequency=&starred=&limit=50&offset=0`.
* `GET /api/recordings/{id}/audio`: Serves audio file with `Accept-Ranges: bytes` support.
* `POST /api/recordings/{id}/star`: Toggles `is_starred` (protects from auto-retention purge).
* `POST /api/recordings/{id}/notes`: Updates call note/tag.
* `DELETE /api/recordings/{id}`: Manually deletes a transmission and its audio file.

### 7.4 System & Telemetry
* `GET /api/system/stats`: Hardware status (RTL-SDR connected / simulator), CPU usage, RAM usage, storage usage (total/used/free), and active recording state.

### 7.5 WebSocket Live Stream (`/ws/live`)
* Server pushes:
  * Telemetry frames at 10 Hz: `{"type": "telemetry", "rssi_dbfs": -38.2, "squelch_open": true, "recording": true}`
  * Binary PCM/Opus audio chunks when squelch is open (or client forces un-squelched monitor).

---

## 8. NVR Storage Retention Engine

A background asyncio task runs hourly to enforce storage quotas:
1. Calculates storage disk utilization percentage.
2. Identifies unstarred recordings older than `retention_days` and deletes their audio files and database records.
3. If disk usage still exceeds `max_disk_usage_percent` (e.g. 90%), continuously deletes the oldest unstarred transmissions in FIFO order until disk usage drops below 80%.
4. Starred transmissions (`is_starred = 1`) are strictly protected from automatic deletion.

---

## 9. Mock SDR Simulator Mode

To ensure effortless development, automated test execution, and CI/CD without hardware:
* The backend inspects whether an RTL-SDR dongle is physically accessible via USB (`rtl_test`).
* If no dongle is present, the engine automatically engages **Mock SDR Simulator Mode**:
  * Emulates real RF noise floor around -65 dBFS.
  * Periodically synthesizes simulated radio transmissions (bursts of voice traffic with simulated pilot/tower calls, tone bursts, and signal peaks between -25 and -38 dBFS).
  * Exercises the exact same squelch evaluator, pre-roll ring buffer, SQLite recording pipeline, WebSocket stream, and canvas scrubber as genuine hardware.
  * The UI displays an amber badge: `● SIMULATOR MODE`.

---

## 10. Testing & Verification Plan

1. **Unit Tests (`pytest`):**
   * Squelch RMS calculator and dBFS conversion accuracy.
   * Pre-roll circular ring buffer push/flush edge cases (underflow/overflow).
   * Password hashing (bcrypt) and default admin credential authentication.
   * Auto-retention FIFO cleanup and starred call preservation logic.
2. **Integration Tests:**
   * API endpoints: login, radio tuning, preset management, timeline queries.
   * Range-header audio playback endpoint validation.
   * WebSocket telemetry and audio streaming packets.
3. **Frontend E2E / Component Verification:**
   * Login flow with `admin` / `12345`.
   * Canvas timeline scrubber rendering across multiple zoom levels.
   * Date picker navigation and historical call retrieval.
   * Squelch threshold draggable slider interaction.
   * SDR Dongle Configuration modal updates.
