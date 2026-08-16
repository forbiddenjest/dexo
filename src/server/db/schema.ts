import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["CUSTOMER", "ADMIN", "SUPER_ADMIN"]);
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "SUSPENDED"]);
export const jobKindEnum = pgEnum("job_kind", [
  "CREATE",
  "START",
  "STOP",
  "RESTART",
  "DELETE",
  "REINSTALL",
]);
export const jobStatusEnum = pgEnum("job_status", ["PENDING", "SUCCESS", "FAILED"]);
export const auditStatusEnum = pgEnum("audit_status", ["SUCCESS", "PENDING", "FAILED"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    username: text("username").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("CUSTOMER"),
    status: userStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`),
    uniqueIndex("users_username_lower_idx").on(sql`lower(${t.username})`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // SHA-256 hash of the bearer token stored in the cookie. The raw
    // token is never persisted, mirroring how a password hash works.
    tokenHash: text("token_hash").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_idx").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
  ],
);

export const vps = pgTable(
  "vps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    // Azure identity — the source of truth for resource state lives in
    // Azure itself; this table stores only the reference + app metadata.
    azureVmName: text("azure_vm_name").notNull(),
    azureResourceId: text("azure_resource_id").notNull(),
    resourceGroup: text("resource_group").notNull(),
    subscriptionId: text("subscription_id").notNull(),
    region: text("region").notNull(),
    vmSize: text("vm_size").notNull(),
    osImage: text("os_image").notNull(),
    sshUser: text("ssh_user").notNull().default("azureuser"),

    suspended: boolean("suspended").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("vps_owner_id_idx").on(t.ownerId),
    uniqueIndex("vps_owner_azure_name_idx").on(t.ownerId, t.azureVmName),
  ],
);

export const sshKeys = pgTable(
  "ssh_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Public key only. Private keys are never accepted or stored.
    publicKey: text("public_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ssh_keys_owner_id_idx").on(t.ownerId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    vpsId: uuid("vps_id"),
    vpsName: text("vps_name"),
    status: auditStatusEnum("status").notNull(),
    error: text("error"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_actor_email_idx").on(t.actorEmail),
    index("audit_logs_created_at_idx").on(t.createdAt),
  ],
);

/** Tracks in-flight asynchronous Azure operations (create/start/stop/restart/delete). */
export const provisioningOperations = pgTable(
  "provisioning_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vpsId: uuid("vps_id").notNull(),
    kind: jobKindEnum("kind").notNull(),
    status: jobStatusEnum("status").notNull().default("PENDING"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("provisioning_operations_vps_id_idx").on(t.vpsId)],
);

export const usersRelations = relations(users, ({ many }) => ({
  vps: many(vps),
  sshKeys: many(sshKeys),
  sessions: many(sessions),
}));

export const vpsRelations = relations(vps, ({ one, many }) => ({
  owner: one(users, { fields: [vps.ownerId], references: [users.id] }),
  operations: many(provisioningOperations),
}));
