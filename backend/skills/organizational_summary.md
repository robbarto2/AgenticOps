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
- **Devices by Type**:
  - Count MX (security appliances/routers)
  - Count MR (wireless access points)
  - Count MS (switches)
  - Count MV (cameras)
  - Count other device types
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
      "total": 45,
      "byType": [
        { "type": "MX", "count": 5, "icon": "🔒", "prompt": "Show me all MX security appliances" },
        { "type": "MR", "count": 20, "icon": "📡", "prompt": "Show me all MR access points" },
        { "type": "MS", "count": 15, "icon": "🔌", "prompt": "Show me all MS switches" },
        { "type": "MV", "count": 5, "icon": "📹", "prompt": "Show me all MV cameras" }
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
- Device icons: MX=🔒, MR=📡, MS=🔌, MV=📹, others as appropriate
