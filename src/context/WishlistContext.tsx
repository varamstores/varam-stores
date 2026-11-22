import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { soundEffects } from '../utils/soundEffects';
import { rpc } from '../lib/api';
import { useAuth } from './AuthContext';
import { useCart } from './CartContext';
import { useCms } from '../cms/CmsProvider';
import { useErrorMessage } from '../cms/hooks';
import type { ProductSummary } from '../types/api';

// Saved items: kept in this browser while signed out, in the account (Postgres) once signed in.
// On sign-in, items saved while signed out are merged into the account.

interface WishlistContextType {
  wishlistIds: string[];
  /** Product cards for the saved items (account or browser). */
  products: ProductSummary[];
  isLoading: boolean;
  toggleWishlist: (product: ProductSummary) => void;
  isInWishlist: (productId: string) => boolean;
  clearWishlist: () => void;
  wishlistCount: number;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);
const LOCAL_KEY = 'varam.wishlist.v1';
const LEGACY_KEYS = ['freshmart_wishlist_v1', 'varamstores_wishlist_v1'];
const SERVER_KEY = ['account', 'wishlist'] as const;

function readLocal(): string[] {
  try {
    const all = [LOCAL_KEY, ...LEGACY_KEYS].flatMap((k) => {
      const raw = localStorage.getItem(k);
      return raw ? (JSON.parse(raw) as unknown[]).map(String) : [];
    });
    return [...new Set(all)];
  } catch {
    return [];
  }
}
function writeLocal(ids: string[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(ids));
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* private mode */
  }
}

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const cms = useCms();
  const errorMessage = useErrorMessage();
  const { isCustomer, context } = useAuth();
  const { showToast } = useCart();
  const qc = useQueryClient();
  const [localIds, setLocalIds] = useState<string[]>(readLocal);
  const merged = useRef<string | null>(null);

  // Signed in: the account's saved items.
  const server = useQuery({
    queryKey: SERVER_KEY,
    queryFn: () => rpc<ProductSummary[]>('list_my_wishlist'),
    enabled: isCustomer,
    staleTime: 60_000,
  });

  // Signed out: product cards for the ids in this browser (also turns old ids like "prod-1" into real ids).
  const local = useQuery({
    queryKey: ['wishlist-local', [...localIds].sort()],
    queryFn: () => rpc<ProductSummary[]>('list_products_by_refs', { p_refs: localIds }),
    enabled: !isCustomer && localIds.length > 0,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isCustomer || !local.data) return;
    const ids = local.data.map((p) => p.id);
    if (ids.length !== localIds.length || ids.some((id) => !localIds.includes(id))) {
      setLocalIds(ids);
      writeLocal(ids);
    }
  }, [local.data, isCustomer, localIds]);

  // After signing in: move browser-saved items into the account, once.
  useEffect(() => {
    const cid = context?.customer?.id;
    if (!cid || merged.current === cid) return;
    merged.current = cid;
    if (!localIds.length) return;
    void rpc('merge_wishlist', { p_refs: localIds }).then(() => {
      setLocalIds([]);
      writeLocal([]);
      void qc.invalidateQueries({ queryKey: SERVER_KEY });
    }, () => undefined);
  }, [context?.customer?.id, localIds, qc]);

  const serverIds = useMemo(() => (server.data ?? []).map((p) => p.id), [server.data]);
  const ids = isCustomer ? serverIds : localIds;

  const toggleWishlist = useCallback((product: ProductSummary) => {
    const adding = !ids.includes(product.id);
    soundEffects.playWishlist(adding);
    showToast(cms.t(adding ? 'global.toasts.wishlist_added' : 'global.toasts.wishlist_removed', { name: product.name }));
    if (!isCustomer) {
      const next = adding ? [...localIds, product.id] : localIds.filter((id) => id !== product.id);
      setLocalIds(next);
      writeLocal(next);
      return;
    }
    const prev = qc.getQueryData<ProductSummary[]>(SERVER_KEY) ?? [];
    qc.setQueryData<ProductSummary[]>(SERVER_KEY, adding ? [product, ...prev] : prev.filter((p) => p.id !== product.id));
    rpc(adding ? 'add_to_wishlist' : 'remove_from_wishlist', { p_product_id: product.id }).catch((err) => {
      qc.setQueryData(SERVER_KEY, prev);
      showToast(errorMessage(err));
    });
  }, [ids, isCustomer, localIds, qc, showToast, cms, errorMessage]);

  const clearWishlist = useCallback(() => {
    soundEffects.playRemoveFromCart();
    showToast(cms.t('global.toasts.wishlist_cleared'));
    if (!isCustomer) {
      setLocalIds([]);
      writeLocal([]);
      return;
    }
    const prev = qc.getQueryData<ProductSummary[]>(SERVER_KEY);
    qc.setQueryData(SERVER_KEY, []);
    rpc('clear_my_wishlist').catch((err) => {
      qc.setQueryData(SERVER_KEY, prev);
      showToast(errorMessage(err));
    });
  }, [isCustomer, qc, showToast, cms, errorMessage]);

  const value = useMemo<WishlistContextType>(() => ({
    wishlistIds: ids,
    products: isCustomer ? (server.data ?? []) : (local.data ?? []).filter((p) => localIds.includes(p.id)),
    isLoading: isCustomer ? server.isLoading : local.isLoading && localIds.length > 0,
    toggleWishlist,
    isInWishlist: (id) => ids.includes(id),
    clearWishlist,
    wishlistCount: ids.length,
  }), [ids, isCustomer, server.data, server.isLoading, local.data, local.isLoading, localIds, toggleWishlist, clearWishlist]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) throw new Error('useWishlist must be used within a WishlistProvider');
  return context;
};
