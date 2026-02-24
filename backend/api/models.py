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


class WanUplinkAlert(BaseModel):
    """A WAN uplink that is failed or not connected."""

    deviceName: str
    serial: str
    interface: str
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
    wanAlerts: list[WanUplinkAlert] = []


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


class DeviceUplinkStatus(BaseModel):
    """Uplink status for a device WAN interface."""

    interface: str
    status: str  # "active", "ready", "failed", "not connected"
    ip: str | None = None
    gateway: str | None = None
    publicIp: str | None = None
    provider: str | None = None


class OrgHealthResponse(BaseModel):
    """Live org health data for polling."""

    health_score: int          # 0-100
    health_status: str         # 'healthy' | 'warning' | 'critical'
    devices_online: int
    devices_offline: int
    devices_alerting: int
    devices_dormant: int
    devices_total: int
    clients_total: int | None = None  # Connected client count (may be unavailable)
    timestamp: str             # ISO 8601


class WebSocketMessage(BaseModel):
    """Incoming WebSocket message from client."""

    type: str  # "user_message"
    content: str
    session_id: str = "default"


class WebSocketEvent(BaseModel):
    """Outgoing WebSocket event to client."""

    type: str  # "agent_start", "tool_call", "text", "card", "done", "error"
    data: dict | str | None = None
