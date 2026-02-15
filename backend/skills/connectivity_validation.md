# Connectivity Validation

## Trigger
Verify connectivity, is it working, VPN working, can we reach, validate connection, post-change validation, test after change

## Steps
1. Identify the connectivity target and context (what was changed, what needs validation)
2. Design a multi-layer test sequence:
   a. DNS resolution test (`run_dns_server_instant_test`) — can we resolve the target?
   b. TCP connectivity test (`run_agent_to_server_instant_test`) — can we reach the port?
   c. HTTP/HTTPS test (`run_http_server_instant_test`) — does the service respond correctly?
   d. Optional: Page load test (`run_page_load_instant_test`) — does the full application work?
3. Run tests from relevant agents (same site as the change, or global for broad validation)
4. Collect and correlate results across all test layers
5. Determine overall pass/fail status

## Analysis
- **Layer-by-layer**: If DNS fails, everything above fails — identify the lowest failing layer
- **Before/after**: If validating a change, compare current results to expected baseline
- **Partial failure**: Some agents succeed, others fail — indicates routing or regional issue
- **Timeout vs error**: Timeout suggests network/firewall block; error suggests service issue

## Presentation
- `network_health`: Pass/fail metrics for each validation layer (DNS, TCP, HTTP, App)
- `data_table`: Detailed results per test layer per agent
- `text_report`: Overall validation verdict with layer-by-layer breakdown
