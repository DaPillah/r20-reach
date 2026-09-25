// Apply a .sql file to the Supabase Postgres over the direct connection.
// Usage: node --env-file=.env.local scripts/apply-sql.mjs supabase/migrations/0001_core_schema.sql
import { readFileSync } from "node:fs";
import pg from "pg";

const file = process.argv[2];
if (!file) {
  console.error("usage: node --env-file=.env.local scripts/apply-sql.mjs <file.sql>");
  process.exit(1);
}
const sql = readFileSync(file, "utf8");

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql); // multi-statement runs as one implicit transaction
  const { rows } = await client.query(
    "select table_name from information_schema.tables where table_schema='r20reach' order by table_name",
  );
  console.log(`✓ applied ${file}`);
  console.log(`r20reach tables (${rows.length}):`, rows.map((r) => r.table_name).join(", "));
} catch (e) {
  console.error("✗ failed:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
