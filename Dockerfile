# ========================================================
# Stage 1: Build Frontend (Vite + React + TypeScript + Tailwind)
# ========================================================
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend

# Cache npm dependencies
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source and compile static production build
COPY frontend/ ./
RUN npm run build

# ========================================================
# Stage 2: Runtime Container (Python 3.12 + RTL-SDR + FFmpeg)
# ========================================================
FROM python:3.12-slim-bookworm

# Environment configuration
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    SDR_HOST=0.0.0.0 \
    SDR_PORT=8000 \
    SDR_STORAGE_DIR=/app/storage

WORKDIR /app

# Install system dependencies:
# - rtl-sdr & librtlsdr-dev: RTL2832U drivers, rtl_fm & rtl_test binaries
# - ffmpeg: Audio encoder for high-efficiency opus/mp3 compression
# - tzdata & ca-certificates: Server timezone synchronization and SSL
# - usbutils: USB hardware diagnostics (lsusb)
RUN apt-get update && apt-get install -y --no-install-recommends \
    rtl-sdr \
    librtlsdr-dev \
    ffmpeg \
    tzdata \
    ca-certificates \
    usbutils \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application and helper scripts
COPY backend/ ./backend/
COPY scripts/ ./scripts/

# Copy built frontend static bundle from stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Prepare persistent storage directory
RUN mkdir -p /app/storage/recordings

# Expose HTTP & WebSocket port
EXPOSE 8000

# Container healthcheck using backend /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')" || exit 1

# Launch production server
CMD ["python3", "backend/run.py", "--host", "0.0.0.0", "--port", "8000"]
