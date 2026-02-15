# Switch Port Security

## Trigger
Switch port security, 802.1X, NAC, port security, MAB, unused ports, trunk ports, dot1x, network access control

## Steps
1. Identify target network(s) and switches (`getOrganizationNetworks` → `getNetworkDevices` filtered to switches)
2. Get switch port configurations for each switch (`getDeviceSwitchPorts`)
3. Check for 802.1X/MAB settings on access ports
4. Identify unused ports that are still enabled
5. Check trunk port configurations — are any trunks exposed to user areas?
6. Get client data to correlate port usage (`getNetworkClients`)

## Analysis
- **802.1X coverage**: What % of access ports have 802.1X or MAB enabled? Any ports in "open" mode?
- **Unused ports**: Ports with no traffic/clients that are still enabled — attack surface
- **Trunk exposure**: Trunk ports should only connect to infrastructure (APs, other switches), not user-facing jacks
- **VLAN assignment**: Are access ports on the correct VLANs? Any on native/default VLAN?
- **Port type**: Access vs trunk vs hybrid — appropriate for the connected device?
- **Storm control**: Broadcast storm protection enabled?
- **DHCP snooping/ARP inspection**: Available via call_meraki_api

## Presentation
- `data_table`: Switch port security matrix (port, type, 802.1X, VLAN, status, connected device)
- `network_health`: Security score metrics (% ports with 802.1X, % unused disabled, etc.)
- `alert_summary`: Security findings by severity
- `text_report`: Recommendations for hardening switch port security
