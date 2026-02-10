"""MCP tool wrappers as LangChain-compatible tools."""

from __future__ import annotations

import json
import logging

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field, create_model

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


def _make_invoke(tool_name: str):
    """Create a closure that invokes the named MCP tool."""
    async def _invoke(**kwargs: str) -> str:
        return await _call_mcp_tool(tool_name, **kwargs)
    return _invoke


def build_langchain_tools(agent_type: str) -> list[StructuredTool]:
    """Build LangChain tools from MCP tool descriptors for a given agent type."""
    descriptors = mcp_manager.get_tools_for_agent(agent_type)
    tools = []

    for desc in descriptors:
        # Build a proper Pydantic args schema from the MCP input schema
        properties = desc.input_schema.get("properties", {})
        required_fields = set(desc.input_schema.get("required", []))

        schema_fields: dict[str, tuple] = {}
        for prop_name, prop_info in properties.items():
            description = prop_info.get("description", "")
            if prop_name in required_fields:
                schema_fields[prop_name] = (str, Field(description=description))
            else:
                schema_fields[prop_name] = (str, Field(default="", description=description))

        args_schema = create_model(
            f"{desc.name}_Schema",
            __base__=BaseModel,
            **schema_fields,
        ) if schema_fields else None

        invoke_fn = _make_invoke(desc.name)

        tool = StructuredTool.from_function(
            coroutine=invoke_fn,
            name=desc.name,
            description=desc.description[:1024],
            args_schema=args_schema,
        )
        tools.append(tool)

    logger.info("Built %d LangChain tools for agent '%s'", len(tools), agent_type)
    return tools
