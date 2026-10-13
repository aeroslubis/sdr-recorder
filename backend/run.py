"""Production and development runner for SDR-Recorder NVR.

Runs FastAPI backend using uvicorn and mounts frontend static build from frontend/dist
with Single Page Application (SPA) index.html fallback when dist directory exists.
"""
import argparse
import os
import sys
from pathlib import Path

import uvicorn
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.main import create_app


def build_app(force_simulator: bool = False):
    """Creates the FastAPI app and configures SPA static asset mounting if built frontend exists."""
    app = create_app(force_simulator=force_simulator)

    base_dir = Path(__file__).resolve().parent.parent
    dist_dir = base_dir / "frontend" / "dist"

    if dist_dir.exists() and dist_dir.is_dir():
        assets_dir = dist_dir / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="static_assets")

        @app.get("/{full_path:path}")
        async def serve_spa_frontend(full_path: str):
            # If path matches a static file in dist, serve it
            target_path = dist_dir / full_path
            if full_path and target_path.exists() and target_path.is_file():
                return FileResponse(str(target_path))

            # SPA index.html fallback for client-side routing
            index_path = dist_dir / "index.html"
            if index_path.exists():
                return FileResponse(str(index_path))

            return {"detail": "Frontend assets not found"}

    return app


def main():
    parser = argparse.ArgumentParser(description="SDR-Recorder NVR Server")
    parser.add_argument("--host", default=os.environ.get("SDR_HOST", "0.0.0.0"), help="Host IP to bind (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=int(os.environ.get("SDR_PORT", "8000")), help="Port to bind (default: 8000)")
    parser.add_argument("--simulator", action="store_true", help="Force Mock SDR Simulator mode")
    parser.add_argument("--reload", action="store_true", help="Enable uvicorn auto-reload")
    args = parser.parse_args()

    force_sim = args.simulator or os.environ.get("SDR_FORCE_SIMULATOR", "").lower() in ["1", "true", "yes"]

    app = build_app(force_simulator=force_sim)

    print(f"==================================================")
    print(f"       SDR-Recorder NVR Server Starting           ")
    print(f"==================================================")
    print(f" Binding Address  : http://{args.host}:{args.port}")
    print(f" Simulator Mode   : {force_sim}")
    print(f" Frontend Dist    : {Path(__file__).resolve().parent.parent / 'frontend' / 'dist'}")
    print(f" Default Login    : admin / 12345")
    print(f"==================================================")

    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info",
    )


if __name__ == "__main__":
    main()
