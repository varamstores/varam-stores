// Static checks every PL/pgSQL function in schemas app and api with plpgsql_check.
// Errors fail the run; warnings are printed. Trigger functions are checked against a table using them.
import { connect } from './lib/db.mjs';

const client = await connect();
let errors = 0, warnings = 0;
try {
  const fns = (await client.query(`
    select p.oid, p.oid::regprocedure::text as sig,
           (p.prorettype = 'trigger'::regtype) as is_trigger,
           (select t.tgrelid from pg_trigger t where t.tgfoid = p.oid limit 1) as relid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname in ('app','api') and l.lanname = 'plpgsql'
    order by 2`)).rows;
  for (const f of fns) {
    if (f.is_trigger && !f.relid) { console.log(`- skip ${f.sig} (trigger function not attached to a table)`); continue; }
    const rows = (await client.query(
      `select level, message, detail, hint, lineno, statement
         from extensions.plpgsql_check_function_tb($1::regprocedure, $2::regclass,
              fatal_errors => false, other_warnings => true, performance_warnings => false, extra_warnings => true)`,
      [f.sig, f.is_trigger ? f.relid : 0])).rows;
    for (const r of rows) {
      const isError = r.level === 'error';
      // Supabase's auth.uid() etc. are fine; ignore "never read variable" style noise only as warnings.
      if (isError) errors++; else warnings++;
      console.log(`${isError ? '✗ ERROR' : '! warn '} ${f.sig} line ${r.lineno ?? '?'}: ${r.message}${r.detail ? ' — ' + r.detail : ''}`);
    }
  }
  console.log(`\nChecked ${fns.length} function(s): ${errors} error(s), ${warnings} warning(s).`);
} finally {
  await client.end();
}
process.exitCode = errors ? 1 : 0;
