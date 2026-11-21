// Idempotent Supabase project settings via the Management API (uses SUPABASE_ACCESS_TOKEN).
//  - PostgREST exposes ONLY schema `api` (functions). Tables in `app` stay private.
import { loadEnv, requireEnv } from './lib/env.mjs';

const env = loadEnv();
requireEnv(env, 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF');
const base = `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}`;
const headers = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };

async function call(method, url, body) {
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url.replace(base, '')} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const WANT_SCHEMAS = 'api';
const current = await call('GET', `${base}/postgrest`);
if (current.db_schema !== WANT_SCHEMAS) {
  await call('PATCH', `${base}/postgrest`, { db_schema: WANT_SCHEMAS });
  console.log(`PostgREST exposed schemas: "${current.db_schema}" → "${WANT_SCHEMAS}"`);
} else {
  console.log(`PostgREST exposed schemas already "${WANT_SCHEMAS}"`);
}
