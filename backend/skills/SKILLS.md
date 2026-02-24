# AgenticOps Skills Registry

Skills are documented patterns that guide agent behavior. Each skill defines trigger conditions, data gathering steps, analysis patterns, and presentation preferences.

## Skill Format

Each skill file is a markdown document with the following structure:
- **Trigger**: Keywords or data patterns that activate this skill
- **Steps**: Ordered list of MCP tool calls to gather data
- **Analysis**: What to look for in the results, thresholds, correlations
- **Presentation**: Which card types to use for displaying results

## Skills by Domain

### Troubleshooting
| Skill | File | Description |
|-------|------|-------------|
| wireless_troubleshooting | `wireless_troubleshooting.md` | Diagnose WiFi connectivity, signal, interference, and roaming issues |
| wan_performance | `wan_performance.md` | Analyze WAN latency, packet loss, bandwidth, and failover status |
| client_troubleshooting | `client_troubleshooting.md` | Diagnose issues with specific user devices and endpoints |
| application_performance | `application_performance.md` | Investigate SaaS and cloud application performance issues |
| performance_degradation_analysis | `performance_degradation_analysis.md` | Systematic root cause isolation for performance degradation using ThousandEyes path viz, outages, BGP, and Meraki correlation |

### Compliance
| Skill | File | Description |
|-------|------|-------------|
| config_audit | `config_audit.md` | Review network configuration compliance and best practices |
| monitoring_compliance | `monitoring_compliance.md` | Verify ThousandEyes monitoring coverage and test completeness |

### Security
| Skill | File | Description |
|-------|------|-------------|
| security_posture | `security_posture.md` | Assess firewall rules, threats, IDS/IPS, and malware status |
| switch_port_security | `switch_port_security.md` | Audit switch port security including 802.1X, NAC, and port configuration |
| wireless_security | `wireless_security.md` | Validate SSID security, encryption, and rogue AP detection |

### Discovery
| Skill | File | Description |
|-------|------|-------------|
| network_inventory | `network_inventory.md` | Display devices, networks, topology, and overall health status |
| organizational_summary | `organizational_summary.md` | Display org-wide network status and executive overview |

### Wi-Fi Analysis
| Skill | File | Description |
|-------|------|-------------|
| wifi_health_assessment | `wifi_health_assessment.md` | Assess overall WiFi health — AP status, channel utilization, connection success, packet loss, rogue APs |
| rf_analysis | `rf_analysis.md` | Deep RF environment analysis — channel interference, power levels, RF profiles, optimization recommendations |
| wifi_client_analysis | `wifi_client_analysis.md` | Client density and capacity analysis — per-AP load, band distribution, roaming, capacity planning |

### Testing
| Skill | File | Description |
|-------|------|-------------|
| instant_testing | `instant_testing.md` | Run on-demand connectivity, DNS, HTTP, and page load tests |
| connectivity_validation | `connectivity_validation.md` | Verify connectivity after changes, VPN, and post-deployment |
| template_deployment | `template_deployment.md` | Deploy monitoring templates and standard test configurations |

### Remediation
| Skill | File | Description |
|-------|------|-------------|
| switch_port_remediation | `switch_port_remediation.md` | Execute switch port configuration changes (VLAN, enable/disable) |
| ssid_remediation | `ssid_remediation.md` | Modify wireless network settings including authentication and encryption |
| firewall_remediation | `firewall_remediation.md` | Create, modify, and manage firewall rules and ACLs |

## How Skills Are Used

1. The orchestrator classifies the user query and routes to a specialist agent
2. The specialist agent's system prompt includes all skills relevant to its domain
3. The agent matches the query against skill triggers
4. The agent follows the skill's steps to gather data, then applies the analysis patterns
5. The canvas agent uses the skill's presentation guidance to create appropriate cards

## Adding New Skills

1. Create a new markdown file in `backend/skills/`
2. Follow the skill format (Trigger, Steps, Analysis, Presentation)
3. Add the skill to this registry under the appropriate domain
4. Update the relevant agent's skill list in `loader.py`
