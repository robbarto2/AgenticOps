# Network Inventory

## Trigger
Inventory, devices, networks, topology, status, health, overview, summary, what do we have, show me

## IMPORTANT: Match scope to query

**Simple listing** ("list networks", "show my networks", "what networks do I have"):
- Call ONLY `getOrganizationNetworks`. Nothing else.
- Respond with ONLY the networks table. No org overview, no device counts, no license info, no analysis.

**Device listing** ("list devices", "show device inventory"):
- Call `getOrganizationInventoryDevices` and optionally `getOrganizationDevicesStatuses`.
- Do NOT also fetch org details, licenses, or networks unless asked.

**Full inventory/overview** ("full inventory", "organization overview", "health summary"):
- Call all relevant tools: `getOrganization`, `getOrganizationNetworks`, `getOrganizationInventoryDevices`, `getOrganizationDevicesStatuses`, `getOrganizationLicensesOverview`
- If ThousandEyes available: get test inventory and account groups

## Analysis (only for full inventory queries)
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
