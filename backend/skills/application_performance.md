# Application Performance

## Trigger
App slow, application performance, Office 365, Zoom, Teams, SaaS, web app, page load, response time, latency to service, cloud app

## Steps
1. Identify the application and affected network/site
2. Get network clients and usage data (`getNetworkClients` — look for app traffic patterns)
3. Check ThousandEyes HTTP/page-load test results for the app (`list_network_app_synthetics_tests` → `get_network_app_synthetics_test` → `get_network_app_synthetics_metrics`)
4. Get path visualization to the app's servers (`get_path_visualization_results` or `get_full_path_visualization`)
5. Check for anomalies affecting app connectivity (`get_anomalies`)
6. Check for ISP/provider outages (`search_outages`)
7. Check for BGP route issues if WAN-related (`get_bgp_route_test_results`)
8. Get network event log for correlation (`getNetworkEvents`)

## Analysis
- **Response time**: HTTP response time vs baseline — is it the app, the network, or DNS?
- **Path analysis**: Where in the path is latency introduced? (LAN, WAN, ISP, cloud provider)
- **DNS resolution**: DNS lookup time — is DNS causing delays?
- **Packet loss**: Loss on any hop in the path visualization
- **BGP routing**: Are routes optimal? Any BGP changes correlating with slowness?
- **Outages**: Is the SaaS provider or ISP experiencing known issues?
- **Local factors**: Client count, bandwidth usage, QoS settings on the Meraki network

## Presentation
- `line_chart`: App response time over time (TE metrics)
- `network_health`: Key metrics (response time, loss, latency, availability)
- `text_report`: Path analysis with hop-by-hop breakdown and root cause
- `alert_summary`: Anomalies and outages correlated with the performance issue
