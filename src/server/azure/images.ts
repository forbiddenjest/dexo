import { getEnv } from "../env";
import { getComputeClient } from "./client";

export interface OsImageRef {
  value: string; // "publisher:offer:sku:version" — matches the panel's existing OS_IMAGES format
  publisher: string;
  offer: string;
  sku: string;
  version: string;
  label: string;
}

/**
 * Known-good Linux image references. Kept centrally so no image
 * identifiers are scattered through route/component code — the panel's
 * "Create VPS" UI already sends one of these `value` strings.
 */
export const OS_IMAGE_CATALOG: OsImageRef[] = [
  {
    value: "Canonical:ubuntu-24_04-lts:server:latest",
    publisher: "Canonical",
    offer: "ubuntu-24_04-lts",
    sku: "server",
    version: "latest",
    label: "Ubuntu 24.04 LTS",
  },
  {
    value: "Canonical:0001-com-ubuntu-server-jammy:22_04-lts:latest",
    publisher: "Canonical",
    offer: "0001-com-ubuntu-server-jammy",
    sku: "22_04-lts",
    version: "latest",
    label: "Ubuntu 22.04 LTS",
  },
  {
    value: "Debian:debian-12:12:latest",
    publisher: "Debian",
    offer: "debian-12",
    sku: "12",
    version: "latest",
    label: "Debian 12",
  },
  {
    value: "RedHat:RHEL:9-lvm:latest",
    publisher: "RedHat",
    offer: "RHEL",
    sku: "9-lvm",
    version: "latest",
    label: "RHEL 9",
  },
  {
    // CentOS 7/8 are EOL and deprecated on Azure Marketplace (Microsoft's
    // own CentOS EOL guidance points users at Rocky Linux/AlmaLinux).
    // Rocky Linux, published by RESF, is the standard drop-in successor.
    value: "resf:rockylinux-x86_64:9-base:latest",
    publisher: "resf",
    offer: "rockylinux-x86_64",
    sku: "9-base",
    version: "latest",
    label: "Rocky Linux 9",
  },
];

export function parseOsImage(value: string): OsImageRef {
  const found = OS_IMAGE_CATALOG.find((i) => i.value === value);
  if (!found) {
    throw new Error(`"${value}" is not a supported OS image.`);
  }
  return found;
}

/**
 * Confirms Azure actually publishes this publisher/offer/sku in the
 * configured region before we attempt to provision a VM with it — we
 * never assume an image exists just because it's in our static catalog.
 */
export async function assertImageAvailable(image: OsImageRef): Promise<void> {
  const env = getEnv();
  const compute = getComputeClient();
  try {
    const versions = await compute.virtualMachineImages.list(
      env.AZURE_REGION,
      image.publisher,
      image.offer,
      image.sku,
      { top: 1 },
    );
    if (!versions || versions.length === 0) {
      throw new Error(
        `Azure has no available versions of ${image.publisher}:${image.offer}:${image.sku} in ${env.AZURE_REGION}.`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Azure has no")) throw err;
    throw new Error(
      `Could not confirm availability of image ${image.publisher}:${image.offer}:${image.sku} in ${env.AZURE_REGION}.`,
    );
  }
}
