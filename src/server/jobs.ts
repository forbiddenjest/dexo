import { eq } from "drizzle-orm";

import { getDb } from "./db/client";
import { provisioningOperations } from "./db/schema";

export type JobKind = "CREATE" | "START" | "STOP" | "RESTART" | "DELETE" | "REINSTALL";

/**
 * Records a provisioning operation as PENDING, then runs `work` in the
 * background (not awaited by the caller) — Azure operations like VM
 * creation can take minutes, far longer than an HTTP request should
 * block for. The frontend polls VPS status, which folds in this job's
 * PENDING/FAILED state until Azure itself reports the final result.
 *
 * Returns the job id immediately, before `work` has necessarily finished.
 */
export async function runTrackedOperation(
  vpsId: string,
  kind: JobKind,
  work: () => Promise<void>,
): Promise<string> {
  const db = getDb();
  const [job] = await db
    .insert(provisioningOperations)
    .values({ vpsId, kind, status: "PENDING" })
    .returning();
  if (!job) throw new Error("Could not create a provisioning operation record.");

  // Intentionally not awaited — runs after this function (and the
  // enclosing server function / HTTP response) returns.
  void work()
    .then(async () => {
      await db
        .update(provisioningOperations)
        .set({ status: "SUCCESS", updatedAt: new Date() })
        .where(eq(provisioningOperations.id, job.id));
    })
    .catch(async (err: unknown) => {
      const message = err instanceof Error ? err.message : "The operation failed.";
      console.error(`Provisioning operation ${job.id} (${kind}) failed:`, err);
      await db
        .update(provisioningOperations)
        .set({ status: "FAILED", error: message, updatedAt: new Date() })
        .where(eq(provisioningOperations.id, job.id));
    });

  return job.id;
}

/** The most recent still-pending or most-recently-failed operation for a VPS, if any. */
export async function getLatestOperation(vpsId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(provisioningOperations)
    .where(eq(provisioningOperations.vpsId, vpsId))
    .orderBy(provisioningOperations.createdAt);
  return rows.length > 0 ? rows[rows.length - 1] : undefined;
}
