import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local.');
}

/**
 * The only way the browser talks to the backend. Every handler is a Postgres function in schema
 * `api` (see backend/docs/API_CONTRACT.md); tables are never reachable from here.
 */
export const supabase = createClient(url, key, {
  db: { schema: 'api' },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const STORAGE_BUCKET = 'storefront';
