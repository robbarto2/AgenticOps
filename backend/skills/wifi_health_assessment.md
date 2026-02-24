# WiFi Health Assessment

## Trigger
WiFi health, wireless health, WiFi status, AP health, wireless performance, WiFi check, wireless check, WiFi overview, access point health

## Steps
1. Identify the target scope — org-wide or specific network/site
2. Get AP statuses (`getOrganizationDevicesStatuses` filtered to MR models, or `getNetworkDevices` for a specific network)
3. Get SSIDs for the network(s) (`getNetworkWirelessSsids`) — check enabled/disabled, bands, auth modes
4. Get org-wide channel utilization by network (`call_meraki_api` → `getOrganizationWirelessDevicesChannelUtilizationByNetwork`) — the single most important WiFi health metric
5. Get per-device channel utilization (`call_meraki_api` → `getOrganizationWirelessDevicesChannelUtilizationByDevice`) for networks with high utilization
6. Get connection stats (`call_meraki_api` → `getNetworkWirelessConnectionStats`) — success vs failure rates
7. Get signal quality history (`call_meraki_api` → `getNetworkWirelessSignalQualityHistory`) — RSSI/SNR trends
8. Get failed connections breakdown (`call_meraki_api` → `getNetworkWirelessFailedConnections`) — auth, DHCP, DNS, association failures
9. Get client count history (`call_meraki_api` → `getNetworkWirelessClientCountHistory`) — client density trends
10. Get org-wide packet loss by network (`call_meraki_api` → `getOrganizationWirelessDevicesPacketLossByNetwork`)
11. Get data rate history (`call_meraki_api` → `getNetworkWirelessDataRateHistory`) for degraded networks
12. Check for rogue APs (`call_meraki_api` → `getNetworkWirelessAirMarshal`) — security and interference

## Analysis
- **AP availability**: Calculate % of APs online — <95% is warning, <90% is critical
- **Channel utilization by band**: 2.4GHz >60% is warning (>70% critical), 5GHz >70% is warning (>80% critical), 6GHz >50% is warning
- **Connection success rate**: <95% is warning, <90% is critical — break down failure types (auth vs DHCP vs DNS vs association)
- **Client density trends**: >30 clients per AP is warning, >50 is critical — check peak vs average
- **Packet loss**: >1% is warning, >3% is critical — correlate with channel utilization
- **Data rate trends**: Declining data rates indicate increasing interference or client density issues
- **Rogue AP count**: Any rogue APs are a concern — check if they're on overlapping channels

## Presentation
- `network_health`: AP online %, avg channel utilization, connection success rate, avg packet loss, client count
- `bar_chart`: Channel utilization by band (2.4GHz / 5GHz / 6GHz) across networks or APs
- `line_chart`: Client count trends over time (peak, average, per-band)
- `alert_summary`: Critical findings — high channel util APs, offline APs, rogue APs, high packet loss
- `text_report`: Overall WiFi health summary with optimization recommendations
