import type { VirtualMachine } from "@azure/arm-compute";

import { getEnv } from "../env";
import { toAzureApiError, getComputeClient } from "./client";
import { assertImageAvailable, parseOsImage } from "./images";
import {
  createNetworkInterface,
  createPublicIp,
  deleteVmNetworkResources,
  ensureNetworkFoundation,
  nicNameFromVmProfile,
  resolveVmIps,
} from "./networking";
import { assertVmSizeAvailable } from "./sizes";

export type AzurePowerState =
  "RUNNING" | "STOPPED" | "DEALLOCATED" | "STARTING" | "STOPPING" | "UNKNOWN";

export interface AzureVmSnapshot {
  azureResourceId: string;
  name: string;
  location: string;
  vmSize: string | null;
  osType: string | null;
  provisioningState: string | null;
  powerState: AzurePowerState;
  publicIp: string | null;
  privateIp: string | null;
  tags: Record<string, string>;
}

function mapPowerState(vm: VirtualMachine): AzurePowerState {
  const statuses = vm.instanceView?.statuses ?? [];
  const powerCode = statuses.find((s) => s.code?.startsWith("PowerState/"))?.code;
  switch (powerCode) {
    case "PowerState/running":
      return "RUNNING";
    case "PowerState/stopped":
      return "STOPPED";
    case "PowerState/deallocated":
      return "DEALLOCATED";
    case "PowerState/starting":
      return "STARTING";
    case "PowerState/stopping":
    case "PowerState/deallocating":
      return "STOPPING";
    default:
      return "UNKNOWN";
  }
}

/** Fetches one VM's live state directly from Azure, including instance view and IPs. */
export async function getAzureVmSnapshot(vmName: string): Promise<AzureVmSnapshot> {
  const env = getEnv();
  const compute = getComputeClient();
  try {
    const vm = await compute.virtualMachines.get(env.AZURE_RESOURCE_GROUP, vmName, {
      expand: "instanceView",
    });
    const nicName = nicNameFromVmProfile(vm.networkProfile);
    const { publicIp, privateIp } = await resolveVmIps(nicName);

    if (!vm.id) throw new Error(`Azure returned no resource ID for VM "${vmName}".`);

    return {
      azureResourceId: vm.id,
      name: vm.name ?? vmName,
      location: vm.location ?? env.AZURE_REGION,
      vmSize: vm.hardwareProfile?.vmSize ?? null,
      osType: vm.storageProfile?.osDisk?.osType ?? null,
      provisioningState: vm.provisioningState ?? null,
      powerState: mapPowerState(vm),
      publicIp,
      privateIp,
      tags: vm.tags ?? {},
    };
  } catch (err) {
    throw toAzureApiError(err, `Could not read VM "${vmName}" from Azure.`);
  }
}

/** Lists every VM in the configured resource group with live power state + IPs. */
export async function listAzureVms(): Promise<AzureVmSnapshot[]> {
  const env = getEnv();
  const compute = getComputeClient();
  try {
    const names: string[] = [];
    for await (const vm of compute.virtualMachines.list(env.AZURE_RESOURCE_GROUP)) {
      if (vm.name) names.push(vm.name);
    }
    // Fetch full instance views + network info in parallel.
    const snapshots = await Promise.all(names.map((name) => getAzureVmSnapshot(name)));
    return snapshots;
  } catch (err) {
    throw toAzureApiError(err, "Could not list virtual machines from Azure.");
  }
}

export async function startAzureVm(vmName: string): Promise<void> {
  const env = getEnv();
  const compute = getComputeClient();
  try {
    const poller = await compute.virtualMachines.beginStart(env.AZURE_RESOURCE_GROUP, vmName);
    await poller.pollUntilDone();
  } catch (err) {
    throw toAzureApiError(err, `Could not start VM "${vmName}".`);
  }
}

/** Stop = deallocate, so the customer is not billed for compute while stopped. */
export async function stopAzureVm(vmName: string): Promise<void> {
  const env = getEnv();
  const compute = getComputeClient();
  try {
    const poller = await compute.virtualMachines.beginDeallocate(env.AZURE_RESOURCE_GROUP, vmName);
    await poller.pollUntilDone();
  } catch (err) {
    throw toAzureApiError(err, `Could not stop VM "${vmName}".`);
  }
}

export async function restartAzureVm(vmName: string): Promise<void> {
  const env = getEnv();
  const compute = getComputeClient();
  try {
    const poller = await compute.virtualMachines.beginRestart(env.AZURE_RESOURCE_GROUP, vmName);
    await poller.pollUntilDone();
  } catch (err) {
    throw toAzureApiError(err, `Could not restart VM "${vmName}".`);
  }
}

export interface CreateVmInput {
  vmName: string;
  vmSize: string;
  osImage: string; // "publisher:offer:sku:version" catalog value
  /** All selected SSH public keys are authorized for login, not just the first. */
  sshPublicKeys: string[];
  adminUsername: string;
  tags?: Record<string, string>;
}

export interface CreateVmResult {
  azureResourceId: string;
  nicName: string;
  publicIpName: string;
}

/**
 * Full provisioning flow: validate size + image availability, ensure the
 * shared VNet/subnet exists, create a public IP + NIC, then create the VM
 * itself. Reuses the shared VNet/subnet rather than creating duplicates.
 */
export async function createAzureVm(input: CreateVmInput): Promise<CreateVmResult> {
  const env = getEnv();
  const compute = getComputeClient();
  const image = parseOsImage(input.osImage);

  if (input.sshPublicKeys.length === 0) {
    throw new Error("At least one SSH public key is required to create a VM.");
  }

  await assertVmSizeAvailable(input.vmSize);
  await assertImageAvailable(image);

  const { subnetId } = await ensureNetworkFoundation();
  const publicIp = await createPublicIp(input.vmName);
  const nic = await createNetworkInterface(input.vmName, subnetId, publicIp.id);

  try {
    const poller = await compute.virtualMachines.beginCreateOrUpdate(
      env.AZURE_RESOURCE_GROUP,
      input.vmName,
      {
        location: env.AZURE_REGION,
        ...(input.tags ? { tags: input.tags } : {}),
        hardwareProfile: { vmSize: input.vmSize },
        storageProfile: {
          imageReference: {
            publisher: image.publisher,
            offer: image.offer,
            sku: image.sku,
            version: image.version,
          },
          osDisk: {
            createOption: "FromImage",
            managedDisk: { storageAccountType: "Premium_LRS" },
          },
        },
        osProfile: {
          computerName: input.vmName,
          adminUsername: input.adminUsername,
          linuxConfiguration: {
            disablePasswordAuthentication: true,
            ssh: {
              // Azure accepts multiple publicKeys entries for the same path;
              // every selected key is authorized for SSH login, not just one.
              publicKeys: input.sshPublicKeys.map((keyData) => ({
                path: `/home/${input.adminUsername}/.ssh/authorized_keys`,
                keyData,
              })),
            },
          },
        },
        networkProfile: {
          networkInterfaces: [{ id: nic.id, primary: true }],
        },
      },
    );
    const vm = await poller.pollUntilDone();
    if (!vm.id) throw new Error("Azure did not return a resource ID for the new VM.");

    return { azureResourceId: vm.id, nicName: nic.name, publicIpName: publicIp.name };
  } catch (err) {
    // Best-effort rollback of the networking resources we just created,
    // so a failed VM create doesn't leave orphaned billable resources.
    await deleteVmNetworkResources(nic.name, publicIp.name);
    throw toAzureApiError(err, `Could not create VM "${input.vmName}".`);
  }
}

/**
 * Deletes the VM and its dependent OS disk, NIC, and public IP. Only
 * touches resources this panel created for this specific VM (by name
 * convention: `<vm>-nic`, `<vm>-pip`) — never anything else in the
 * resource group.
 */
export async function deleteAzureVm(vmName: string): Promise<void> {
  const env = getEnv();
  const compute = getComputeClient();

  let osDiskName: string | undefined;
  let nicName: string | undefined;
  try {
    const vm = await compute.virtualMachines.get(env.AZURE_RESOURCE_GROUP, vmName);
    osDiskName = vm.storageProfile?.osDisk?.name;
    nicName = nicNameFromVmProfile(vm.networkProfile);
  } catch {
    // If we can't read it, still attempt the delete by name below.
  }

  try {
    const poller = await compute.virtualMachines.beginDelete(env.AZURE_RESOURCE_GROUP, vmName);
    await poller.pollUntilDone();
  } catch (err) {
    throw toAzureApiError(err, `Could not delete VM "${vmName}".`);
  }

  await deleteVmNetworkResources(nicName ?? `${vmName}-nic`, `${vmName}-pip`);

  if (osDiskName) {
    try {
      const poller = await compute.disks.beginDelete(env.AZURE_RESOURCE_GROUP, osDiskName);
      await poller.pollUntilDone();
    } catch {
      // Non-fatal — the VM itself is gone; disk cleanup failure is logged by the caller.
    }
  }
}
