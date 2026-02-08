"""REST API endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from api.models import HealthResponse, SkillInfo, SkillsResponse
from mcp_client.manager import mcp_manager
from skills.loader import list_skills

router = APIRouter(prefix="/api")


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Health check: reports MCP connection status and tool counts."""
    tools = mcp_manager.tools
    meraki_count = sum(1 for t in tools if t.source == "meraki")
    te_count = sum(1 for t in tools if t.source == "thousandeyes")

    return HealthResponse(
        status="ok",
        meraki_connected=mcp_manager.meraki_connected,
        meraki_tools=meraki_count,
        thousandeyes_connected=mcp_manager.te_connected,
        thousandeyes_tools=te_count,
        total_tools=len(tools),
    )


@router.get("/skills", response_model=SkillsResponse)
async def get_skills() -> SkillsResponse:
    """List all available skills."""
    skills = list_skills()
    return SkillsResponse(
        skills=[SkillInfo(**s) for s in skills],
        count=len(skills),
    )
