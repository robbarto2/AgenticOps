# Network Inventory

## Trigger
Inventory, devices, networks, topology, status, health, overview, summary, what do we have, show me

## Steps
1. Get organization details (`getOrganization`)
2. Get all networks (`getOrganizationNetworks`)
3. Get device inventory (`getOrganizationInventoryDevices`)
4. Get device statuses (`getOrganizationDevicesStatuses`)
5. Get license overview (`getOrganizationLicensesOverview`)
6. If ThousandEyes available: get test inventory and account groups

## Analysis
- **Device health**: Count online vs offline vs alerting devices
- **Model distribution**: Breakdown by device type (MR, MS, MX, MV, etc.)
- **Network count**: Total networks, by product type
- **Licensing**: License status, expiration dates, compliance
- **Firmware**: Check for outdated firmware versions
- **Geographic distribution**: Devices by site/tag if available

## Presentation
- `data_table`: Device inventory (name, model, serial, network, status)
- `bar_chart`: Devices by model type
- `network_health`: Overall health metrics (online %, device count, network count)
- `bar_chart`: Device status distribution (online/offline/alerting)
- `text_report`: Inventory summary with highlights and concerns
