import { getEnv } from "../env";
import { getNetworkClient } from "./client";

const VNET_NAME = "azconsole-vnet";
const SUBNET_NAME = "azconsole-subnet";
const VNET_ADDRESS_SPACE = "10.20.0.0/16";
const SUBNET_ADDRESS_PREFIX = "10.20.1.0/24";
const NSG_NAME = "azconsole-nsg";

/**
 * Ensures the shared VNet/subnet used for provisioned VMs exists,
 * creating it only if missing. Idempotent — safe to call on every
 * VM creation.
 */
export async function ensureNetworkFoundation(): Promise<{ subnetId: string }> {
  const env = getEnv();
  const network = getNetworkClient();
  const rg = env.AZURE_RESOURCE_GROUP;

  // Network security group: SSH (22) + HTTPS (443) inbound by default.
  // Least-privilege starting point; administrators can tighten/extend
  // this in the Azure portal without the panel needing to manage rules.
  let nsg;
  try {
    nsg = await network.networkSecurityGroups.get(rg, NSG_NAME);
  } catch {
    const poller = await network.networkSecurityGroups.beginCreateOrUpdate(rg, NSG_NAME, {
      location: env.AZURE_REGION,
      securityRules: [
        {
          name: "allow-ssh",
          protocol: "Tcp",
          direction: "Inbound",
          access: "Allow",
          priority: 1000,
          sourceAddressPrefix: "*",
          sourcePortRange: "*",
          destinationAddressPrefix: "*",
          destinationPortRange: "22",
        },
      ],
    });
    nsg = await poller.pollUntilDone();
  }

  if (!nsg.id) {
    throw new Error(`Azure did not return a resource ID for network security group "${NSG_NAME}".`);
  }
  const nsgId = nsg.id;

  let vnet;
  try {
    vnet = await network.virtualNetworks.get(rg, VNET_NAME);
  } catch {
    const poller = await network.virtualNetworks.beginCreateOrUpdate(rg, VNET_NAME, {
      location: env.AZURE_REGION,
      addressSpace: { addressPrefixes: [VNET_ADDRESS_SPACE] },
      subnets: [
        {
          name: SUBNET_NAME,
          addressPrefix: SUBNET_ADDRESS_PREFIX,
          networkSecurityGroup: { id: nsgId },
        },
      ],
    });
    vnet = await poller.pollUntilDone();
  }

  const subnet = vnet.subnets?.find((s) => s.name === SUBNET_NAME) ?? vnet.subnets?.[0];
  if (!subnet?.id) {
    throw new Error(`Subnet ${SUBNET_NAME} could not be created or located in ${VNET_NAME}.`);
  }
  return { subnetId: subnet.id };
}

export async function createPublicIp(vmName: string): Promise<{ id: string; name: string }> {
  const env = getEnv();
  const network = getNetworkClient();
  const name = `${vmName}-pip`;
  const poller = await network.publicIPAddresses.beginCreateOrUpdate(
    env.AZURE_RESOURCE_GROUP,
    name,
    {
      location: env.AZURE_REGION,
      publicIPAllocationMethod: "Static",
      sku: { name: "Standard" },
    },
  );
  const pip = await poller.pollUntilDone();
  if (!pip.id) throw new Error("Azure did not return a resource ID for the new public IP.");
  return { id: pip.id, name };
}

export async function createNetworkInterface(
  vmName: string,
  subnetId: string,
  publicIpId: string,
): Promise<{ id: string; name: string }> {
  const env = getEnv();
  const network = getNetworkClient();
  const name = `${vmName}-nic`;
  const poller = await network.networkInterfaces.beginCreateOrUpdate(
    env.AZURE_RESOURCE_GROUP,
    name,
    {
      location: env.AZURE_REGION,
      ipConfigurations: [
        {
          name: "ipconfig1",
          subnet: { id: subnetId },
          publicIPAddress: { id: publicIpId },
        },
      ],
    },
  );
  const nic = await poller.pollUntilDone();
  if (!nic.id) throw new Error("Azure did not return a resource ID for the new network interface.");
  return { id: nic.id, name };
}

/** Resolves the current public and private IP addresses for a VM by name. */
export async function resolveVmIps(
  nicName: string | undefined,
): Promise<{ publicIp: string | null; privateIp: string | null }> {
  if (!nicName) return { publicIp: null, privateIp: null };
  const env = getEnv();
  const network = getNetworkClient();

  try {
    const nic = await network.networkInterfaces.get(env.AZURE_RESOURCE_GROUP, nicName);
    const ipConfig = nic.ipConfigurations?.[0];
    const privateIp = ipConfig?.privateIPAddress ?? null;

    const publicIpRef = ipConfig?.publicIPAddress;
    if (!publicIpRef?.id) return { publicIp: null, privateIp };

    const publicIpName = publicIpRef.id.split("/").pop();
    if (!publicIpName) return { publicIp: null, privateIp };

    const pip = await network.publicIPAddresses.get(env.AZURE_RESOURCE_GROUP, publicIpName);
    return { publicIp: pip.ipAddress ?? null, privateIp };
  } catch {
    return { publicIp: null, privateIp: null };
  }
}

export function nicNameFromVmProfile(networkProfile?: {
  networkInterfaces?: { id?: string }[];
}): string | undefined {
  const nicId = networkProfile?.networkInterfaces?.[0]?.id;
  return nicId?.split("/").pop();
}

export async function deleteVmNetworkResources(
  nicName?: string,
  publicIpName?: string,
): Promise<void> {
  const env = getEnv();
  const network = getNetworkClient();
  const rg = env.AZURE_RESOURCE_GROUP;

  if (nicName) {
    try {
      const poller = await network.networkInterfaces.beginDelete(rg, nicName);
      await poller.pollUntilDone();
    } catch {
      // Best-effort cleanup — surfaced via audit log by the caller, not fatal.
    }
  }
  if (publicIpName) {
    try {
      const poller = await network.publicIPAddresses.beginDelete(rg, publicIpName);
      await poller.pollUntilDone();
    } catch {
      // Best-effort cleanup.
    }
  }
}
