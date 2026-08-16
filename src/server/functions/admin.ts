import { createServerFn } from "@tanstack/react-start";
import { count, eq, sql as rawSql } from "drizzle-orm";
import { z } from "zod";

import { requireAdmin } from "../auth/rbac";
import { hashPassword } from "../auth/password";
import { writeAudit } from "../audit";
import { getDb } from "../db/client";
import { users, vps as vpsTable } from "../db/schema";
import { HttpError, toHttpError } from "../http-error";

function toCustomerDto(row: typeof users.$inferSelect, vpsCount: number) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    username: row.username,
    role: row.role,
    status: row.status,
    vpsCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export const adminCustomersFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    await requireAdmin();
    const db = getDb();
    const rows = await db.select().from(users);
    const counts = await db
      .select({ ownerId: vpsTable.ownerId, n: count() })
      .from(vpsTable)
      .groupBy(vpsTable.ownerId);
    const countMap = new Map(counts.map((c) => [c.ownerId, c.n]));
    return rows.map((r) => toCustomerDto(r, countMap.get(r.id) ?? 0));
  } catch (err) {
    throw toHttpError(err, "Could not load customers.");
  }
});

const statusSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export const adminSetCustomerStatusFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => statusSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const admin = await requireAdmin();
      if (data.userId === admin.id)
        throw new HttpError(403, "You cannot change your own account status.");
      const db = getDb();
      const row = (await db.select().from(users).where(eq(users.id, data.userId)).limit(1))[0];
      if (!row) throw new HttpError(404, "Customer not found.");
      await db
        .update(users)
        .set({ status: data.status, updatedAt: new Date() })
        .where(eq(users.id, row.id));
      await writeAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: data.status === "SUSPENDED" ? "USER_SUSPEND" : "USER_REACTIVATE",
        vpsName: row.email,
        status: "SUCCESS",
      });
      return null;
    } catch (err) {
      throw toHttpError(err, "Could not update customer status.");
    }
  });

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9_-]+$/, "Use letters, numbers, hyphens and underscores only."),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const adminCreateUserFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => createUserSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const admin = await requireAdmin();
      const db = getDb();

      const existingEmail = await db
        .select()
        .from(users)
        .where(rawSql`lower(${users.email}) = ${data.email}`)
        .limit(1);
      if (existingEmail.length > 0)
        throw new HttpError(409, "An account with that email already exists.");

      const existingUsername = await db
        .select()
        .from(users)
        .where(rawSql`lower(${users.username}) = ${data.username}`)
        .limit(1);
      if (existingUsername.length > 0) throw new HttpError(409, "That username is already taken.");

      const passwordHash = await hashPassword(data.password);
      const [row] = await db
        .insert(users)
        .values({
          email: data.email,
          username: data.username,
          name: data.name,
          passwordHash,
          role: "CUSTOMER",
          status: "ACTIVE",
        })
        .returning();
      if (!row) throw new HttpError(500, "Could not create the customer.");

      await writeAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "USER_CREATE",
        status: "SUCCESS",
      });

      return toCustomerDto(row, 0);
    } catch (err) {
      throw toHttpError(err, "Could not create the customer.");
    }
  });

const passwordSchema = z.object({ userId: z.string().uuid(), password: z.string().min(8) });

export const adminSetUserPasswordFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => passwordSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const admin = await requireAdmin();
      const db = getDb();
      const row = (await db.select().from(users).where(eq(users.id, data.userId)).limit(1))[0];
      if (!row) throw new HttpError(404, "Customer not found.");
      const passwordHash = await hashPassword(data.password);
      await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, row.id));
      await writeAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "USER_PASSWORD_RESET",
        vpsName: row.email,
        status: "SUCCESS",
      });
      return null;
    } catch (err) {
      throw toHttpError(err, "Could not reset the customer's password.");
    }
  });
