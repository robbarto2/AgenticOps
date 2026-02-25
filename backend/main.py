"""FastAPI application with lifespan for MCP client management."""

from __future__ import annotations

# Fix httpx SSL: httpx uses certifi's cert bundle instead of the system cert
# store, which misses locally-installed CAs (e.g. Cisco/Meraki).  Point
# certifi.where() at the system OpenSSL cert file so httpx picks it up.
import ssl as _ssl
_sys_cert = _ssl.get_default_verify_paths().openssl_cafile
if _sys_cert:
    import certifi as _certifi
    _certifi.where = lambda: _sys_cert

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.rest import router as rest_router
from api.websocket import router as ws_router
from api.health import router as health_router
from api.devices import router as devices_router
from api.settings import router as settings_router
from mcp_client.manager import mcp_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: connect MCP clients. Shutdown: disconnect."""
    logger.info("AgenticOps starting up...")
    await mcp_manager.connect()
    logger.info("AgenticOps ready")
    yield
    logger.info("AgenticOps shutting down...")
    await mcp_manager.disconnect()


app = FastAPI(
    title="AgenticOps",
    description="AI-powered network operations with multi-agent architecture",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health_router)
app.include_router(rest_router)
app.include_router(devices_router)
app.include_router(settings_router)
app.include_router(ws_router)


if __name__ == "__main__":
    import uvicorn

    from config import settings

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        ws_max_size=50_000_000,  # 50MB for base64 image uploads
    )
