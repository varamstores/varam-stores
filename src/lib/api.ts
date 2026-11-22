import { supabase } from './supabase';

/**
 * A failed backend call. `code` is the stable error code raised by Postgres (e.g. SLOT_FULL,
 * see API_CONTRACT §12), or NETWORK when the request never reached the server. Show the
 * customer the CMS microcopy for the code (`errorMessage()` in src/cms), never `message`.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown> | null;
  readonly hint: string | null;

  constructor(code: string, status: number, details: Record<string, unknown> | null, hint: string | null) {
    super(hint ?? code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.hint = hint;
  }
}

const OUR_CODE = /^[A-Z][A-Z0-9_]+$/;

function parseDetails(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function toApiError(error: { message?: string; details?: string | null; hint?: string | null; code?: string }, status: number): ApiError {
  const message = error.message ?? '';
  if (OUR_CODE.test(message)) return new ApiError(message, status, parseDetails(error.details), error.hint ?? null);
  if (status === 0 || /fetch|network|Failed to fetch|Load failed/i.test(message)) return new ApiError('NETWORK', 0, null, null);
  if (status === 401 || error.code === 'PGRST301' || /JWT/i.test(message)) return new ApiError('UNAUTHENTICATED', 401, null, null);
  if (status === 404 || error.code === 'PGRST202') return new ApiError('NOT_FOUND', 404, null, null);
  return new ApiError('INTERNAL', status || 500, null, null);
}

/** Calls `api.<fn>(...)`. Throws ApiError on failure. */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  let res;
  try {
    res = await supabase.rpc(fn, args ?? {});
  } catch {
    throw new ApiError('NETWORK', 0, null, null);
  }
  if (res.error) throw toApiError(res.error, res.status);
  return res.data as T;
}

/** Drops undefined values so optional Postgres parameters keep their defaults. */
export function args(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

export function isApiError(e: unknown, code?: string): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}
