import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CartItem } from '../types';
import type { CartLine, CartView, Money, ProductSummary } from '../types/api';
import { animateFlyToCart } from '../utils/flyToCart';
import { soundEffects } from '../utils/soundEffects';
import { args, rpc } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useCms } from '../cms/CmsProvider';
import { useErrorMessage } from '../cms/hooks';
import { formatMoney } from '../lib/money';
import { useAuth } from './AuthContext';

// The basket lives in Postgres (api.get_cart / add_cart_item / …) and is priced there: promotions,
// delivery and VAT all come from the server. Guests keep an opaque token in this browser; after
// signing in, the basket moves to the account on the next change.

type FlySource = HTMLElement | React.MouseEvent | { x: number; y: number } | null;

interface CartContextType {
  cart: CartView | null;
  items: CartItem[];
  isLoading: boolean;
  isUpdating: boolean;
  addToCart: (product: ProductSummary, quantity?: number, source?: FlySource) => Promise<void>;
  /** quantity = units for "each" products, weight steps for products sold by weight; 0 removes. */
  updateQuantity: (productId: string, quantity: number, source?: FlySource) => Promise<void>;
  removeFromCart: (productId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  setSubstitution: (productId: string, allowed: boolean) => Promise<void>;
  /** Units (or weight steps) of a product in the basket, for steppers on product cards. */
  quantityOf: (productId: string) => number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  appliedCoupon: string | null;
  coupon: CartView['coupon'];
  applyCoupon: (code: string) => Promise<boolean>;
  removeCoupon: () => Promise<void>;
  /** Sets the delivery postcode. Throws ApiError (POSTCODE_INVALID / POSTCODE_NOT_SERVED) for the caller to show. */
  setPostcode: (postcode: string) => Promise<CartView>;
  totalItems: number;
  subtotal: Money;
  discountAmount: Money;
  deliveryFee: Money;
  total: Money;
  freeDeliveryThreshold: Money | null;
  amountNeededForFreeDelivery: Money;
  toastMessage: string | null;
  showToast: (msg: string) => void;
  flyToCart: (product: ProductSummary, source?: FlySource) => void;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const TOKEN_KEY = 'varam.cart.token.v1';
const LEGACY_CART_KEYS = ['freshmart_cart_v1', 'varamstores_cart_v1'];
const LEGACY_COUPON_KEYS = ['freshmart_coupon_v1', 'varamstores_coupon_v1'];
const CART_KEY = ['cart'] as const;
const ZERO: Money = { amount: 0, currency: 'GBP' };

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: the basket still works for this tab */
  }
}

/** grams for `steps` weight steps of a product (first step = minimum weight). */
export function gramsForSteps(p: ProductSummary, steps: number): number {
  const min = p.minWeightGrams ?? p.weightStepGrams ?? 1000;
  const step = p.weightStepGrams ?? min;
  return steps <= 0 ? 0 : min + (steps - 1) * step;
}
export function stepsForGrams(p: ProductSummary, grams: number | null): number {
  if (!grams) return 0;
  const min = p.minWeightGrams ?? p.weightStepGrams ?? 1000;
  const step = p.weightStepGrams ?? min;
  return Math.max(1, Math.round((grams - min) / step) + 1);
}

function toItem(l: CartLine): CartItem {
  return {
    id: l.id,
    product: l.product,
    quantity: l.product.saleUnit === 'weight' ? stepsForGrams(l.product, l.weightGrams) : (l.quantity ?? 0),
    weightGrams: l.weightGrams,
    unitPrice: l.unitPrice,
    lineTotal: l.lineTotal,
    substitutionAllowed: l.substitutionAllowed,
    isEstimate: l.isEstimate,
  };
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const cms = useCms();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const tokenRef = useRef<string | null>(readToken());
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const [pending, setPending] = useState(0);
  const [isCartOpen, setIsCartOpenState] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage((current) => (current === msg ? null : current)), 2800);
  }, []);

  const { data: cart = null, isLoading } = useQuery({
    queryKey: CART_KEY,
    queryFn: () => rpc<CartView>('get_cart', args({ p_cart_token: tokenRef.current ?? undefined })),
    staleTime: 30_000,
  });

  /** Runs basket changes one at a time so fast taps can never apply out of order. */
  const mutate = useCallback((fn: string, a: Record<string, unknown>): Promise<CartView> => {
    const job = queueRef.current.catch(() => undefined).then(async () => {
      setPending((n) => n + 1);
      try {
        const view = await rpc<CartView>(fn, args({ ...a, p_cart_token: tokenRef.current ?? undefined }));
        if (view.cartToken) {
          tokenRef.current = view.cartToken;
          writeToken(view.cartToken);
        } else if (view.id) {
          // a customer basket: any guest token was merged into it and is no longer valid
          tokenRef.current = null;
          writeToken(null);
        }
        qc.setQueryData(CART_KEY, view);
        return view;
      } finally {
        setPending((n) => n - 1);
      }
    });
    queueRef.current = job;
    return job;
  }, [qc]);

  const patchQuantity = useCallback((lineId: string, patch: Partial<CartLine>) => {
    const prev = qc.getQueryData<CartView>(CART_KEY);
    if (prev) {
      qc.setQueryData<CartView>(CART_KEY, {
        ...prev,
        lines: prev.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
      });
    }
    return prev;
  }, [qc]);

  const fail = useCallback((err: unknown, rollback?: CartView) => {
    if (rollback) qc.setQueryData(CART_KEY, rollback);
    else void qc.invalidateQueries({ queryKey: CART_KEY });
    showToast(errorMessage(err));
  }, [qc, showToast, errorMessage]);

  // A basket saved by the old site in this browser is moved into the real basket once.
  useEffect(() => {
    let legacy: { ref: string; quantity: number }[] = [];
    try {
      for (const key of LEGACY_CART_KEYS) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as { product?: { id?: string }; quantity?: number }[];
        legacy = legacy.concat(parsed.filter((i) => i.product?.id).map((i) => ({ ref: String(i.product!.id), quantity: Number(i.quantity) || 1 })));
      }
    } catch {
      legacy = [];
    }
    const clearLegacy = () => {
      try {
        [...LEGACY_CART_KEYS, ...LEGACY_COUPON_KEYS].forEach((k) => localStorage.removeItem(k));
      } catch {
        /* ignore */
      }
    };
    if (!legacy.length) {
      clearLegacy();
      return;
    }
    mutate('import_cart', { p_items: legacy }).then(clearLegacy, () => undefined);
  }, [mutate]);

  // Signing in or out changes whose basket this is.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        void qc.invalidateQueries({ queryKey: CART_KEY });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  // Once the shopper has a customer profile, move the guest basket into their account.
  const { context: authContext } = useAuth();
  const claimedFor = useRef<string | null>(null);
  useEffect(() => {
    const cid = authContext?.customer?.id;
    if (!cid || claimedFor.current === cid) return;
    claimedFor.current = cid;
    mutate('claim_cart', {}).catch(() => {
      claimedFor.current = null;
    });
  }, [authContext?.customer?.id, mutate]);

  const lineFor = useCallback((productId: string) => cart?.lines.find((l) => l.product.id === productId), [cart]);

  const value = useMemo<CartContextType>(() => {
    const items = (cart?.lines ?? []).map(toItem);

    const addToCart = async (product: ProductSummary, quantity = 1, source?: FlySource) => {
      soundEffects.playAddToCart();
      animateFlyToCart(product, source);
      const existing = lineFor(product.id);
      try {
        if (product.saleUnit === 'weight') {
          const grams = existing ? quantity * (product.weightStepGrams ?? 1000) : gramsForSteps(product, quantity);
          await mutate('add_cart_item', { p_product_id: product.id, p_quantity: null, p_weight_grams: grams });
        } else {
          await mutate('add_cart_item', { p_product_id: product.id, p_quantity: quantity });
        }
        showToast(cms.t('global.toasts.added_to_basket', { name: product.name }));
      } catch (err) {
        fail(err);
      }
    };

    const updateQuantity = async (productId: string, quantity: number, source?: FlySource) => {
      const line = lineFor(productId);
      if (!line) {
        return;
      }
      const product = line.product;
      const current = toItem(line).quantity;
      if (quantity > current) {
        soundEffects.playQuantityChange(true);
        animateFlyToCart(product, source);
      } else if (quantity < current) {
        soundEffects.playQuantityChange(false);
      }
      if (quantity <= 0) return removeFromCart(productId);
      const patch = product.saleUnit === 'weight'
        ? { weightGrams: gramsForSteps(product, quantity) }
        : { quantity };
      const rollback = patchQuantity(line.id, patch);
      try {
        await mutate('update_cart_item', product.saleUnit === 'weight'
          ? { p_line_id: line.id, p_weight_grams: patch.weightGrams }
          : { p_line_id: line.id, p_quantity: quantity });
      } catch (err) {
        fail(err, rollback);
      }
    };

    const removeFromCart = async (productId: string) => {
      const line = lineFor(productId);
      if (!line) return;
      soundEffects.playRemoveFromCart();
      const prev = qc.getQueryData<CartView>(CART_KEY);
      if (prev) qc.setQueryData<CartView>(CART_KEY, { ...prev, lines: prev.lines.filter((l) => l.id !== line.id) });
      try {
        await mutate('remove_cart_item', { p_line_id: line.id });
      } catch (err) {
        fail(err, prev);
      }
    };

    const clearCart = async () => {
      soundEffects.playRemoveFromCart();
      try {
        await mutate('clear_cart', {});
        showToast(cms.t('global.toasts.basket_cleared'));
      } catch (err) {
        fail(err);
      }
    };

    const setSubstitution = async (productId: string, allowed: boolean) => {
      const line = lineFor(productId);
      if (!line) return;
      const rollback = patchQuantity(line.id, { substitutionAllowed: allowed });
      try {
        await mutate('update_cart_item', { p_line_id: line.id, p_substitution_allowed: allowed });
      } catch (err) {
        fail(err, rollback);
      }
    };

    const applyCoupon = async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return false;
      try {
        const view = await mutate('apply_coupon', { p_code: trimmed });
        const c = view.coupon;
        if (c?.status === 'applied') {
          soundEffects.playCoupon();
          showToast(cms.t('global.toasts.coupon_applied', { code: c.code }));
        } else if (c) {
          showToast(cms.t('global.toasts.coupon_not_eligible', { code: c.code, reason: couponReasonText(cms, c) }));
        }
        return true;
      } catch (err) {
        showToast(errorMessage(err));
        return false;
      }
    };

    const removeCoupon = async () => {
      try {
        await mutate('remove_coupon', {});
        showToast(cms.t('global.toasts.coupon_removed'));
      } catch (err) {
        fail(err);
      }
    };

    const setPostcode = (postcode: string) => mutate('set_cart_postcode', { p_postcode: postcode });

    return {
      cart,
      items,
      isLoading,
      isUpdating: pending > 0,
      addToCart,
      updateQuantity,
      removeFromCart,
      clearCart,
      setSubstitution,
      quantityOf: (productId) => {
        const line = lineFor(productId);
        return line ? toItem(line).quantity : 0;
      },
      isCartOpen,
      setIsCartOpen: (open) => {
        setIsCartOpenState(open);
        soundEffects.playDrawer(open);
      },
      appliedCoupon: cart?.coupon?.status === 'applied' ? cart.coupon.code : null,
      coupon: cart?.coupon ?? null,
      applyCoupon,
      removeCoupon,
      setPostcode,
      totalItems: cart?.itemCount ?? 0,
      subtotal: cart?.totals.itemsSubtotal ?? ZERO,
      discountAmount: cart?.totals.discountTotal ?? ZERO,
      deliveryFee: cart?.totals.deliveryFee ?? ZERO,
      total: cart?.totals.total ?? ZERO,
      freeDeliveryThreshold: cart?.delivery.freeDeliveryThreshold ?? null,
      amountNeededForFreeDelivery: cart?.delivery.amountNeededForFreeDelivery ?? ZERO,
      toastMessage,
      showToast,
      flyToCart: animateFlyToCart,
      refresh: async () => {
        await qc.invalidateQueries({ queryKey: CART_KEY });
      },
    };
  }, [cart, isLoading, pending, isCartOpen, toastMessage, showToast, lineFor, mutate, patchQuantity, fail, qc, cms, errorMessage]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

/** Shopper-facing explanation of why a saved promo code does not apply yet. */
export function couponReasonText(cms: ReturnType<typeof useCms>, coupon: NonNullable<CartView['coupon']>): string {
  const reason = coupon.reasonCode ?? 'INVALID';
  const text = cms.lookup(`global.coupon_reasons.${reason.toLowerCase()}`);
  const amount = coupon.details?.amountNeeded ? formatMoney(coupon.details.amountNeeded) : '';
  return typeof text === 'string' && text ? text.replace('{amount}', amount) : cms.t('global.coupon_reasons.invalid');
}

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
};
