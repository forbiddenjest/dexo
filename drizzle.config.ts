import { defineConfig } from "drizzle-kit";

// drizzle-kit runs as a standalone CLI (outside the Vite/Nitro server
// build), so it reads DATABASE_URL directly from process.env rather than
// through src/server/env.ts.
const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run drizzle-kit. Set it in your .env file.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
