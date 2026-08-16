import { getEnv } from "../env";
import { getComputeClient } from "./client";

export interface AvailableVmSize {
  name: string;
  vCPUs: number;
  memoryGB: number;
}

/** Queries Azure for VM sizes actually available in the configured region. */
export async function listAvailableVmSizes(): Promise<AvailableVmSize[]> {
  const env = getEnv();
  const compute = getComputeClient();
  const out: AvailableVmSize[] = [];
  for await (const size of compute.virtualMachineSizes.list(env.AZURE_REGION)) {
    if (!size.name) continue;
    out.push({
      name: size.name,
      vCPUs: size.numberOfCores ?? 0,
      memoryGB: Math.round(((size.memoryInMB ?? 0) / 1024) * 10) / 10,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Throws if the requested size is not offered in the configured region. */
export async function assertVmSizeAvailable(vmSize: string): Promise<void> {
  const sizes = await listAvailableVmSizes();
  if (!sizes.some((s) => s.name === vmSize)) {
    throw new Error(`VM size "${vmSize}" is not available in the configured Azure region.`);
  }
}
