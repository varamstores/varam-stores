# Varam Foods — Backend (Postgres-only)

All business logic lives in the Supabase Postgres database. There's no API server.
The storefront and admin portal call functions in schema `api` through `supabase-js`. Tables live
in the private schema `app`. Progress: [../PROGRESS.md](../PROGRESS.md). Design: [docs/PLAN.md](docs/PLAN.md).

## Setup (once)
```bash
cd backend
cp .env.example .env        # fill in the Supabase values (never commit .env)
npm install
node scripts/fetch-secret-key.mjs   # writes SUPABASE_SECRET_KEY into .env via the access token
```

## Everyday commands
| Command | What it does |
|---|---|
| `npm run db:migrate` | Apply new `db/migrations/*.sql` (checksummed; never edit an applied file, add a new one) |
| `npm run db:status` | Show applied / pending migrations |
| `npm run db:build-seed` | Regenerate `db/seed/*.sql` from the frontend mocks (needed only while mocks exist) |
| `npm run db:seed` | Apply seed files once each (never overwrites admin edits) |
| `npm run assets:upload` | Upload `public/` images to Supabase Storage (skips unchanged files) |
| `npm run db:test` | Run pgTAP tests against the live DB inside rolled-back transactions |
| `npm run db:lint` | plpgsql_check every function |
| `npm run supabase:configure` | Expose only schema `api` through PostgREST |
| `npm run db:all` | migrate → configure → seed → lint → test |

Bootstrap a Store Manager login:
`node scripts/bootstrap-admin.mjs --email you@example.com --password '…' --name 'Your Name'`

Remove all sample data before launch: `select app.purge_sample_data();`

## Rules for new SQL
- Tables go in `app`. Browser-callable functions go in `api`: `security definer`, `set search_path = ''`, fully-qualified names, and a comment with `@access anon|authenticated|staff`. Staff functions also call `app.require_permission('…')`.
- Raise errors with `app.raise_error('CODE', http_status, details_json)`.
- End every migration with `select app.harden();`.
