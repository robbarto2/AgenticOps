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


class ProblemDevice(BaseModel):
    """A device that is offline or alerting."""

    name: str
    model: str
    serial: str
    status: str


class EntityStatsResponse(BaseModel):
    """Live stats for a network entity."""

    deviceCount: int
    clientCount: int
    ssidCount: int
    onlineCount: int = -1
    offlineCount: int = -1
    alertingCount: int = -1
    location: str | None = None
    problemDevices: list[ProblemDevice] = []


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


class ChannelUtilization(BaseModel):
    """Channel utilization for a wireless band."""

    band: str  # '2.4', '5', or '6'
    utilization: float  # 0-100 percentage


class LldpCdpNeighbor(BaseModel):
    """LLDP/CDP neighbor info for a single port."""

    sourcePort: str
    switchName: str | None = None
    switchPort: str | None = None
    switchIp: str | None = None
    protocol: str  # "lldp", "cdp", or "both"


class WebSocketMessage(BaseModel):
    """Incoming WebSocket message from client."""

    type: str  # "user_message"
    content: str
    session_id: str = "default"


class WebSocketEvent(BaseModel):
    """Outgoing WebSocket event to client."""

    type: str  # "agent_start", "tool_call", "text", "card", "done", "error"
    data: dict | str | None = None
