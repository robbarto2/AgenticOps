# Security Posture

## Trigger
Security, firewall, threat, ACL, content filtering, IDS, IPS, malware, vulnerability, attack, blocked

## Steps
1. Get L3 firewall rules (`getNetworkApplianceFirewallL3FirewallRules`)
2. Get L7 firewall rules (`getNetworkApplianceFirewallL7FirewallRules`)
3. Get content filtering settings (`getNetworkApplianceContentFiltering`)
4. Get security events (`getNetworkApplianceSecurityEvents`)
5. Get malware protection settings (`getNetworkApplianceSecurity`)
6. Get intrusion detection settings (`getNetworkApplianceSecurityIntrusion`)
7. If ThousandEyes available: check for active alerts and outages

## Analysis
- **Firewall rules**: Check for overly permissive rules (any/any), unused rules, rule ordering
- **Content filtering**: Verify blocked categories align with policy
- **Security events**: Identify patterns, top threats, affected clients
- **IDS/IPS mode**: Should be in prevention mode, not just detection
- **Default deny**: Last rule should be deny-all (implicit or explicit)

## Presentation
- `data_table`: Firewall rules with risk assessment
- `bar_chart`: Security events by category/severity
- `alert_summary`: Active threats and security events
- `text_report`: Security posture assessment and recommendations
- `network_health`: Security score metrics
