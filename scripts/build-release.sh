#!/usr/bin/env bash
set -euo pipefail

# Build downloadable release archives (.tar.gz, .zip, and SHA256SUMS.txt)
# containing the backend runtime and pre-built frontend/dist SPA bundle.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

VERSION="${1:-${GITHUB_REF_NAME:-v1.0.0}}"
# Sanitize version string for safe filenames
SAFE_VERSION="${VERSION//\//-}"
PACKAGE_NAME="sdr-recorder-${SAFE_VERSION}"
OUT_DIR="${PROJECT_ROOT}/dist"
STAGE_PARENT="$(mktemp -d)"
STAGE_DIR="${STAGE_PARENT}/${PACKAGE_NAME}"

cleanup() {
    rm -rf "$STAGE_PARENT"
}
trap cleanup EXIT

if [ "${SKIP_FRONTEND_BUILD:-0}" != "1" ]; then
    if command -v npm >/dev/null 2>&1; then
        echo "[*] Building frontend production bundle..."
        (cd "${PROJECT_ROOT}/frontend" && npm run build)
    elif [ ! -f "${PROJECT_ROOT}/frontend/dist/index.html" ]; then
        echo "[ERROR] npm not found and frontend/dist/index.html is missing." >&2
        exit 1
    else
        echo "[*] npm not found; reusing existing frontend/dist bundle."
    fi
fi

if [ ! -f "${PROJECT_ROOT}/frontend/dist/index.html" ]; then
    echo "[ERROR] frontend/dist/index.html not found. Run 'cd frontend && npm run build' first." >&2
    exit 1
fi

echo "[*] Staging release package ${PACKAGE_NAME}..."
mkdir -p "$STAGE_DIR" "$OUT_DIR"

# Copy backend runtime code (exclude tests and bytecode caches)
mkdir -p "${STAGE_DIR}/backend"
tar -C "${PROJECT_ROOT}/backend" \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='tests' \
    -cf - . | tar -C "${STAGE_DIR}/backend" -xf -

# Copy pre-built frontend SPA assets
mkdir -p "${STAGE_DIR}/frontend/dist"
cp -R "${PROJECT_ROOT}/frontend/dist/." "${STAGE_DIR}/frontend/dist/"

# Copy launcher scripts and deployment/config docs
mkdir -p "${STAGE_DIR}/scripts"
cp "${PROJECT_ROOT}/scripts/start.sh" "${STAGE_DIR}/scripts/start.sh"
chmod +x "${STAGE_DIR}/scripts/start.sh"

for file in requirements.txt .env.example Dockerfile docker-compose.yml README.md; do
    if [ -f "${PROJECT_ROOT}/${file}" ]; then
        cp "${PROJECT_ROOT}/${file}" "${STAGE_DIR}/${file}"
    fi
done

TAR_PATH="${OUT_DIR}/${PACKAGE_NAME}.tar.gz"
ZIP_PATH="${OUT_DIR}/${PACKAGE_NAME}.zip"
SUMS_PATH="${OUT_DIR}/SHA256SUMS.txt"

rm -f "$TAR_PATH" "$ZIP_PATH" "$SUMS_PATH"

echo "[*] Creating ${TAR_PATH}..."
tar -C "$STAGE_PARENT" -czf "$TAR_PATH" "$PACKAGE_NAME"

echo "[*] Creating ${ZIP_PATH}..."
python3 - "$STAGE_PARENT" "$PACKAGE_NAME" "$ZIP_PATH" << 'PYEOF'
import os
import sys
import zipfile
from pathlib import Path

stage_parent = Path(sys.argv[1])
package_name = sys.argv[2]
zip_path = Path(sys.argv[3])
root = stage_parent / package_name

with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(stage_parent)
        if path.is_dir():
            continue
        zf.write(path, arcname=str(rel))
PYEOF

echo "[*] Generating ${SUMS_PATH}..."
(
    cd "$OUT_DIR"
    sha256sum "${PACKAGE_NAME}.tar.gz" "${PACKAGE_NAME}.zip" > "$(basename "$SUMS_PATH")"
)

echo "[✓] Release artifacts created in ${OUT_DIR}:"
ls -lh "$TAR_PATH" "$ZIP_PATH" "$SUMS_PATH"
