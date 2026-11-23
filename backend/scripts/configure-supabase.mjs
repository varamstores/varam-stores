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

//  - Auth: links in sign-up, password-reset and staff-invitation emails point at the shop's website
//    address (Settings → Store details → Website address, setting `site_url`). Run this again after
//    changing that setting (e.g. at go-live). Existing allowed redirect URLs are kept.
const { connect } = await import('./lib/db.mjs');
const db = await connect();
let siteUrl;
try {
  siteUrl = (await db.query(`select value #>> '{}' as v from app.app_settings where key = 'site_url'`)).rows[0]?.v;
} finally {
  await db.end();
}
if (!siteUrl || !/^https?:\/\/[^\s]+$/.test(siteUrl)) throw new Error('Setting site_url is missing or not a web address.');
siteUrl = siteUrl.replace(/\/+$/, '');
const auth = await call('GET', `${base}/config/auth`);
const allow = new Set((auth.uri_allow_list ?? '').split(',').map((s) => s.trim()).filter(Boolean));
allow.add(`${siteUrl}/**`);
allow.add('http://localhost:5173/**');
const wantList = [...allow].join(',');
if (auth.site_url !== siteUrl || auth.uri_allow_list !== wantList) {
  await call('PATCH', `${base}/config/auth`, { site_url: siteUrl, uri_allow_list: wantList });
  console.log(`Auth site URL → ${siteUrl}; allowed redirects → ${wantList}`);
} else {
  console.log(`Auth site URL already ${siteUrl}`);
}
