# Client Troubleshooting

## Trigger
Client, laptop, user can't connect, device name, MAC address, specific user, CEO, executive, employee, phone, tablet, endpoint, offline client, disconnected client

## Steps
1. Find the network: `getOrganizationNetworks` — use network name from query, or search all networks
2. Locate the client: `getNetworkClients` on the target network — match by MAC address, IP, or description
3. Get the AP or switch: from client record, get the `recentDeviceSerial` → `getDevice` to check AP/switch health, model, status
4. Get SSID config: `getNetworkWirelessSsids` — check auth mode, band selection, VLAN, IP assignment for the client's SSID
5. Get client events: `getNetworkEvents` with `clientMac` parameter — look for association, disassociation, deauth, DHCP, 802.1X events
6. Check device statuses: `getOrganizationDevicesStatuses` — is the client's AP/switch online or alerting?
7. Check ThousandEyes: `list_alerts` and `get_anomalies` for any active network issues

## Analysis — Check EACH of these
- **Offline/disconnected**: When was the client last seen? What was the last event (disassociation reason code)? Is the AP still online?
- **Weak signal**: RSSI below -70 dBm = poor, below -80 dBm = very poor. Causes: distance from AP, physical obstructions, wrong band (2.4 vs 5 GHz)
- **Auth failures**: Look for 802.1X rejection events, RADIUS timeouts, PSK mismatches. Check SSID auth mode (PSK, WPA2-Enterprise, open)
- **DHCP issues**: Look for DHCP timeout events. Check if client has an IP. VLAN misconfiguration can cause DHCP to fail
- **IP conflicts**: Multiple clients with same IP = conflict. Check DHCP pool size vs client count
- **Roaming issues**: Frequent AP changes in events = sticky client or poor roaming. Check if client is bouncing between APs
- **AP overloaded**: If AP has >30 clients, congestion is likely. Check client count on the AP
- **Band issues**: Client on 2.4 GHz when 5 GHz is available = potential congestion. Check if band steering is enabled

## Required output (MANDATORY)
Your response MUST include these sections:

### Status Assessment
State clearly: client is Online/Offline/Degraded

### Connection Details
- Current or last known: AP/switch name, SSID, VLAN, IP, signal strength
- Connection type: wireless 2.4GHz / wireless 5GHz / wired

### Root Cause
State the MOST LIKELY cause based on evidence gathered. Be specific — reference actual data:
- "Client disconnected at 14:32 with deauth reason 'inactivity' — device likely went to sleep or moved out of range"
- "RSSI of -82 dBm indicates very weak signal — client is too far from AP 'Floor2-AP1'"
- "3 DHCP timeout events in the last hour — DHCP pool on VLAN 50 may be exhausted"

### Remediation Steps
Provide 2-4 specific actions. NOT generic advice — specific to the findings:
- "Add an access point near [location] to improve coverage"
- "Expand DHCP pool on VLAN 50 from /25 to /24"
- "Enable band steering on SSID 'CL26' to reduce 2.4GHz congestion"
- "Check the user's device for updated WiFi drivers and correct network profile"
- "Reconnect the client manually — the disassociation may be transient"

## Presentation
- `text_report`: Full diagnosis with root cause and remediation (primary output)
- `alert_summary`: Key events and issues found
