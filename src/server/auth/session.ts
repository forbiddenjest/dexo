import { createHash, randomBytes } from "node:crypto";

import { deleteCookie, getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";
import { and, eq, gt } from "drizzle-orm";

import { getDb } from "../db/client";
import { sessions, users } from "../db/schema";
import type { Role, UserStatus } from "./rbac";

const SESSION_COOKIE = "azc_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  username: string;
  role: Role;
  status: UserStatus;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isProd() {
  return process.env["NODE_ENV"] === "production";
}

/** Creates a new session row and sets the session cookie on the response. */
export async function createSession(userId: string): Promise<void> {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const ip =
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
    getRequestHeader("x-real-ip") ??
    null;
  const userAgent = getRequestHeader("user-agent") ?? null;

  await db.insert(sessions).values({ userId, tokenHash, expiresAt, ip, userAgent });

  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Reads the session cookie, validates it against the DB, and returns the user (or null). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;

  const db = getDb();
  const tokenHash = hashToken(token);
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      username: users.username,
      role: users.role,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return row;
}

/** Destroys the current session (DB row + cookie), if any. */
export async function destroySession(): Promise<void> {
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    const db = getDb();
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

export function getRequestIp(): string | null {
  return (
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
    getRequestHeader("x-real-ip") ??
    null
  );
}
