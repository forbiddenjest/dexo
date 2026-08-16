/**
 * Creates (or promotes) an administrator account. Run interactively-free
 * via CLI args so it works unattended during deployment:
 *
 *   npm run create-admin -- --email=you@example.com --username=admin --name="Admin" --password='correct-horse-battery-staple'
 */
import "dotenv/config";
import { eq, sql as rawSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { hashPassword } from "../src/server/auth/password";
import { users } from "../src/server/db/schema";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

async function main() {
  const email = arg("email");
  const username = arg("username");
  const name = arg("name") ?? "Administrator";
  const password = arg("password");

  if (!email || !username || !password) {
    console.error(
      "Usage: npm run create-admin -- --email=you@example.com --username=admin --name=\"Admin\" --password='...'",
    );
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("Password must be at least 12 characters for an administrator account.");
    process.exit(1);
  }

  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql);

  const passwordHash = await hashPassword(password);
  const existing = await db
    .select()
    .from(users)
    .where(rawSql`lower(${users.email}) = lower(${email})`)
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(users)
      .set({ role: "ADMIN", status: "ACTIVE", passwordHash, updatedAt: new Date() })
      .where(eq(users.id, existing[0]!.id));
    console.log(`Existing user ${email} promoted to ADMIN and password reset.`);
  } else {
    await db.insert(users).values({
      email: email.trim().toLowerCase(),
      username: username.trim().toLowerCase(),
      name,
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
    });
    console.log(`Administrator account created: ${email}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error("Failed to create admin:", err);
  process.exit(1);
});
