import { ClientSecretCredential } from "@azure/identity";

import { getEnv } from "../env";

let cached: ClientSecretCredential | undefined;

/**
 * Server-side-only Azure credential. AZURE_CLIENT_SECRET never leaves
 * this process — it is read from env once here and handed to the Azure
 * SDK, never serialized into any API response or client bundle.
 */
export function getAzureCredential(): ClientSecretCredential {
  if (cached) return cached;
  const env = getEnv();
  cached = new ClientSecretCredential(
    env.AZURE_TENANT_ID,
    env.AZURE_CLIENT_ID,
    env.AZURE_CLIENT_SECRET,
  );
  return cached;
}
