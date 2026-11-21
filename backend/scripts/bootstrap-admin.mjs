// Creates (or links) the first Store Manager login.
//   node scripts/bootstrap-admin.mjs --email someone@example.com --password '…' --name 'Full Name'
// The auth user is created pre-confirmed (no email is sent). Credentials are never stored in the repo.
import { loadEnv, requireEnv } from './lib/env.mjs';
import { connect } from './lib/db.mjs';

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const email = arg('email')?.trim().toLowerCase();
const password = arg('password');
const name = arg('name') ?? 'Store Manager';
if (!email || !password) throw new Error('Usage: --email <email> --password <password> [--name <full name>]');

const env = loadEnv();
requireEnv(env, 'SUPABASE_URL', 'SUPABASE_SECRET_KEY');
const headers = { apikey: env.SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' };

const client = await connect();
try {
  let userId = (await client.query('select id from auth.users where lower(email) = $1', [email])).rows[0]?.id;
  if (!userId) {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST', headers,
      body: JSON.stringify({ email, password, email_confirm: true, app_metadata: { varam_role: 'staff' } }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Auth admin create user → ${res.status}: ${body.msg ?? body.message ?? JSON.stringify(body).slice(0, 200)}`);
    userId = body.id;
    console.log(`Created auth user ${email} (pre-confirmed).`);
  } else {
    console.log(`Auth user ${email} already exists — linking.`);
  }
  await client.query(
    `insert into app.staff (user_id, email, full_name, role_code, status, is_sample)
     values ($1, $2, $3, 'store_manager', 'active', false)
     on conflict (email) do update set user_id = excluded.user_id, role_code = 'store_manager', status = 'active'`,
    [userId, email, name]);
  console.log(`${email} is a Store Manager (full access).`);
} finally {
  await client.end();
}
