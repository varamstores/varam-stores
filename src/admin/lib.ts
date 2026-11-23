import { useCallback, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { rpc, isApiError } from '../lib/api';
import { supabase, STORAGE_BUCKET } from '../lib/supabase';
import type { Money } from '../types/api';
import { toast } from './toast';

// ── data ────────────────────────────────────────────────────────────────────────────────────────
// Every admin screen reads with useAdminQuery and writes with useAction. Keys start with 'admin' so a
// save can refresh exactly the lists it affects.

export function useAdminQuery<T>(fn: string, params?: Record<string, unknown>, options?: Partial<UseQueryOptions<T>>) {
  return useQuery<T>({
    queryKey: ['admin', fn, params ?? {}],
    queryFn: () => rpc<T>(fn, params),
    staleTime: 15_000,
    ...options,
  });
}

export interface Paged<T> { items: T[]; total: number; nextCursor: string | null }

/** Lists that come in pages of 50 ("Show more" loads the next page using the database's cursor). */
export function usePaged<T, P extends Paged<T> = Paged<T>>(fn: string, params: Record<string, unknown>, options: { refetchInterval?: number } = {}) {
  const q = useInfiniteQuery({
    queryKey: ['admin', fn, params, 'paged'],
    queryFn: ({ pageParam }) => rpc<P>(fn, { ...params, p_limit: 50, p_cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: P) => last.nextCursor ?? undefined,
    staleTime: 15_000,
    refetchInterval: options.refetchInterval,
  });
  const first = q.data?.pages[0];
  return { ...q, first, items: q.data?.pages.flatMap((p) => p.items) ?? [] };
}

/** Plain-English message for a failed call. Database hints are written for staff, so they are shown as they are. */
export function errorText(err: unknown): string {
  if (isApiError(err)) {
    if (err.hint) return err.hint;
    switch (err.code) {
      case 'NETWORK': return 'No connection. Check the internet and try again.';
      case 'UNAUTHENTICATED': return 'Your sign-in has expired. Please sign in again.';
      case 'FORBIDDEN': return 'Your role does not allow this. Ask a Store Manager.';
      case 'NOT_FOUND': return 'That item no longer exists. Refresh the page.';
      case 'CONFLICT': return 'Someone else changed this at the same time. Refresh and try again.';
      case 'RATE_LIMITED': return 'Too many tries. Wait a minute and try again.';
      default: return 'Something went wrong. Please try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}

interface ActionOptions {
  /** Toast shown on success; omit for none. */
  success?: string;
  /** Query function names to refresh afterwards (default: every admin query). */
  refresh?: string[];
}

/** Runs one database function, shows a toast, refreshes lists. Returns the result, or undefined on failure. */
export function useAction() {
  const qc = useQueryClient();
  const m = useMutation({ mutationFn: ({ fn, params }: { fn: string; params?: Record<string, unknown> }) => rpc<unknown>(fn, params) });
  const run = useCallback(async <T = unknown>(fn: string, params?: Record<string, unknown>, opts: ActionOptions = {}): Promise<T | undefined> => {
    try {
      const out = (await m.mutateAsync({ fn, params })) as T;
      if (opts.refresh) await Promise.all(opts.refresh.map((f) => qc.invalidateQueries({ queryKey: ['admin', f] })));
      else await qc.invalidateQueries({ queryKey: ['admin'] });
      if (opts.success) toast.success(opts.success);
      return out;
    } catch (err) {
      toast.error(errorText(err));
      return undefined;
    }
  }, [m, qc]);
  return { run, busy: m.isPending };
}

/** Local form state with a "changed" flag. */
export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [dirty, setDirty] = useState(false);
  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty(true);
  }, []);
  const reset = useCallback((next: T) => { setValues(next); setDirty(false); }, []);
  return { values, set, reset, dirty, setValues };
}

// ── formatting ──────────────────────────────────────────────────────────────────────────────────
const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
export const pence = (p: number | null | undefined) => (p == null ? '—' : gbp.format(p / 100));
export const money = (m: Money | null | undefined) => (m ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: m.currency }).format(m.amount / 100) : '—');

const TZ = 'Europe/London';
export function date(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
}
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ });
}
export function time(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
}
/** "3 min ago", "yesterday", or a date. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  return date(iso);
}
/** Today in London as YYYY-MM-DD. */
export function londonToday(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "1.25 kg" / "750 g". */
export function formatWeight(g: number | null | undefined): string {
  if (g == null) return '—';
  return g >= 1000 ? `${Number((g / 1000).toFixed(3))} kg` : `${g} g`;
}

/** Pounds typed by staff ("3.50", "£3.5") → pence, or null when empty/invalid. */
export function parsePounds(text: string): number | null {
  const t = text.replace(/[£,\s]/g, '');
  if (t === '') return null;
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return NaN;
  return Math.round(Number(t) * 100);
}
export const poundsText = (p: number | null | undefined) => (p == null ? '' : (p / 100).toFixed(2));

// ── order status words ──────────────────────────────────────────────────────────────────────────
export const ORDER_STATUS: Record<string, { label: string; tone: Tone; help: string }> = {
  pending_payment: { label: 'Awaiting payment', tone: 'grey', help: 'The customer has not finished paying yet.' },
  placed: { label: 'New', tone: 'blue', help: 'Paid (card held) and waiting to be picked.' },
  picking: { label: 'Picking', tone: 'amber', help: 'Someone is picking this order now.' },
  picked: { label: 'Picked', tone: 'amber', help: 'Picked; the payment is being taken.' },
  paid: { label: 'Ready to send', tone: 'violet', help: 'Packed and charged. Ready to go out for delivery.' },
  out_for_delivery: { label: 'On the road', tone: 'violet', help: 'With a driver.' },
  delivered: { label: 'Delivered', tone: 'green', help: 'Handed to the customer.' },
  cancelled: { label: 'Cancelled', tone: 'red', help: 'Cancelled; nothing was charged.' },
  partially_refunded: { label: 'Part refunded', tone: 'red', help: 'Some money was refunded.' },
  refunded: { label: 'Refunded', tone: 'red', help: 'Fully refunded.' },
};
export type Tone = 'grey' | 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'yellow';

// ── files ───────────────────────────────────────────────────────────────────────────────────────
export function downloadText(fileName: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const newKey = () => crypto.randomUUID();

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif', 'image/avif'];

/** Uploads a picture to Supabase Storage, registers it in the media library, returns its storage path. */
export async function uploadImage(file: File, folder: string): Promise<{ path: string; url: string }> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('Use a JPG, PNG, WebP, SVG, GIF or AVIF picture.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Pictures must be under 10 MB.');
  const bytes = await file.arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map((b) => b.toString(16).padStart(2, '0')).join('');
  const base = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? file.type.split('/')[1]).toLowerCase().replace('svg+xml', 'svg');
  const path = `uploads/${folder}/${base}-${hash.slice(0, 10)}.${ext}`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: true, cacheControl: '31536000' });
  if (error) throw new Error(/row-level security|unauthorized|403/i.test(error.message) ? 'Your role cannot upload pictures.' : 'The upload failed. Please try again.');
  const out = await rpc<{ path: string; url: string }>('admin_register_media', { p_object_path: path, p_content_type: file.type, p_bytes: file.size, p_sha256: hash });
  return out;
}

/** Public address of a stored picture ("uploads/x.jpg" or "/hero.jpg"). */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path.replace(/^\/+/, '')).data.publicUrl;
}
