# Instant Testing

## Trigger
Run test, instant test, test connectivity, page load test, DNS test, HTTP test, agent-to-server test, verify, probe, check from, test from

## Steps
1. Identify the target (URL, IP, domain) and test type from user context
2. List available cloud/enterprise agents to select test sources (`list_cloud_enterprise_agents`)
3. Select appropriate agents (prefer agents geographically close to the user's context, or use all cloud agents for broad coverage)
4. Run the instant test with the appropriate tool:
   - DNS: `run_dns_server_instant_test` (domain, DNS server)
   - HTTP: `run_http_server_instant_test` (URL)
   - Page load: `run_page_load_instant_test` (URL with full page rendering)
   - Agent-to-server: `run_agent_to_server_instant_test` (IP/hostname, port)
   - API: `run_api_instant_test` (API endpoint URL)
5. Poll for results with `get_instant_test_metrics`
6. If needed, rerun with `rerun_instant_test`

## Analysis
- **DNS**: Resolution time (< 50ms good, > 200ms bad), NXDOMAIN errors, SERVFAIL
- **HTTP**: Response time (< 500ms good, > 2s bad), status codes, SSL errors
- **Page load**: DOM load time, total load time, component breakdown
- **Connectivity**: Packet loss (0% ideal, > 1% notable, > 5% problematic), latency, jitter
- **Path**: Hop count, where latency/loss is introduced

## Presentation
- `data_table`: Test results by agent (agent name, location, response time, loss, status)
- `bar_chart`: Response time comparison across agents/locations
- `network_health`: Key test metrics (avg response time, max loss, availability)
- `text_report`: Analysis and interpretation of results
