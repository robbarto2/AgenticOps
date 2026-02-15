# SSID Remediation

## Trigger
Change SSID, update wireless, modify wifi, disable SSID, enable SSID, close open network, change authentication, WPA3, change wifi password

## Steps
1. Identify the target network and SSID
2. Get current SSID configuration (`getNetworkWirelessSsids`)
3. Use `search_methods` → `get_method_info` to find `updateNetworkWirelessSsid` parameters
4. Determine the required changes (auth mode, encryption, VLAN, enabled state, etc.)
5. **Present change plan with before/after values — STOP and wait for confirmation**
6. After confirmation: execute via `call_meraki_api` with the updateNetworkWirelessSsid method
7. Re-read SSID config to verify the change was applied

## Analysis
- **Auth mode changes**: Changing from open to WPA2/WPA3 will disconnect all current clients
- **VLAN changes**: Moving an SSID to a different VLAN affects client IP addressing
- **Disabling SSIDs**: Confirm it's not a critical production network
- **Multiple networks**: If changing across all networks, list ALL targets

## Presentation
- `data_table`: Before/after comparison for each SSID being changed
- `text_report`: Change summary, client impact warning, and verification results
