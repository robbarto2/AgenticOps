"""MCP tool wrappers as LangChain-compatible tools."""

from __future__ import annotations

import json
import logging

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field, create_model

from mcp_client.manager import mcp_manager

logger = logging.getLogger(__name__)


async def _call_mcp_tool(tool_name: str, **kwargs) -> str:
    """Call an MCP tool and return the result as a string."""
    # Filter out empty string values and empty lists
    arguments = {}
    for k, v in kwargs.items():
        if isinstance(v, str) and v == "":
            continue
        if isinstance(v, list) and len(v) == 0:
            continue
        arguments[k] = v

    # Log tool calls for debugging (especially to check productTypes parameter)
    logger.info("MCP tool call: %s with args: %s", tool_name, arguments)

    result = await mcp_manager.call_tool(tool_name, arguments)
    if "error" in result:
        return f"Error: {result['error']}"
    content = result.get("content", json.dumps(result))

    # Inject an explicit item count so the LLM doesn't have to count
    # items in large JSON arrays (which is error-prone and inconsistent).
    content = _inject_item_count(content)

    return content


def _inject_item_count(content: str) -> str:
    """If content is a JSON array or truncated response, prepend the total count."""
    try:
        parsed = json.loads(content)
    except (json.JSONDecodeError, ValueError, TypeError):
        return content

    if isinstance(parsed, list):
        return f"[Total items returned: {len(parsed)}]\n{content}"

    if isinstance(parsed, dict):
        # Handle MCP truncated responses that include a total count
        total = parsed.get("_total_count")
        preview = parsed.get("_preview")
        if parsed.get("_response_truncated") and total is not None:
            preview_count = len(preview) if isinstance(preview, list) else "?"
            return (
                f"[Total items: {total} (response truncated, showing preview of {preview_count})]\n"
                f"{content}"
            )
        # Handle wrapper objects with a data/results/items list
        for key in ("data", "results", "items", "tests", "networks"):
            inner = parsed.get(key)
            if isinstance(inner, list) and len(inner) > 0:
                return f"[Total items in '{key}': {len(inner)}]\n{content}"

    return content


def _make_invoke(tool_name: str):
    """Create a closure that invokes the named MCP tool."""
    async def _invoke(**kwargs) -> str:
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
            prop_type = prop_info.get("type", "string")

            # Determine the Python type based on JSON schema type
            if prop_type == "array":
                # Array types become list[str]
                items_type = prop_info.get("items", {}).get("type", "string")
                if items_type == "string":
                    python_type = list[str]
                    default_value = [] if prop_name not in required_fields else ...
                else:
                    # Fallback for other array item types
                    python_type = list
                    default_value = [] if prop_name not in required_fields else ...
            else:
                # Everything else defaults to str for now
                python_type = str
                default_value = "" if prop_name not in required_fields else ...

            if prop_name in required_fields:
                schema_fields[prop_name] = (python_type, Field(description=description))
            else:
                schema_fields[prop_name] = (python_type, Field(default=default_value, description=description))

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
