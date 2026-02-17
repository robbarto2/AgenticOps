# Network Topology

## Trigger
Topology, network diagram, device connections, network map, how devices are connected, show connections, physical topology, logical topology, network layout

## Steps

**CRITICAL: NEVER ask the user for network IDs or organization IDs. Look them up using the API.**

**PERFORMANCE CRITICAL: Make LLDP/CDP calls in PARALLEL for all devices at once, not sequentially.**

1. **Look up the network**: ALWAYS call `getOrganizationNetworks` first (no parameters needed). Search the results for the network name the user mentioned. Extract the `networkId` from the matching network.

2. **Get network devices**: Call `getNetworkDevices` with the networkId you found in step 1, to get all devices with their serial numbers, models, and IPs.

3. **Get LLDP/CDP neighbor data FOR ALL DEVICES IN PARALLEL**: Make multiple simultaneous tool calls (one per device) in a single iteration:
   - For each device, call `call_meraki_api` with:
   - method: `GET`
   - path: `/devices/{serial}/lldpCdp`
   This returns neighbor information showing physical connections between devices.

4. **Get uplink statuses** (optional, for MX/gateway devices): Call `getOrganizationDevicesUplinksAddressesByDevice` (no parameters needed) to identify WAN connections.

## Analysis

- **Build nodes** from device list:
  - Determine `deviceType` from model prefix: MR→`mr`, MS→`ms`, MX→`mx`, MV→`mv`, MG→`mg`, MT→`mt`
  - Set `status` from device status (online/offline/dormant)
  - Include `label` (device name), `ip` (LAN IP), `model`, `serial`

- **Build links** from LLDP/CDP data:
  - Each LLDP/CDP entry shows a neighbor connection — create a link between the device and its neighbor
  - Match neighbors to known devices by serial number, device ID, or port description
  - Set `linkType`: wired connections = `wired`, wireless connections = `wireless`
  - LLDP/CDP data is bidirectional — both devices report the same link. Deduplicate by sorting source/target IDs

- **Add internet/WAN node**: If MX/gateway devices have WAN uplinks, add an `internet` node and connect it with `linkType: "wan"`

- **Fallback** (no LLDP/CDP data): If LLDP/CDP returns empty or errors, build a logical star topology:
  - MX at center connected to all switches (`wired`)
  - Switches connected to APs (`wired`)
  - Add internet node connected to MX (`wan`)

## Presentation
- Use `topology` card type with:
  - `nodes`: Array of `{ id, label, deviceType, status, ip, model, serial }`
  - `links`: Array of `{ source, target, linkType, label, speed }`
  - `networkName`: The network name for identification
- Device type values: `mx`, `ms`, `mr`, `mv`, `mg`, `mt`, `client`, `internet`, `unknown`
- Link type values: `wired`, `wireless`, `wan`, `vpn`
- Set card source to `"meraki"`
