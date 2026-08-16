import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { writeAudit } from "../audit";
import { hashPassword } from "../auth/password";
import { getResourceClient } from "../azure/client";
import { checkDatabaseConnection, getDb } from "../db/client";
import { users } from "../db/schema";
import { getEnv, isConfigured } from "../env";
import { HttpError, toHttpError, ValidationError } from "../http-error";

/**
 * First-run setup status. This endpoint is intentionally unauthenticated
 * — there is no admin account yet for it to authenticate against — but it
 * only ever reveals non-secret information (connection health, region,
 * subscription/resource-group *names*, never credentials), and once an
 * account exists on the instance it stops reporting details entirely.
 * See setupCreateAdminFn for the guard that actually locks setup down.
 */
export interface SetupStatus {
  /** True only when this instance has zero user accounts. */
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

async function hasAnyUser(): Promise<boolean> {
  const db = getDb();
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  return rows.length > 0;
}

export const setupStatusFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SetupStatus> => {
    const dbCheck = await checkDatabaseConnection();

    if (!dbCheck.ok) {
      return {
        needsSetup: true,
        database: { ok: false, error: dbCheck.error },
        azure: {
          configured: isConfigured(),
          connected: false,
          subscriptionId: null,
          resourceGroup: null,
          region: null,
          error: null,
        },
      };
    }

    // Database reachable — the real question is whether anyone has signed
    // up yet. Once they have, this instance is considered set up and we
    // stop reporting connection internals to unauthenticated visitors.
    const alreadySetUp = await hasAnyUser();
    if (alreadySetUp) {
      return {
        needsSetup: false,
        database: { ok: true, error: null },
        azure: {
          configured: isConfigured(),
          connected: false,
          subscriptionId: null,
          resourceGroup: null,
          region: null,
          error: null,
        },
      };
    }

    if (!isConfigured()) {
      return {
        needsSetup: true,
        database: { ok: true, error: null },
        azure: {
          configured: false,
          connected: false,
          subscriptionId: null,
          resourceGroup: null,
          region: null,
          error: "Azure environment variables are not fully configured on the server.",
        },
      };
    }

    const env = getEnv();
    try {
      const resources = getResourceClient();
      await resources.resourceGroups.get(env.AZURE_RESOURCE_GROUP);
      return {
        needsSetup: true,
        database: { ok: true, error: null },
        azure: {
          configured: true,
          connected: true,
          subscriptionId: env.AZURE_SUBSCRIPTION_ID,
          resourceGroup: env.AZURE_RESOURCE_GROUP,
          region: env.AZURE_REGION,
          error: null,
        },
      };
    } catch (err) {
      return {
        needsSetup: true,
        database: { ok: true, error: null },
        azure: {
          configured: true,
          connected: false,
          subscriptionId: env.AZURE_SUBSCRIPTION_ID,
          resourceGroup: env.AZURE_RESOURCE_GROUP,
          region: env.AZURE_REGION,
          error:
            err instanceof Error
              ? err.message
              : "Could not reach Azure with the configured credentials.",
        },
      };
    }
  },
);

const createAdminSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters.")
    .max(50)
    .regex(
      /^[a-z0-9._-]+$/,
      "Username can only contain letters, numbers, dots, dashes and underscores.",
    ),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(12, "Password must be at least 12 characters."),
});

/**
 * Creates the very first administrator account for this instance. Guarded
 * server-side (not just by hiding the UI) — if any user already exists,
 * this always fails, regardless of what the client believes the setup
 * state to be.
 */
export const setupCreateAdminFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => createAdminSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const dbCheck = await checkDatabaseConnection();
      if (!dbCheck.ok) {
        throw new HttpError(503, `Database is not reachable: ${dbCheck.error}`);
      }

      const db = getDb();
      if (await hasAnyUser()) {
        throw new HttpError(409, "Setup has already been completed on this instance.");
      }

      const passwordHash = await hashPassword(data.password);

      let created;
      try {
        const rows = await db
          .insert(users)
          .values({
            email: data.email,
            username: data.username,
            name: data.name,
            passwordHash,
            role: "SUPER_ADMIN",
            status: "ACTIVE",
          })
          .returning({ id: users.id, email: users.email });
        created = rows[0];
      } catch (err) {
        // Handles the race where two requests both pass the hasAnyUser()
        // check concurrently, and any other insert-time constraint issue.
        throw new ValidationError(
          err instanceof Error && /unique/i.test(err.message)
            ? "That email or username is already taken."
            : "Could not create the administrator account.",
        );
      }

      if (!created) {
        throw new HttpError(500, "Could not create the administrator account.");
      }

      await writeAudit({
        actorId: created.id,
        actorEmail: created.email,
        action: "USER_CREATE",
        status: "SUCCESS",
      });

      return { ok: true as const };
    } catch (err) {
      throw toHttpError(err, "Could not complete setup.");
    }
  });
