/**
 * This is the ONLY place the frontend talks to the backend. Every method
 * calls a server function (src/server/functions/*), which runs
 * exclusively on the server — Azure credentials and the database
 * connection never reach the browser. There is no mock/demo fallback:
 * if the server function throws (missing config, Azure error, DB error,
 * auth failure), that error surfaces to the UI as an ApiError.
 */
import {
  addSshKeyFn,
  adminSshKeysForUserFn,
  deleteSshKeyFn,
  listSshKeysFn,
} from "@/server/functions/ssh-keys";
import { adminAuditFn, historyFn } from "@/server/functions/activity";
import {
  adminCreateUserFn,
  adminCustomersFn,
  adminSetCustomerStatusFn,
  adminSetUserPasswordFn,
} from "@/server/functions/admin";
import { azureStatusFn } from "@/server/functions/azure-status";
import { loginFn, logoutFn, sessionFn } from "@/server/functions/auth";
import { setupCreateAdminFn, setupStatusFn } from "@/server/functions/setup";
import {
  adminListVpsFn,
  adminSetVpsSuspendedFn,
  adminVpsActionFn,
  createVpsFn,
  deleteVpsFn,
  getVpsFn,
  getVpsStatusFn,
  listVpsFn,
  reinstallVpsFn,
  vpsActionFn,
} from "@/server/functions/vps";

import type {
  ActivityRecord,
  Customer,
  JobResponse,
  SessionUser,
  SetupStatus,
  SshKey,
  Vps,
  VpsStatusResponse,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Server functions encode HTTP-style status codes into the thrown
 * error's message as `"<status>::<message>"` (see src/server/http-error.ts)
 * because custom error subclasses don't reliably survive the
 * server/client serialization boundary. This unwraps that back into a
 * proper ApiError for the UI to check with `instanceof`.
 */
async function unwrap<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
    const match = /^(\d{3})::([\s\S]*)$/.exec(message);
    if (match) {
      throw new ApiError(Number(match[1]), match[2] ?? "Something went wrong.");
    }
    throw new ApiError(500, "Something went wrong. Please try again.");
  }
}

export const api = {
  session(): Promise<SessionUser | null> {
    return unwrap(sessionFn());
  },

  login(email: string, password: string): Promise<SessionUser> {
    return unwrap(loginFn({ data: { email, password } }));
  },

  async logout(): Promise<void> {
    await unwrap(logoutFn());
  },

  listVps(): Promise<Vps[]> {
    return unwrap(listVpsFn());
  },

  getVps(vpsId: string): Promise<Vps> {
    return unwrap(getVpsFn({ data: { vpsId } }));
  },

  getVpsStatus(vpsId: string): Promise<VpsStatusResponse> {
    return unwrap(getVpsStatusFn({ data: { vpsId } }));
  },

  createVps(input: {
    name: string;
    vmSize: string;
    osImage: string;
    sshKeyIds: string[];
    ownerId: string;
  }): Promise<Vps & JobResponse> {
    return unwrap(createVpsFn({ data: input }));
  },

  vpsAction(vpsId: string, action: "start" | "stop" | "restart"): Promise<JobResponse> {
    return unwrap(vpsActionFn({ data: { vpsId, action } }));
  },

  reinstallVps(
    vpsId: string,
    input: { osImage: string; confirmationName: string; sshKeyIds: string[] },
  ): Promise<JobResponse> {
    return unwrap(reinstallVpsFn({ data: { vpsId, ...input } }));
  },

  async deleteVps(vpsId: string, confirmationName: string): Promise<void> {
    await unwrap(deleteVpsFn({ data: { vpsId, confirmationName } }));
  },

  listSshKeys(): Promise<SshKey[]> {
    return unwrap(listSshKeysFn());
  },

  addSshKey(input: { name: string; publicKey: string }): Promise<SshKey> {
    return unwrap(addSshKeyFn({ data: input }));
  },

  async deleteSshKey(keyId: string): Promise<void> {
    await unwrap(deleteSshKeyFn({ data: { keyId } }));
  },

  history(): Promise<ActivityRecord[]> {
    return unwrap(historyFn()) as Promise<ActivityRecord[]>;
  },

  adminCustomers(): Promise<Customer[]> {
    return unwrap(adminCustomersFn()) as Promise<Customer[]>;
  },

  async adminSetCustomerStatus(userId: string, status: "ACTIVE" | "SUSPENDED"): Promise<void> {
    await unwrap(adminSetCustomerStatusFn({ data: { userId, status } }));
  },

  adminCreateUser(input: {
    name: string;
    username: string;
    email: string;
    password: string;
  }): Promise<Customer> {
    return unwrap(adminCreateUserFn({ data: input })) as Promise<Customer>;
  },

  async adminSetUserPassword(userId: string, password: string): Promise<void> {
    await unwrap(adminSetUserPasswordFn({ data: { userId, password } }));
  },

  adminListVps(): Promise<Vps[]> {
    return unwrap(adminListVpsFn());
  },

  adminSshKeys(userId: string): Promise<SshKey[]> {
    return unwrap(adminSshKeysForUserFn({ data: { userId } }));
  },

  adminVpsAction(vpsId: string, action: "start" | "stop" | "restart"): Promise<JobResponse> {
    return unwrap(adminVpsActionFn({ data: { vpsId, action } }));
  },

  adminAudit(): Promise<ActivityRecord[]> {
    return unwrap(adminAuditFn()) as Promise<ActivityRecord[]>;
  },

  async adminSetVpsSuspended(vpsId: string, suspended: boolean): Promise<void> {
    await unwrap(adminSetVpsSuspendedFn({ data: { vpsId, suspended } }));
  },

  // --- Azure connection status (replaces the old write-only config store) ---

  async azureStatus() {
    return unwrap(azureStatusFn());
  },

  // --- First-run setup ---

  setupStatus(): Promise<SetupStatus> {
    return unwrap(setupStatusFn());
  },

  async setupCreateAdmin(input: {
    name: string;
    username: string;
    email: string;
    password: string;
  }): Promise<void> {
    await unwrap(setupCreateAdminFn({ data: input }));
  },
};
