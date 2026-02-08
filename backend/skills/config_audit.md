# Configuration Audit

## Trigger
Config, configuration, audit, compliance, SSID settings, VLAN, switch port, policy, standard, best practice

## Steps
1. Get all SSIDs and their settings (`getNetworkWirelessSsids`)
2. Get VLAN configuration (`getNetworkApplianceVlans`)
3. Get switch port configurations (`getDeviceSwitchPorts` for each switch)
4. Get firewall rules (`getNetworkApplianceFirewallL3FirewallRules`)
5. Get VPN configuration (`getNetworkApplianceSiteToSiteVpn`)
6. Get network settings (`getNetwork`)

## Analysis
- **SSIDs**: Check auth mode (WPA3 preferred), VLAN assignment, band steering
- **VLANs**: Verify segmentation, DHCP settings, naming conventions
- **Switch ports**: Check for trunk vs access mode, VLAN assignment, PoE settings
- **Firewall**: Rule ordering, permissive rules, documentation
- **VPN**: Hub vs spoke topology, split tunnel settings, subnet overlap
- **Naming**: Consistent naming conventions across all elements

## Presentation
- `data_table`: SSID configuration matrix
- `data_table`: VLAN summary with DHCP and subnet info
- `data_table`: Switch port configuration summary
- `text_report`: Compliance findings organized by severity (critical, warning, info)
- `network_health`: Configuration compliance score
