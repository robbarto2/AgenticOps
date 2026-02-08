"""MCP tool wrappers as LangChain-compatible tools."""

from __future__ import annotations

import json
import logging

from langchain_core.tools import StructuredTool

from mcp_client.manager import mcp_manager

logger = logging.getLogger(__name__)


async def _call_mcp_tool(tool_name: str, **kwargs: str) -> str:
    """Call an MCP tool and return the result as a string."""
    # Filter out empty string values
    arguments = {k: v for k, v in kwargs.items() if v != ""}
    result = await mcp_manager.call_tool(tool_name, arguments)
    if "error" in result:
        return f"Error: {result['error']}"
    return result.get("content", json.dumps(result))


def build_langchain_tools(agent_type: str) -> list[StructuredTool]:
    """Build LangChain tools from MCP tool descriptors for a given agent type."""
    descriptors = mcp_manager.get_tools_for_agent(agent_type)
    tools = []

    for desc in descriptors:
        # Create a closure to capture the tool name
        tool_name = desc.name

        async def _invoke(tool_name: str = tool_name, **kwargs: str) -> str:
            return await _call_mcp_tool(tool_name, **kwargs)

        # Build the args schema from the MCP input schema
        properties = desc.input_schema.get("properties", {})
        required = desc.input_schema.get("required", [])

        # Create field descriptions for the tool
        args_schema_fields: dict[str, tuple] = {}
        for prop_name, prop_info in properties.items():
            field_type = str  # MCP tools use string args
            description = prop_info.get("description", "")
            default = ... if prop_name in required else ""
            args_schema_fields[prop_name] = (field_type, default)

        tool = StructuredTool.from_function(
            coroutine=_invoke,
            name=tool_name,
            description=desc.description[:1024],  # LangChain has description limits
        )
        tools.append(tool)

    logger.info("Built %d LangChain tools for agent '%s'", len(tools), agent_type)
    return tools
