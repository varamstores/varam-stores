// Runs every backend/db/tests/*.sql (pgTAP) inside BEGIN … ROLLBACK against the live DB.
// Nothing a test does is persisted. Exit code 1 if any assertion fails.
//   node scripts/test.mjs            all files
//   node scripts/test.mjs 002        files whose name contains "002"
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BACKEND_DIR } from './lib/env.mjs';
import { connect, describePgError } from './lib/db.mjs';

const DIR = path.join(BACKEND_DIR, 'db', 'tests');
const filter = process.argv[2];
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql') && (!filter || f.includes(filter))).sort();

let failedFiles = 0, totalOk = 0, totalNotOk = 0;
for (const file of files) {
  const sql = readFileSync(path.join(DIR, file), 'utf8');
  const client = await connect();
  const lines = [];
  try {
    await client.query('begin');
    await client.query(`set local search_path = extensions, public`);
    const res = await client.query(sql);
    for (const r of Array.isArray(res) ? res : [res]) {
      for (const row of r.rows ?? []) {
        const v = Object.values(row)[0];
        if (typeof v === 'string') lines.push(...v.split('\n'));
      }
    }
  } catch (err) {
    lines.push(`not ok - ${file} raised: ${describePgError(err, sql)}`);
  } finally {
    await client.query('rollback').catch(() => {});
    await client.end();
  }
  const notOk = lines.filter((l) => /^not ok/.test(l));
  const ok = lines.filter((l) => /^ok/.test(l));
  const planProblem = lines.some((l) => /^# Looks like/.test(l));
  totalOk += ok.length; totalNotOk += notOk.length;
  const failed = notOk.length > 0 || planProblem || ok.length === 0;
  if (failed) failedFiles++;
  console.log(`${failed ? '✗' : '✓'} ${file}  (${ok.length} passed${notOk.length ? `, ${notOk.length} failed` : ''})`);
  if (failed) for (const l of lines.filter((l) => /^(not ok|#)/.test(l))) console.log('    ' + l);
}
console.log(`\n${totalOk} assertions passed, ${totalNotOk} failed, ${failedFiles} file(s) failing.`);
process.exitCode = failedFiles ? 1 : 0;
