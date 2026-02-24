# WiFi Client Density & Capacity Analysis

## Trigger
WiFi clients, client density, clients per AP, band distribution, capacity planning, roaming, sticky clients, WiFi capacity, AP capacity, AP overload, wireless clients, client load

## Steps
1. Identify the target scope — org-wide, specific network, or specific AP
2. Get client list (`getNetworkClients`) — total count, per-AP distribution, band breakdown (2.4GHz vs 5GHz vs 6GHz)
3. Get client count history (`call_meraki_api` → `getNetworkWirelessClientCountHistory`) — peak vs average trends
4. Get per-AP connection and latency stats (`call_meraki_api` → `getNetworkWirelessDevicesConnectionStats`) — identify overloaded APs
5. Get per-AP latency stats (`call_meraki_api` → `getNetworkWirelessDevicesLatencyStats`) — correlate latency with client density
6. Get per-client latency and packet loss for worst APs (`call_meraki_api` → `getNetworkWirelessClientsLatencyStats`)
7. Get SSID status per AP (`getNetworkWirelessSsids`) — check band selection and client balancing settings
8. Get client connectivity events (`call_meraki_api` → `getNetworkWirelessClientConnectivityEvents`) for problem clients — roaming, disconnects, auth failures
9. Get failed connections breakdown (`call_meraki_api` → `getNetworkWirelessFailedConnections`) — identify failure patterns

## Analysis
- **Client distribution per AP**: >30 clients is warning, >50 is critical. Identify the most loaded APs and check if nearby APs are underutilized.
- **Band distribution**: >40% of clients on 2.4GHz indicates band steering is disabled or ineffective. 5GHz should carry the majority of traffic.
- **Latency distribution**: Correlate per-AP latency with client count — APs with high latency AND high client count are overloaded.
- **Per-client packet loss**: Correlate packet loss with AP and band — if 2.4GHz clients have significantly higher loss, it confirms congestion.
- **Connection failure breakdown**: Auth failures (802.1X/PSK issues), DHCP failures (pool exhaustion), association failures (AP overloaded), DNS failures.
- **Roaming patterns**: Frequent roaming between same APs indicates coverage overlap or power imbalance. Roaming failures indicate sticky clients.
- **Capacity planning**: Compare peak vs average client count. If peak is >2x average, consider whether peak capacity is adequate. Growth trends indicate future AP needs.

## Presentation
- `bar_chart`: Clients per AP (top 15 busiest), band distribution (2.4GHz / 5GHz / 6GHz pie or bar)
- `line_chart`: Client count trends over time (total, per-band, peak vs average)
- `data_table`: Top APs by client count (AP name, client count, avg latency, packet loss, band split)
- `data_table`: Worst performing clients (client name/MAC, AP, band, latency, packet loss, events)
- `text_report`: Capacity analysis with density recommendations and growth projections
- `alert_summary`: Overloaded APs, band steering issues, high failure rates
