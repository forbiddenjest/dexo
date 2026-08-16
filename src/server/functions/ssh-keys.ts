import { createHash } from "node:crypto";

import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAdmin, requireUser } from "../auth/rbac";
import { getDb } from "../db/client";
import { sshKeys } from "../db/schema";
import { HttpError, toHttpError } from "../http-error";

const SSH_PREFIXES = ["ssh-ed25519", "ssh-rsa", "ecdsa-sha2-"];

function validatePublicKey(raw: string): string {
  const key = raw.trim();
  if (!SSH_PREFIXES.some((p) => key.startsWith(p))) {
    throw new HttpError(400, "Public key must start with ssh-ed25519, ssh-rsa or ecdsa-sha2-*.");
  }
  if (/PRIVATE KEY/i.test(key)) {
    throw new HttpError(400, "That looks like a private key. Only paste your public key.");
  }
  // Public keys are base64 blobs after the type token — reject anything
  // that doesn't look structurally like `type base64data [comment]`.
  const parts = key.split(/\s+/);
  if (parts.length < 2 || !/^[A-Za-z0-9+/=]+$/.test(parts[1] ?? "")) {
    throw new HttpError(400, "That doesn't look like a valid SSH public key.");
  }
  return key;
}

function fingerprintOf(key: string): string {
  // SHA-256 fingerprint of the base64-decoded key blob, formatted the
  // way `ssh-keygen -lf` displays it.
  const parts = key.split(/\s+/);
  const blob = Buffer.from(parts[1] ?? "", "base64");
  const digest = createHash("sha256").update(blob).digest("base64").replace(/=+$/, "");
  return `SHA256:${digest}`;
}

function toDto(row: typeof sshKeys.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    fingerprint: row.fingerprint,
    publicKeyPreview: `${row.publicKey.slice(0, 44)}…`,
    createdAt: row.createdAt.toISOString(),
  };
}

export const listSshKeysFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const user = await requireUser();
    const db = getDb();
    const rows = await db.select().from(sshKeys).where(eq(sshKeys.ownerId, user.id));
    return rows.map(toDto);
  } catch (err) {
    throw toHttpError(err, "Could not load SSH keys.");
  }
});

const addSchema = z.object({
  name: z.string().trim().min(1).max(64),
  publicKey: z.string().min(1),
});

export const addSshKeyFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => addSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const user = await requireUser();
      const key = validatePublicKey(data.publicKey);
      const db = getDb();
      const [row] = await db
        .insert(sshKeys)
        .values({
          ownerId: user.id,
          name: data.name,
          publicKey: key,
          fingerprint: fingerprintOf(key),
        })
        .returning();
      if (!row) throw new HttpError(500, "Could not save the SSH key.");
      return toDto(row);
    } catch (err) {
      throw toHttpError(err, "Could not add the SSH key.");
    }
  });

const idSchema = z.object({ keyId: z.string().uuid() });

export const deleteSshKeyFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const user = await requireUser();
      const db = getDb();
      await db.delete(sshKeys).where(and(eq(sshKeys.id, data.keyId), eq(sshKeys.ownerId, user.id)));
      return null;
    } catch (err) {
      throw toHttpError(err, "Could not delete the SSH key.");
    }
  });

export const adminSshKeysForUserFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    try {
      await requireAdmin();
      const db = getDb();
      const rows = await db.select().from(sshKeys).where(eq(sshKeys.ownerId, data.userId));
      return rows.map(toDto);
    } catch (err) {
      throw toHttpError(err, "Could not load SSH keys for this user.");
    }
  });
