"""MCP Client Manager - lifecycle management for all MCP server connections."""

from __future__ import annotations

import logging
from contextlib import AsyncExitStack

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamablehttp_client

from config import settings
from mcp_client.types import ToolDescriptor

logger = logging.getLogger(__name__)


class MCPClientManager:
    """Manages connections to Meraki (stdio) and ThousandEyes (SSE) MCP servers."""

    def __init__(self) -> None:
        self._exit_stack = AsyncExitStack()
        self._meraki_session: ClientSession | None = None
        self._te_session: ClientSession | None = None
        self._tools: list[ToolDescriptor] = []
        self._tool_map: dict[str, ToolDescriptor] = {}

    @property
    def tools(self) -> list[ToolDescriptor]:
        return list(self._tools)

    @property
    def meraki_connected(self) -> bool:
        return self._meraki_session is not None

    @property
    def te_connected(self) -> bool:
        return self._te_session is not None

    async def connect(self) -> None:
        """Connect to all configured MCP servers and discover tools."""
        await self._connect_meraki()
        await self._connect_thousandeyes()
        logger.info(
            "MCP client ready: %d tools (%d Meraki, %d ThousandEyes)",
            len(self._tools),
            sum(1 for t in self._tools if t.source == "meraki"),
            sum(1 for t in self._tools if t.source == "thousandeyes"),
        )

    async def disconnect(self) -> None:
        """Disconnect all MCP sessions."""
        await self._exit_stack.aclose()
        self._meraki_session = None
        self._te_session = None
        self._tools.clear()
        self._tool_map.clear()
        logger.info("MCP client disconnected")

    async def _connect_meraki(self) -> None:
        """Connect to Meraki MCP via stdio (local subprocess)."""
        if not settings.meraki_mcp_script or not settings.meraki_mcp_venv_fastmcp:
            logger.warning("Meraki MCP not configured (MERAKI_MCP_SCRIPT / MERAKI_MCP_VENV_FASTMCP not set)")
            return

        try:
            server_params = StdioServerParameters(
                command=settings.meraki_mcp_venv_fastmcp,
                args=["run", settings.meraki_mcp_script, "--transport", "stdio"],
                env=settings.meraki_subprocess_env(),
            )
            transport = await self._exit_stack.enter_async_context(
                stdio_client(server_params)
            )
            session = await self._exit_stack.enter_async_context(
                ClientSession(transport[0], transport[1])
            )
            await session.initialize()
            self._meraki_session = session

            # Discover tools
            tools_result = await session.list_tools()
            for tool in tools_result.tools:
                descriptor = ToolDescriptor(
                    name=tool.name,
                    description=tool.description or "",
                    source="meraki",
                    input_schema=tool.inputSchema if hasattr(tool, "inputSchema") else {},
                )
                self._tools.append(descriptor)
                self._tool_map[tool.name] = descriptor

            logger.info("Meraki MCP connected: %d tools discovered", len(tools_result.tools))
        except Exception:
            logger.exception("Failed to connect to Meraki MCP")

    async def _connect_thousandeyes(self) -> None:
        """Connect to ThousandEyes MCP via Streamable HTTP (remote)."""
        if not settings.te_mcp_url or not settings.te_token:
            logger.warning("ThousandEyes MCP not configured (TE_MCP_URL / TE_TOKEN not set)")
            return

        try:
            headers = {"Authorization": f"Bearer {settings.te_token}"}
            transport = await self._exit_stack.enter_async_context(
                streamablehttp_client(url=settings.te_mcp_url, headers=headers)
            )
            session = await self._exit_stack.enter_async_context(
                ClientSession(transport[0], transport[1])
            )
            await session.initialize()
            self._te_session = session

            # Discover tools
            tools_result = await session.list_tools()
            for tool in tools_result.tools:
                descriptor = ToolDescriptor(
                    name=tool.name,
                    description=tool.description or "",
                    source="thousandeyes",
                    input_schema=tool.inputSchema if hasattr(tool, "inputSchema") else {},
                )
                self._tools.append(descriptor)
                self._tool_map[tool.name] = descriptor

            logger.info("ThousandEyes MCP connected: %d tools discovered", len(tools_result.tools))
        except Exception:
            logger.exception("Failed to connect to ThousandEyes MCP")

    async def call_tool(self, tool_name: str, arguments: dict | None = None) -> dict:
        """Call an MCP tool by name, routing to the correct session."""
        descriptor = self._tool_map.get(tool_name)
        if descriptor is None:
            return {"error": f"Unknown tool: {tool_name}"}

        session = (
            self._meraki_session if descriptor.source == "meraki" else self._te_session
        )
        if session is None:
            return {"error": f"MCP session not connected for source: {descriptor.source}"}

        try:
            result = await session.call_tool(tool_name, arguments or {})
            # Extract text content from MCP result
            contents = []
            for block in result.content:
                if hasattr(block, "text"):
                    contents.append(block.text)
            return {
                "tool": tool_name,
                "source": descriptor.source,
                "content": "\n".join(contents) if contents else str(result.content),
            }
        except Exception as e:
            logger.exception("Error calling tool %s", tool_name)
            return {"error": f"Tool call failed: {e}", "tool": tool_name}

    def get_tools_for_agent(self, agent_type: str) -> list[ToolDescriptor]:
        """Get tools available to a specific agent type.

        Uses per-agent allowlists to keep tool counts low and reduce LLM
        context size / latency.  If an agent isn't listed here it gets
        nothing (safe default).
        """
        allowed = _AGENT_TOOL_ALLOWLIST.get(agent_type)
        if allowed is None:
            return []
        return [t for t in self._tools if t.name in allowed]


# ---------------------------------------------------------------------------
# Per-agent tool allowlists
# Only include the tools each agent genuinely needs.  This keeps the LLM
# context small and responses fast.
# ---------------------------------------------------------------------------

_DISCOVERY_TOOLS = {
    # Meraki
    "getOrganizations",
    "getOrganizationNetworks",
    "getOrganizationDevices",
    "getNetwork",
    "getNetworkDevices",
    "getNetworkClients",
    "getNetworkWirelessSsids",
    "getDevice",
    "call_meraki_api",
    # ThousandEyes
    "get_account_groups",
    "list_network_app_synthetics_tests",
    "list_cloud_enterprise_agents",
    "list_endpoint_agents",
}

_TROUBLESHOOTING_TOOLS = {
    # Meraki
    "getOrganizationNetworks",
    "getNetworkDevices",
    "getNetworkClients",
    "getNetworkEvents",
    "getNetworkWirelessSsids",
    "getDevice",
    "call_meraki_api",
    # ThousandEyes
    "list_network_app_synthetics_tests",
    "get_network_app_synthetics_test",
    "get_network_app_synthetics_metrics",
    "get_endpoint_agent_metrics",
    "get_anomalies",
    "list_alerts",
    "get_path_visualization_results",
    "get_full_path_visualization",
    "list_cloud_enterprise_agents",
    "list_endpoint_agents",
}

_SECURITY_TOOLS = {
    # Meraki
    "getOrganizationNetworks",
    "getNetworkDevices",
    "getNetworkEvents",
    "getDevice",
    "call_meraki_api",
    # ThousandEyes
    "list_alerts",
    "get_alert",
    "list_events",
    "get_event",
    "search_outages",
    "get_anomalies",
}

_COMPLIANCE_TOOLS = {
    # Meraki only
    "getOrganizationNetworks",
    "getOrganizationDevices",
    "getNetworkDevices",
    "getNetworkWirelessSsids",
    "getDeviceSwitchPorts",
    "getDevice",
    "call_meraki_api",
}

_AGENT_TOOL_ALLOWLIST: dict[str, set[str]] = {
    "discovery": _DISCOVERY_TOOLS,
    "troubleshooting": _TROUBLESHOOTING_TOOLS,
    "security": _SECURITY_TOOLS,
    "compliance": _COMPLIANCE_TOOLS,
}


# Global singleton
mcp_manager = MCPClientManager()
