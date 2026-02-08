"""FastAPI application with lifespan for MCP client management."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.rest import router as rest_router
from api.websocket import router as ws_router
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
app.include_router(rest_router)
app.include_router(ws_router)


if __name__ == "__main__":
    import uvicorn

    from config import settings

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
