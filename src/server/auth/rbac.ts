import { getSessionUser, type SessionUser } from "./session";

export type Role = "CUSTOMER" | "ADMIN" | "SUPER_ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED";

export class AuthError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "AuthError";
  }
}

export function isAdminRole(role: Role): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/**
 * Resolves the authenticated user from the session cookie. Throws a 401
 * AuthError if there is no valid session, and a 403 if the account has
 * been suspended — every sensitive server function calls this first so
 * authorization is enforced server-side regardless of what the UI shows.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError(401, "You must be signed in.");
  if (user.status === "SUSPENDED") throw new AuthError(403, "This account is suspended.");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdminRole(user.role)) throw new AuthError(403, "Administrator access is required.");
  return user;
}

/** Throws unless `user` owns the resource or is an admin. */
export function assertOwnerOrAdmin(user: SessionUser, ownerId: string) {
  if (user.id === ownerId) return;
  if (isAdminRole(user.role)) return;
  throw new AuthError(403, "You do not have access to this resource.");
}
