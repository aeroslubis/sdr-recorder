"""Main FastAPI Application and lifecycle management for SDR-Recorder NVR."""
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend import config
from backend.database import get_connection, init_db
from backend.routers.auth_router import router as auth_router
from backend.routers.radio_router import router as radio_router
from backend.routers.recordings_router import router as recordings_router
from backend.routers.system_router import router as system_router
from backend.routers.ws_router import ConnectionManager, router as ws_router
from backend.sdr.dongle_config import DongleConfig
from backend.sdr.receiver import SDRReceiver, TransmissionEvent
from backend.storage.audio_writer import save_transmission
from backend.storage.retention import retention_worker

logger = logging.getLogger(__name__)


def create_app(
    db_path: Optional[str] = None,
    force_simulator: bool = False,
    test_mode: bool = False,
) -> FastAPI:
    """Create and configure the FastAPI SDR-Recorder NVR application."""
    resolved_db_path = db_path or config.DB_PATH

    # Ensure database schema is initialized
    init_db(resolved_db_path)

    # Pre-load initial radio config from DB
    conn = get_connection(resolved_db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM radio_config WHERE id = 1")
        row = cursor.fetchone()
        cfg_dict = dict(row) if row else {}
    finally:
        conn.close()

    dongle_cfg = DongleConfig.from_dict(cfg_dict)

    retention_task: Optional[asyncio.Task] = None

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        nonlocal retention_task
        logger.info("Starting SDR-Recorder NVR backend engine...")

        # Start background retention worker in non-test mode
        if not app.state.test_mode:
            retention_task = asyncio.create_task(
                retention_worker(
                    db_path=resolved_db_path,
                    storage_dir=config.STORAGE_DIR,
                    interval_seconds=3600,
                )
            )

        # Start receiver loop in non-test mode
        if not app.state.test_mode and not app.state.receiver.is_running:
            await app.state.receiver.start()

        yield

        logger.info("Shutting down SDR-Recorder NVR backend engine...")
        if retention_task and not retention_task.done():
            retention_task.cancel()
            try:
                await retention_task
            except asyncio.CancelledError:
                pass

        if hasattr(app.state, "receiver") and app.state.receiver:
            if app.state.receiver.is_running:
                await app.state.receiver.stop()

    app = FastAPI(
        title="SDR-Recorder NVR",
        description="Airband & Public Safety SDR Multi-Channel Recorder NVR Backend",
        version="1.0.0",
        lifespan=lifespan,
    )

    # Attach state
    app.state.db_path = resolved_db_path
    app.state.force_simulator = force_simulator
    app.state.test_mode = test_mode
    app.state.receiver = SDRReceiver(
        config=dongle_cfg,
        force_simulator=force_simulator or test_mode,
    )

    # Register transmission completed callback to persist audio & metadata
    async def handle_transmission_end(event: TransmissionEvent) -> None:
        try:
            conn = get_connection(resolved_db_path)
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT audio_format FROM system_settings WHERE id = 1")
                s_row = cursor.fetchone()
                audio_format = s_row["audio_format"] if s_row else "wav"
                save_transmission(
                    db_conn=conn,
                    storage_dir=config.RECORDINGS_DIR,
                    event=event,
                    audio_format=audio_format,
                    sample_rate=app.state.receiver.sample_rate,
                )
            finally:
                conn.close()
        except Exception as e:
            logger.error(f"Error saving transmission recording: {e}", exc_info=True)

    app.state.receiver.on_transmission_end_callback = handle_transmission_end

    # Initialize WebSocket connection manager and receiver chunk callback
    ws_mgr = ConnectionManager()
    app.state.ws_manager = ws_mgr

    async def handle_receiver_chunk(chunk: bytes, result: Any) -> None:
        await ws_mgr.handle_chunk(chunk, result, receiver=app.state.receiver)

    app.state.receiver.on_chunk_callback = handle_receiver_chunk

    # CORS Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount API routers
    app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
    app.include_router(radio_router, prefix="/api/radio", tags=["Radio Control"])
    app.include_router(recordings_router, prefix="/api/recordings", tags=["Recordings Archive"])
    app.include_router(system_router, prefix="/api/system", tags=["System & Telemetry"])
    app.include_router(ws_router, tags=["WebSocket Live Stream"])

    @app.get("/api/health")
    def health_check() -> Dict[str, Any]:
        return {
            "status": "ok",
            "is_simulator": app.state.receiver.is_simulator,
            "is_running": app.state.receiver.is_running,
        }

    return app


# Default application instance
app = create_app()
