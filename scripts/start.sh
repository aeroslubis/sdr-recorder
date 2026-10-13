#!/usr/bin/env bash
set -e

# SDR-Recorder NVR unified startup script
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "=== SDR-Recorder NVR Launcher ==="

# 1. Check or set up Python virtual environment
VENV_PATH="$PROJECT_ROOT/.venv"
if [ ! -d "$VENV_PATH" ]; then
    echo "[!] Virtual environment not found at $VENV_PATH. Creating one..."
    python3 -m venv "$VENV_PATH"
    "$VENV_PATH/bin/pip" install --upgrade pip
fi

PYTHON_BIN="$VENV_PATH/bin/python3"
if [ ! -f "$PYTHON_BIN" ]; then
    echo "[ERROR] Python binary not found in virtual environment!"
    exit 1
fi

# 2. Check if frontend build exists, build if missing or if BUILD_FRONTEND=1
FRONTEND_DIST="$PROJECT_ROOT/frontend/dist"
if [ ! -d "$FRONTEND_DIST" ] || [ "${BUILD_FRONTEND:-0}" = "1" ]; then
    echo "[*] Building frontend static bundle with Vite..."
    if command -v npm >/dev/null 2>&1; then
        (cd "$PROJECT_ROOT/frontend" && npm run build)
    else
        echo "[WARNING] npm not found! Skipping frontend build."
    fi
fi

# 3. Port & Host configuration
HOST="${SDR_HOST:-0.0.0.0}"
PORT="${SDR_PORT:-8000}"

echo "[*] Starting SDR-Recorder NVR on http://${HOST}:${PORT}"
echo "[*] Default credentials: admin / 12345"

# 4. Start backend server using runner
exec "$PYTHON_BIN" backend/run.py --host "$HOST" --port "$PORT" "$@"
