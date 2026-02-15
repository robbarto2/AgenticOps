"""Pydantic request/response models for the API."""

from __future__ import annotations

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    meraki_connected: bool
    meraki_tools: int
    thousandeyes_connected: bool
    thousandeyes_tools: int
    total_tools: int


class SkillInfo(BaseModel):
    """Skill metadata."""

    name: str
    agent: str
    file: str
    description: str


class SkillsResponse(BaseModel):
    """Skills list response."""

    skills: list[SkillInfo]
    count: int


class EntityStatsResponse(BaseModel):
    """Live stats for a network entity."""

    deviceCount: int
    clientCount: int
    ssidCount: int


class DeviceDetail(BaseModel):
    """Single device entry."""

    name: str
    model: str
    serial: str
    status: str


class ClientDetail(BaseModel):
    """Single client entry."""

    description: str
    mac: str
    ip: str
    vlan: str


class SsidDetail(BaseModel):
    """Single SSID entry."""

    name: str
    authMode: str
    enabled: bool


class WebSocketMessage(BaseModel):
    """Incoming WebSocket message from client."""

    type: str  # "user_message"
    content: str
    session_id: str = "default"


class WebSocketEvent(BaseModel):
    """Outgoing WebSocket event to client."""

    type: str  # "agent_start", "tool_call", "text", "card", "done", "error"
    data: dict | str | None = None
