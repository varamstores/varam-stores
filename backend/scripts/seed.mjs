// Applies backend/db/seed/*.sql in order, each ONCE (tracked in meta.seed_runs with a checksum),
// each in its own transaction. Seeds never overwrite admin edits (ON CONFLICT DO NOTHING).
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { BACKEND_DIR } from './lib/env.mjs';
import { connect, describePgError } from './lib/db.mjs';

const DIR = path.join(BACKEND_DIR, 'db', 'seed');
const files = readdirSync(DIR).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
const client = await connect();
try {
  await client.query(`create table if not exists meta.seed_runs (
    file text primary key, checksum text not null, applied_at timestamptz not null default now())`);
  const applied = new Map((await client.query('select file, checksum from meta.seed_runs')).rows.map((r) => [r.file, r.checksum]));
  for (const file of files) {
    const sql = readFileSync(path.join(DIR, file), 'utf8');
    const checksum = createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
    if (applied.has(file)) {
      console.log(applied.get(file) === checksum ? `  already applied  ${file}` : `! ${file} changed since it was applied — not re-applied (admin data is the source of truth now)`);
      continue;
    }
    process.stdout.write(`→ ${file} … `);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into meta.seed_runs (file, checksum) values ($1, $2)', [file, checksum]);
      await client.query('commit');
      console.log('ok');
    } catch (err) {
      await client.query('rollback').catch(() => {});
      console.log('FAILED');
      console.error(describePgError(err, sql));
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await client.end();
}
