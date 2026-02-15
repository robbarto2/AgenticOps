# Client Troubleshooting

## Trigger
Client, laptop, user can't connect, device name, MAC address, specific user, CEO, executive, employee, phone, tablet, endpoint

## Steps
1. Identify the client — by name, MAC address, or description from user context
2. Find the network the client is connected to (`getOrganizationNetworks` → `getNetworkClients` to locate)
3. Get client connection history and current status (`call_meraki_api` → `getNetworkClientPolicy`, client events)
4. Check the AP/switch the client is connected to (`getDevice` for AP health)
5. Check SSID configuration for the connected network (`getNetworkWirelessSsids`)
6. Check for DHCP/DNS events related to the client (`getNetworkEvents` filtered by client MAC)
7. If ThousandEyes endpoint agent is on the client: get endpoint metrics (`get_endpoint_agent_metrics`, `list_endpoint_agent_tests`)
8. Check for broader outages affecting the site (`search_outages`, `list_events`)

## Analysis
- **Connection state**: Is the client currently connected? Last seen time? RSSI/signal quality?
- **Auth failures**: RADIUS/802.1X rejections, PSK mismatches, certificate issues
- **DHCP issues**: IP assignment failures, pool exhaustion, stale leases
- **DNS issues**: Resolution failures, wrong DNS server, split-DNS problems
- **AP health**: Is the AP the client connects to healthy? Channel utilization, client count
- **Network-wide**: Are other clients on the same AP/SSID affected? (single client vs site-wide)
- **ISP/WAN**: If endpoint agent available, check upstream path quality

## Presentation
- `data_table`: Client connection details (MAC, IP, VLAN, SSID, AP, signal, status)
- `line_chart`: Client signal/throughput over time (if available)
- `alert_summary`: Events and issues found during investigation
- `text_report`: Root cause analysis with step-by-step remediation
