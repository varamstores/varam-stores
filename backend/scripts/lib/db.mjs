import pg from 'pg';
import { loadEnv, requireEnv } from './env.mjs';

// Connects as the `postgres` role through the Supabase session pooler (IPv4-friendly).
// TLS: Supabase's pooler certificate chains to the Supabase root CA, which is not in Node's
// default trust store. Download it from Dashboard → Database → SSL and set DB_CA_CERT_PATH
// to verify the server; without it the connection is encrypted but not server-verified.
export async function connect() {
  const env = loadEnv();
  requireEnv(env, 'DATABASE_URL');
  let ssl = { rejectUnauthorized: false };
  if (env.DB_CA_CERT_PATH) {
    const { readFileSync } = await import('node:fs');
    ssl = { ca: readFileSync(env.DB_CA_CERT_PATH, 'utf8'), rejectUnauthorized: true };
  }
  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl,
    connectionTimeoutMillis: 20000,
    application_name: 'varam-scripts',
  });
  // The pooler may reset idle connections; surface it as a message instead of an unhandled crash.
  client.on('error', (err) => console.error(`database connection error: ${err.code ?? ''} ${err.message}`));
  await client.connect();
  return client;
}

// Pretty-print a Postgres error with position context (for migrations / seeds).
export function describePgError(err, sql) {
  const parts = [`${err.code ?? ''} ${err.message}`];
  if (err.detail) parts.push(`detail: ${err.detail}`);
  if (err.hint) parts.push(`hint: ${err.hint}`);
  if (err.where) parts.push(`where: ${err.where}`);
  if (err.position && sql) {
    const pos = Number(err.position);
    const before = sql.slice(0, pos);
    const line = before.split('\n').length;
    const lines = sql.split('\n');
    const from = Math.max(0, line - 3);
    parts.push(`at line ${line}:\n` + lines.slice(from, line + 2).map((l, i) => `${from + i + 1 === line ? '>' : ' '} ${from + i + 1} | ${l}`).join('\n'));
  }
  return parts.join('\n');
}
