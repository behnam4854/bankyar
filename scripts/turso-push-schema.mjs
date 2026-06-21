// One-off helper: push prisma/turso-schema.sql into the Turso database over HTTP.
// Usage: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/turso-push-schema.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@libsql/client/web";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) {
  console.error("Missing TURSO_DATABASE_URL");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "..", "prisma", "turso-schema.sql"), "utf8");

const client = createClient({ url, authToken });

// Split on semicolons that end a statement (the generated DDL has no string
// literals containing ';', so a simple split is safe here).
const statements = sql
  .split(";")
  // Drop full-line `-- ...` comments inside each chunk, then trim.
  .map((s) =>
    s
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter((s) => s.length > 0);

console.log(`Applying ${statements.length} DDL statements to ${url} ...`);
for (const stmt of statements) {
  await client.execute(stmt);
}

const tables = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
);
console.log("Tables now in Turso:", tables.rows.map((r) => r.name).join(", "));
console.log("Schema push complete.");
