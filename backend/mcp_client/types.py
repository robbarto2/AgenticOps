"""Shared types for MCP tool descriptors."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ToolDescriptor:
    """Describes a single MCP tool discovered from a server."""

    name: str
    description: str
    source: str  # "meraki" or "thousandeyes"
    input_schema: dict = field(default_factory=dict)
