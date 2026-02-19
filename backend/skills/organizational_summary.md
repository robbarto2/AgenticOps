# Organizational Summary

## Trigger
organizational summary, org summary, organization overview, org overview, dashboard, overall status, executive summary

## Steps
1. Get organization details (`getOrganization`)
2. Get all networks in the organization (`getOrganizationNetworks`)
3. Get organization devices status summary (`getOrganizationDevicesStatuses`)
4. Get organization inventory (`getOrganizationInventoryDevices`)
5. Get organization licenses overview (`getOrganizationLicensesOverview`)
6. Get organization alerts (last 24h) (`getOrganizationAlerts` with timespan=86400)
7. Get organization uplinks statuses (`getOrganizationUplinksStatuses`)
8. Get organization assurance score if available

## Analysis
- **Networks**: Count total networks
- **Clients**: Sum total connected clients across all networks/devices
- **Devices by Type** (count ALL types present in the data — do NOT omit any):
  - MX / Z4 (security appliances/routers)
  - MR / CW (wireless access points)
  - MS / C9 (switches)
  - MV (cameras)
  - MT (sensors)
  - MG (cellular gateways)
  - Any other model prefixes found in the data
- **Health Score**:
  - Calculate based on device online status, uplink status, alert severity
  - Healthy: >90%, Warning: 70-90%, Critical: <70%
  - If assurance API available, use that score
- **Alerts**: Categorize by severity (critical, high, medium, low)
- **License Status**: Check expiration dates, license count
- **Firmware Compliance**: % of devices on recommended firmware versions

## Presentation
- Use `org_summary` card type with interactive elements
- Each metric should have a clickable prompt for drill-down:
  - Networks → "Show me details for all networks"
  - Clients → "List all connected clients with details"
  - Device types → "Show me all [device type] devices"
  - Health → "What are the current health issues?"
  - Alerts → "Show me all active alerts with details"
  - License → "Show detailed license information"
  - Firmware → "Show firmware compliance by device"

## Card Data Structure
```json
{
  "type": "org_summary",
  "title": "Organization Summary",
  "source": "meraki",
  "data": {
    "orgName": "Organization Name",
    "networks": {
      "total": 10,
      "prompt": "Show me details for all networks"
    },
    "clients": {
      "total": 523,
      "prompt": "List all connected clients with details"
    },
    "devices": {
      "total": 146,
      "byType": [
        { "type": "Switches", "count": 49, "icon": "🔌", "prompt": "Show me all switches" },
        { "type": "Access Points", "count": 30, "icon": "📡", "prompt": "Show me all access points" },
        { "type": "Appliances", "count": 27, "icon": "🔒", "prompt": "Show me all security appliances" },
        { "type": "Cameras", "count": 16, "icon": "📹", "prompt": "Show me all cameras" },
        { "type": "Sensors", "count": 16, "icon": "🌡️", "prompt": "Show me all sensors" },
        { "type": "Gateways", "count": 4, "icon": "📶", "prompt": "Show me all cellular gateways" }
      ]
    },
    "health": {
      "score": 95,
      "status": "healthy",
      "prompt": "What are the current health issues?"
    },
    "alerts": {
      "critical": 0,
      "high": 2,
      "medium": 5,
      "low": 3,
      "prompt": "Show me all active alerts with details"
    },
    "license": {
      "status": "Active",
      "daysRemaining": 180,
      "prompt": "Show detailed license information"
    },
    "firmware": {
      "compliance": 87,
      "prompt": "Show firmware compliance by device"
    }
  }
}
```

## Important Notes
- This is a high-level executive view - prioritize clarity over detail
- All metrics should be current/real-time from the Meraki API
- Interactive prompts allow users to drill into any metric
- Health calculation should be transparent and based on multiple factors
- Device icons: Appliances=🔒, Access Points=📡, Switches=🔌, Cameras=📹, Sensors=🌡️, Gateways=📶
- **CRITICAL**: Include ALL device types found in the data. Do NOT omit any category. Use the `productType` field to group devices, not model prefixes. Count each productType exactly from the API response — do NOT estimate or round.
