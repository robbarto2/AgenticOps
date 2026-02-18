# Performance Monitoring

## Trigger
Test results, test performance, test metrics, ThousandEyes results, HTTP test results, DNS test results, page load results, availability, response time, latency trend, how are my tests performing, show me test data, monitoring results, uplink performance, WAN metrics

## Steps
1. List available ThousandEyes tests (`list_network_app_synthetics_tests`)
2. For specific tests, get test configuration (`get_network_app_synthetics_test`)
3. Fetch actual metrics data (`get_network_app_synthetics_metrics`) — this is the critical step
4. Check for active anomalies (`get_anomalies`)
5. Check for active alerts (`list_alerts`)
6. For path-based analysis, get path visualization (`get_path_visualization_results`)
7. For endpoint monitoring, get endpoint metrics (`get_endpoint_agent_metrics`)

## Analysis
- **Response time**: Compare against baseline — <200ms healthy, 200-500ms warning, >500ms critical
- **Availability**: >99.9% healthy, 99-99.9% warning, <99% critical
- **Packet loss**: <0.1% healthy, 0.1-1% warning, >1% critical
- **Latency**: <50ms healthy, 50-150ms warning, >150ms critical
- **Jitter**: <10ms healthy, 10-30ms warning, >30ms critical
- **Per-agent comparison**: Identify if issues are location-specific or widespread
- **Time trends**: Are metrics improving, stable, or degrading?

## Presentation
- `line_chart`: Response time / latency / availability over time (use time-series data points from metrics)
- `network_health`: Key metric tiles (avg response time, availability %, loss %, latency)
- `bar_chart`: Per-agent comparison (response time by agent location)
- `text_report`: Detailed analysis with root cause assessment
- `alert_summary`: Active alerts and anomalies
