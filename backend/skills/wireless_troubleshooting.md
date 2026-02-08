# Wireless Troubleshooting

## Trigger
WiFi, wireless, SSID, connectivity, signal, interference, roaming, client disconnection, slow wireless, channel utilization

## Steps
1. Identify the target network (ask user or use context)
2. Get wireless SSIDs for the network (`getNetworkWirelessSsids`)
3. Get wireless connection stats (`getNetworkWirelessConnectionStats`)
4. Get failed connection stats (`getNetworkWirelessFailedConnections`)
5. Get channel utilization history (`getNetworkWirelessChannelUtilizationHistory`)
6. Get signal quality history (`getNetworkWirelessSignalQualityHistory`)
7. If client-specific: get client connectivity events (`getNetworkWirelessClientConnectivityEvents`)
8. If AP-specific: get device wireless status (`getDeviceWirelessStatus`)

## Analysis
- **Channel utilization**: >60% on 2.4GHz is problematic, >80% is critical
- **Signal quality**: SNR < 20dB indicates coverage issues
- **Connection failures**: High auth failure rate suggests credential or RADIUS issues
- **DHCP failures**: Indicate IP pool exhaustion or DHCP server issues
- **DNS failures**: Suggest upstream DNS misconfiguration
- **Roaming events**: Frequent roaming indicates coverage gaps or sticky clients

## Presentation
- `line_chart`: Signal quality over time
- `bar_chart`: Channel utilization by band (2.4GHz vs 5GHz)
- `data_table`: SSID configuration summary (name, band, auth mode, VLAN)
- `text_report`: Findings, root cause analysis, and recommendations
