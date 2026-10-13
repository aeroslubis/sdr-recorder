# Unified Settings Modal, Dongle Enumeration & Read-Only Frequency Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement RTL-SDR hardware device enumeration, unified multi-tab Settings Modal (Dongle, Channel Setup, Storage, Password), and lock the main dashboard frequency to read-only during recording.

**Architecture:** 
1. **Backend:** Add hardware device probe utility `get_available_devices()` parsing `rtl_test` output into device descriptors, expose `GET /api/radio/devices`, and create `GET` / `POST` endpoints for `/api/system/settings`.
2. **Frontend:** Create a unified `SettingsModal` with 4 tabs (`Dongle`, `Channel Setup`, `Storage`, `Password`), wire all TopBar admin menu shortcuts to open this modal to the selected tab, and update `RadioTuningPanel` so the main tuned frequency is strictly read-only with a lock indicator to protect ongoing recordings.

**Tech Stack:** Python FastAPI, SQLite, React 18, TypeScript, Tailwind CSS, Lucide React, Vitest, Pytest.

**Spec:** [docs/superpowers/specs/2026-10-13-sdr-recorder-nvr-design.md](file:///home/aeros/workspace/agy/sdr-recorder/docs/superpowers/specs/2026-10-13-sdr-recorder-nvr-design.md)

## Global Constraints

- WebUI theme strictly follows `supabase.md` dark midnight tokens (Obsidian `#121212`, Ash `#242424`, Charcoal `#2e2e2e`, Phosphor Green `#3ecf8e`, Mint Pulse `#00c573`).
- All UI text, tabs, labels, and alerts must be in English.
- The tuned frequency on the main dashboard must be read-only to prevent accidentally disturbing the active recording engine.
- Single unified settings modal with 4 tabs: `Dongle`, `Channel Setup`, `Storage`, and `Password`.
- Device enumeration must detect real USB dongles via `rtl_test` and seamlessly provide `Mock SDR Simulator (Virtual)` if no dongles are attached.

## Review Focus

1. **Subprocess safety in `rtl_test` enumeration:** Probing connected USB devices must have a strict timeout (1.5s) and must not hang if an RTL-SDR is busy or detached mid-probe.
2. **Settings Modal tab state retention:** Switching between tabs in `SettingsModal` must preserve unsaved form inputs until the user clicks "Save" or closes the modal.
3. **Password change security:** The Password tab must validate that new passwords are at least 5 characters long and match confirmation before submitting.
4. **Storage quota validation:** The Storage tab must reject negative retention days or disk percentages > 99%.
5. **Main view frequency protection:** The frequency display in `RadioTuningPanel` must not emit tuning mutation requests or expose step increment/decrement buttons that could disrupt ongoing recording files.

---

### Task 1: Backend RTL-SDR Device Enumeration & System Settings API

**Files:**
- Modify: `backend/sdr/receiver.py`
- Modify: `backend/routers/radio_router.py`
- Modify: `backend/routers/system_router.py`
- Test: `backend/tests/test_devices_settings.py`

**Interfaces:**
- Produces:
  - `get_available_devices() -> List[Dict[str, Any]]`: Returns `[{"index": int, "name": str, "available": bool}]`.
  - `GET /api/radio/devices`: Returns list of detected SDR dongles.
  - `GET /api/system/settings`: Returns `{ retention_days: int, max_disk_usage_percent: int, audio_format: str }`.
  - `POST /api/system/settings`: Updates retention settings in database `system_settings` table.

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
        assert isinstance(dev_res.json(), list)

        # GET settings
        get_res = client.get("/api/system/settings", headers=headers)
        assert get_res.status_code == 200
        assert get_res.json()["retention_days"] == 14

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

Parse `Found N device(s)` lines from `rtl_test` with regex. Fallback to simulator device if none found. Expose `GET /api/radio/devices` and `GET`/`POST` `/api/system/settings`.

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest backend/tests/test_devices_settings.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/sdr/receiver.py backend/routers/radio_router.py backend/routers/system_router.py backend/tests/test_devices_settings.py
git commit -m "feat(backend): add sdr device enumeration and system settings api"
```

---

### Task 2: Read-Only Frequency Display in Main RadioTuningPanel

**Files:**
- Modify: `frontend/src/components/RadioTuningPanel.tsx`
- Modify: `frontend/src/__tests__/RadioTuningPanel.test.tsx`

**Interfaces:**
- Produces: `RadioTuningPanel` where:
  - Tuned frequency is displayed as a prominent read-only readout with a lock indicator `[🔒 RECORDING LOCKED]`.
  - Step increment/decrement buttons (`±1M`, `±25k`, etc.) are removed from the main panel to protect active recording.
  - Squelch slider and S-meter remain interactive for live sensitivity adjustment.
  - Channel presets list displays current channel with a "Manage Channels" link pointing to Settings.

- [ ] **Step 1: Write failing test in `RadioTuningPanel.test.tsx` for read-only frequency lock**

```tsx
// in frontend/src/__tests__/RadioTuningPanel.test.tsx
test('displays locked frequency readout and no direct step modification buttons', () => {
  render(
    <RadioTuningPanel
      frequencyHz={118200000}
      modulation="AM"
      squelchThreshold={-42.0}
      onTune={jest.fn()}
    />
  );
  expect(screen.getByText(/118.200.000/i)).toBeInTheDocument();
  expect(screen.getByText(/RECORDING LOCKED/i)).toBeInTheDocument();
  // Ensure disruptive stepping buttons are not present
  expect(screen.queryByText(/\+1M/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --run src/__tests__/RadioTuningPanel.test.tsx`
Expected: FAIL

- [ ] **Step 3: Update `RadioTuningPanel.tsx` to read-only locked frequency display**

Style the frequency card with a phosphor-green glowing locked badge, informative subtitle, and keep S-meter and Squelch threshold draggable slider interactive.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- --run src/__tests__/RadioTuningPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RadioTuningPanel.tsx frontend/src/__tests__/RadioTuningPanel.test.tsx
git commit -m "feat(frontend): lock main tuning panel frequency to read-only during recording"
```

---

### Task 3: Unified Multi-Tab Settings Modal Component

**Files:**
- Create: `frontend/src/components/SettingsModal.tsx`
- Create: `frontend/src/__tests__/SettingsModal.test.tsx`

**Interfaces:**
- Produces: `SettingsModal` supporting 4 tabs:
  - `activeTab: 'dongle' | 'channels' | 'storage' | 'password'`
  - Tab 1 `Dongle`: Fetches `/api/radio/devices`, dropdown selects physical USB dongles (or simulator), calibration PPM, gain mode, Bias-T, Direct sampling, buffers.
  - Tab 2 `Channels`: Channel Presets manager with add, edit frequency & modulation, and delete.
  - Tab 3 `Storage`: Retention days slider, Max disk quota percentage, audio format picker, live storage stats bar.
  - Tab 4 `Password`: Old password, new password, confirmation password with change password submission.

- [ ] **Step 1: Write failing component test for SettingsModal tabs and interactions**

```tsx
// frontend/src/__tests__/SettingsModal.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsModal } from '../components/SettingsModal';

test('renders settings modal with 4 tabs and switches between them', () => {
  render(
    <SettingsModal
      isOpen={true}
      initialTab="dongle"
      onClose={jest.fn()}
      onSaveDongle={jest.fn()}
      onSaveStorage={jest.fn()}
      onChangePassword={jest.fn()}
    />
  );
  expect(screen.getByRole('tab', { name: /dongle/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /channel setup/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /storage/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /password/i })).toBeInTheDocument();

  // Switch to Storage tab
  fireEvent.click(screen.getByRole('tab', { name: /storage/i }));
  expect(screen.getByText(/Retention Period/i)).toBeInTheDocument();
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

### Task 4: Integrate Unified Settings Modal with TopBar and DashboardLayout

**Files:**
- Modify: `frontend/src/components/TopBar.tsx`
- Modify: `frontend/src/components/DashboardLayout.tsx`
- Test: `frontend/src/__tests__/TopBar.test.tsx`
- Test: `tests/e2e/test_full_system.py`

**Interfaces:**
- Produces:
  - TopBar admin dropdown has items:
    - `⚙ SDR Dongle Configuration` -> opens `SettingsModal` on tab `'dongle'`.
    - `🗄 Storage & Retention Manager` -> opens `SettingsModal` on tab `'storage'`.
    - `🔑 Change Password` -> opens `SettingsModal` on tab `'password'`.
    - `📻 Channel Setup` -> opens `SettingsModal` on tab `'channels'`.
    - `🚪 Sign Out` -> triggers logout.
  - `DashboardLayout` manages `isSettingsOpen` and `settingsTab` state, seamlessly handling saves across dongle hardware, presets, storage, and password.

- [ ] **Step 1: Write failing test in `TopBar.test.tsx` for admin dropdown actions**

```tsx
// frontend/src/__tests__/TopBar.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { TopBar } from '../components/TopBar';

test('clicking menu items triggers openSettings with corresponding tab', () => {
  const onOpenSettings = jest.fn();
  render(<TopBar username="admin" onOpenSettings={onOpenSettings} onLogout={jest.fn()} />);

  // Open dropdown
  fireEvent.click(screen.getByText('admin'));

  // Click Storage & Retention
  fireEvent.click(screen.getByText(/Storage & Retention Manager/i));
  expect(onOpenSettings).toHaveBeenCalledWith('storage');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --run src/__tests__/TopBar.test.tsx`
Expected: FAIL

- [ ] **Step 3: Update `TopBar.tsx` and wire in `DashboardLayout.tsx`**

Replace old disconnected props with `onOpenSettings(tab)`, mount `SettingsModal` in `DashboardLayout`, and connect handlers for dongle config, presets, storage settings, and password updates.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- --run`
Expected: PASS

- [ ] **Step 5: Run full test suite and verify build**

Run: `.venv/bin/pytest tests/ backend/tests/ -v && cd frontend && npm run build`
Expected: PASS (all tests green, 0 build errors)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/TopBar.tsx frontend/src/components/DashboardLayout.tsx frontend/src/__tests__/TopBar.test.tsx
git commit -m "feat: wire unified settings modal to topbar and dashboard layout"
```
