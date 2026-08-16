/**
 * Server-only environment configuration.
 *
 * This module is imported exclusively from files under `src/server/**`.
 * It must never be imported from client/browser code — doing so would
 * attempt to bundle secrets into the client build. The rest of the
 * codebase reaches these values only indirectly, through the server
 * functions in `src/server/functions/*`.
 *
 * There is intentionally NO fallback behavior here. Missing or invalid
 * configuration throws immediately with a clear message instead of
 * allowing the application to silently run in a degraded/mock mode.
 */
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // --- Azure ---
  AZURE_TENANT_ID: z.string().min(1, "AZURE_TENANT_ID is required"),
  AZURE_CLIENT_ID: z.string().min(1, "AZURE_CLIENT_ID is required"),
  AZURE_CLIENT_SECRET: z.string().min(1, "AZURE_CLIENT_SECRET is required"),
  AZURE_SUBSCRIPTION_ID: z.string().min(1, "AZURE_SUBSCRIPTION_ID is required"),
  AZURE_RESOURCE_GROUP: z.string().min(1, "AZURE_RESOURCE_GROUP is required"),
  AZURE_REGION: z.string().min(1, "AZURE_REGION is required").default("eastus"),

  // --- Database ---
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // --- Sessions ---
  SESSION_SECRET: z
    .string()
    .min(
      32,
      "SESSION_SECRET must be at least 32 characters — generate with `openssl rand -hex 32`",
    ),

  APP_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;
let cachedError: Error | undefined;

/**
 * Lazily validates and returns server environment configuration.
 * Throws a ConfigurationError (never returns partially-valid config)
 * if anything required is missing. Callers should catch this and
 * surface it as a clear configuration error to the user — never as
 * a fallback to fake data.
 */
export function getEnv(): Env {
  if (cached) return cached;
  if (cachedError) throw cachedError;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    cachedError = new ConfigurationError(
      `Server configuration is invalid or incomplete:\n${issues}\n\nSet these in your .env file (see .env.example).`,
    );
    throw cachedError;
  }
  cached = parsed.data;
  return cached;
}

/** True once env has been validated successfully at least once this process. */
export function isConfigured(): boolean {
  try {
    getEnv();
    return true;
  } catch {
    return false;
  }
}

export class ConfigurationError extends Error {
  readonly code = "CONFIGURATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}
