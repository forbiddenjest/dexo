import { createServerFn } from "@tanstack/react-start";
import { eq, sql as rawSql } from "drizzle-orm";
import { z } from "zod";

import { writeAudit } from "../audit";
import { verifyPassword } from "../auth/password";
import { getSessionUser } from "../auth/session";
import { createSession, destroySession } from "../auth/session";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { HttpError, toHttpError } from "../http-error";

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

// Simple in-memory rate limiter for the login endpoint. Keyed by email,
// resets on process restart — sufficient to blunt basic credential
// stuffing on a single-instance deployment without adding Redis as a
// hard dependency. For multi-instance deployments, front this with a
// reverse-proxy rate limit as well (see deployment docs).
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 5 * 60 * 1000;

function checkRateLimit(key: string) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    throw new HttpError(429, "Too many login attempts. Try again in a few minutes.");
  }
}

export const loginFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => loginSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const email = data.email.trim().toLowerCase();
      checkRateLimit(email);

      const db = getDb();
      const rows = await db
        .select()
        .from(users)
        .where(rawSql`lower(${users.email}) = ${email}`)
        .limit(1);
      const account = rows[0];

      if (!account || !(await verifyPassword(data.password, account.passwordHash))) {
        throw new HttpError(401, "Invalid email or password.");
      }
      if (account.status === "SUSPENDED") {
        throw new HttpError(403, "This account is suspended. Contact your administrator.");
      }

      await createSession(account.id);
      await writeAudit({
        actorId: account.id,
        actorEmail: account.email,
        action: "USER_LOGIN",
        status: "SUCCESS",
      });

      return {
        id: account.id,
        email: account.email,
        name: account.name,
        username: account.username,
        role: account.role,
      };
    } catch (err) {
      throw toHttpError(err, "Could not sign in.");
    }
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const user = await getSessionUser();
    await destroySession();
    if (user) {
      await writeAudit({
        actorId: user.id,
        actorEmail: user.email,
        action: "USER_LOGOUT",
        status: "SUCCESS",
      });
    }
    return null;
  } catch (err) {
    throw toHttpError(err, "Could not sign out.");
  }
});

export const sessionFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getSessionUser();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    role: user.role,
  };
});
