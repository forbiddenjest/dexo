export type VpsStatus = "RUNNING" | "STOPPED" | "PROVISIONING" | "DELETING" | "SUSPENDED" | "ERROR";

export type Role = "CUSTOMER" | "ADMIN" | "SUPER_ADMIN";

export type UserStatus = "ACTIVE" | "SUSPENDED";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  username: string;
  role: Role;
}

export interface Customer extends SessionUser {
  status: UserStatus;
  vpsCount: number;
  createdAt: string;
}

export interface Vps {
  id: string;
  ownerId: string;
  ownerEmail: string;
  azureName: string;
  azureRegion: string;
  azureVmSize: string;
  azureOsImage: string;
  status: VpsStatus;
  statusMessage: string | null;
  publicIp: string | null;
  privateIp: string | null;
  sshUser: string;
  createdAt: string;
  suspended?: boolean;
}

export interface VpsStatusResponse {
  id: string;
  status: VpsStatus;
  statusMessage: string | null;
  publicIp: string | null;
  privateIp: string | null;
}

export interface SshKey {
  id: string;
  name: string;
  fingerprint: string;
  publicKeyPreview: string;
  createdAt: string;
}

export type ActivityAction =
  | "VPS_CREATE"
  | "VPS_START"
  | "VPS_STOP"
  | "VPS_RESTART"
  | "VPS_REINSTALL"
  | "VPS_DELETE"
  | "VPS_SUSPEND"
  | "VPS_UNSUSPEND"
  | "CONFIG_UPDATE"
  | "CONFIG_DELETE"
  | "CONSOLE_RELOAD"
  | "USER_LOGIN"
  | "USER_LOGOUT"
  | "USER_SUSPEND"
  | "USER_REACTIVATE"
  | "USER_CREATE"
  | "USER_PASSWORD_RESET";

export interface ActivityRecord {
  id: string;
  action: ActivityAction;
  vpsId: string | null;
  vpsName: string | null;
  actorEmail: string;
  status: "SUCCESS" | "PENDING" | "FAILED";
  error: string | null;
  createdAt: string;
}

export interface JobResponse {
  jobId: string;
  auditLogId: string;
}

export interface SetupStatus {
  needsSetup: boolean;
  database: { ok: boolean; error: string | null };
  azure: {
    configured: boolean;
    connected: boolean;
    subscriptionId: string | null;
    resourceGroup: string | null;
    region: string | null;
    error: string | null;
  };
}

export const ACTION_LABELS: Record<ActivityAction, string> = {
  VPS_CREATE: "Created VPS",
  VPS_START: "Started VPS",
  VPS_STOP: "Stopped VPS",
  VPS_RESTART: "Restarted VPS",
  VPS_REINSTALL: "Reinstalled VPS",
  VPS_DELETE: "Deleted VPS",
  VPS_SUSPEND: "Suspended VPS",
  VPS_UNSUSPEND: "Unsuspended VPS",
  CONFIG_UPDATE: "Updated configuration value",
  CONFIG_DELETE: "Deleted configuration value",
  CONSOLE_RELOAD: "Reloaded Azure console",
  USER_LOGIN: "Signed in",
  USER_LOGOUT: "Signed out",
  USER_SUSPEND: "Suspended customer",
  USER_REACTIVATE: "Reactivated customer",
  USER_CREATE: "Created customer",
  USER_PASSWORD_RESET: "Reset customer password",
};

export const REGIONS = [
  { value: "eastus", label: "East US" },
  { value: "westeurope", label: "West Europe" },
  { value: "northeurope", label: "North Europe" },
  { value: "centralindia", label: "Central India" },
  { value: "southeastasia", label: "Southeast Asia" },
];

export const VM_SIZES = [
  { value: "Standard_B1s", label: "Standard_B1s - 1 vCPU · 1 GiB", group: "Burstable (B-series)" },
  { value: "Standard_B2s", label: "Standard_B2s - 2 vCPU · 4 GiB", group: "Burstable (B-series)" },
  {
    value: "Standard_B2ms",
    label: "Standard_B2ms - 2 vCPU · 8 GiB",
    group: "Burstable (B-series)",
  },
  { value: "Standard_D2s_v5", label: "Standard_D2s_v5 - 2 vCPU · 8 GiB", group: "Intel (Dsv5)" },
  { value: "Standard_D4s_v5", label: "Standard_D4s_v5 - 4 vCPU · 16 GiB", group: "Intel (Dsv5)" },
  {
    value: "Standard_D2as_v5",
    label: "D2as_v5 - 2 vCPU · 8 GB",
    group: "AMD EPYC 7763 - Milan (Dasv5)",
  },
  {
    value: "Standard_D4as_v5",
    label: "D4as_v5 - 4 vCPU · 16 GB",
    group: "AMD EPYC 7763 - Milan (Dasv5)",
  },
  {
    value: "Standard_D8as_v5",
    label: "D8as_v5 - 8 vCPU · 32 GB",
    group: "AMD EPYC 7763 - Milan (Dasv5)",
  },
  {
    value: "Standard_D16as_v5",
    label: "D16as_v5 - 16 vCPU · 64 GB",
    group: "AMD EPYC 7763 - Milan (Dasv5)",
  },
  {
    value: "Standard_D32as_v5",
    label: "D32as_v5 - 32 vCPU · 128 GB",
    group: "AMD EPYC 7763 - Milan (Dasv5)",
  },
  {
    value: "Standard_D2as_v7",
    label: "D2as_v7 - 2 vCPU · 8 GB",
    group: "AMD EPYC 9005 - Turin (Dasv7)",
  },
  {
    value: "Standard_D4as_v7",
    label: "D4as_v7 - 4 vCPU · 16 GB",
    group: "AMD EPYC 9005 - Turin (Dasv7)",
  },
  {
    value: "Standard_D8as_v7",
    label: "D8as_v7 - 8 vCPU · 32 GB",
    group: "AMD EPYC 9005 - Turin (Dasv7)",
  },
  {
    value: "Standard_D16as_v7",
    label: "D16as_v7 - 16 vCPU · 64 GB",
    group: "AMD EPYC 9005 - Turin (Dasv7)",
  },
  {
    value: "Standard_D32as_v7",
    label: "D32as_v7 - 32 vCPU · 128 GB",
    group: "AMD EPYC 9005 - Turin (Dasv7)",
  },
];

export const VM_SIZE_GROUPS = [...new Set(VM_SIZES.map((s) => s.group))];

export function vmSizeLabel(value: string) {
  return VM_SIZES.find((s) => s.value === value)?.label ?? value;
}

export const OS_IMAGES = [
  { value: "Canonical:ubuntu-24_04-lts:server:latest", label: "Ubuntu 24.04 LTS" },
  { value: "Canonical:0001-com-ubuntu-server-jammy:22_04-lts:latest", label: "Ubuntu 22.04 LTS" },
  { value: "Debian:debian-12:12:latest", label: "Debian 12" },
  { value: "RedHat:RHEL:9-lvm:latest", label: "RHEL 9" },
  { value: "resf:rockylinux-x86_64:9-base:latest", label: "Rocky Linux 9" },
];

export function osLabel(image: string) {
  return OS_IMAGES.find((o) => o.value === image)?.label ?? image;
}

export function regionLabel(region: string) {
  return REGIONS.find((r) => r.value === region)?.label ?? region;
}
