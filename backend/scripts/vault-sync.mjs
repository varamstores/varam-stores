// Copies server-side secrets from backend/.env into Supabase Vault, where the database reads them
// (Stripe payments, Resend emails, staff invitations). Never prints a secret — only which names were set.
//   npm run vault:sync
// Missing values are skipped, so it is safe to run before every key exists.
import { loadEnv, requireEnv } from './lib/env.mjs';
import { connect } from './lib/db.mjs';

const SECRETS = [
  { env: 'SUPABASE_SECRET_KEY', name: 'supabase_secret_key', description: 'Supabase secret key — used only to send staff invitations.' },
  { env: 'STRIPE_SECRET_KEY', name: 'stripe_secret_key', description: 'Stripe secret key — card payments and refunds.' },
  { env: 'RESEND_API_KEY', name: 'resend_api_key', description: 'Resend API key — order and account emails.' },
];

const env = loadEnv();
requireEnv(env, 'SUPABASE_URL');
if (env.STRIPE_SECRET_KEY && !/^(sk|rk)_(test|live)_/.test(env.STRIPE_SECRET_KEY)) {
  throw new Error('STRIPE_SECRET_KEY does not look like a Stripe secret key (sk_test_… / sk_live_…). Nothing was changed.');
}

const client = await connect();
try {
  await client.query('begin');
  for (const s of SECRETS) {
    const value = env[s.env];
    if (!value) { console.log(`- ${s.name}: skipped (${s.env} not set in backend/.env)`); continue; }
    const existing = (await client.query('select id from vault.secrets where name = $1', [s.name])).rows[0];
    if (existing) await client.query('select vault.update_secret($1, $2, $3, $4)', [existing.id, value, s.name, s.description]);
    else await client.query('select vault.create_secret($1, $2, $3)', [value, s.name, s.description]);
    console.log(`✓ ${s.name}: ${existing ? 'updated' : 'created'}`);
  }
  await client.query(`update app.app_settings set value = to_jsonb($1::text), updated_at = now() where key = 'supabase_url'`, [env.SUPABASE_URL.replace(/\/+$/, '')]);
  console.log('✓ supabase_url setting saved');
  await client.query('commit');
} catch (err) {
  await client.query('rollback').catch(() => {});
  throw err;
} finally {
  await client.end();
}
