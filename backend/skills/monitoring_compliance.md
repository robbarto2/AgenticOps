# Monitoring Compliance

## Trigger
Monitoring compliance, test coverage, alert policy, are all sites monitored, monitoring gaps, ThousandEyes coverage, synthetic tests, alerting

## Steps
1. Get all networks in the organization (`getOrganizationNetworks`)
2. Get all ThousandEyes synthetic tests (`list_network_app_synthetics_tests`)
3. For each test, get configuration details (`get_network_app_synthetics_test`)
4. Get alert configurations (`list_alerts`)
5. Get ThousandEyes agent inventory (`list_cloud_enterprise_agents`, `list_endpoint_agents`)
6. Cross-reference networks vs test coverage

## Analysis
- **Site coverage**: Does every network/site have at least one synthetic test? Flag uncovered sites
- **Test types**: Are critical services (DNS, HTTP, page load) tested for each site?
- **Alert thresholds**: Are alerts configured for key metrics (packet loss > 5%, latency > 200ms, availability < 99%)?
- **Agent placement**: Are enterprise agents deployed at all major sites?
- **Test frequency**: Are tests running at appropriate intervals (e.g., every 5 min for critical services)?
- **Endpoint coverage**: Are endpoint agents deployed for key user groups?
- **Missing tests**: Standard tests that should exist but don't (e.g., DNS to internal servers, HTTP to ERP/CRM)

## Presentation
- `data_table`: Coverage matrix (network/site vs test types — shows gaps)
- `network_health`: Monitoring coverage score (% sites covered, % critical services tested)
- `alert_summary`: Compliance gaps organized by priority
- `text_report`: Recommendations for filling monitoring gaps
