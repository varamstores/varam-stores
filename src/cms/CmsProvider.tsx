import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { rpc, isApiError } from '../lib/api';
import { CMS_KINDS, type CmsEntries, type CmsKind, type CmsPageKey, type CmsSectionKey } from './content.gen';
import type { CmsBundle, CmsImage, CmsLink, CmsPageInfo, CmsSectionInfo } from './types';

// The bundle is cached so repeat visits paint instantly (and work on a flaky connection); a fresh
// copy is always fetched on start, then the version is polled so admin edits appear within a minute.
const CACHE_KEY = 'varam.cms.bundle.v1';
const POLL_MS = 60_000;

type KeysOfType<T> = { [K in keyof CmsEntries]: CmsEntries[K] extends T ? K : never }[keyof CmsEntries];
export type CmsTextKey = KeysOfType<string>;
export type CmsImageKey = KeysOfType<CmsImage>;
export type CmsLinkKey = KeysOfType<CmsLink>;
export type CmsVars = Record<string, string | number>;

const EMPTY: Record<CmsKind, unknown> = {
  text: '', richtext: '', image: { desktop: null, mobile: null, alt: '' }, link: { label: '', href: '' },
  list: [], number: 0, boolean: false, color: '#000000', json: null,
};
const HIDDEN_SECTION: CmsSectionInfo = { position: 0, enabled: false, desktop: false, mobile: false };

export interface CmsApi {
  status: 'loading' | 'ready' | 'error';
  version: number | null;
  /** Typed value of any entry. */
  get: <K extends keyof CmsEntries>(key: K) => CmsEntries[K];
  /** Text with {placeholders} filled in. */
  t: (key: CmsTextKey, vars?: CmsVars) => string;
  img: (key: CmsImageKey) => CmsImage;
  link: (key: CmsLinkKey) => CmsLink;
  /** Any entry by a key built at runtime (e.g. error codes). Undefined if it does not exist. */
  lookup: (key: string) => unknown;
  section: (key: CmsSectionKey) => CmsSectionInfo;
  page: (key: CmsPageKey | string) => CmsPageInfo | undefined;
  /** Section keys of a page in the order the admin set. */
  sectionOrder: (page: CmsPageKey) => string[];
  reload: () => Promise<void>;
}

const CmsContext = createContext<CmsApi | null>(null);

function readCache(): CmsBundle | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CmsBundle) : null;
  } catch {
    return null;
  }
}
function writeCache(b: CmsBundle) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(b));
  } catch {
    /* storage full or blocked: the site still works, just without the instant-paint cache */
  }
}

export function interpolate(s: string, vars?: CmsVars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

const warned = new Set<string>();
function warnMissing(key: string) {
  if (import.meta.env.DEV && !warned.has(key)) {
    warned.add(key);
    console.warn(`[cms] "${key}" is not in the CMS bundle. Run: cd backend && npm run cms:sync`);
  }
}

export const CmsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bundle, setBundle] = useState<CmsBundle | null>(readCache);
  const [status, setStatus] = useState<CmsApi['status']>(() => (bundle ? 'ready' : 'loading'));
  const versionRef = useRef<number | null>(bundle?.version ?? null);
  const inflight = useRef<Promise<void> | null>(null);

  const load = useCallback(() => {
    if (inflight.current) return inflight.current;
    inflight.current = (async () => {
      try {
        const b = await rpc<CmsBundle>('get_cms_bundle');
        versionRef.current = b.version;
        setBundle(b);
        writeCache(b);
        setStatus('ready');
      } catch (e) {
        setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
        if (!isApiError(e, 'NETWORK')) console.error('[cms] failed to load content', e);
      } finally {
        inflight.current = null;
      }
    })();
    return inflight.current;
  }, []);

  const check = useCallback(async () => {
    try {
      const v = await rpc<number>('get_cms_version');
      if (Number(v) !== versionRef.current) await load();
    } catch {
      /* offline: keep showing what we have */
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void check();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  const api = useMemo<CmsApi>(() => {
    const entries = bundle?.entries ?? {};
    const get = <K extends keyof CmsEntries>(key: K): CmsEntries[K] => {
      if (key in entries) return entries[key] as CmsEntries[K];
      warnMissing(key);
      return EMPTY[CMS_KINDS[key]] as CmsEntries[K];
    };
    return {
      status,
      version: bundle?.version ?? null,
      get,
      t: (key, vars) => interpolate(String(get(key) ?? ''), vars),
      img: (key) => get(key) as CmsImage,
      link: (key) => get(key) as CmsLink,
      lookup: (key) => entries[key],
      section: (key) => {
        const [pageKey, sectionKey] = key.split('.');
        return bundle?.pages[pageKey]?.sections[sectionKey] ?? HIDDEN_SECTION;
      },
      page: (key) => bundle?.pages[key],
      sectionOrder: (pageKey) => {
        const sections = bundle?.pages[pageKey]?.sections ?? {};
        return Object.entries(sections).sort((a, b) => a[1].position - b[1].position).map(([k]) => k);
      },
      reload: load,
    };
  }, [bundle, status, load]);

  return <CmsContext.Provider value={api}>{children}</CmsContext.Provider>;
};

export function useCms(): CmsApi {
  const ctx = useContext(CmsContext);
  if (!ctx) throw new Error('useCms must be used inside <CmsProvider>');
  return ctx;
}
