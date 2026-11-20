# Design Document: Dongle Activity Logging and Interface Settings Tab (Rollback to fafb18a)

- **Date:** 2026-11-21
- **Branch:** `feature/dongle-logging-interface` (branched from commit `fafb18a94eca304e20242621a5cd10956f2cd733`)
- **Status:** Proposed

---

## 1. Intent & Context

The scanner-mode and multi-frequency hopping implementation introduced rapid USB process recycling and hardware instability on physical RTL-SDR dongles on host machines. The goal is to return the SDR core to the stable, proven single-frequency baseline at commit `fafb18a94eca304e20242621a5cd10956f2cd733`, while:
1. Retaining the **Interface** settings tab in the WebUI (spectrum palette, FPS, decay, passband, 12h/24h time format, show seconds, default volume, continuous playback) along with English UI standardization.
2. Implementing dedicated **Dongle Activity Logging** (tracking connect, disconnect, reconnect, process restart, and RF tuning events) outputting to both container `stdout` and a rotating log file in `storage/logs/dongle.log`.
3. Ensuring **NO Logs tab** is added to the WebUI.

---

## 2. Goals & Non-Goals

### Goals
- Create a clean branch `feature/dongle-logging-interface` from commit `fafb18a94eca304e20242621a5cd10956f2cd733`.
- Cherry-pick the Interface tab implementation (`1293ef6`, `bb98fbb`, `e0a909c`) and UI English standardization (`82798e4`) without any scanner-mode or WebUI log tabs.
- Implement dongle activity logging in `backend/sdr/receiver.py` (and logging initialization in `backend/main.py`) with:
  - Standard container `stdout` logging.
  - Rotating file logging at `storage/logs/dongle.log` (5MB max size, 3 backup rotations).
- Maintain 100% test coverage for Interface settings and dongle logging.
- Retain all UI, code, and comments in English.

### Non-Goals
- Multi-frequency channel hopping / scanner mode (omitted to preserve hardware stability).
- WebUI log viewer tab or API endpoints for logs (logging is intended for server / container diagnostics).
- Modifying `TopBar.tsx`.

---

## 3. Approaches Considered

- **Approach 1: Tag Tip and Hard Reset `feature/scanner-mode` to `fafb18a`**
  - Reset existing branch to `fafb18a` and cherry-pick UI commits.
  - *Trade-off:* Rewrites branch history, though keeps the branch name unchanged.
- **Approach 2: Create New Branch `feature/dongle-logging-interface` from `fafb18a` (Chosen)**
  - Leaves `feature/scanner-mode` intact as historical reference and starts clean from `fafb18a`.
  - *Trade-off:* Cleanest git isolation; requires creating the new branch and updating remote deployment.
- **Approach 3: Sequential Revert Commits**
  - Generate 20+ reverse commits on top of current HEAD.
  - *Trade-off:* Extremely messy git history and prone to merge conflicts.

---

## 4. Technical Architecture

### 4.1 Git Strategy & Cherry-Picks
1. Create new branch `feature/dongle-logging-interface` from `fafb18a`.
2. Cherry-pick commits:
   - `1293ef6`: `feat(ui): add UiSettingsContext with localStorage persistence`
   - `bb98fbb`: `feat(settings): add Interface configuration tab in SettingsModal`
   - `e0a909c`: `feat(ui): connect live spectrum and dashboard components to UiSettingsContext`
   - `82798e4`: `chore(i18n): standardize all UI labels, tooltips, and descriptions to English`
3. Verify that `SettingsModal.tsx` has tabs: `['dongle', 'channels', 'recording', 'storage', 'password', 'interface']` and NO `'logs'` tab.

### 4.2 Dongle Activity Logging Design
- **Logger Name:** `backend.sdr.dongle`
- **Output Targets:**
  1. `sys.stdout` (`logging.StreamHandler`) with formatter `[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s`.
  2. Rotating file handler (`logging.handlers.RotatingFileHandler`):
     - Path: `storage/logs/dongle.log` (directory auto-created if missing).
     - Max size: `5 * 1024 * 1024` bytes (5 MB).
     - Backup count: 3 files (`dongle.log.1`, `dongle.log.2`, `dongle.log.3`).
- **Events Tracked:**
  - `INITIALIZE`: Initial hardware availability check during application start.
  - `CONNECTED`: RTL-SDR dongle detected and `rtl_fm` process spawned (logs PID, device index, sample rate).
  - `DISCONNECTED`: USB read error / EOF / subprocess termination detected (logs return code, enters reconnection cycle).
  - `RECONNECTING`: Background reconnect loop polling for hardware availability.
  - `RESTARTED`: Manual or API-triggered device restart initiated from Dongle Settings.
  - `TUNED`: RF frequency, modulation, squelch threshold, or gain adjustments applied.

---

## 5. Verification Plan

1. **Python Unit Tests:**
   - Test dongle activity logger initialization, rotating file handler creation, and log emission on connect, disconnect, and restart events.
   - Run complete backend test suite with `pytest`.
2. **Frontend Unit Tests:**
   - Test `UiSettingsContext` persists and updates interface preferences.
   - Test `SettingsModal` renders the Interface tab with spectrum and audio controls.
   - Verify `SettingsModal` does NOT render any Logs tab.
   - Run complete frontend test suite with `npm test -- --run`.
3. **End-to-End Build:**
   - Build frontend via `npm run build`.
   - Verify production bundle is clean with zero TypeScript errors.
