import { ComputeManagementClient } from "@azure/arm-compute";
import { NetworkManagementClient } from "@azure/arm-network";
import { ResourceManagementClient } from "@azure/arm-resources";

import { getEnv } from "../env";
import { getAzureCredential } from "./credentials";

let compute: ComputeManagementClient | undefined;
let network: NetworkManagementClient | undefined;
let resources: ResourceManagementClient | undefined;

export function getComputeClient(): ComputeManagementClient {
  if (compute) return compute;
  const env = getEnv();
  compute = new ComputeManagementClient(getAzureCredential(), env.AZURE_SUBSCRIPTION_ID);
  return compute;
}

export function getNetworkClient(): NetworkManagementClient {
  if (network) return network;
  const env = getEnv();
  network = new NetworkManagementClient(getAzureCredential(), env.AZURE_SUBSCRIPTION_ID);
  return network;
}

export function getResourceClient(): ResourceManagementClient {
  if (resources) return resources;
  const env = getEnv();
  resources = new ResourceManagementClient(getAzureCredential(), env.AZURE_SUBSCRIPTION_ID);
  return resources;
}

/**
 * A normalized, non-sensitive representation of any Azure SDK error.
 * Never surfaces stack traces, request bodies, or credential material
 * to the caller — only a safe, human-readable message and HTTP-like
 * status code.
 */
export class AzureApiError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "AzureApiError";
  }
}

export function toAzureApiError(err: unknown, fallback = "Azure request failed."): AzureApiError {
  if (err instanceof AzureApiError) return err;

  const anyErr = err as { statusCode?: number; code?: string; message?: string } | undefined;
  const statusCode = typeof anyErr?.statusCode === "number" ? anyErr.statusCode : 502;
  const code = anyErr?.code;

  if (code === "AuthenticationFailed" || statusCode === 401) {
    return new AzureApiError(
      401,
      "Azure authentication failed. Check the service principal credentials.",
    );
  }
  if (code === "AuthorizationFailed" || statusCode === 403) {
    return new AzureApiError(
      403,
      "The Azure service principal does not have permission to perform this operation.",
    );
  }
  if (code === "ResourceNotFound" || code === "ResourceGroupNotFound" || statusCode === 404) {
    return new AzureApiError(404, "The requested Azure resource could not be found.");
  }
  if (code === "SkuNotAvailable") {
    return new AzureApiError(409, "The requested VM size is not available in this region.");
  }
  if (code === "QuotaExceeded" || code === "OperationNotAllowed") {
    return new AzureApiError(
      409,
      "This operation would exceed your Azure subscription quota. Request a quota increase or choose a smaller size.",
    );
  }
  if (code === "InvalidParameter" || statusCode === 400) {
    return new AzureApiError(
      400,
      anyErr?.message?.split("\n")[0] ?? "Azure rejected the request parameters.",
    );
  }

  return new AzureApiError(statusCode, fallback);
}
