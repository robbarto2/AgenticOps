# Performance Degradation Root Cause Analysis

## Trigger
Root cause, RCA, performance degradation, degraded performance, why is it slow, what's causing, isolate the problem, where is the issue, network forensics, latency root cause, loss root cause, outage analysis, ISP issue, transit issue, provider issue, multi-location correlation, what caused the degradation, why did performance drop

## Steps

### Phase 1 — Establish Baseline (parallel data gathering)
1. Identify affected ThousandEyes tests (`list_network_app_synthetics_tests` or `list_tests` — filter by name/target if the user specifies one)
2. Get the test configuration to understand test type, target, agents, and interval (`get_network_app_synthetics_test` or `get_test`)
3. Fetch metrics for all 4 key dimensions — call `get_network_app_synthetics_metrics` (or `get_test_results`) for each:
   - `TTFB` or `responseTime` — app-layer response
   - `NET_LATENCY` or `latency` — network-layer round-trip
   - `NET_LOSS` or `loss` — packet loss percentage
   - `WEB_AVAILABILITY` or `availability` — overall availability
4. Note the degradation window: when metrics deviated from normal (identify start time, peak, and recovery if applicable)

### Phase 2 — Layer-by-Layer Isolation (sequential, follow decision tree)
5. **App vs Network separation**: Compare TTFB/responseTime with NET_LATENCY — if TTFB >> NET_LATENCY, the delay is in the application/server, not the network
6. **Path visualization**: Call `get_path_visualization_results` or `get_full_path_visualization` — walk each hop and note:
   - Which hop introduces the most latency or loss
   - Whether the problematic hop is in the local network, ISP, transit, or destination
   - Any path changes (different ASN, different hop count) vs normal
7. **ISP/provider outage check**: Call `search_outages` — look for outages from the same ISP, transit provider, or destination provider during the degradation window
8. **BGP route stability**: Call `get_bgp_route_test_results` — check for:
   - Route changes or withdrawals during the window
   - AS path inflation (longer paths = suboptimal routing)
   - Prefix changes or new more-specifics
9. **Anomaly detection**: Call `get_anomalies` — check if ThousandEyes automatically flagged anomalies during the degradation window
10. **Alert history**: Call `list_alerts` — check for triggered alerts and their timing relative to the degradation
11. **Event correlation**: Call `list_events` — look for topology changes, routing updates, or configuration changes that coincide with degradation

### Phase 3 — Local Infrastructure Correlation (Meraki)
12. Identify the Meraki network associated with the affected site (`getOrganizationNetworks` — match by name/site)
13. Check device statuses in that network (`getNetworkDevices` + `getOrganizationDevicesStatuses` — any offline or alerting devices?)
14. Check WAN uplink health (`getOrganizationApplianceUplinkStatuses` — loss, latency, uplink failovers)
15. Get network events during the degradation window (`getNetworkEvents` — look for WAN failover, connectivity change, DHCP, VPN events)

### Phase 4 — Multi-Location Correlation
16. If the test runs from multiple agent locations, compare metrics across agents:
    - **All locations affected equally** → problem is at the destination/server
    - **One location significantly worse** → problem is local to that site or its ISP
    - **Subset of locations affected** → shared transit provider or regional issue
17. Cross-reference location-specific findings with path viz and outage data to confirm the root cause

## Analysis — Root Cause Decision Tree

Apply these checks in order. The FIRST matching condition is the primary root cause:

1. **Application/Server Issue**
   - TTFB or responseTime is >> NET_LATENCY (e.g., TTFB 2000ms but latency only 50ms)
   - HTTP error codes (5xx) across all test locations
   - Availability drops but network metrics remain stable
   → Root cause: application or server-side degradation

2. **ISP/Transit Provider Issue**
   - Path visualization shows high latency/loss at ISP or transit hops (not first or last hop)
   - `search_outages` returns matching ISP/provider outage
   - Only some test locations affected (those sharing the same ISP/transit)
   → Root cause: ISP or transit provider problem

3. **DNS Resolution Issue**
   - DNS resolution time > 200ms or intermittent DNS failures in test results
   - TTFB spikes correlate with DNS lookup delays
   - Changing DNS resolver improves results
   → Root cause: DNS infrastructure problem

4. **SD-WAN / Local WAN Issue**
   - Meraki uplink shows loss > 1% or latency spikes
   - WAN failover events in Meraki event log during degradation window
   - Path visualization first hop (gateway/firewall) shows issues
   - Only tests from one specific site affected
   → Root cause: local WAN or SD-WAN issue

5. **Local Network Issue**
   - All tests originating from one site are affected (regardless of destination)
   - Meraki devices offline or alerting
   - Gateway hop in path viz shows loss/latency
   → Root cause: local LAN/infrastructure issue

6. **BGP Routing Issue**
   - BGP route changes correlate with latency onset
   - AS path inflation (e.g., path went from 3 hops to 7 hops)
   - Route withdrawals or flapping during degradation window
   - Latency increases without loss (suboptimal path, not congestion)
   → Root cause: BGP routing instability or suboptimal path selection

## Required Output Format

Structure your response with these 6 sections:

### 1. Root Cause Summary
One-sentence verdict: what caused the degradation and where.

### 2. Degradation Timeline
- **Start**: When metrics first deviated
- **Peak**: When degradation was worst
- **Recovery**: When metrics returned to normal (or "ongoing")
- **Duration**: Total time of impact

### 3. Primary Root Cause
- **Layer**: Application / ISP-Transit / DNS / SD-WAN / Local Network / BGP
- **Evidence**: Specific data points that confirm this (metrics, hop data, outage IDs)
- **Confidence**: High / Medium / Low (based on how many independent data sources agree)

### 4. Contributing Factors
Any secondary issues that compounded the problem (e.g., BGP reroute made ISP congestion worse).

### 5. Multi-Location Impact
Which locations were affected and which were not. What this tells us about the scope.

### 6. Remediation Steps
Specific actions based on the identified root cause:
- **Application**: Contact app team, check server health, review CDN config
- **ISP/Transit**: Contact provider with outage reference, consider backup path
- **DNS**: Switch resolver, check DNS TTLs, verify DNS infrastructure
- **SD-WAN**: Check uplink config, review failover policy, verify QoS
- **Local Network**: Check device health, review port utilization, verify gateway
- **BGP**: Review route policies, check for prefix hijacks, verify peering

## Presentation
- `text_report`: Primary output — the full 6-section root cause analysis with evidence
- `line_chart`: Metrics timeline showing degradation period (TTFB, latency, loss, availability)
- `alert_summary`: Active outages, anomalies, and alerts correlated with degradation
- `network_health`: Current state tiles (availability, latency, loss, response time)
