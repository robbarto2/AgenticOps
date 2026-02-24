# RF Analysis & Optimization

## Trigger
RF analysis, channel utilization, channel interference, co-channel interference, DFS, channel width, power level, RF profile, spectrum, interference, WiFi optimization, radio settings, wireless optimization, band steering, min bitrate, minimum bitrate, RSSI, signal quality, signal strength, SNR

## Steps
1. Identify the target scope — org-wide, specific network, or specific AP
2. Get AP list (`getNetworkDevices` filtered to MR models) — identify all wireless APs
3. Get RF profiles (`call_meraki_api` → `getNetworkWirelessRfProfiles`) — check configured profiles
4. Get RF profile assignments per device (`call_meraki_api` → `getNetworkWirelessRfProfilesAssignments`) — which APs use which profile
5. Get per-device channel utilization (`call_meraki_api` → `getOrganizationWirelessDevicesChannelUtilizationByDevice`) — identify worst APs
6. Get channel utilization history (`call_meraki_api` → `getNetworkWirelessChannelUtilizationHistory`) — trending data
7. For high-utilization APs: get radio settings (`call_meraki_api` → `getDeviceWirelessRadioSettings`) — check channel, width, power
8. Get AP statuses (`getOrganizationDevicesStatuses`) — check for alerting or degraded APs
9. Get SSID band settings (`getNetworkWirelessSsids`) — check band selection, band steering, min bitrate per SSID
10. For RSSI/signal quality queries: get signal quality history per band — call `call_meraki_api` → `getNetworkWirelessSignalQualityHistory` three times, once with `band="2.4"`, once with `band="5"`, and once with `band="6"` to get per-band RSSI trends

## Analysis
- **Co-channel interference**: Multiple APs on the same channel (especially 2.4GHz channels 1, 6, 11). Static channel assignments are a red flag — auto-channel is almost always better.
- **Channel width**: 2.4GHz should use 20MHz (40MHz causes massive overlap). 5GHz can use 40MHz or 80MHz depending on AP density. 160MHz on 5GHz is rarely appropriate.
- **Minimum bitrate**: Should be 12Mbps+ on 2.4GHz to reduce cell size and airtime waste. 6Mbps or lower on 2.4GHz causes slow clients to dominate airtime.
- **Power levels**: Auto power is preferred. Fixed high power on 2.4GHz causes co-channel interference. Power imbalance between APs causes sticky clients.
- **DFS channels**: Check if DFS channels are enabled on 5GHz — they provide additional capacity. Frequent radar events on DFS channels indicate radar environment issues.
- **Band steering**: Should be enabled to push dual-band clients to 5GHz/6GHz. Check if >40% of clients are on 2.4GHz — indicates band steering issues.
- **WiFi vs non-WiFi utilization**: High non-WiFi utilization indicates external interference (microwaves, Bluetooth, cordless phones on 2.4GHz).
- **RF profile consistency**: APs in the same area should use the same RF profile. Mismatched profiles cause roaming issues.

## Optimization Recommendations (prioritized)
1. **Enable auto-channel** on all bands if using static channels
2. **Set 20MHz channel width** on 2.4GHz (40MHz causes overlap)
3. **Raise minimum bitrate** to 12Mbps on 2.4GHz (reduces cell size, improves airtime)
4. **Enable band steering** to push clients to 5GHz/6GHz
5. **Enable auto-power** to let APs self-adjust transmit power
6. **Disable low data rates** (1, 2, 5.5, 6, 9, 11 Mbps) on 2.4GHz
7. **Disable 2.4GHz** on high-density APs where 5GHz coverage is sufficient
8. **Enable DFS channels** on 5GHz for additional capacity
9. **Review RF profiles** for consistency across co-located APs

## Presentation
- `bar_chart`: Per-AP channel utilization (sorted by worst), WiFi vs non-WiFi utilization breakdown
- `data_table`: RF profile comparison (channel width, power, min bitrate, band steering per profile)
- `line_chart`: Channel utilization history (by band, by AP)
- `text_report`: RF environment analysis with specific optimization recommendations
- `alert_summary`: Critical RF issues — co-channel interference, high utilization APs, misconfigured profiles
