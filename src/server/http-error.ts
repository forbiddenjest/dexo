import { AzureApiError } from "./azure/client";
import { AuthError } from "./auth/rbac";
import { ConfigurationError } from "./env";

/**
 * Server functions serialize thrown errors across the server/client
 * boundary as plain Error objects — custom subclass properties (like a
 * `statusCode`) are not guaranteed to survive. To keep the status code
 * intact, we encode it into the message itself as `"<status>::<message>"`
 * and the client-side `unwrap()` helper (src/lib/api/client.ts) parses it
 * back out into an ApiError. This is the one place that encoding happens.
 */
export class HttpError extends Error {
  constructor(statusCode: number, message: string) {
    super(`${statusCode}::${message}`);
    this.name = "HttpError";
  }
}

/** Normalizes any caught error into an HttpError, without leaking internals. */
export function toHttpError(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof AuthError) return new HttpError(err.statusCode, err.message);
  if (err instanceof AzureApiError) return new HttpError(err.statusCode, err.message);
  if (err instanceof ConfigurationError) return new HttpError(503, err.message);
  if (err instanceof Error) {
    // Known, already-safe validation-style messages we raise ourselves
    // (e.g. "At least one SSH key is required.") are fine to pass through;
    // anything else is logged server-side and replaced with a generic
    // message so stack traces / internal details never reach the client.
    if (err.name === "ValidationError") return new HttpError(400, err.message);
    console.error(err);
    return new HttpError(500, fallback);
  }
  console.error(err);
  return new HttpError(500, fallback);
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
