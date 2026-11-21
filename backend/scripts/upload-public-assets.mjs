// Uploads every image in ../public to Supabase Storage bucket "storefront", keeping the same
// relative path ("/brands/aachi.webp" → "brands/aachi.webp"), and records each file in
// app.media_assets. Idempotent: unchanged files (same sha256) are skipped.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { REPO_DIR, loadEnv, requireEnv } from './lib/env.mjs';
import { connect } from './lib/db.mjs';

const env = loadEnv();
requireEnv(env, 'SUPABASE_URL', 'SUPABASE_SECRET_KEY');
const PUBLIC_DIR = path.join(REPO_DIR, 'public');
const BUCKET = 'storefront';
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.gif': 'image/gif', '.avif': 'image/avif', '.ico': 'image/x-icon' };

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(PUBLIC_DIR)
  .map((full) => ({ full, rel: path.relative(PUBLIC_DIR, full).split(path.sep).join('/') }))
  .filter((f) => TYPES[path.extname(f.rel).toLowerCase()]);
const skippedNonImages = walk(PUBLIC_DIR).length - files.length;

// Read the manifest, then close: the pooler resets connections left idle during long uploads.
let known;
{
  const c = await connect();
  known = new Map((await c.query('select object_path, sha256 from app.media_assets')).rows.map((r) => [r.object_path, r.sha256]));
  await c.end();
}

const done = [];          // rows to record once all uploads finish
let uploaded = 0, unchanged = 0, failed = 0;
async function upload(f) {
  const body = readFileSync(f.full);
  const sha256 = createHash('sha256').update(body).digest('hex');
  if (known.get(f.rel) === sha256) { unchanged++; return; }
  const contentType = TYPES[path.extname(f.rel).toLowerCase()];
  const url = `${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${f.rel.split('/').map(encodeURIComponent).join('/')}`;
  let res = null, lastError = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { apikey: env.SUPABASE_SECRET_KEY, 'Content-Type': contentType, 'x-upsert': 'true', 'Cache-Control': 'max-age=31536000' },
        body,
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok || (res.status < 500 && res.status !== 429)) break;   // success or a non-retryable error
      lastError = `${res.status}`;
    } catch (err) {
      res = null;
      lastError = err.cause?.code ?? err.name ?? String(err);
    }
    await new Promise((r) => setTimeout(r, attempt * 1500));
  }
  if (!res || !res.ok) {
    failed++;
    console.error(`✗ ${f.rel}: ${res ? `${res.status} ${(await res.text()).slice(0, 200)}` : lastError}`);
    return;
  }
  done.push([f.rel, BUCKET, '/' + f.rel, contentType, body.length, sha256]);
  uploaded++;
  console.log(`✓ ${f.rel} (${uploaded + unchanged + failed}/${files.length})`);
}

const queue = [...files];
await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await upload(queue.shift()); }));

const client = await connect();
for (const row of done) {
  await client.query(
    `insert into app.media_assets (object_path, bucket, source_path, content_type, bytes, sha256)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (object_path) do update set content_type = excluded.content_type, bytes = excluded.bytes,
       sha256 = excluded.sha256, uploaded_at = now()`, row);
}
// The catalogue builds image URLs from this base (see app.media_url).
await client.query(
  `insert into app.app_settings (key, value, description) values ('media_base_url', to_jsonb($1::text),
     'Public base URL of the storefront Storage bucket; catalogue image paths are relative to it.')
   on conflict (key) do update set value = excluded.value, updated_at = now()`,
  [`${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`]);
await client.end();

console.log(`${files.length} images: ${uploaded} uploaded, ${unchanged} unchanged, ${failed} failed` +
  (skippedNonImages ? ` (${skippedNonImages} non-image files ignored)` : ''));
process.exitCode = failed ? 1 : 0;
