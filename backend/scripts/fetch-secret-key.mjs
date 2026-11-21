// Fetches the project's server-side key via the Management API and writes it to
// backend/.env as SUPABASE_SECRET_KEY. Never prints the key.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BACKEND_DIR, loadEnv, requireEnv } from './lib/env.mjs';

const env = loadEnv();
requireEnv(env, 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF');
const res = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/api-keys?reveal=true`, {
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
});
if (!res.ok) throw new Error(`api-keys → ${res.status}`);
const keys = await res.json();
const secret = keys.find((k) => k.type === 'secret' && k.api_key) ?? keys.find((k) => k.name === 'service_role' && k.api_key);
if (!secret) throw new Error('No secret / service_role key found on the project.');

const file = path.join(BACKEND_DIR, '.env');
const text = readFileSync(file, 'utf8');
const line = `SUPABASE_SECRET_KEY=${secret.api_key}`;
const next = /^SUPABASE_SECRET_KEY=.*$/m.test(text) ? text.replace(/^SUPABASE_SECRET_KEY=.*$/m, line) : text + `\n${line}\n`;
writeFileSync(file, next);
console.log(`Saved SUPABASE_SECRET_KEY (${secret.type === 'secret' ? 'secret key' : 'legacy service_role key'}, ${secret.api_key.length} chars) to backend/.env`);
