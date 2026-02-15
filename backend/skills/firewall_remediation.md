# Firewall Remediation

## Trigger
Add firewall rule, modify firewall, block subnet, allow traffic, update ACL, change firewall, firewall rule, block access

## Steps
1. Identify the target network for the firewall change
2. Get current firewall rules (`call_meraki_api` → getNetworkApplianceFirewallL3FirewallRules)
3. Use `search_methods` → `get_method_info` to find the update method and parameters
4. Formulate the new rule set (add/modify/remove rules)
5. **Present the complete rule set (before and after) — STOP and wait for confirmation**
6. After confirmation: execute via `call_meraki_api` with updateNetworkApplianceFirewallL3FirewallRules
7. Re-read firewall rules to verify the change was applied

## Analysis
- **Rule ordering**: New rules must be inserted in the correct position (rules are processed top-down)
- **Default rule**: The default deny/allow rule at the bottom cannot be deleted
- **Scope**: Adding a broad deny rule can break existing connectivity
- **Overlap**: Check for conflicting or redundant rules
- **Bidirectional**: Consider if both inbound and outbound rules are needed

## Presentation
- `data_table`: Full rule set showing added/modified/removed rules highlighted
- `text_report`: Change summary, impact analysis, and verification results
