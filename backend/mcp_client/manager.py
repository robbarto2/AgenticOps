"""MCP Client Manager - lifecycle management for all MCP server connections."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from contextlib import AsyncExitStack

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamablehttp_client

from config import settings
from mcp_client.types import ToolDescriptor

logger = logging.getLogger(__name__)

# Rate limiting: minimum delay between API calls (in seconds)
MIN_CALL_INTERVAL = 0.1  # 100ms between calls = max 10 calls/sec

# Cache TTL: how long to cache results (in seconds)
CACHE_TTL = 3600  # 1 hour (aggressive caching to minimize API traffic and avoid rate limits)

# Retry settings for rate limit errors
MAX_RETRIES = 3
RETRY_DELAY = 1.0  # Initial retry delay in seconds

# Per-attempt timeout for a single MCP tool call (seconds).
# Keeps any one API call from blocking indefinitely when the Meraki
# API is slow or unresponsive. Agents have their own outer timeout
# on top of this.
MCP_CALL_TIMEOUT_SEC = 20

# Strings that indicate a rate-limit error in MCP response content
_RATE_LIMIT_MARKERS = ("429", "rate limit", "too many requests", "rate-limit")


class MCPClientManager:
    """Manages connections to Meraki (stdio) and ThousandEyes (SSE) MCP servers."""

    def __init__(self) -> None:
        self._exit_stack = AsyncExitStack()
        self._meraki_session: ClientSession | None = None
        self._te_session: ClientSession | None = None
        self._tools: list[ToolDescriptor] = []
        self._tool_map: dict[str, ToolDescriptor] = {}

        # Per-source rate limiting so Meraki and TE calls don't block each other
        self._last_call_time: dict[str, float] = {"meraki": 0, "thousandeyes": 0}
        self._throttle_lock: dict[str, asyncio.Lock] = {
            "meraki": asyncio.Lock(),
            "thousandeyes": asyncio.Lock(),
        }

        # Cache: {cache_key: (result, timestamp)}
        self._cache: dict[str, tuple[dict, float]] = {}

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
        cache_size = len(self._cache)
        self._cache.clear()
        logger.info("MCP client disconnected (cleared %d cached entries)", cache_size)

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
        except Exception as e:
            logger.error("Failed to connect to ThousandEyes MCP: %s", str(e))
            logger.debug("Full error:", exc_info=True)

    def _make_cache_key(self, tool_name: str, arguments: dict | None) -> str:
        """Generate a cache key from tool name and arguments."""
        args_json = json.dumps(arguments or {}, sort_keys=True)
        key_str = f"{tool_name}:{args_json}"
        return hashlib.md5(key_str.encode()).hexdigest()

    def _get_cached(self, cache_key: str) -> dict | None:
        """Get cached result if still valid, otherwise return None."""
        if cache_key in self._cache:
            result, timestamp = self._cache[cache_key]
            if time.time() - timestamp < CACHE_TTL:
                logger.debug("Cache HIT for key %s (age: %.1fs)", cache_key[:8], time.time() - timestamp)
                return result
            else:
                # Expired, remove from cache
                del self._cache[cache_key]
                logger.debug("Cache EXPIRED for key %s", cache_key[:8])
        return None

    def _cache_result(self, cache_key: str, result: dict) -> None:
        """Store result in cache with current timestamp."""
        self._cache[cache_key] = (result, time.time())
        logger.debug("Cache STORE for key %s (%d total cached)", cache_key[:8], len(self._cache))

    async def _throttle(self, source: str = "meraki") -> None:
        """Apply per-source rate limiting by waiting if needed.

        Uses an asyncio.Lock so that concurrent callers (e.g. from
        asyncio.gather) properly queue up instead of all reading the
        same _last_call_time and firing simultaneously.  Meraki and
        ThousandEyes each have independent throttle state.
        """
        lock = self._throttle_lock.get(source, self._throttle_lock["meraki"])
        async with lock:
            now = time.time()
            time_since_last = now - self._last_call_time.get(source, 0)
            if time_since_last < MIN_CALL_INTERVAL:
                wait_time = MIN_CALL_INTERVAL - time_since_last
                logger.debug("Throttling %s: waiting %.3fs before next API call", source, wait_time)
                await asyncio.sleep(wait_time)
            self._last_call_time[source] = time.time()

    @staticmethod
    def _is_rate_limit(text: str) -> bool:
        """Check if text contains rate-limit indicators."""
        lower = text.lower()
        return any(marker in lower for marker in _RATE_LIMIT_MARKERS)

    async def call_tool(self, tool_name: str, arguments: dict | None = None, *, skip_cache: bool = False) -> dict:
        """Call an MCP tool by name, routing to the correct session.

        Implements caching, rate limiting, and retry with exponential backoff.
        Detects rate-limit errors both from exceptions AND from MCP response content.

        When *skip_cache* is True the cached lookup is bypassed but the fresh
        result is still stored, benefiting subsequent callers.
        """
        descriptor = self._tool_map.get(tool_name)
        if descriptor is None:
            return {"error": f"Unknown tool: {tool_name}"}

        # Check cache first (only for read operations, not writes)
        cache_key = self._make_cache_key(tool_name, arguments)
        if not skip_cache:
            cached = self._get_cached(cache_key)
            if cached is not None:
                return cached

        session = (
            self._meraki_session if descriptor.source == "meraki" else self._te_session
        )
        if session is None:
            source_name = "Meraki" if descriptor.source == "meraki" else "ThousandEyes"
            return {"error": f"I'm having trouble connecting to {source_name}. Please try again in a moment."}

        # Retry loop with exponential backoff for rate limits
        for attempt in range(MAX_RETRIES):
            # Apply per-source rate limiting before each attempt
            await self._throttle(descriptor.source)

            try:
                result = await asyncio.wait_for(
                    session.call_tool(tool_name, arguments or {}),
                    timeout=MCP_CALL_TIMEOUT_SEC,
                )
                # Extract text content from MCP result
                contents = []
                for block in result.content:
                    if hasattr(block, "text"):
                        contents.append(block.text)

                content_text = "\n".join(contents) if contents else str(result.content)

                # Check if the MCP server returned a rate-limit error as content
                if self._is_rate_limit(content_text) and attempt < MAX_RETRIES - 1:
                    delay = RETRY_DELAY * (2 ** attempt)
                    logger.warning(
                        "Rate limit in response content for tool %s (attempt %d/%d), retrying in %.1fs",
                        tool_name, attempt + 1, MAX_RETRIES, delay
                    )
                    await asyncio.sleep(delay)
                    continue

                response = {
                    "tool": tool_name,
                    "source": descriptor.source,
                    "content": content_text,
                }

                # Only cache successful results (not error or rate-limit responses)
                if result.isError:
                    logger.debug("Skipping cache for error response from tool %s", tool_name)
                elif self._is_rate_limit(content_text):
                    logger.warning("Skipping cache for rate-limited response from tool %s", tool_name)
                else:
                    self._cache_result(cache_key, response)

                return response

            except asyncio.TimeoutError:
                logger.warning(
                    "Tool call %s timed out after %ds (attempt %d/%d)",
                    tool_name, MCP_CALL_TIMEOUT_SEC, attempt + 1, MAX_RETRIES,
                )
                # Don't retry on timeout — the API is slow, not rate-limited
                source_name = "Meraki" if descriptor.source == "meraki" else "ThousandEyes"
                return {
                    "error": f"{source_name} API did not respond within {MCP_CALL_TIMEOUT_SEC}s. "
                             "It may be slow or rate-limited. Please try again.",
                    "tool": tool_name,
                }

            except Exception as e:
                error_str = str(e).lower()

                # Check if this is a rate limit error
                if self._is_rate_limit(error_str) and attempt < MAX_RETRIES - 1:
                    delay = RETRY_DELAY * (2 ** attempt)
                    logger.warning(
                        "Rate limit exception on tool %s (attempt %d/%d), retrying in %.1fs",
                        tool_name, attempt + 1, MAX_RETRIES, delay
                    )
                    await asyncio.sleep(delay)
                    continue

                # Not a rate limit error, or out of retries
                logger.exception("Error calling tool %s (attempt %d/%d)", tool_name, attempt + 1, MAX_RETRIES)
                break

        # All retries failed
        source_name = "Meraki" if descriptor.source == "meraki" else "ThousandEyes"
        return {"error": f"I'm having trouble connecting to {source_name}. Please try again in a moment.", "tool": tool_name}

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
    "getOrganizationDevicesStatuses",
    "getNetwork",
    "getNetworkDevices",
    "getNetworkClients",
    "getNetworkEvents",
    "getNetworkWirelessSsids",
    "getDevice",
    "call_meraki_api",
    "search_methods",
    "get_method_info",
    # ThousandEyes
    "get_account_groups",
    "list_network_app_synthetics_tests",
    "get_network_app_synthetics_test",
    "list_cloud_enterprise_agents",
    "list_endpoint_agents",
    "list_endpoint_agent_tests",
}

_TROUBLESHOOTING_TOOLS = {
    # Meraki
    "getOrganizationNetworks",
    "getNetworkDevices",
    "getOrganizationDevicesStatuses",
    "getNetworkClients",
    "getNetworkEvents",
    "getNetworkWirelessSsids",
    "getDevice",
    "call_meraki_api",
    "search_methods",
    "get_method_info",
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
    "list_endpoint_agent_tests",
    "get_bgp_route_test_results",
    "list_events",
    "get_event",
    "search_outages",
}

_SECURITY_TOOLS = {
    # Meraki
    "getOrganizationNetworks",
    "getNetworkDevices",
    "getNetworkEvents",
    "getNetworkClients",
    "getNetworkWirelessSsids",
    "getDeviceSwitchPorts",
    "getDevice",
    "call_meraki_api",
    "search_methods",
    "get_method_info",
    # ThousandEyes
    "list_alerts",
    "get_alert",
    "list_events",
    "get_event",
    "search_outages",
    "get_anomalies",
}

_COMPLIANCE_TOOLS = {
    # Meraki
    "getOrganizationNetworks",
    "getOrganizationDevices",
    "getNetworkDevices",
    "getNetworkWirelessSsids",
    "getDeviceSwitchPorts",
    "getDevice",
    "call_meraki_api",
    "search_methods",
    "get_method_info",
    # ThousandEyes
    "list_network_app_synthetics_tests",
    "get_network_app_synthetics_test",
    "list_alerts",
    "get_alert",
}

_TESTING_TOOLS = {
    # ThousandEyes instant tests
    "run_agent_to_server_instant_test",
    "run_http_server_instant_test",
    "run_page_load_instant_test",
    "run_web_transaction_instant_test",
    "run_api_instant_test",
    "run_dns_server_instant_test",
    "run_dns_trace_instant_test",
    "run_agent_to_agent_instant_test",
    "rerun_instant_test",
    "get_instant_test_metrics",
    # ThousandEyes templates
    "get_templates",
    "deploy_template",
    # ThousandEyes agent discovery (find agents to run from)
    "list_cloud_enterprise_agents",
    "list_endpoint_agents",
}

_REMEDIATION_TOOLS = {
    # Meraki write operations
    "updateDeviceSwitchPort",
    "call_meraki_api",
    # Meraki API discovery (find the right method/params before writing)
    "search_methods",
    "get_method_info",
    # Meraki read-only lookups (resolve IDs before writing)
    "getOrganizationNetworks",
    "getNetworkDevices",
    "getDevice",
    "getNetworkWirelessSsids",
    "getDeviceSwitchPorts",
}

_TOPOLOGY_TOOLS = {
    # Meraki - topology discovery
    "getOrganizationNetworks",
    "getNetworkDevices",
    "getDevice",
    "getOrganizationDevicesUplinksAddressesByDevice",
    "call_meraki_api",  # For LLDP/CDP: GET /devices/{serial}/lldpCdp
    "search_methods",
    "get_method_info",
}

_PERFORMANCE_TOOLS = {
    # ThousandEyes — test discovery and metrics
    "list_network_app_synthetics_tests",
    "get_network_app_synthetics_test",
    "get_network_app_synthetics_metrics",
    "get_endpoint_agent_metrics",
    "get_anomalies",
    "list_alerts",
    "get_path_visualization_results",
    "get_full_path_visualization",
    "get_bgp_route_test_results",
    "list_cloud_enterprise_agents",
    "list_endpoint_agents",
    "list_endpoint_agent_tests",
    # Meraki — network lookup and uplink performance
    "getOrganizationNetworks",
    "call_meraki_api",
    "search_methods",
    "get_method_info",
}

_WIFI_TOOLS = {
    # Meraki — network/device lookup
    "getOrganizationNetworks",
    "getNetworkDevices",
    "getOrganizationDevicesStatuses",
    "getNetworkWirelessSsids",
    "getNetworkClients",
    "getDevice",
    # Meraki — dynamic API access for wireless-specific methods
    "call_meraki_api",
    # NOTE: search_methods / get_method_info intentionally excluded —
    # skill files already list the exact methods; including these wastes
    # LLM iterations on API schema exploration.
}

_AGENT_TOOL_ALLOWLIST: dict[str, set[str]] = {
    "discovery": _DISCOVERY_TOOLS,
    "troubleshooting": _TROUBLESHOOTING_TOOLS,
    "security": _SECURITY_TOOLS,
    "compliance": _COMPLIANCE_TOOLS,
    "testing": _TESTING_TOOLS,
    "remediation": _REMEDIATION_TOOLS,
    "topology": _TOPOLOGY_TOOLS,
    "performance": _PERFORMANCE_TOOLS,
    "wifi": _WIFI_TOOLS,
}


# Global singleton
mcp_manager = MCPClientManager()
