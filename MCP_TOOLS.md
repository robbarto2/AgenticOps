# MCP Tools Reference

This document covers all 55 MCP tools available through the AgenticOps platform -- 25 from the Meraki MCP server and 30 from the ThousandEyes MCP server. Each tool description explains what it does in practical terms and lists its parameters.

---

## Meraki Tools (25 tools)

### Organization-Level

#### `getOrganizations`
**What it does:** Returns every Meraki organization your API key has access to. Each organization in the response includes its name, ID, URL, and licensing information. This is typically the first call you make to discover which organizations you can manage.

**Parameters:** None.

---

#### `getOrganizationAdmins`
**What it does:** Lists all administrator accounts for a given organization, including each admin's name, email, org-level access rights, network-level access tags, and authentication method (email or two-factor). Useful for auditing who has access to your Meraki dashboard.

**Parameters:**
- `organizationId` (optional) -- The organization ID. If omitted, uses the active profile's org ID.

---

#### `getOrganizationNetworks`
**What it does:** Returns the list of all Meraki networks in your organization. Each network entry includes its name, ID, product types (wireless, switch, appliance, camera, etc.), tags, time zone, and notes. This is the go-to tool for discovering what networks exist and getting the network IDs you need for most other calls.

**Parameters:**
- `organizationId` (optional) -- The organization ID. If omitted, uses the active profile's org ID.

---

#### `getOrganizationDevices`
**What it does:** Returns every device across all networks in the organization. Each device entry includes its serial number, model, name, MAC address, network ID, firmware version, and location (address, lat/lng). Use this for a full hardware inventory or to find a specific device's serial number.

**Parameters:**
- `organizationId` (optional) -- The organization ID. If omitted, uses the active profile's org ID.

---

### Network-Level

#### `getNetwork`
**What it does:** Returns detailed information about a single Meraki network: its name, ID, product types, time zone, tags, notes, enrollment string, and configuration template binding. Use this when you already have a network ID and need its properties.

**Parameters:**
- `networkId` (required) -- The ID of the network (e.g., `L_123456789012345678`).

---

#### `getNetworkClients`
**What it does:** Returns the list of clients (devices/users) that have connected to a network within a given time window. Each client entry includes MAC address, IP address, hostname/description, VLAN, SSID (for wireless), OS type, usage stats (sent/received bytes), and first/last seen timestamps. Essential for understanding who and what is on the network.

**Parameters:**
- `networkId` (required) -- The ID of the network.
- `timespan` (optional, default: 86400) -- How far back to look, in seconds. Default is 24 hours (86400). Maximum is 30 days (2592000).

---

#### `getNetworkEvents`
**What it does:** Returns a log of events that have occurred on a network -- things like client associations/disassociations, DHCP events, configuration changes, and security events. Each event has a timestamp, type, description, client MAC, device serial, and SSID. Invaluable for troubleshooting recent issues.

**Parameters:**
- `networkId` (required) -- The ID of the network.
- `productType` (optional) -- Filter events to a specific product type: `wireless`, `appliance`, `switch`, `camera`, `cellularGateway`, etc.
- `perPage` (optional, default: 100) -- Number of events to return per page.

---

#### `getNetworkDevices`
**What it does:** Returns the list of Meraki devices (APs, switches, appliances, cameras) in a specific network. Each device includes its serial, model, name, MAC, firmware, LAN IP, tags, and physical address. Use this when you need to see what hardware is deployed in a particular network.

**Parameters:**
- `networkId` (required) -- The ID of the network.

---

#### `getNetworkWirelessSsids`
**What it does:** Returns all 15 SSID slots for a wireless network, showing which are enabled, their names, authentication modes (open, PSK, 802.1X), encryption settings, VLAN tags, band selection, and visibility. Use this to audit wireless configuration or troubleshoot connectivity issues related to SSID settings.

**Parameters:**
- `networkId` (required) -- The ID of the network (must contain wireless product type).

---

### Device-Level

#### `getDevice`
**What it does:** Returns full details for a single device identified by its serial number: name, model, MAC, network ID, firmware version, LAN IP, physical address, coordinates, tags, and notes. Use this to look up a specific piece of hardware.

**Parameters:**
- `serial` (required) -- The serial number of the device (e.g., `Q2MN-XXXX-XXXX`).

---

#### `getDeviceSwitchPorts`
**What it does:** Returns the configuration of every port on a Meraki switch. Each port entry includes its number, name, enabled status, type (access or trunk), VLAN, voice VLAN, allowed VLANs, PoE status, STP guard, RSTP, link negotiation, and access policy settings. Essential for auditing switch configurations.

**Parameters:**
- `serial` (required) -- The serial number of the switch.

---

#### `updateDeviceSwitchPort`
**What it does:** Modifies the configuration of a specific switch port. You can change any combination of settings in a single call -- VLAN assignment, port type, PoE, name, tags, STP settings, and more. This is the primary tool for making switch port configuration changes.

**Parameters:**
- `serial` (required) -- The serial number of the switch.
- `portId` (required) -- The port number to configure (e.g., `1`, `2`, `48`).
- `name` (optional) -- A descriptive name for the port.
- `tags` (optional) -- Space-separated tags for the port.
- `enabled` (optional) -- Whether the port is enabled (true/false).
- `poeEnabled` (optional) -- Whether Power over Ethernet is enabled.
- `type` (optional) -- Port type: `access` or `trunk`.
- `vlan` (optional) -- Native/access VLAN number.
- `voiceVlan` (optional) -- Voice VLAN number.
- `allowedVlans` (optional) -- Allowed VLANs for trunk ports (e.g., `1,2,3` or `all`).
- `isolationEnabled` (optional) -- Whether port isolation is enabled.
- `rstpEnabled` (optional) -- Whether RSTP is enabled.
- `stpGuard` (optional) -- STP guard mode: `disabled`, `root guard`, `bpdu guard`, `loop guard`.
- `linkNegotiation` (optional) -- Link speed/duplex: `Auto negotiate`, `1 Gigabit full duplex`, etc.
- `portScheduleId` (optional) -- ID of the port schedule to apply.
- `udld` (optional) -- UDLD mode: `Alert only` or `Enforce`.
- `accessPolicyType` (optional) -- Access policy type for 802.1X.
- `accessPolicyNumber` (optional) -- Access policy number.
- `macAllowList` (optional) -- MAC addresses allowed on the port.
- `stickyMacAllowList` (optional) -- Sticky MAC addresses.
- `stickyMacAllowListLimit` (optional) -- Max number of sticky MACs.
- `stormControlEnabled` (optional) -- Whether storm control is enabled.

---

### Meta / Utility

#### `call_meraki_api`
**What it does:** A universal gateway to any of the 804+ Meraki Dashboard API endpoints. While the other Meraki tools cover the most common operations, this tool lets you call any method from any SDK section (organizations, networks, wireless, switch, appliance, camera, devices, sensor, sm, etc.). Use this for anything not covered by the dedicated tools -- firewall rules, VPN settings, content filtering, traffic analysis, and hundreds more.

**Parameters:**
- `section` (required) -- The SDK section name (e.g., `organizations`, `networks`, `wireless`, `switch`, `appliance`, `camera`, `devices`, `sensor`, `sm`).
- `method` (required) -- The API method name (e.g., `getNetworkApplianceFirewallL3FirewallRules`, `updateNetworkWirelessSsid`).
- `parameters` (optional) -- A dictionary of parameters for the method (e.g., `{"networkId": "L_123", "number": "0"}`).

---

#### `list_all_methods`
**What it does:** Lists every available API method in the Meraki SDK, optionally filtered to a specific section. Returns method names organized by section. Use this to discover what API calls are available before using `call_meraki_api`.

**Parameters:**
- `section` (optional) -- Filter to a specific SDK section (e.g., `wireless`, `switch`, `appliance`). If omitted, returns all sections.

---

#### `search_methods`
**What it does:** Searches across all Meraki API methods by keyword. Returns matching method names and their sections. For example, searching for "firewall" returns all firewall-related methods across appliance, switch, and wireless sections. Use this when you know what you want to do but do not know the exact method name.

**Parameters:**
- `keyword` (required) -- The search term (e.g., `admin`, `firewall`, `ssid`, `event`, `vlan`).

---

#### `get_method_info`
**What it does:** Returns detailed parameter documentation for a specific API method, including each parameter's name, type, whether it is required, and its description. Use this before calling `call_meraki_api` to understand exactly what parameters a method expects.

**Parameters:**
- `section` (required) -- The SDK section (e.g., `organizations`, `networks`).
- `method` (required) -- The method name (e.g., `getOrganizationAdmins`).

---

#### `get_mcp_config`
**What it does:** Returns the current MCP server configuration, including which Meraki organization is active, caching settings, and environment information. Useful for debugging connection issues.

**Parameters:** None.

---

### Cache Management

#### `cache_stats`
**What it does:** Returns statistics about the Meraki MCP response cache, including the number of cached items, hit/miss ratio, memory usage, and cache configuration (TTL, max size). Use this to understand how effectively the cache is reducing API calls.

**Parameters:** None.

---

#### `cache_clear`
**What it does:** Clears the entire in-memory response cache, forcing all subsequent API calls to fetch fresh data from the Meraki cloud. Use this when you suspect stale cached data is causing incorrect results.

**Parameters:** None.

---

#### `get_cached_response`
**What it does:** Retrieves a paginated slice of a previously cached large API response that was saved to disk. When the MCP server returns a large dataset, it saves the full response to a file and returns only a summary. This tool lets you page through the full data without context overflow.

**Parameters:**
- `filepath` (required) -- Path to the cached response file (provided in the `_full_response_cached` field of the original response).
- `offset` (optional, default: 0) -- Starting index for pagination.
- `limit` (optional, default: 10, max: 100) -- Number of items to return.

---

#### `list_cached_responses`
**What it does:** Lists all cached response files that have been saved to disk, showing file paths, sizes, and creation times. Use this to see what large API responses are available for retrieval with `get_cached_response`.

**Parameters:** None.

---

#### `clear_cached_files`
**What it does:** Deletes cached response files from disk that are older than a specified age. Use this to free up disk space from old API response dumps.

**Parameters:**
- `older_than_hours` (optional, default: 24) -- Delete files older than this many hours.

---

### Profile Management

#### `list_profiles`
**What it does:** Lists all configured Meraki organization profiles, showing each profile's name, organization name, organization ID, and whether it is currently active. Profiles let you switch between different Meraki organizations without changing API keys.

**Parameters:** None.

---

#### `switch_profile`
**What it does:** Switches the active Meraki organization profile to a different one. After switching, all subsequent API calls will target the new organization. The switch is immediate and clears the cache.

**Parameters:**
- `profile_name` (required) -- The name of the profile to switch to (case-insensitive).

---

#### `get_active_profile`
**What it does:** Returns the currently active profile's name, organization name, and organization ID. Use this to confirm which Meraki organization you are currently working with.

**Parameters:** None.

---
---

## ThousandEyes Tools (30 tools)

### Account / Admin

#### `get_account_groups`
**What it does:** Returns all account groups your ThousandEyes user has access to, including each group's name, ID, and associated organization. Use this to discover available account groups and get the `aid` values needed to scope other API calls.

**Parameters:** None.

---

### Tests -- Configuration

#### `list_network_app_synthetics_tests`
**What it does:** Lists Cloud and Enterprise Agent (CEA) tests with optional filtering by name, type, or target. Returns each test's name, ID, type, target server/URL, interval, and configuration. Supports case-insensitive substring matching, so searching for "google" matches "Google Search Test". Use this to find test IDs you need for metrics and results queries.

**Parameters:**
- `name` (optional) -- Filter by test name (case-insensitive substring match).
- `type` (optional) -- Filter by test type: `http-server`, `agent-to-server`, `page-load`, `dns-server`, `web-transactions`, `api`, `bgp`, `dns-trace`, `dnssec`, `ftp-server`, `sip-server`, `voice`.
- `target` (optional) -- Filter by target URL or server (case-insensitive substring match).
- `aid` (optional) -- Account group ID for scoping.

---

#### `get_network_app_synthetics_test`
**What it does:** Returns the full configuration details for a single CEA test, including all settings, assigned agents, alert rules, and scheduling. Use this when you need the complete picture of how a test is configured.

**Parameters:**
- `type` (required) -- The test type (`agent-to-server`, `agent-to-agent`, `bgp`, `dns-server`, `dns-trace`, `dnssec`, `http-server`, `page-load`, `web-transactions`, `api`, `ftp-server`, `sip-server`, `voice`).
- `testId` (required) -- The test ID.
- `aid` (optional) -- Account group ID for scoping.

---

#### `list_endpoint_agent_tests`
**What it does:** Lists all configured endpoint agent scheduled tests, including test name, target server, interval, protocol, and enabled status. These are tests that run from endpoint agents installed on user machines (laptops, desktops) rather than cloud/enterprise agents.

**Parameters:**
- `aid` (optional) -- Account group ID for scoping.

---

### Agents

#### `list_cloud_enterprise_agents`
**What it does:** Lists ThousandEyes Cloud and Enterprise Agents with filtering by type, location, country, and enabled status. Returns each agent's name, ID, type, location, country, IP addresses, network info, and status. Use this to find agent IDs for running instant tests or to audit your agent deployment.

**Parameters:**
- `agent_type` (optional) -- Filter by type: `cloud`, `enterprise`, or `enterprise-cluster`.
- `location` (optional) -- Filter by location name (case-insensitive substring match, e.g., "San Francisco").
- `country_id` (optional) -- Filter by 2-letter ISO country code (e.g., `US`, `UK`, `DE`).
- `enabled` (optional) -- Filter by enabled status (true/false).
- `aid` (optional) -- Account group ID for scoping.

---

#### `list_endpoint_agents`
**What it does:** Lists ThousandEyes Endpoint Agents installed on user devices, with filtering by agent name, computer name, city, and country. Returns each agent's name, ID, computer name, platform (Windows/Mac), status, and location. Use this to find endpoint agents for troubleshooting end-user network issues.

**Parameters:**
- `agent_id` (optional) -- Filter by agent IDs (array of strings).
- `agent_name` (optional) -- Filter by agent names (array of strings).
- `computer_name` (optional) -- Filter by computer names (array of strings).
- `location_city` (optional) -- Filter by cities (array, e.g., `["San Francisco", "New York"]`).
- `location_country_iso` (optional) -- Filter by country codes (array, e.g., `["US", "UK"]`).
- `aid` (optional) -- Account group ID for scoping.

---

### Results and Metrics

#### `get_network_app_synthetics_metrics`
**What it does:** Retrieves time-series metric data from Cloud and Enterprise Agent tests. This is the primary tool for pulling performance data from scheduled CEA tests. Returns timestamped data points that can be grouped and aggregated.

Available metric categories:
- **DNS:** trace availability, query count, query time, server availability, server response time, DNSSEC validity
- **BGP:** reachability, path changes, updates
- **Network (ping/agent-to-server):** packet loss, latency, jitter, bandwidth, capacity
- **Proxy network:** loss, latency, jitter through proxy
- **One-way network:** loss, latency, jitter, throughput, errors (to-target, from-target, bidirectional)
- **Web/HTTP:** availability, time to first byte, throughput, DNS time, connect time, SSL time, wait time, receive time, redirect time, fetch time, plus error counts by category
- **Page load:** load time, DOM time, completion rate, component count, error count
- **FTP:** availability, TTFB, throughput, DNS/connect/SSL/negotiation/wait/transfer times, plus error counts
- **VoIP/RTP:** discards, latency, loss, MOS score, packet delay variation
- **SIP:** availability, DNS/connect/redirect/register/options/invite/wait/response times, plus error counts
- **Web transactions:** transaction time, completion, page-by-page timing, assertion errors
- **API transactions:** transaction time, per-request timing breakdown (DNS, connect, SSL, block, send, wait, receive), completion, errors

**Parameters:**
- `metric_id` (required) -- The metric to retrieve (e.g., `NET_LATENCY`, `WEB_AVAILABILITY`, `BGP_REACHABILITY`).
- `start_date` (required) -- Start of time range in ISO 8601 format.
- `end_date` (required) -- End of time range in ISO 8601 format.
- `aggregation_type` (required) -- How to aggregate: `MEAN`, `MEDIAN`, `MINIMUM`, `MAXIMUM`, or `STDEV`.
- `group_by` (optional) -- Group results by: `ALL`, `TEST`, `TEST_LABEL`, `SOURCE_AGENT`, `AGENT_LABEL`, or `SOURCE_MONITOR`.
- `filter_dimension` (optional) -- Dimension to filter on (e.g., `TEST`, `AGENT`).
- `filter_values` (optional) -- Array of values for the filter dimension (e.g., `["12345"]`).
- `aid` (optional) -- Account group ID for scoping.

---

#### `get_endpoint_agent_metrics`
**What it does:** Retrieves time-series metric data from Endpoint Agents -- the agents installed on actual user devices. This gives you visibility into end-user experience across network, web, wireless, and cellular connections.

Available metric categories:
- **Network (browser sessions):** packet loss, latency, jitter, connection failures, VPN loss/latency, CPU/memory load
- **Web (browser sessions):** session count, page count, completion rate, response time, page load time, DOM time, experience score, browser errors
- **Gateway/topology:** probe count, transmission rate, signal quality, gateway loss/latency, proxy loss/latency, health scores (agent, gateway, connection, proxy, VPN, DNS), DNS time, CPU/memory
- **Wireless:** channel swaps, association/auth/DHCP/EAP/init failures, retransmission rate, roaming events, RSSI, signal quality, throughput
- **Cellular:** RSSI, RSRP, RSRQ, SINR
- **Scheduled tests (network):** loss, jitter, latency, VPN loss/latency, TCP errors, application score, CPU/memory
- **Scheduled tests (HTTP):** availability, wait time, SSL time, connect time, DNS lookup, response time, throughput, application score
- **Dynamic/AST tests:** loss, jitter, latency, application score, VPN loss/latency, TCP errors, CPU/memory

**Parameters:**
- `metric_id` (required) -- The endpoint metric to retrieve (e.g., `ENDPOINT_NET_LATENCY`, `ENDPOINT_WEB_PAGE_LOAD`, `ENDPOINT_GATEWAY_WIRELESS_RSSI`).
- `start_date` (required) -- Start of time range in ISO 8601 format.
- `end_date` (required) -- End of time range in ISO 8601 format.
- `aggregation_type` (required) -- How to aggregate: `MEAN`, `MEDIAN`, `MINIMUM`, `MAXIMUM`, or `STDEV`.
- `group_by` (optional) -- Group by: `ALL`, `ENDPOINT_AGENT_MACHINE_ID`, `ENDPOINT_AGENT_TEST`, `ENDPOINT_AGENT_LOCATION`, `ENDPOINT_AGENT_COUNTRY`, `ENDPOINT_AGENT_NETWORK`, `ENDPOINT_AGENT_TARGET_IP`, `ENDPOINT_AGENT_GATEWAY`, `ENDPOINT_AGENT_BSSID`, or `ENDPOINT_AGENT_SSID`.
- `filter_dimension` (optional) -- Dimension to filter on (same options as group_by).
- `filter_values` (optional) -- Array of filter values (e.g., `["Corporate-WiFi"]`).
- `aid` (optional) -- Account group ID for scoping.

---

#### `get_bgp_route_test_results`
**What it does:** Returns detailed BGP routing information for a specific prefix and test round, including AS path details and hop-by-hop routing data. This is similar to looking at a BGP RIB (Routing Information Base). Use this for analyzing specific routing paths and troubleshooting BGP issues.

**Parameters:**
- `test_id` (required) -- The test ID to retrieve BGP route results for.
- `prefix_id` (required) -- The ID of the BGP prefix to inspect.
- `round_id` (required) -- The round ID for the specific test round.
- `aid` (optional) -- Account group ID for scoping.

---

#### `get_path_visualization_results`
**What it does:** Returns network path visualization data showing the hop-by-hop route between a ThousandEyes agent and the test target. Each hop includes IP address, hostname, latency, loss, and ASN. Use this for troubleshooting where in the network path problems are occurring.

**Parameters:**
- `test_id` (required) -- The test ID.
- `start_date` (required) -- Start of time range in ISO 8601 format.
- `end_date` (required) -- End of time range in ISO 8601 format.
- `direction` (optional) -- For bidirectional tests: `to-target` or `from-target`.
- `aid` (optional) -- Account group ID for scoping.

---

#### `get_full_path_visualization`
**What it does:** Returns comprehensive path visualization data for all agents and all rounds within a time range. Unlike `get_path_visualization_results` which returns summary data, this iterates through every agent and round to collect complete hop-by-hop routing details. Use this when you need a thorough analysis of network paths across multiple vantage points and time periods. Note: this can be a large dataset.

**Parameters:**
- `test_id` (required) -- The test ID.
- `start_date` (required) -- Start of time range in ISO 8601 format.
- `end_date` (required) -- End of time range in ISO 8601 format.
- `direction` (optional) -- For bidirectional tests: `to-target` or `from-target`.
- `aid` (optional) -- Account group ID for scoping.

---

#### `get_instant_test_metrics`
**What it does:** Retrieves raw test result data for an instant test (one-time on-demand test). Supports all test types: network, HTTP, page load, web transaction, API, DNS server, DNS trace, FTP, SIP server, RTP stream, and BGP. Returns the full API response with detailed results.

**Parameters:**
- `test_id` (required) -- The instant test ID.
- `start_date` (required) -- Start of time range in ISO 8601 format.
- `end_date` (required) -- End of time range in ISO 8601 format.
- `test_type` (required) -- Type of results to retrieve: `network`, `http`, `page_load`, `web_transaction`, `api`, `dns_server`, `dns_trace`, `ftp`, `sip_server`, `rtp_stream`, or `bgp`.
- `aid` (optional) -- Account group ID for scoping.

---

### Anomalies and Alerts

#### `get_anomalies`
**What it does:** Analyzes ThousandEyes test data for metric anomalies using a hybrid detection approach that combines baseline analysis, CUSUM changepoint detection, and threshold-based rules. Automatically selects appropriate metrics based on test type (e.g., latency and loss for agent-to-server tests, availability and TTFB for HTTP tests). Returns a list of detected anomalies with the metric value, timestamp, confidence level, test ID, and agent ID.

**Parameters:**
- `test_ids` (required) -- Array of test IDs to analyze (e.g., `["12345", "67890"]`).
- `start_time_iso` (required) -- Start of the analysis window in ISO 8601 format.
- `end_time_iso` (required) -- End of the analysis window in ISO 8601 format.
- `agent_ids` (optional) -- Array of agent IDs to narrow the analysis to specific vantage points.
- `aid` (optional) -- Account group ID for scoping.

---

#### `list_alerts`
**What it does:** Returns ThousandEyes alerts. By default returns currently active (triggered) alerts. You can also query historical alerts by specifying a date range and alert state. Each alert includes its ID, type, severity, rule, affected tests, and affected agents.

**Parameters:**
- `aid` (optional) -- Account group ID for scoping.
- `start_date` (optional) -- Start of time range in ISO 8601 format. Use with `end_date` for historical alerts.
- `end_date` (optional) -- End of time range in ISO 8601 format. Use with `start_date` for historical alerts.
- `state` (optional, default: `TRIGGER`) -- Alert state to filter by: `TRIGGER` (active) or `CLEAR` (resolved).

---

#### `get_alert`
**What it does:** Returns full details for a specific alert by its ID, including the alert rule that triggered it, affected tests, affected agents, severity, start time, and resolution status. Use this to drill into a specific alert from `list_alerts`.

**Parameters:**
- `alert_id` (required) -- The alert ID.
- `aid` (optional) -- Account group ID for scoping.

---

### Events and Outages

#### `list_events`
**What it does:** Returns ThousandEyes events within a time window. Events represent significant changes like agent state changes, test configuration updates, or detected issues. You can specify a date range or a rolling window (e.g., last 24 hours, last 7 days).

**Parameters:**
- `start_date` (optional) -- Start of time range in ISO 8601 format. Must be paired with `end_date`.
- `end_date` (optional) -- End of time range in ISO 8601 format. Must be paired with `start_date`.
- `window` (optional) -- Rolling time window: `24h`, `7d`, `1w`, etc. Used when date range is not provided. Defaults to `24h`.
- `aid` (optional) -- Account group ID for scoping.

---

#### `get_event`
**What it does:** Returns full details for a specific event, including impacted targets, locations, agents, start/end times, and severity. Use this to drill into a specific event from `list_events`.

**Parameters:**
- `event_id` (required) -- The event ID.
- `aid` (optional) -- Account group ID for scoping.

---

#### `search_outages`
**What it does:** Searches for network and application outages detected by ThousandEyes Internet Insights. You can filter by provider name, application name, ASN/interface network, and time range. Returns outage details including affected locations and whether your tests were impacted. Use this to understand if external outages are affecting your services.

**Parameters:**
- `start_date` (optional) -- Start of time range in ISO 8601 format. Must be paired with `end_date`.
- `end_date` (optional) -- End of time range in ISO 8601 format. Must be paired with `start_date`.
- `window` (optional) -- Rolling time window (e.g., `24h`, `7d`, `1w`). Defaults to `24h` when no date range given.
- `outage_scope` (optional) -- Scope: `all` or `with-affected-test` (only outages impacting your tests).
- `provider_name` (optional) -- Array of provider names to filter (e.g., `["Cisco", "Microsoft"]`).
- `application_name` (optional) -- Array of application names (e.g., `["Google", "Facebook"]`).
- `interface_network` (optional) -- Array of ASN names (e.g., `["Telianet", "Cloudflare"]`).
- `aid` (optional) -- Account group ID for scoping.

---

### Instant Tests (On-Demand)

#### `run_agent_to_server_instant_test`
**What it does:** Runs a one-time network connectivity test from ThousandEyes agents to a target server. Measures latency, packet loss, jitter, and generates path visualization data. Use this for quick network troubleshooting or validating connectivity to a server.

**Parameters:**
- `server` (required) -- Target server: hostname, IP address, or hostname:port (e.g., `www.example.com`, `8.8.8.8`, `api.example.com:443`).
- `agent_ids` (required) -- Array of ThousandEyes agent IDs to run from.
- `test_name` (optional) -- Descriptive name for the test.
- `protocol` (optional, default: `tcp`) -- Protocol: `tcp`, `icmp`, or `udp`.
- `aid` (optional) -- Account group ID for scoping.

---

#### `run_http_server_instant_test`
**What it does:** Runs a one-time HTTP/HTTPS test to measure web server availability and response time breakdown. Measures DNS resolution, TCP connect, SSL handshake, time to first byte, and total response time, plus HTTP status codes and network metrics. Use this to validate web service health.

**Parameters:**
- `url` (required) -- Target URL (e.g., `https://www.example.com/api/health`).
- `agent_ids` (required) -- Array of ThousandEyes agent IDs to run from.
- `test_name` (optional) -- Descriptive name for the test.
- `aid` (optional) -- Account group ID for scoping.

---

#### `run_page_load_instant_test`
**What it does:** Runs a one-time page load test that opens a URL in a real browser and measures the full page load experience. Captures page load time, DOM time, TTFB, a waterfall of all page components (images, scripts, CSS), and network metrics. Use this to test end-user web performance.

**Parameters:**
- `url` (required) -- Target URL to load (e.g., `https://app.example.com/dashboard`).
- `agent_ids` (required) -- Array of ThousandEyes agent IDs to run from.
- `test_name` (optional) -- Descriptive name for the test.
- `aid` (optional) -- Account group ID for scoping.

---

#### `run_web_transaction_instant_test`
**What it does:** Runs a one-time scripted browser transaction that simulates a multi-step user workflow (e.g., login, search, checkout). Measures total transaction time, per-step timing, captures screenshots, and detects errors. Use this to test complex application workflows.

**Parameters:**
- `url` (required) -- Starting URL for the transaction.
- `transaction_script` (required) -- Selenium-based JavaScript defining the user interactions (clicks, form inputs, navigation).
- `agent_ids` (required) -- Array of ThousandEyes agent IDs to run from.
- `test_name` (optional) -- Descriptive name for the test.
- `aid` (optional) -- Account group ID for scoping.

---

#### `run_api_instant_test`
**What it does:** Runs a one-time sequence of API requests to validate API functionality and performance. Each request in the sequence can have its own URL, HTTP method, headers, and body. Measures response time, status codes, and end-to-end workflow timing. Use this to test REST APIs and microservice chains.

**Parameters:**
- `url` (required) -- Base URL for the API.
- `requests_config` (required) -- Array of request configurations, each with `name`, `url`, `method` (get/post/put/delete/patch), and optionally `body` (JSON string) and `headers` (array of `{"key": "x", "value": "y"}`).
- `agent_ids` (required) -- Array of ThousandEyes agent IDs to run from.
- `test_name` (optional) -- Descriptive name for the test.
- `aid` (optional) -- Account group ID for scoping.

---

#### `run_dns_server_instant_test`
**What it does:** Runs a one-time DNS server test that queries specific DNS servers to resolve a domain. Measures DNS resolution time, server availability, and the resolved IP addresses. Also collects network metrics to the DNS servers. Use this to troubleshoot DNS resolution issues.

**Parameters:**
- `domain` (required) -- Domain name to resolve (e.g., `www.example.com`).
- `dns_servers` (required) -- Array of DNS server addresses to query (e.g., `["8.8.8.8", "1.1.1.1"]`).
- `agent_ids` (required) -- Array of ThousandEyes agent IDs to run from.
- `test_name` (optional) -- Descriptive name for the test.
- `aid` (optional) -- Account group ID for scoping.

---

#### `run_dns_trace_instant_test`
**What it does:** Runs a one-time DNS trace that follows the full resolution chain from root servers through TLD servers to the authoritative name server. Measures response time at each delegation level. Use this to troubleshoot DNS delegation problems or validate DNS infrastructure.

**Parameters:**
- `domain` (required) -- Domain name to trace (e.g., `www.example.com`).
- `agent_ids` (required) -- Array of ThousandEyes agent IDs to run from.
- `test_name` (optional) -- Descriptive name for the test.
- `aid` (optional) -- Account group ID for scoping.

---

#### `run_agent_to_agent_instant_test`
**What it does:** Runs a one-time bidirectional network test between two ThousandEyes Enterprise Agents. Measures latency, packet loss, and jitter in both directions, plus path visualization. Both source and target must be Enterprise Agents (not Cloud Agents). Use this to validate connectivity between data centers, offices, or cloud regions.

**Parameters:**
- `target_agent_id` (required) -- The agent ID of the target Enterprise Agent.
- `agent_ids` (required) -- Array of source Enterprise Agent IDs.
- `test_name` (optional) -- Descriptive name for the test.
- `protocol` (optional, default: `tcp`) -- Protocol: `tcp` or `udp`.
- `port` (optional, default: 49153) -- Target port number (1-65535).
- `aid` (optional) -- Account group ID for scoping.

---

#### `rerun_instant_test`
**What it does:** Re-runs a previously created instant test using the same configuration. This saves you from having to provide all the parameters again. Use this to quickly repeat a diagnostic test.

**Parameters:**
- `test_id` (required) -- The ID of the existing instant test to rerun.
- `aid` (optional) -- Account group ID for scoping.

---

### Templates

#### `get_templates`
**What it does:** Lists all test templates available in your account. Templates are pre-configured test bundles that can be deployed to quickly set up tests, alert rules, and dashboards. Returns template names, IDs, descriptions, and required user inputs.

**Parameters:**
- `aid` (optional) -- Account group ID for scoping.
- `name` (optional) -- Filter templates by name (case-insensitive).

---

#### `deploy_template`
**What it does:** Deploys a template, which creates all the tests, alert rules, dashboards, and other assets defined in it. You provide the template UUID and any required user input values (like domain names, agent selections, and test intervals). Use `get_templates` first to find the template and understand what user inputs it requires.

**Parameters:**
- `uuid` (required) -- The template UUID.
- `aid` (optional) -- Account group ID for scoping.
- `name` (optional) -- A name for the deployed template instance.
- `user_input_values` (optional) -- Dictionary of values for the template's user inputs. Value types vary by input: strings, numbers, arrays, agent IDs, test IDs, or agent selection configs (with `monitoringSettingsType`, `agentIds`, `labelIds`, `maxMachines`).

---

### Skills

#### `views_explanation_skill`
**What it does:** An AI Canvas skill that generates visual explanations of ThousandEyes test results for a given time window. Produces network visualization widgets and path visualization data with interpretive hints. Use this when you want a visual, explained view of what happened with a test during a specific time period.

**Parameters:**
- `core_skill_input` (optional) -- Dictionary with the explanation parameters:
  - `test_id` (optional) -- ThousandEyes test ID.
  - `start_time_iso` (optional) -- Start time in ISO 8601 format.
  - `end_time_iso` (optional) -- End time in ISO 8601 format.
  - `agent_ids` (optional) -- Array of agent IDs.
  - `application_name` (optional) -- Target application name.
  - `locations` (optional) -- Array of location names.
  - `aid` (optional) -- Account group ID for scoping.
- `context` (optional) -- Additional context dictionary (currently unused).
