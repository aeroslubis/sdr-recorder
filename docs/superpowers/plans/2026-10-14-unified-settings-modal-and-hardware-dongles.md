# Unified Settings Modal, Dongle Enumeration, Read-Only Frequency & Live SDR Visualizer Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement RTL-SDR hardware device enumeration, unified multi-tab Settings Modal (Dongle, Channel Setup, Storage, Password), clean read-only frequency display (without badge indicator), channel preset 3-dots popup menu (Edit/Activate/Delete), active recording label (`● RECORDING`), and a BrowSDR-inspired live SDR spectrum visualizer (spectrum only, no waterfall) above the 24h timeline scrubber.

**Architecture:** 
1. **Backend Device Probe & Settings API:** Add hardware device probe utility `get_available_devices()` in `backend/sdr/receiver.py` parsing `rtl_test -t` output into detected device records (with fallback to Virtual Simulator), expose `GET /api/radio/devices`, and create `GET` / `POST` endpoints for `/api/system/settings`.
2. **Read-Only Frequency & Preset 3-Dots Action Menu (Edit / Activate / Delete):** Update `RadioTuningPanel` so the main tuned frequency is strictly read-only with clean typography (no step increment/decrement buttons and no cluttering badge indicators). In the channel preset list, remove the "+ Add Preset" button and inline trash icons, replacing them with a 3-dots action button (`⋮`) opening a popup menu with `Edit`, `Activate` (`Aktif`), and `Delete`. Add a prominent `● RECORDING` indicator on the channel currently tuned and recording.
3. **Live BrowSDR-style SDR Spectrum Visualizer:** Create `LiveSpectrumVisualizer.tsx` positioned directly above the 24h timeline scrubber. Connect it to the audio analysis engine (`AnalyserNode` in `WebAudioPlayer`) and WebSocket live telemetry (`liveRssi`, `squelchOpen`), rendering real-time voice FFT frequency bars in Supabase phosphor green (`#3ecf8e`) without waterfall.
4. **Unified Multi-Tab Settings Modal:** Create `SettingsModal.tsx` consolidating all configuration into a single dialog with 4 tabs:
   - `Dongle`: Connected USB dongle selector (from `/api/radio/devices`), PPM crystal offset, RF gain slider/AGC, Bias-Tee toggle, direct sampling, sample rate, and squelch pre-roll/hang-time buffers.
   - `Channel Setup`: Channel presets list management (add, edit frequency & modulation, delete).
   - `Storage`: Retention days slider, maximum disk quota percentage, audio recording format picker, and disk usage gauge.
   - `Password`: Change admin password form with current password validation and matching checks.
5. **TopBar & DashboardLayout Integration:** Connect all TopBar admin menu items (`Dongle`, `Channel Setup`, `Storage & Retention`, `Password`) to open `SettingsModal` directly to the selected tab. Clean TopBar hardware indicator pill to remove duplicate white bullet.

**Tech Stack:** Python FastAPI, SQLite (WAL mode), React 18, TypeScript, Tailwind CSS (`supabase.md` tokens), Web Audio API (`AnalyserNode`), HTML5 Canvas, Vitest, Pytest.

**Spec:** [docs/superpowers/specs/2026-10-13-sdr-recorder-nvr-design.md](file:///home/aeros/workspace/agy/sdr-recorder/docs/superpowers/specs/2026-10-13-sdr-recorder-nvr-design.md)

---

## Global Constraints

- **Theme & Design Tokens:** Strictly adhere to `supabase.md` dark midnight tokens:
  - Canvas background: Obsidian `#121212`
  - Cards & panels: Ash `#242424`
  - Borders: Charcoal `#2e2e2e` (1px hairline)
  - Inputs & borders: Slate `#393939`
  - Accent / Primary: Phosphor Green `#3ecf8e` & Mint Pulse `#00c573`
  - Text: Snow `#fafafa`, Silver Mist `#b4b4b4`, Smoke `#898989`
- **UI Language:** All UI text, tabs, tooltips, buttons, and notifications must be in **English**.
- **Clean Frequency Readout:** The tuned frequency on the main dashboard must be strictly read-only (no manual editing, no stepping buttons) to protect ongoing recordings. **Do NOT display a badge indicator** (e.g. no `[🔒 RECORDING LOCKED]` badge) on the frequency display.
- **Preset Active Indicator & 3-Dots Action Menu:** In the channel presets list, remove "+ Add Preset" and direct trash buttons. Each card has a 3-dots button opening a popup menu (`Edit`, `Activate` / `Aktif`, `Delete`). The channel currently being recorded displays a clear `● RECORDING` label in phosphor green.
- **SDR Live Visualizer:** Real-time audio spectrum visualizer (spectrum only, no waterfall) placed directly above the 24h timeline scrubber, reacting to live speech transmissions.
- **Single Hardware Indicator:** TopBar hardware status displays a single colored pulsing dot without duplicate white bullet text.
- **Unified Settings Modal:** All settings are housed in a single modal with 4 tabs: `Dongle`, `Channel Setup`, `Storage`, and `Password`.
- **Safe Device Probe:** Subprocess execution of `rtl_test -t` must have a timeout of 1.5s to avoid blocking if a hardware dongle is busy or unplugged.
- **Professional Branding (No NVR / CCTV):** Remove all "NVR" and "CCTV" labels/branding from the entire application UI (TopBar brand, login page, page titles, aria labels). Rebrand cleanly as **SDR Recorder** for an elegant, professional radio communications monitoring tool.

---

## Task Breakdown

### Task 1: Backend RTL-SDR Device Enumeration & System Settings API

**Files:**
- Modify: `backend/sdr/receiver.py`
- Modify: `backend/routers/radio_router.py`
- Modify: `backend/routers/system_router.py`
- Test: `backend/tests/test_devices_settings.py`

**Interfaces:**
- Produces:
  - `get_available_devices() -> List[Dict[str, Any]]`: Returns list of detected SDR dongles, e.g. `[{"index": 0, "name": "Realtek RTL2838UHIDIR SN: 00000001", "available": true}]`. If no hardware is detected or `rtl_test` is missing, returns `[{"index": 0, "name": "Mock SDR Simulator (Virtual)", "available": true}]`.
  - `GET /api/radio/devices`: Returns detected hardware devices list.
  - `GET /api/system/settings`: Returns `{ retention_days: int, max_disk_usage_percent: int, audio_format: str }`.
  - `POST /api/system/settings`: Updates retention settings in SQLite database `system_settings` table.

- [ ] **Step 1: Write failing test for device enumeration and system settings API**

```python
# backend/tests/test_devices_settings.py
import pytest
from fastapi.testclient import TestClient
from backend.main import create_app
from backend.sdr.receiver import get_available_devices

def test_get_available_devices_returns_list():
    devices = get_available_devices()
    assert isinstance(devices, list)
    assert len(devices) >= 1
    assert "index" in devices[0]
    assert "name" in devices[0]

def test_system_settings_api(tmp_path):
    test_db = str(tmp_path / "test_settings.db")
    app = create_app(db_path=test_db, force_simulator=True, test_mode=True)
    with TestClient(app) as client:
        # Login
        login_res = client.post("/api/auth/login", json={"username": "admin", "password": "12345"})
        token = login_res.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # GET devices
        dev_res = client.get("/api/radio/devices", headers=headers)
        assert dev_res.status_code == 200
        devices = dev_res.json()
        assert isinstance(devices, list)
        assert len(devices) >= 1

        # GET settings
        get_res = client.get("/api/system/settings", headers=headers)
        assert get_res.status_code == 200
        assert "retention_days" in get_res.json()

        # POST settings
        update_res = client.post(
            "/api/system/settings",
            json={"retention_days": 30, "max_disk_usage_percent": 85, "audio_format": "opus"},
            headers=headers
        )
        assert update_res.status_code == 200
        assert update_res.json()["retention_days"] == 30
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest backend/tests/test_devices_settings.py -v`
Expected: FAIL (ImportError / 404 Not Found)

- [ ] **Step 3: Implement device probe parser in `receiver.py` and settings routes in `radio_router.py` & `system_router.py`**

Parse `Found N device(s)` lines from `rtl_test -t` with regex. Fallback to simulator device if none found. Expose `GET /api/radio/devices` and `GET`/`POST` `/api/system/settings`.

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest backend/tests/test_devices_settings.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/sdr/receiver.py backend/routers/radio_router.py backend/routers/system_router.py backend/tests/test_devices_settings.py
git commit -m "feat(backend): add sdr device enumeration and system settings api"
```

---

### Task 2: Clean Read-Only Frequency & Preset 3-Dots Action Menu (Edit / Activate / Delete)

**Files:**
- Modify: `frontend/src/components/RadioTuningPanel.tsx`
- Modify: `frontend/src/__tests__/RadioTuningPanel.test.tsx`

**Interfaces:**
- Produces `RadioTuningPanel` where:
  - Tuned frequency is displayed as clean read-only typography (e.g. `118.200.000 Hz` / `118.2000 MHz`).
  - No stepping buttons (`-1M`, `+1M`, `-25k`, etc.) and no inline frequency editing form.
  - **No badge indicator** on the frequency display (clean typography).
  - Presets list:
    - **No "+ Add Preset" button** in the panel header.
    - **No direct trash/delete icon** on preset cards.
    - Each preset card displays a 3-dots action button (`⋮` / `MoreVertical`).
    - Clicking the 3-dots button opens a popup dropdown menu with 3 options:
      1. `Edit`: Opens edit preset dialog/inline form to modify name, frequency, modulation, squelch threshold, and category.
      2. `Activate` (`Aktif`): Tunes and activates this preset as the active channel currently being recorded.
      3. `Delete`: Deletes the preset.
    - The active channel being recorded renders a distinct `● RECORDING` indicator badge in phosphor green.
  - Squelch slider and S-meter remain interactive for live sensitivity adjustment.

- [ ] **Step 1: Write failing test in `RadioTuningPanel.test.tsx`**

```tsx
// frontend/src/__tests__/RadioTuningPanel.test.tsx
test('displays clean read-only frequency without badge, hides add/trash buttons, and renders 3-dots menu with Edit/Activate/Delete', () => {
  const onTune = jest.fn();
  const onDeletePreset = jest.fn();
  render(
    <RadioTuningPanel
      frequencyHz={118200000}
      modulation="AM"
      squelchThreshold={-42.0}
      onTune={onTune}
      onDeletePreset={onDeletePreset}
      presets={[
        { id: 1, name: 'Haneda Tower', frequency_hz: 118200000, modulation: 'AM', category: 'Airband' },
        { id: 2, name: 'Tokyo Approach', frequency_hz: 119100000, modulation: 'AM', category: 'Airband' },
      ]}
    />
  );
  // Frequency displayed cleanly
  expect(screen.getByText(/118.200.000 Hz/i)).toBeInTheDocument();
  // No step buttons
  expect(screen.queryByText(/\+1M/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/-1M/i)).not.toBeInTheDocument();
  // No badge indicator on frequency display
  expect(screen.queryByText(/RECORDING LOCKED/i)).not.toBeInTheDocument();
  // No Add Preset button and no direct trash icons
  expect(screen.queryByText(/Add Preset/i)).not.toBeInTheDocument();
  expect(screen.queryByTitle(/Delete preset/i)).not.toBeInTheDocument();
  // Active preset has RECORDING label
  expect(screen.getByText(/● RECORDING/i)).toBeInTheDocument();

  // 3-dots menu button exists
  const moreBtns = screen.getAllByRole('button', { name: /Channel options/i });
  expect(moreBtns.length).toBeGreaterThan(0);
  fireEvent.click(moreBtns[1]); // click 3-dots on Tokyo Approach

  // Popup options appear: Edit, Activate, Delete
  expect(screen.getByText(/Edit/i)).toBeInTheDocument();
  expect(screen.getByText(/Activate|Aktif/i)).toBeInTheDocument();
  expect(screen.getByText(/Delete/i)).toBeInTheDocument();

  // Clicking Activate calls onTune
  fireEvent.click(screen.getByText(/Activate|Aktif/i));
  expect(onTune).toHaveBeenCalledWith(expect.objectContaining({ frequencyHz: 119100000 }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --run src/__tests__/RadioTuningPanel.test.tsx`
Expected: FAIL

- [ ] **Step 3: Update `RadioTuningPanel.tsx`**

Remove the step buttons and inline frequency editing form. Remove the Add Preset button and direct trash icon. Implement 3-dots (`MoreVertical`) dropdown menu with `Edit`, `Activate`, and `Delete` actions. Style the frequency readout cleanly with high contrast snow text. Add the `● RECORDING` pill badge next to the matching active preset.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- --run src/__tests__/RadioTuningPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RadioTuningPanel.tsx frontend/src/__tests__/RadioTuningPanel.test.tsx
git commit -m "feat(frontend): clean read-only frequency readout and 3-dots preset action menu"
```

---

### Task 3: Live BrowSDR-Style SDR Spectrum Visualizer (Spectrum Only, No Waterfall)

**Files:**
- Modify: `frontend/src/audio/WebAudioPlayer.ts`
- Create: `frontend/src/components/LiveSpectrumVisualizer.tsx`
- Create: `frontend/src/__tests__/LiveSpectrumVisualizer.test.tsx`

**Interfaces:**
- Produces:
  - `WebAudioPlayer.getAnalyser(): AnalyserNode | null`: Exposes an `AnalyserNode` connected to the active audio pipeline.
  - `LiveSpectrumVisualizer`:
    - Placed directly above the 24-hour timeline scrubber.
    - **SDR Spectrum Only (No Waterfall)**: Clean real-time FFT spectrum bars with phosphor green (`#3ecf8e`) gradient and peak hold dots.
    - Dynamic responsiveness: when squelch opens / speech occurs, spectrum surges dynamically; when squelched, displays low-level simulated ambient RF noise floor matching `liveRssi`.
    - Compact height (~90px - 110px) with live frequency marker, modulation, and signal readout.

- [ ] **Step 1: Write failing component test in `LiveSpectrumVisualizer.test.tsx`**

```tsx
// frontend/src/__tests__/LiveSpectrumVisualizer.test.tsx
import { render, screen } from '@testing-library/react';
import { LiveSpectrumVisualizer } from '../components/LiveSpectrumVisualizer';

test('renders live SDR spectrum visualizer canvas with frequency and squelch readout', () => {
  render(
    <LiveSpectrumVisualizer
      frequencyHz={118200000}
      modulation="AM"
      squelchOpen={true}
      rssi={-32.5}
      analyserNode={null}
    />
  );
  expect(screen.getByText(/LIVE SDR SPECTRUM/i)).toBeInTheDocument();
  expect(screen.getByText(/118.200 MHz/i)).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /Live SDR spectrum canvas/i }) || screen.getByTestId('spectrum-canvas')).toBeInTheDocument();
});
```


- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --run src/__tests__/LiveSpectrumVisualizer.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `AnalyserNode` in `WebAudioPlayer.ts` and build `LiveSpectrumVisualizer.tsx`**

Connect `AnalyserNode` (`fftSize = 256`, `smoothingTimeConstant = 0.8`) in `WebAudioPlayer`. In `LiveSpectrumVisualizer`, implement HTML5 Canvas `requestAnimationFrame` loop that draws FFT bars and waterfall lines in phosphor green.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- --run src/__tests__/LiveSpectrumVisualizer.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/audio/WebAudioPlayer.ts frontend/src/components/LiveSpectrumVisualizer.tsx frontend/src/__tests__/LiveSpectrumVisualizer.test.tsx
git commit -m "feat(frontend): add browsdr live sdr spectrum and waterfall visualizer"
```

---

### Task 4: Unified Multi-Tab Settings Modal Component

**Files:**
- Create: `frontend/src/components/SettingsModal.tsx`
- Create: `frontend/src/__tests__/SettingsModal.test.tsx`

**Interfaces:**
- Produces: `SettingsModal` supporting 4 tabs:
  - `activeTab: 'dongle' | 'channels' | 'storage' | 'password'`
  - **Tab 1 `Dongle`**: Fetches `/api/radio/devices`, dropdown selects physical USB dongles (or simulator), crystal calibration PPM (-100 to +100), RF gain mode (Manual / Auto AGC) and slider (0.0 to 49.6 dB), Hardware Bias-Tee toggle, Direct sampling (Disabled / I-branch / Q-branch), sample rate, squelch pre-roll buffer (100-2000ms), and hang time (100-3000ms).
  - **Tab 2 `Channel Setup`**: Full channel presets manager: list existing presets, create new preset (name, frequency, modulation, squelch, category), edit preset, and delete preset.
  - **Tab 3 `Storage`**: Retention period slider (1 to 365 days), maximum disk usage quota (50% to 95%), audio recording format selector (`WAV` / `Opus`), and disk storage gauge.
  - **Tab 4 `Password`**: Old password, new password, confirmation password with validation and change password API submission.

- [ ] **Step 1: Write failing component test for SettingsModal tabs and interactions**

```tsx
// frontend/src/__tests__/SettingsModal.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsModal } from '../components/SettingsModal';

test('renders unified settings modal with 4 tabs and switches between them', () => {
  render(
    <SettingsModal
      isOpen={true}
      initialTab="dongle"
      onClose={jest.fn()}
      onSaveDongle={jest.fn()}
      onSaveStorage={jest.fn()}
      onChangePassword={jest.fn()}
      presets={[]}
      onSavePreset={jest.fn()}
      onDeletePreset={jest.fn()}
    />
  );
  expect(screen.getByRole('tab', { name: /dongle/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /channel setup/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /storage/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /password/i })).toBeInTheDocument();

  // Switch to Storage tab
  fireEvent.click(screen.getByRole('tab', { name: /storage/i }));
  expect(screen.getByText(/Retention Period/i)).toBeInTheDocument();

  // Switch to Password tab
  fireEvent.click(screen.getByRole('tab', { name: /password/i }));
  expect(screen.getByText(/Current Password/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --run src/__tests__/SettingsModal.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `SettingsModal.tsx` adhering to Supabase design tokens**

Implement tab bar header with active Phosphor Green indicator, device selector with live query to `/api/radio/devices`, presets management in Channel Setup tab, storage retention sliders, and change password form.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- --run src/__tests__/SettingsModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SettingsModal.tsx frontend/src/__tests__/SettingsModal.test.tsx
git commit -m "feat(frontend): implement unified 4-tab settings modal"
```

---

### Task 5: Integrate Unified Settings Modal & Live Visualizer with TopBar & DashboardLayout

**Files:**
- Modify: `frontend/src/components/TopBar.tsx`
- Modify: `frontend/src/components/DashboardLayout.tsx`
- Test: `frontend/src/__tests__/TopBar.test.tsx`
- Test: `frontend/src/__tests__/DashboardLayout.test.tsx`

**Interfaces:**
- Produces:
  - `TopBar`:
    - Hardware status pill: removes duplicate white bullet (`● `) from text string (`RTL-SDR ONLINE` / `SIMULATOR MODE`), keeping only the single colored pulsing status dot.
    - Admin dropdown items:
      - `⚙ SDR Dongle Configuration` -> `onOpenSettings('dongle')`
      - `📻 Channel Setup` -> `onOpenSettings('channels')`
      - `🗄 Storage & Retention Manager` -> `onOpenSettings('storage')`
      - `🔑 Change Password` -> `onOpenSettings('password')`
      - `🚪 Sign Out` -> `onLogout()`
  - `DashboardLayout`:
    - Manages unified `isSettingsOpen` and `settingsTab` state.
    - Embeds `LiveSpectrumVisualizer` directly above `TimelineScrubber`.
    - Wires all settings save handlers:
      - Dongle hardware config -> `POST /api/radio/dongle-config`
      - System storage config -> `POST /api/system/settings`
      - Password change -> `POST /api/auth/change-password`
      - Presets -> `POST /api/radio/presets` and `DELETE /api/radio/presets/{id}`

- [ ] **Step 1: Write failing test in `TopBar.test.tsx` for admin dropdown menu tabs**

```tsx
// frontend/src/__tests__/TopBar.test.tsx
test('clicking menu items triggers onOpenSettings with corresponding tab', () => {
  const onOpenSettings = jest.fn();
  render(<TopBar username="admin" onOpenSettings={onOpenSettings} onLogout={jest.fn()} />);

  // Open dropdown
  fireEvent.click(screen.getByText('admin'));

  // Click Storage & Retention
  fireEvent.click(screen.getByText(/Storage & Retention Manager/i));
  expect(onOpenSettings).toHaveBeenCalledWith('storage');

  // Click Change Password
  fireEvent.click(screen.getByText(/Change Password/i));
  expect(onOpenSettings).toHaveBeenCalledWith('password');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --run src/__tests__/TopBar.test.tsx`
Expected: FAIL

- [ ] **Step 3: Update `TopBar.tsx` and wire in `DashboardLayout.tsx`**

Replace disconnected callbacks with unified `onOpenSettings(tab)`. Embed `LiveSpectrumVisualizer` directly above `TimelineScrubber`. Wire `SettingsModal` with API endpoints.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- --run`
Expected: PASS

- [ ] **Step 5: Run full test suite and verify build**

Run: `.venv/bin/pytest tests/ backend/tests/ -v && cd frontend && npm run build`
Expected: PASS (all tests green, 0 build errors)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/TopBar.tsx frontend/src/components/DashboardLayout.tsx frontend/src/__tests__/TopBar.test.tsx
git commit -m "feat: wire unified settings modal and live sdr visualizer to dashboard"
```

---

## Verification & Acceptance Plan

1. **Backend Tests:** Run `.venv/bin/pytest tests/ backend/tests/ -v` to ensure device enumeration, settings API, radio controls, retention worker, and auth all pass.
2. **Frontend Tests:** Run `npm test -- --run` in `frontend/` to ensure all unit & component tests pass.
3. **Production Build:** Run `npm run build` in `frontend/` to verify zero TypeScript or bundler errors.
4. **Manual End-to-End Checklist:**
   - [ ] Admin menu: Click "⚙ SDR Dongle Configuration" -> opens SettingsModal on Dongle tab.
   - [ ] Admin menu: Click "🗄 Storage & Retention Manager" -> opens SettingsModal on Storage tab.
   - [ ] Admin menu: Click "🔑 Change Password" -> opens SettingsModal on Password tab.
   - [ ] Admin menu: Click "📻 Channel Setup" -> opens SettingsModal on Channels tab.
   - [ ] Dongle tab: Device selector shows real RTL-SDR dongle (or Simulator if not plugged in).
   - [ ] Frequency display on main dashboard: Clean read-only text, no stepping buttons, no `RECORDING LOCKED` badge.
   - [ ] Channel preset list: Matching active preset shows `● RECORDING` in phosphor green.
   - [ ] Center column: Real-time BrowSDR-style spectrum and waterfall canvas is visible above the 24h timeline scrubber, reacting to audio transmission bursts.
