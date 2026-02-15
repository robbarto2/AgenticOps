"""Health check endpoint for monitoring backend status."""

from fastapi import APIRouter

from mcp_client.manager import mcp_manager

router = APIRouter()


@router.get("/api/health")
async def health_check() -> dict:
    """Health check endpoint - returns backend status and MCP connection status."""
    return {
        "status": "healthy",
        "meraki_connected": mcp_manager.meraki_connected,
        "thousandeyes_connected": mcp_manager.te_connected,
        "total_tools": len(mcp_manager.tools),
    }
