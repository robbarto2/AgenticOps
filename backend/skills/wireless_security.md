# Wireless Security

## Trigger
Wireless security, SSID security, open wifi, open network, WPA2, WPA3, captive portal, rogue AP, wireless audit, wifi security

## Steps
1. Get all networks in the organization (`getOrganizationNetworks`)
2. For each network (or target network), get SSIDs (`getNetworkWirelessSsids`)
3. Check authentication modes for each enabled SSID
4. Check for open networks without splash pages
5. Get wireless security events (`getNetworkEvents` with security event types)
6. Check for ThousandEyes alerts related to wireless (`list_alerts`)

## Analysis
- **Open networks**: Any SSID with `authMode: "open"` without a captive portal is critical risk
- **WPA version**: WPA3 preferred, WPA2 acceptable, WPA/WEP is critical finding
- **PSK vs Enterprise**: Enterprise (802.1X/RADIUS) is more secure than PSK for corporate networks
- **VLAN isolation**: Guest SSIDs should be on isolated VLANs, not on the corporate network
- **Band steering**: Should be enabled for performance, but note for security posture
- **SSID broadcast**: Hidden SSIDs provide minimal security benefit but note status
- **Client isolation**: Should be enabled on guest networks to prevent lateral movement
- **IP assignment**: Bridge mode vs NAT mode implications for network segmentation

## Presentation
- `data_table`: SSID security matrix (SSID name, auth mode, encryption, VLAN, client isolation, splash)
- `alert_summary`: Security findings organized by severity
- `network_health`: Wireless security score metrics
- `text_report`: Detailed findings and remediation recommendations
