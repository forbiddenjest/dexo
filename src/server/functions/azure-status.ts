import { createServerFn } from "@tanstack/react-start";

import { getResourceClient } from "../azure/client";
import { checkDatabaseConnection } from "../db/client";
import { getEnv, isConfigured } from "../env";
import { requireAdmin } from "../auth/rbac";
import { toHttpError } from "../http-error";

export interface AzureStatus {
  configured: boolean;
  connected: boolean;
  subscriptionId: string | null;
  resourceGroup: string | null;
  region: string | null;
  resourceGroupExists: boolean;
  database: { ok: boolean; error: string | null };
  error: string | null;
}

export const azureStatusFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AzureStatus> => {
    try {
      await requireAdmin();
    } catch (err) {
      throw toHttpError(err);
    }

    if (!isConfigured()) {
      const dbCheck = await checkDatabaseConnection();
      return {
        configured: false,
        connected: false,
        subscriptionId: null,
        resourceGroup: null,
        region: null,
        resourceGroupExists: false,
        database: { ok: dbCheck.ok, error: dbCheck.ok ? null : dbCheck.error },
        error: "Azure environment variables are not fully configured.",
      };
    }

    const env = getEnv();
    const dbCheck = await checkDatabaseConnection();

    try {
      const resources = getResourceClient();
      const rg = await resources.resourceGroups.get(env.AZURE_RESOURCE_GROUP);
      return {
        configured: true,
        connected: true,
        subscriptionId: env.AZURE_SUBSCRIPTION_ID,
        resourceGroup: env.AZURE_RESOURCE_GROUP,
        region: env.AZURE_REGION,
        resourceGroupExists: !!rg.id,
        database: { ok: dbCheck.ok, error: dbCheck.ok ? null : dbCheck.error },
        error: null,
      };
    } catch (err) {
      return {
        configured: true,
        connected: false,
        subscriptionId: env.AZURE_SUBSCRIPTION_ID,
        resourceGroup: env.AZURE_RESOURCE_GROUP,
        region: env.AZURE_REGION,
        resourceGroupExists: false,
        database: { ok: dbCheck.ok, error: dbCheck.ok ? null : dbCheck.error },
        error:
          err instanceof Error
            ? err.message
            : "Could not reach Azure with the configured credentials.",
      };
    }
  },
);
