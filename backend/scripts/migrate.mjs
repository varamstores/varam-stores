// Applies backend/db/migrations/*.sql in order, each in its own transaction.
// Applied files are checksummed; editing an applied migration is an error (write a new one).
//   node scripts/migrate.mjs           apply pending
//   node scripts/migrate.mjs --status  list applied / pending
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { BACKEND_DIR } from './lib/env.mjs';
import { connect, describePgError } from './lib/db.mjs';

const DIR = path.join(BACKEND_DIR, 'db', 'migrations');
const statusOnly = process.argv.includes('--status');

const files = readdirSync(DIR).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
const client = await connect();
try {
  await client.query(`
    create schema if not exists meta;
    revoke all on schema meta from public;
    create table if not exists meta.schema_migrations (
      version    text primary key,
      name       text not null,
      checksum   text not null,
      applied_at timestamptz not null default now()
    );`);
  await client.query(`select pg_advisory_lock(hashtext('varam_migrations'))`);

  const applied = new Map((await client.query('select version, checksum from meta.schema_migrations')).rows.map((r) => [r.version, r.checksum]));
  let ran = 0;
  for (const file of files) {
    const version = file.slice(0, 4);
    const sql = readFileSync(path.join(DIR, file), 'utf8');
    const checksum = createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
    if (applied.has(version)) {
      if (applied.get(version) !== checksum) {
        throw new Error(`Migration ${file} was edited after being applied (checksum mismatch). Write a new migration instead.`);
      }
      if (statusOnly) console.log(`  applied  ${file}`);
      continue;
    }
    if (statusOnly) { console.log(`  pending  ${file}`); continue; }
    process.stdout.write(`→ ${file} … `);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into meta.schema_migrations (version, name, checksum) values ($1, $2, $3)', [version, file, checksum]);
      await client.query('commit');
      console.log('ok');
      ran++;
    } catch (err) {
      await client.query('rollback').catch(() => {});
      console.log('FAILED');
      console.error(describePgError(err, sql));
      process.exitCode = 1;
      break;
    }
  }
  if (!statusOnly) {
    await client.query(`notify pgrst, 'reload schema'`);
    console.log(ran ? `Applied ${ran} migration(s).` : 'Nothing to apply.');
  }
} finally {
  await client.query(`select pg_advisory_unlock(hashtext('varam_migrations'))`).catch(() => {});
  await client.end();
}
