import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";

import { requireAdmin, requireUser } from "../auth/rbac";
import { getDb } from "../db/client";
import { auditLogs } from "../db/schema";
import { toHttpError } from "../http-error";

function toDto(row: typeof auditLogs.$inferSelect) {
  return {
    id: row.id,
    action: row.action,
    vpsId: row.vpsId,
    vpsName: row.vpsName,
    actorEmail: row.actorEmail,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

export const historyFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const user = await requireUser();
    const db = getDb();
    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.actorEmail, user.email))
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);
    return rows.map(toDto);
  } catch (err) {
    throw toHttpError(err, "Could not load activity history.");
  }
});

export const adminAuditFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    await requireAdmin();
    const db = getDb();
    const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
    return rows.map(toDto);
  } catch (err) {
    throw toHttpError(err, "Could not load the audit log.");
  }
});
