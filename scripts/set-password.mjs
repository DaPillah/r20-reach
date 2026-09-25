// Set a leader's password (bcrypt). Usage:
//   node --env-file=.env.local scripts/set-password.mjs <email> <password>
import bcrypt from "bcryptjs";
import pg from "pg";

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error("usage: set-password.mjs <email> <password>");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
try {
  await client.connect();
  await client.query("set search_path to r20reach, public");
  const res = await client.query(
    "update membership set password_hash=$2 where lower(email)=lower($1)",
    [email, hash],
  );
  console.log(`✓ set password for ${res.rowCount} membership(s) matching ${email}`);
} finally {
  await client.end();
}
