// Loads backend/.env without printing anything. Values may be single- or double-quoted.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dns from 'node:dns';

// This network times out on IPv6 for some Supabase hosts; prefer IPv4 for every script.
dns.setDefaultResultOrder('ipv4first');

export const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REPO_DIR = path.resolve(BACKEND_DIR, '..');

export function loadEnv() {
  const file = path.join(BACKEND_DIR, '.env');
  if (!existsSync(file)) throw new Error(`Missing ${file}. Copy .env.example to .env and fill it in.`);
  const env = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

export function requireEnv(env, ...keys) {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing in backend/.env: ${missing.join(', ')}`);
}
