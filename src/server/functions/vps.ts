import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { assertImageAvailable, parseOsImage } from "../azure/images";
import { assertVmSizeAvailable } from "../azure/sizes";
import {
  createAzureVm,
  deleteAzureVm,
  getAzureVmSnapshot,
  restartAzureVm,
  startAzureVm,
  stopAzureVm,
  type AzureVmSnapshot,
} from "../azure/vms";
import { assertOwnerOrAdmin, isAdminRole, requireAdmin, requireUser } from "../auth/rbac";
import { writeAudit } from "../audit";
import { getEnv } from "../env";
import { getDb } from "../db/client";
import { sshKeys, users, vps as vpsTable } from "../db/schema";
import { HttpError, toHttpError, ValidationError } from "../http-error";
import { getLatestOperation, runTrackedOperation } from "../jobs";

type VpsStatus = "RUNNING" | "STOPPED" | "PROVISIONING" | "DELETING" | "SUSPENDED" | "ERROR";

interface VpsDto {
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

type VpsRow = typeof vpsTable.$inferSelect;

async function buildVpsDto(row: VpsRow, ownerEmail: string): Promise<VpsDto> {
  const base = {
    id: row.id,
    ownerId: row.ownerId,
    ownerEmail,
    azureName: row.azureVmName,
    azureRegion: row.region,
    azureVmSize: row.vmSize,
    azureOsImage: row.osImage,
    sshUser: row.sshUser,
    createdAt: row.createdAt.toISOString(),
    suspended: row.suspended,
  };

  if (row.suspended) {
    return {
      ...base,
      status: "SUSPENDED",
      statusMessage: "Suspended by an administrator.",
      publicIp: null,
      privateIp: null,
    };
  }

  const job = await getLatestOperation(row.id);
  if (job?.status === "PENDING") {
    return {
      ...base,
      status: job.kind === "DELETE" ? "DELETING" : "PROVISIONING",
      statusMessage: `${job.kind[0]}${job.kind.slice(1).toLowerCase()} in progress`,
      publicIp: null,
      privateIp: null,
    };
  }

  if (!row.azureResourceId) {
    // Create job hasn't produced a resource yet and isn't pending (i.e. it failed).
    return {
      ...base,
      status: "ERROR",
      statusMessage: job?.status === "FAILED" ? job.error : "Provisioning has not completed.",
      publicIp: null,
      privateIp: null,
    };
  }

  let snapshot: AzureVmSnapshot | null = null;
  let error: string | null = null;
  try {
    snapshot = await getAzureVmSnapshot(row.azureVmName);
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not read VM state from Azure.";
  }

  if (!snapshot) {
    return { ...base, status: "ERROR", statusMessage: error, publicIp: null, privateIp: null };
  }

  const status: VpsStatus =
    snapshot.powerState === "RUNNING"
      ? "RUNNING"
      : snapshot.powerState === "STOPPED" || snapshot.powerState === "DEALLOCATED"
        ? "STOPPED"
        : snapshot.powerState === "STARTING" || snapshot.powerState === "STOPPING"
          ? "PROVISIONING"
          : "ERROR";

  return {
    ...base,
    status,
    statusMessage: job?.status === "FAILED" ? job.error : null,
    publicIp: snapshot.publicIp,
    privateIp: snapshot.privateIp,
  };
}

async function ownerEmailsFor(ownerIds: string[]): Promise<Map<string, string>> {
  if (ownerIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, [...new Set(ownerIds)]));
  return new Map(rows.map((r) => [r.id, r.email]));
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const listVpsFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const user = await requireUser();
    const db = getDb();
    const rows = await db.select().from(vpsTable).where(eq(vpsTable.ownerId, user.id));
    const emails = await ownerEmailsFor(rows.map((r) => r.ownerId));
    const dtos = await Promise.all(
      rows.map((r) => buildVpsDto(r, emails.get(r.ownerId) ?? user.email)),
    );
    return dtos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    throw toHttpError(err, "Could not load your VPS instances.");
  }
});

export const adminListVpsFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    await requireAdmin();
    const db = getDb();
    const rows = await db.select().from(vpsTable);
    const emails = await ownerEmailsFor(rows.map((r) => r.ownerId));
    const dtos = await Promise.all(
      rows.map((r) => buildVpsDto(r, emails.get(r.ownerId) ?? "unknown")),
    );
    return dtos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    throw toHttpError(err, "Could not load VPS instances.");
  }
});

const idSchema = z.object({ vpsId: z.string().uuid() });

export const getVpsFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const user = await requireUser();
      const db = getDb();
      const row = (await db.select().from(vpsTable).where(eq(vpsTable.id, data.vpsId)).limit(1))[0];
      if (!row) throw new HttpError(404, "VPS not found.");
      assertOwnerOrAdmin(user, row.ownerId);
      const emails = await ownerEmailsFor([row.ownerId]);
      return await buildVpsDto(row, emails.get(row.ownerId) ?? "unknown");
    } catch (err) {
      throw toHttpError(err, "Could not load this VPS.");
    }
  });

export const getVpsStatusFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const user = await requireUser();
      const db = getDb();
      const row = (await db.select().from(vpsTable).where(eq(vpsTable.id, data.vpsId)).limit(1))[0];
      if (!row) throw new HttpError(404, "VPS not found.");
      assertOwnerOrAdmin(user, row.ownerId);
      const emails = await ownerEmailsFor([row.ownerId]);
      const dto = await buildVpsDto(row, emails.get(row.ownerId) ?? "unknown");
      return {
        id: dto.id,
        status: dto.status,
        statusMessage: dto.statusMessage,
        publicIp: dto.publicIp,
        privateIp: dto.privateIp,
      };
    } catch (err) {
      throw toHttpError(err, "Could not load VPS status.");
    }
  });

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

const nameSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(
    /^[a-z][a-z0-9-]*[a-z0-9]$/,
    "Use lowercase letters, numbers and hyphens, starting with a letter.",
  );

const createVpsSchema = z.object({
  name: nameSchema,
  vmSize: z.string().min(1),
  osImage: z.string().min(1),
  sshKeyIds: z.array(z.string().uuid()).min(1, "At least one SSH key is required."),
  ownerId: z.string().uuid(),
});

export const createVpsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => createVpsSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const admin = await requireAdmin();
      const env = getEnv();
      const db = getDb();

      const owner = (await db.select().from(users).where(eq(users.id, data.ownerId)).limit(1))[0];
      if (!owner) throw new HttpError(404, "Select a registered user to own this VPS.");

      const keys = await db
        .select()
        .from(sshKeys)
        .where(and(eq(sshKeys.ownerId, data.ownerId), inArray(sshKeys.id, data.sshKeyIds)));
      if (keys.length !== data.sshKeyIds.length) {
        throw new HttpError(400, "One or more selected SSH keys were not found for this user.");
      }

      // Validate size/image up front so the client gets a fast, clear
      // error instead of discovering it only after the async job fails.
      await assertVmSizeAvailable(data.vmSize);
      await assertImageAvailable(parseOsImage(data.osImage));

      const existing = await db
        .select()
        .from(vpsTable)
        .where(and(eq(vpsTable.ownerId, data.ownerId), eq(vpsTable.azureVmName, data.name)));
      if (existing.length > 0) {
        throw new HttpError(409, "That user already has a VPS with that name.");
      }

      const [row] = await db
        .insert(vpsTable)
        .values({
          ownerId: data.ownerId,
          azureVmName: data.name,
          azureResourceId: "",
          resourceGroup: env.AZURE_RESOURCE_GROUP,
          subscriptionId: env.AZURE_SUBSCRIPTION_ID,
          // The instance is always provisioned in the server's configured
          // Azure region (this deployment supports one region at a time —
          // see AZURE_REGION). Never take region from client input: doing
          // so would let the UI claim a placement that doesn't match where
          // the VM, its NIC, and its VNet/subnet actually get created.
          region: env.AZURE_REGION,
          vmSize: data.vmSize,
          osImage: data.osImage,
          sshUser: "azureuser",
        })
        .returning();
      if (!row) throw new HttpError(500, "Could not create the VPS record.");

      const jobId = await runTrackedOperation(row.id, "CREATE", async () => {
        const result = await createAzureVm({
          vmName: data.name,
          vmSize: data.vmSize,
          osImage: data.osImage,
          adminUsername: "azureuser",
          // All selected keys are authorized for SSH login, not just the first.
          sshPublicKeys: keys.map((k) => k.publicKey),
          tags: { managedBy: "azure-console", ownerId: data.ownerId },
        });
        await db
          .update(vpsTable)
          .set({ azureResourceId: result.azureResourceId, updatedAt: new Date() })
          .where(eq(vpsTable.id, row.id));
      });

      await writeAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "VPS_CREATE",
        vpsId: row.id,
        vpsName: row.azureVmName,
        status: "PENDING",
      });

      const dto = await buildVpsDto(row, owner.email);
      return { ...dto, jobId, auditLogId: jobId };
    } catch (err) {
      throw toHttpError(err, "Could not create the VPS.");
    }
  });

const actionSchema = z.object({
  vpsId: z.string().uuid(),
  action: z.enum(["start", "stop", "restart"]),
});

async function performAction(
  vpsId: string,
  action: "start" | "stop" | "restart",
  actorEmail: string,
  actorId: string,
) {
  const db = getDb();
  const row = (await db.select().from(vpsTable).where(eq(vpsTable.id, vpsId)).limit(1))[0];
  if (!row) throw new HttpError(404, "VPS not found.");

  const latest = await getLatestOperation(vpsId);
  if (latest?.status === "PENDING") {
    throw new HttpError(409, "Another operation is already in progress.");
  }
  if (!row.azureResourceId) {
    throw new HttpError(409, "This VPS has not finished provisioning yet.");
  }

  const kind = action === "start" ? "START" : action === "stop" ? "STOP" : "RESTART";
  const op = action === "start" ? startAzureVm : action === "stop" ? stopAzureVm : restartAzureVm;

  const jobId = await runTrackedOperation(vpsId, kind, () => op(row.azureVmName));

  await writeAudit({
    actorId,
    actorEmail,
    action: action === "start" ? "VPS_START" : action === "stop" ? "VPS_STOP" : "VPS_RESTART",
    vpsId: row.id,
    vpsName: row.azureVmName,
    status: "PENDING",
  });

  return { jobId, auditLogId: jobId };
}

export const vpsActionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => actionSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const user = await requireUser();
      const db = getDb();
      const row = (await db.select().from(vpsTable).where(eq(vpsTable.id, data.vpsId)).limit(1))[0];
      if (!row) throw new HttpError(404, "VPS not found.");
      assertOwnerOrAdmin(user, row.ownerId);
      if (row.suspended && !isAdminRole(user.role)) {
        throw new HttpError(403, "This VPS is suspended by an administrator.");
      }
      return await performAction(data.vpsId, data.action, user.email, user.id);
    } catch (err) {
      throw toHttpError(err, "Could not perform that action.");
    }
  });

export const adminVpsActionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => actionSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const admin = await requireAdmin();
      return await performAction(data.vpsId, data.action, admin.email, admin.id);
    } catch (err) {
      throw toHttpError(err, "Could not perform that action.");
    }
  });

const reinstallSchema = z.object({
  vpsId: z.string().uuid(),
  osImage: z.string().min(1),
  confirmationName: z.string().min(1),
  sshKeyIds: z.array(z.string().uuid()).min(1, "At least one SSH key is required."),
});

export const reinstallVpsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => reinstallSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const user = await requireUser();
      const db = getDb();
      const row = (await db.select().from(vpsTable).where(eq(vpsTable.id, data.vpsId)).limit(1))[0];
      if (!row) throw new HttpError(404, "VPS not found.");
      assertOwnerOrAdmin(user, row.ownerId);
      if (row.suspended && !isAdminRole(user.role)) {
        throw new HttpError(403, "This VPS is suspended by an administrator.");
      }
      if (data.confirmationName !== row.azureVmName) {
        throw new HttpError(400, "The confirmation name does not match the VPS name.");
      }
      const latest = await getLatestOperation(data.vpsId);
      if (latest?.status === "PENDING") {
        throw new HttpError(409, "Another operation is already in progress.");
      }

      const keys = await db
        .select()
        .from(sshKeys)
        .where(and(eq(sshKeys.ownerId, row.ownerId), inArray(sshKeys.id, data.sshKeyIds)));
      if (keys.length === 0)
        throw new HttpError(400, "Selected SSH keys were not found for this user.");

      await assertImageAvailable(parseOsImage(data.osImage));

      // Azure VM "reinstall" = delete + recreate with the same name/network
      // identity, since ARM has no in-place OS-swap primitive for
      // arbitrary image changes on an existing managed disk.
      const jobId = await runTrackedOperation(row.id, "REINSTALL", async () => {
        await deleteAzureVm(row.azureVmName);
        const result = await createAzureVm({
          vmName: row.azureVmName,
          vmSize: row.vmSize,
          osImage: data.osImage,
          adminUsername: row.sshUser,
          sshPublicKeys: keys.map((k) => k.publicKey),
          tags: { managedBy: "azure-console", ownerId: row.ownerId },
        });
        await db
          .update(vpsTable)
          .set({
            azureResourceId: result.azureResourceId,
            osImage: data.osImage,
            updatedAt: new Date(),
          })
          .where(eq(vpsTable.id, row.id));
      });

      await writeAudit({
        actorId: user.id,
        actorEmail: user.email,
        action: "VPS_REINSTALL",
        vpsId: row.id,
        vpsName: row.azureVmName,
        status: "PENDING",
      });

      return { jobId, auditLogId: jobId };
    } catch (err) {
      throw toHttpError(err, "Could not reinstall the VPS.");
    }
  });

const deleteSchema = z.object({ vpsId: z.string().uuid(), confirmationName: z.string().min(1) });

export const deleteVpsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => deleteSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const admin = await requireAdmin();
      const db = getDb();
      const row = (await db.select().from(vpsTable).where(eq(vpsTable.id, data.vpsId)).limit(1))[0];
      if (!row) throw new HttpError(404, "VPS not found.");
      if (data.confirmationName !== row.azureVmName) {
        throw new HttpError(400, "The confirmation name does not match the VPS name.");
      }
      const latest = await getLatestOperation(data.vpsId);
      if (latest?.status === "PENDING") {
        throw new HttpError(409, "Another operation is already in progress.");
      }

      const jobId = await runTrackedOperation(row.id, "DELETE", async () => {
        if (row.azureResourceId) {
          await deleteAzureVm(row.azureVmName);
        }
        await db.delete(vpsTable).where(eq(vpsTable.id, row.id));
      });

      await writeAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "VPS_DELETE",
        vpsId: row.id,
        vpsName: row.azureVmName,
        status: "PENDING",
      });

      return { jobId, auditLogId: jobId };
    } catch (err) {
      throw toHttpError(err, "Could not delete the VPS.");
    }
  });

const suspendSchema = z.object({ vpsId: z.string().uuid(), suspended: z.boolean() });

export const adminSetVpsSuspendedFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => suspendSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const admin = await requireAdmin();
      const db = getDb();
      const row = (await db.select().from(vpsTable).where(eq(vpsTable.id, data.vpsId)).limit(1))[0];
      if (!row) throw new HttpError(404, "VPS not found.");

      const latest = await getLatestOperation(data.vpsId);
      if (latest?.status === "PENDING") {
        throw new HttpError(409, "Another operation is already in progress.");
      }

      await db
        .update(vpsTable)
        .set({ suspended: data.suspended, updatedAt: new Date() })
        .where(eq(vpsTable.id, row.id));

      await writeAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: data.suspended ? "VPS_SUSPEND" : "VPS_UNSUSPEND",
        vpsId: row.id,
        vpsName: row.azureVmName,
        status: "SUCCESS",
      });
      return null;
    } catch (err) {
      throw toHttpError(err, "Could not update VPS suspension.");
    }
  });

export { ValidationError };
