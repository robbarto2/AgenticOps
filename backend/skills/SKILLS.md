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
| wireless_troubleshooting | `wireless_troubleshooting.md` | Diagnose WiFi connectivity and performance issues |
| wan_performance | `wan_performance.md` | Analyze WAN uplink metrics, latency, and failover |

### Security
| Skill | File | Description |
|-------|------|-------------|
| security_posture | `security_posture.md` | Evaluate firewall rules, content filtering, threat events |

### Compliance
| Skill | File | Description |
|-------|------|-------------|
| config_audit | `config_audit.md` | Check SSIDs, VLANs, switch ports against requirements |

### Discovery
| Skill | File | Description |
|-------|------|-------------|
| network_inventory | `network_inventory.md` | Full inventory scan with health assessment |

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
