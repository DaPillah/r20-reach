// Import R20's real roster (people + leaders) from a normalized JSON file into
// the r20reach schema. PII lives ONLY in the JSON you pass (keep it out of git);
// this script is generic. Idempotent: upserts people on (org_id, phone_e164),
// finds-or-creates leader memberships by full_name.
//
//   node --env-file=.env.local scripts/import-members.mjs /tmp/r20-import.json
//
// JSON shape: { owners: string[], people: [{first,last,campus,phone,stage,owner,last_touch,custom}] }
import { readFileSync } from "node:fs";
import pg from "pg";

const path = process.argv[2];
if (!path) {
  console.error("usage: import-members.mjs <normalized.json>");
  process.exit(1);
}
const { people, owners } = JSON.parse(readFileSync(path, "utf8"));

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

const norm = (s) => (s ?? "").trim().toLowerCase();

try {
  await client.connect();
  await client.query("set search_path to r20reach, public");
  await client.query("begin");

  const org = (await client.query("select id from org where slug='r20' limit 1")).rows[0]?.id;
  if (!org) throw new Error("org 'r20' not found");

  // Find-or-create a leader membership per distinct owner name.
  const existing = (await client.query("select id, full_name from membership where org_id=$1", [org])).rows;
  const byName = new Map(existing.map((m) => [norm(m.full_name), m.id]));
  const created = [];
  for (const name of owners) {
    if (byName.has(norm(name))) continue;
    const id = (
      await client.query(
        `insert into membership (org_id, user_id, role, full_name)
         values ($1, gen_random_uuid(), 'leader', $2) returning id`,
        [org, name],
      )
    ).rows[0].id;
    byName.set(norm(name), id);
    created.push(name);
  }

  // Clear demo seed people (fixed 7777... ids) so real data doesn't mix with fake.
  const demo = await client.query(`delete from person where org_id=$1 and id::text like '77777777-%'`, [org]);

  // Upsert people.
  let ins = 0;
  for (const p of people) {
    const ownerId = p.owner ? byName.get(norm(p.owner)) ?? null : null;
    const custom = JSON.stringify(p.custom ?? {});
    if (p.phone) {
      await client.query(
        `insert into person
           (org_id, first_name, last_name, campus, phone_e164, timezone, sms_consent,
            source, owner_id, track, stage, last_touch_at, custom, created_at)
         values ($1,$2,$3,$4,$5,'America/New_York','unknown','import',$6,'warm',$7,$8,$9::jsonb, now())
         on conflict (org_id, phone_e164) where phone_e164 is not null
         do update set first_name=excluded.first_name, last_name=excluded.last_name,
           campus=excluded.campus, owner_id=excluded.owner_id, stage=excluded.stage,
           last_touch_at=excluded.last_touch_at, custom=excluded.custom, updated_at=now()`,
        [org, p.first, p.last, p.campus, p.phone, ownerId, p.stage, p.last_touch, custom],
      );
    } else {
      await client.query(
        `insert into person
           (org_id, first_name, last_name, campus, timezone, sms_consent,
            source, owner_id, track, stage, last_touch_at, custom, created_at)
         values ($1,$2,$3,$4,'America/New_York','unknown','import',$5,'warm',$6,$7,$8::jsonb, now())`,
        [org, p.first, p.last, p.campus, ownerId, p.stage, p.last_touch, custom],
      );
    }
    ins++;
  }

  await client.query("commit");
  console.log(`✓ import complete`);
  console.log(`  leaders created: ${created.length}${created.length ? " — " + created.join(", ") : ""}`);
  console.log(`  demo people removed: ${demo.rowCount}`);
  console.log(`  people upserted: ${ins}`);
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error("import failed (rolled back):", e.message);
  process.exit(1);
} finally {
  await client.end();
}
