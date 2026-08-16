import { getDb } from "./db/client";
import { auditLogs } from "./db/schema";
import { getRequestIp } from "./auth/session";

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

export async function writeAudit(entry: {
  actorId: string | null;
  actorEmail: string;
  action: ActivityAction;
  vpsId?: string | null;
  vpsName?: string | null;
  status: "SUCCESS" | "PENDING" | "FAILED";
  error?: string | null;
}): Promise<void> {
  const db = getDb();
  // Never let audit logging itself take down the calling operation, and
  // never include secret material — only IDs, emails, and short messages.
  try {
    await db.insert(auditLogs).values({
      actorId: entry.actorId,
      actorEmail: entry.actorEmail,
      action: entry.action,
      vpsId: entry.vpsId ?? null,
      vpsName: entry.vpsName ?? null,
      status: entry.status,
      error: entry.error ?? null,
      ip: getRequestIp(),
    });
  } catch (err) {
    console.error("Failed to write audit log entry:", err);
  }
}
