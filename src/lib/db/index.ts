import { sql } from "@vercel/postgres";
import { readFileSync } from "fs";
import path from "path";

export { sql };

let migrated = false;

export async function runMigrations(): Promise<void> {
  if (migrated) return;
  const migrationsPath = path.join(process.cwd(), "src/lib/db/migrations.sql");
  const ddl = readFileSync(migrationsPath, "utf8");
  const statements = ddl
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await sql.query(stmt);
  }
  migrated = true;
}
