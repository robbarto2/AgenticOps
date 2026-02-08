# WAN Performance

## Trigger
WAN, uplink, latency, packet loss, bandwidth, failover, internet, ISP, SD-WAN, connectivity, slow network

## Steps
1. Identify the target network or device
2. Get uplink statuses for the appliance (`getOrganizationApplianceUplinkStatuses`)
3. Get uplink usage history (`getOrganizationApplianceUplinksUsageByNetwork`)
4. Get loss and latency history (`getOrganizationDevicesUplinksLossAndLatency`)
5. If ThousandEyes available: get relevant test results for the site
6. If ThousandEyes available: get path visualization data

## Analysis
- **Latency**: >100ms for enterprise apps is concerning, >200ms is critical
- **Packet loss**: >1% sustained indicates WAN issues, >5% is service-affecting
- **Uplink status**: Check for failover events and primary/backup status
- **Bandwidth utilization**: >80% sustained indicates capacity issues
- **Correlate Meraki + ThousandEyes**: Match uplink issues with end-to-end path data

## Presentation
- `line_chart`: Latency and packet loss over time
- `bar_chart`: Bandwidth utilization by uplink
- `data_table`: Uplink status summary (interface, IP, status, ISP)
- `text_report`: Performance analysis and recommendations
- `alert_summary`: Any active uplink alerts or failover events
