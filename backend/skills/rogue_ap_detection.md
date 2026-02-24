# Rogue AP Detection

## Trigger
Rogue AP, rogue APs, unauthorized AP, unknown AP, air marshal, rogue detection, rogue wireless, wireless intruder

## Steps
1. Get all organization networks (`getOrganizationNetworks`) to find wireless-capable networks
2. Get all organization device statuses (`getOrganizationDevicesStatuses`) to build a set of known/registered device MACs
3. For each wireless network, call Air Marshal (`call_meraki_api` → `getNetworkWirelessAirMarshal`) to get all APs detected by your Meraki radios
4. Cross-reference every detected AP's BSSIDs and wired MACs against the known device MAC inventory
5. Any AP whose identifiers do NOT appear in the known inventory is classified as a rogue/unknown AP

## Analysis
- **Rogue count per network**: Flag networks with the most rogues — they may be in shared buildings or dense environments
- **Signal strength**: Rogues with strong RSSI (> -60 dBm) are physically close and more concerning
- **Channel overlap**: Rogues on channels 1, 6, or 11 (2.4 GHz) or your primary 5 GHz channels cause direct interference
- **SSID spoofing**: Rogues broadcasting an SSID matching your corporate SSIDs are high-severity security threats (evil twin attacks)
- **Persistence**: Rogues seen consistently (long firstSeen-to-lastSeen window) are more concerning than transient APs

## Presentation
- `data_table`: List of rogue APs with columns — Network, SSID, BSSID, Channel, Signal (dBm), First Seen, Last Seen
- Text summary: Total rogues found, breakdown by network, highlight high-severity rogues (strong signal or SSID spoofing)
