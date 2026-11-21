# Dongle Activity Logging and Interface Settings Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roll back the repository to commit `fafb18a`, cherry-pick the Interface settings tab and English UI standardization, and implement dual-output dongle activity logging (stdout and `storage/logs/dongle.log`) without any WebUI Logs tab.

**Architecture:** Branch `feature/dongle-logging-interface` directly from commit `fafb18a94eca304e20242621a5cd10956f2cd733`. Cherry-pick the isolated frontend commits for `UiSettingsContext`, the Interface tab in `SettingsModal`, spectrum color/decay integration, and English labels. Implement a dedicated `backend.sdr.dongle` logger with `StreamHandler` and `RotatingFileHandler` writing to `storage/logs/dongle.log`. Instrument `SDRReceiver` lifecycle events (startup probe, subprocess spawn, USB disconnect/EOF, background reconnect, manual restart, and tuning).

**Tech Stack:** Python 3.12/3.15, FastAPI, asyncio, standard library `logging.handlers.RotatingFileHandler`, React, TypeScript, Vitest, Pytest.

**Spec:** [docs/superpowers/specs/2026-11-21-dongle-logging-and-interface-tab-design.md](file:///home/dev/workspace/sdr-recorder/.worktrees/scanner-mode/docs/superpowers/specs/2026-11-21-dongle-logging-and-interface-tab-design.md)

## Global Constraints

- Baseline commit is `fafb18a94eca304e20242621a5cd10956f2cd733`.
- Never modify `TopBar.tsx`.
- All code, UI labels, tooltips, error messages, and comments must be in English.
- No scanner-mode, channel-hopping, or WebUI Logs tab code permitted.
- Dongle log rotation: 5 MB max file size, 3 backup copies.
- Log file directory `storage/logs` must be auto-created if not present.

## Review Focus

1. **Missing log directory:** If `storage/logs` does not exist on startup, the logger must create it automatically without raising `FileNotFoundError` (pinned in Task 2).
2. **Log rotation under load:** When `dongle.log` exceeds 5 MB, it must rotate up to 3 backups (`dongle.log.1`..`3`) cleanly without throwing permissions or locking errors (pinned in Task 2).
3. **Unexpected USB dongle disconnect / EOF:** When `rtl_fm` terminates or USB communication fails, `SDRReceiver` must catch the failure, log `WARNING` with device index and status, and enter reconnection polling without crashing the application (pinned in Task 3).
4. **Hardware reconnect detection:** When a disconnected dongle is plugged back in, the reconnection loop must detect availability, log `INFO` reconnect message, and respawn `rtl_fm` (pinned in Task 3).
5. **No WebUI Logs tab:** The frontend `SettingsModal` must render the Interface tab with spectrum controls, and must NOT contain any Logs tab or log viewer (pinned in Task 4).

---

### Task 1: Create Branch and Cherry-pick Interface Tab & English UI

**Files:**
- Create branch: `feature/dongle-logging-interface` at `fafb18a`
- Cherry-pick commits:
  - `1293ef6b8923356ff6d8053c9b809f0ec1f870d2`: `feat(ui): add UiSettingsContext with localStorage persistence`
  - `bb98fbb53ed9765b1b7510f96f6cfa86693c5a51`: `feat(settings): add Interface configuration tab in SettingsModal`
  - `e0a909cbd3bd143e92092a0a4cc85ffac8e0acb3`: `feat(ui): connect live spectrum and dashboard components to UiSettingsContext`
  - `82798e4e94b2db02cb6e6b52a326ffda3b10ce07`: `chore(i18n): standardize all UI labels, tooltips, and descriptions to English`
- Modify: `docs/superpowers/specs/2026-11-21-dongle-logging-and-interface-tab-design.md` (add to branch)
- Modify: `docs/superpowers/plans/2026-11-21-dongle-logging-and-interface-tab.md` (add to branch)

**Interfaces:**
- Consumes: Commit `fafb18a` as base.
- Produces: Clean codebase on branch `feature/dongle-logging-interface` containing Interface settings tab and English UI, with zero scanner-mode code or WebUI Logs tab.

- [ ] **Step 1: Check out new branch from `fafb18a`**
  ```bash
  git checkout -b feature/dongle-logging-interface fafb18a94eca304e20242621a5cd10956f2cd733
  ```

- [ ] **Step 2: Cherry-pick UI commits in order**
  ```bash
  git cherry-pick 1293ef6b8923356ff6d8053c9b809f0ec1f870d2
  git cherry-pick bb98fbb53ed9765b1b7510f96f6cfa86693c5a51
  git cherry-pick e0a909cbd3bd143e92092a0a4cc85ffac8e0acb3
  git cherry-pick 82798e4e94b2db02cb6e6b52a326ffda3b10ce07
  ```
  *(Resolve any trivial conflicts in docs or tests; preserve Interface tab and English labels)*

- [ ] **Step 3: Copy spec and plan documents onto the new branch**
  Commit the design spec and plan to `docs/superpowers/` on `feature/dongle-logging-interface`.

- [ ] **Step 4: Verify initial test suite on new branch**
  Run:
  - Backend: `/home/dev/workspace/sdr-recorder/.venv/bin/pytest backend/tests/` (all existing tests pass)
  - Frontend: `cd frontend && npm test -- --run` (all existing tests pass)

---

### Task 2: Implement Rotating Dongle Activity Logger Utility

**Files:**
- Create: `backend/utils/dongle_logger.py`
- Create: `backend/tests/test_dongle_logging.py`
- Modify: `backend/main.py:20-60`

**Interfaces:**
- Consumes: `storage_dir: str`
- Produces:
  ```python
  def setup_dongle_logger(storage_dir: str, log_filename: str = "dongle.log") -> logging.Logger:
      """Configures and returns the backend.sdr.dongle logger with stdout and RotatingFileHandler."""
  ```

- [ ] **Step 1: Write failing unit test for `setup_dongle_logger`**
  In `backend/tests/test_dongle_logging.py`:
  ```python
  import logging
  import os
  import tempfile
  import pytest
  from backend.utils.dongle_logger import setup_dongle_logger, DONGLE_LOGGER_NAME

  def test_setup_dongle_logger_creates_directory_and_file():
      with tempfile.TemporaryDirectory() as tmpdir:
          logger = setup_dongle_logger(storage_dir=tmpdir, log_filename="dongle.log")
          assert logger.name == DONGLE_LOGGER_NAME
          
          # Test log emission
          test_msg = "RTL-SDR dongle connected on index 0"
          logger.info(test_msg)
          
          log_file_path = os.path.join(tmpdir, "logs", "dongle.log")
          assert os.path.exists(log_file_path)
          with open(log_file_path, "r", encoding="utf-8") as f:
              content = f.read()
          assert test_msg in content
          assert "[INFO]" in content
          assert f"[{DONGLE_LOGGER_NAME}]" in content
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `/home/dev/workspace/sdr-recorder/.venv/bin/pytest backend/tests/test_dongle_logging.py`
  Expected: FAIL with `ModuleNotFoundError: No module named 'backend.utils.dongle_logger'`

- [ ] **Step 3: Implement `setup_dongle_logger` in `backend/utils/dongle_logger.py`**
  ```python
  """Dongle activity logging facility with stdout and rotating file handlers."""
  import logging
  import os
  import sys
  from logging.handlers import RotatingFileHandler

  DONGLE_LOGGER_NAME = "backend.sdr.dongle"

  def setup_dongle_logger(storage_dir: str, log_filename: str = "dongle.log") -> logging.Logger:
      logger = logging.getLogger(DONGLE_LOGGER_NAME)
      logger.setLevel(logging.INFO)
      logger.propagate = False  # Avoid duplicate root logs if root also logs stdout

      # Auto-create storage/logs directory
      logs_dir = os.path.join(storage_dir, "logs")
      os.makedirs(logs_dir, exist_ok=True)
      log_path = os.path.join(logs_dir, log_filename)

      # Check if handlers already attached
      has_file = any(isinstance(h, RotatingFileHandler) for h in logger.handlers)
      has_stream = any(isinstance(h, logging.StreamHandler) and not isinstance(h, RotatingFileHandler) for h in logger.handlers)

      formatter = logging.Formatter(
          "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
          datefmt="%Y-%m-%d %H:%M:%S",
      )

      if not has_stream:
          sh = logging.StreamHandler(sys.stdout)
          sh.setLevel(logging.INFO)
          sh.setFormatter(formatter)
          logger.addHandler(sh)

      if not has_file:
          rfh = RotatingFileHandler(
              log_path,
              maxBytes=5 * 1024 * 1024,
              backupCount=3,
              encoding="utf-8",
          )
          rfh.setLevel(logging.INFO)
          rfh.setFormatter(formatter)
          logger.addHandler(rfh)

      return logger
  ```
  And initialize in `backend/main.py` lifespan / `create_app` passing `config.STORAGE_DIR`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `/home/dev/workspace/sdr-recorder/.venv/bin/pytest backend/tests/test_dongle_logging.py`
  Expected: PASS

- [ ] **Step 5: Commit changes**
  ```bash
  git add backend/utils/dongle_logger.py backend/tests/test_dongle_logging.py backend/main.py
  git commit -m "feat(logging): implement dual-output rotating dongle activity logger"
  ```

---

### Task 3: Instrument Dongle Activity Lifecycle in SDRReceiver

**Files:**
- Modify: `backend/sdr/receiver.py:230-660`
- Modify: `backend/tests/test_dongle_logging.py`

**Interfaces:**
- Consumes: `backend.utils.dongle_logger.setup_dongle_logger`, `DONGLE_LOGGER_NAME`
- Produces: Log messages emitted on:
  - Hardware probe: `[INFO] [backend.sdr.dongle] RTL-SDR dongle probe: device_index={idx}, available={bool}`
  - Subprocess spawn: `[INFO] [backend.sdr.dongle] RTL-SDR dongle connected on device_index={idx} (PID {pid}, {modulation}, {freq:.3f} MHz, squelch={squelch} dBFS)`
  - Subprocess exit / EOF / failure: `[WARNING] [backend.sdr.dongle] RTL-SDR dongle disconnected on device_index={idx} (returncode={rc}). Reconnection worker active.`
  - Reconnect success: `[INFO] [backend.sdr.dongle] RTL-SDR dongle reconnected on device_index={idx}. Respawning rtl_fm process.`
  - Manual restart: `[INFO] [backend.sdr.dongle] RTL-SDR dongle restart requested via API for device_index={idx}. Resetting process...`
  - RF Retune: `[INFO] [backend.sdr.dongle] RTL-SDR dongle tuned to {freq:.3f} MHz ({modulation}, squelch={squelch} dBFS)`

- [ ] **Step 1: Write unit tests verifying lifecycle log emissions**
  In `backend/tests/test_dongle_logging.py`:
  Add tests for `SDRReceiver`:
  - `test_dongle_connect_and_disconnect_logs_emitted()`
  - `test_dongle_restart_and_tuning_logs_emitted()`
  Assert expected messages appear in `storage/logs/dongle.log`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `/home/dev/workspace/sdr-recorder/.venv/bin/pytest backend/tests/test_dongle_logging.py::test_dongle_connect_and_disconnect_logs_emitted`
  Expected: FAIL (messages not yet in log file)

- [ ] **Step 3: Instrument `SDRReceiver` in `backend/sdr/receiver.py`**
  Import `dongle_logger = logging.getLogger("backend.sdr.dongle")`.
  Log appropriate messages at:
  - `__init__` / initial `is_hardware_available` check
  - `_run_loop` before and after spawning `rtl_fm`
  - Subprocess exit / `IncompleteReadError`
  - Reconnect detection in `_run_loop`
  - `restart()` method
  - `update_config()` method

- [ ] **Step 4: Run test to verify it passes**
  Run: `/home/dev/workspace/sdr-recorder/.venv/bin/pytest backend/tests/test_dongle_logging.py`
  Expected: PASS

- [ ] **Step 5: Run full backend test suite**
  Run: `/home/dev/workspace/sdr-recorder/.venv/bin/pytest backend/tests/`
  Expected: All tests PASS

- [ ] **Step 6: Commit changes**
  ```bash
  git add backend/sdr/receiver.py backend/tests/test_dongle_logging.py
  git commit -m "feat(sdr): instrument dongle connect, disconnect, restart, and tuning lifecycle logs"
  ```

---

### Task 4: Verify Frontend SettingsModal Interface Tab and Ensure No Logs Tab

**Files:**
- Modify/Verify: `frontend/src/components/SettingsModal.tsx`
- Modify/Verify: `frontend/src/__tests__/SettingsModal.test.tsx`
- Modify/Verify: `frontend/src/context/UiSettingsContext.tsx`

**Interfaces:**
- Consumes: `UiSettingsContext`, `SettingsModalProps`
- Produces: `SettingsModal` with exactly tabs: `'dongle'`, `'channels'`, `'recording'`, `'storage'`, `'password'`, `'interface'` and NO `'logs'` tab.

- [ ] **Step 1: Write test confirming Interface tab is present and Logs tab is absent**
  In `frontend/src/__tests__/SettingsModal.test.tsx`:
  ```tsx
  test('renders Interface tab and does not render any Logs tab', () => {
    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        dongleConfig={mockDongleConfig}
        onSaveDongle={vi.fn()}
        onRestartDongle={vi.fn()}
        onChangePassword={vi.fn()}
      />
    );

    // Interface tab must exist
    expect(screen.getByRole('tab', { name: /interface/i })).toBeInTheDocument();

    // Logs tab must NOT exist
    expect(screen.queryByRole('tab', { name: /logs/i })).toBeNull();
    expect(screen.queryByText(/Backend System Logs/i)).toBeNull();
  });
  ```

- [ ] **Step 2: Run test to verify it passes**
  Run: `cd frontend && npm test -- src/__tests__/SettingsModal.test.tsx --run`
  Expected: PASS

- [ ] **Step 3: Run full frontend test suite and build**
  Run:
  - `cd frontend && npm test -- --run`
  - `cd frontend && npm run build`
  Expected: All tests pass and build finishes with code 0.

- [ ] **Step 4: Commit changes**
  ```bash
  git add frontend/src/__tests__/SettingsModal.test.tsx
  git commit -m "test(settings): verify Interface tab is present and Logs tab is absent"
  ```

---

### Task 5: Final End-to-End Verification and SDD Ledger Completion

**Files:**
- Create: `.superpowers/sdd/2026-11-21-dongle-logging-and-interface-tab/progress.md`

- [ ] **Step 1: Run complete backend test suite**
  Run: `/home/dev/workspace/sdr-recorder/.venv/bin/pytest backend/tests/`
  Expected: All tests PASS.

- [ ] **Step 2: Run complete frontend test suite**
  Run: `cd frontend && npm test -- --run`
  Expected: All tests PASS.

- [ ] **Step 3: Check git log and branch structure**
  Verify `git log --oneline -n 10` reflects clean cherry-picks from `fafb18a` with no hopping or WebUI log commits.

- [ ] **Step 4: Create and update SDD ledger**
  Document the completion of all tasks in the progress ledger.
