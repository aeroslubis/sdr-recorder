"""Main FastAPI Application and lifecycle management for SDR-Recorder NVR."""
import logging
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend import config
from backend.database import get_connection, init_db
from backend.routers.auth_router import router as auth_router
from backend.routers.radio_router import router as radio_router
from backend.sdr.dongle_config import DongleConfig
from backend.sdr.receiver import SDRReceiver

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

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info("Starting SDR-Recorder NVR backend engine...")
        # Start receiver loop in non-test mode
        if not app.state.test_mode and not app.state.receiver.is_running:
            await app.state.receiver.start()

        yield

        logger.info("Shutting down SDR-Recorder NVR backend engine...")
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
