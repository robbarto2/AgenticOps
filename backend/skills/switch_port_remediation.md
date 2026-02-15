# Switch Port Remediation

## Trigger
Set port, change port, update switch port, VLAN change, disable port, enable port, configure port, port remediation

## Steps
1. Identify the target switch and port number
2. If switch not specified, look up device (`getOrganizationNetworks` → `getNetworkDevices` filtered to switches)
3. Get current port configuration (`getDeviceSwitchPorts`)
4. Determine the required change (VLAN, type, name, enabled state, etc.)
5. **Present change plan with before/after values — STOP and wait for confirmation**
6. After confirmation: execute `updateDeviceSwitchPort` with the new settings
7. Re-read port config to verify the change was applied

## Analysis
- **VLAN validity**: Ensure the target VLAN exists on the network
- **Port type**: Changing from access to trunk (or vice versa) has connectivity implications
- **Bulk changes**: If multiple ports, list ALL changes before executing any
- **PoE**: Changing PoE settings affects connected devices (phones, APs, cameras)

## Presentation
- `data_table`: Before/after comparison for each port being changed
- `text_report`: Change summary and verification results
