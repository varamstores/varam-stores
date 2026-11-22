import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldCheck, CheckCircle2, Truck, Lock, MapPin, Clock, Printer, ShoppingBag, AlertTriangle, Plus, Leaf } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useCart } from '../context/CartContext';
import { useNavigation } from '../context/NavigationContext';
import { useAuth } from '../context/AuthContext';
import { soundEffects } from '../utils/soundEffects';
import { rpc, isApiError } from '../lib/api';
import { formatMoney, formatGrams } from '../lib/money';
import { useAddresses, saveAddress, accountKeys } from '../lib/account';
import { useDeliverySlots, useSlotLabeller, type DeliverySlot } from '../lib/delivery';
import { useCms } from '../cms/CmsProvider';
import { InlineText, Picture } from '../cms/components';
import { useErrorMessage, useSeo } from '../cms/hooks';
import type { Address, CheckoutView, OrderView, PlaceOrderResult } from '../types/api';

interface CheckoutPageProps {
  onOpenLocationModal?: () => void;
}

const CHECKOUT_KEY = 'varam.checkout.v1';
const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
let stripePromise: Promise<Stripe | null> | null = null;
const getStripe = () => (stripePromise ??= stripeKey ? loadStripe(stripeKey) : Promise.resolve(null));

const field = 'w-full text-sm px-3 py-2.5 rounded-xl border border-stone-200 focus:outline-none focus:border-[#F5D103] focus:ring-2 focus:ring-[#F5D103]/20 bg-white';
const card = 'bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-7 shadow-2xs';

function readSaved(): { checkoutId: string; key: string } | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeSaved(v: { checkoutId: string; key: string } | null) {
  try {
    if (v) sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(CHECKOUT_KEY);
  } catch {
    /* ignore */
  }
}

const StepHeading: React.FC<{ n: number; title: string; done?: boolean; icon: React.ReactNode }> = ({ n, title, done, icon }) => (
  <div className="flex items-center gap-3 mb-4">
    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold ${done ? 'bg-[#18181B] text-[#F5D103]' : 'bg-amber-100 text-[#B45309]'}`}>
      {done ? <CheckCircle2 className="w-4 h-4" /> : n}
    </span>
    <h2 className="font-serif-heading font-bold text-lg sm:text-xl text-[#18181B] flex items-center gap-2">{icon}{title}</h2>
  </div>
);

/** Holds the "Place order" button inside Stripe <Elements> so it can confirm the card. */
const StripePay: React.FC<{ label: string; disabled: boolean; onPlace: (confirm: (clientSecret: string, orderNumber: string) => Promise<string | null>) => void }> = ({ label, disabled, onPlace }) => {
  const stripe = useStripe();
  const elements = useElements();
  return (
    <>
      <div className="mb-4"><PaymentElement options={{ layout: 'tabs' }} /></div>
      <button
        type="button"
        disabled={disabled || !stripe || !elements}
        onClick={() =>
          onPlace(async (clientSecret, orderNumber) => {
            if (!stripe || !elements) return 'Stripe not ready';
            const submitted = await elements.submit();
            if (submitted.error) return submitted.error.message ?? 'Card error';
            const { error } = await stripe.confirmPayment({
              elements,
              clientSecret,
              confirmParams: { return_url: `${window.location.origin}/checkout?order=${encodeURIComponent(orderNumber)}` },
              redirect: 'if_required',
            });
            return error ? (error.message ?? 'Card error') : null;
          })
        }
        className="w-full py-4 rounded-full bg-[#18181B] hover:bg-[#E5A800] hover:text-[#18181B] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Lock className="w-4 h-4" />
        {label}
      </button>
    </>
  );
};

export const CheckoutPage: React.FC<CheckoutPageProps> = ({ onOpenLocationModal }) => {
  const cms = useCms();
  useSeo('checkout');
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const label = useSlotLabeller();
  const { items, cart, refresh: refreshCart, setIsCartOpen } = useCart();
  const { goToShop, goToAccount } = useNavigation();
  const { status: authStatus, isCustomer, context } = useAuth();
  const { data: addresses = [], isLoading: addressesLoading } = useAddresses(isCustomer);

  const [saved, setSaved] = useState(readSaved);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [addingAddress, setAddingAddress] = useState(false);
  const [draft, setDraft] = useState({ fullName: '', line1: '', line2: '', city: '', postcode: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [notes, setNotes] = useState('');
  const [dob, setDob] = useState('');
  const [processing, setProcessing] = useState(false);
  const [placed, setPlaced] = useState<PlaceOrderResult | null>(null);
  const [success, setSuccess] = useState<OrderView | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const returnHandled = useRef(false);

  const checkoutQuery = useQuery({
    queryKey: ['checkout', saved?.checkoutId ?? ''],
    queryFn: () => rpc<CheckoutView>('get_checkout', { p_checkout_id: saved!.checkoutId }),
    enabled: !!saved?.checkoutId && isCustomer,
    retry: false,
  });
  const checkout = checkoutQuery.data && checkoutQuery.data.status === 'open' ? checkoutQuery.data : null;

  // Pick the default (or the checkout's) address once addresses load.
  useEffect(() => {
    if (addressId || !addresses.length) return;
    setAddressId(checkout?.address?.id ?? addresses.find((a) => a.isDefault)?.id ?? addresses[0].id);
  }, [addresses, addressId, checkout?.address?.id]);
  useEffect(() => {
    if (checkout) setNotes(checkout.deliveryNotes ?? '');
  }, [checkout?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  // Back from a bank (3-D Secure) redirect: confirm the order from the URL.
  useEffect(() => {
    if (returnHandled.current || !isCustomer) return;
    const order = new URLSearchParams(window.location.search).get('order');
    if (!order) return;
    returnHandled.current = true;
    void rpc<OrderView>('confirm_order_payment', { p_order_number: order }).then((o) => {
      finish(o);
    }, (err) => setError(errorMessage(err)));
  }, [isCustomer]); // eslint-disable-line react-hooks/exhaustive-deps

  const address: Address | undefined = addresses.find((a) => a.id === addressId);
  const { data: slots = [], isLoading: slotsLoading } = useDeliverySlots(address?.deliverable ? address.postcode : null);
  const slotsByDay = useMemo(() => {
    const map = new Map<string, DeliverySlot[]>();
    for (const s of slots) map.set(s.dayLabel, [...(map.get(s.dayLabel) ?? []), s]);
    return [...map.entries()];
  }, [slots]);

  const view = checkout?.cart ?? cart;
  const totals = view?.totals;
  const holdEnds = checkout ? new Date(checkout.expiresAt).getTime() : 0;
  const holdExpired = !!checkout && (!checkout.holdActive || holdEnds <= now);
  const selectedSlot = checkout?.slot ? label(checkout.slot) : null;

  const setCheckout = (c: CheckoutView, key?: string) => {
    const next = { checkoutId: c.id, key: key ?? saved?.key ?? crypto.randomUUID() };
    if (next.checkoutId !== saved?.checkoutId) next.key = crypto.randomUUID();
    setSaved(next);
    writeSaved(next);
    qc.setQueryData(['checkout', c.id], c);
  };

  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(errorMessage(err));
      if (isApiError(err, 'SLOT_HOLD_EXPIRED') || isApiError(err, 'NOT_FOUND')) {
        writeSaved(null);
        setSaved(null);
      }
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const chooseSlot = (slot: DeliverySlot) =>
    run(async () => {
      soundEffects.playTap();
      const c = checkout && !holdExpired
        ? await rpc<CheckoutView>('update_checkout', { p_checkout_id: checkout.id, p: { slotId: slot.id, ...(checkout.address?.id !== addressId ? { addressId } : {}) } })
        : await rpc<CheckoutView>('start_checkout', { p_slot_id: slot.id, p_address_id: addressId });
      setCheckout(c);
      void refreshCart();
    });

  const chooseAddress = (id: string) => {
    setAddressId(id);
    // a different address may be in another zone: the slot is chosen again for it
    if (checkout && checkout.address?.id !== id) {
      writeSaved(null);
      setSaved(null);
    }
  };

  const update = (p: Record<string, unknown>) =>
    checkout && run(async () => setCheckout(await rpc<CheckoutView>('update_checkout', { p_checkout_id: checkout.id, p })));

  const addAddress = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const a = await saveAddress({ ...draft, line2: draft.line2 || null, phone: draft.phone || null });
      await qc.invalidateQueries({ queryKey: accountKeys.addresses });
      setAddressId(a.id);
      setAddingAddress(false);
      setDraft({ fullName: '', line1: '', line2: '', city: '', postcode: '', phone: '' });
    });
  };

  const finish = (o: OrderView) => {
    soundEffects.playOrderSuccess();
    writeSaved(null);
    setSaved(null);
    setSuccess(o);
    void refreshCart();
    void qc.invalidateQueries({ queryKey: ['account'] });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const place = async (confirmCard?: (clientSecret: string, orderNumber: string) => Promise<string | null>) => {
    if (!checkout || !saved) return;
    setProcessing(true);
    setError(null);
    try {
      const res = placed ?? await rpc<PlaceOrderResult>('place_order', {
        p_checkout_id: checkout.id,
        p_idempotency_key: saved.key,
        p_accept_terms: acceptTerms,
        p_terms_version: checkout.termsVersion,
        p_expected_total_minor: checkout.cart.totals.total.amount,
      });
      setPlaced(res);
      if (res.mode === 'stripe') {
        if (!confirmCard || !res.clientSecret) throw new Error('card');
        const cardError = await confirmCard(res.clientSecret, res.orderNumber);
        if (cardError) {
          setError(cardError);
          return;
        }
      }
      const order = await rpc<OrderView>('confirm_order_payment', { p_order_number: res.orderNumber });
      finish(order);
    } catch (err) {
      setError(errorMessage(err));
      if (isApiError(err, 'PRICE_CHANGED') || isApiError(err, 'SLOT_HOLD_EXPIRED')) void checkoutQuery.refetch();
    } finally {
      setProcessing(false);
    }
  };

  // ── success ────────────────────────────────────────────────────────────────────────────────
  if (success) {
    const slot = success.slot ? label(success.slot) : null;
    const pending = success.status === 'pending_payment';
    const steps = ['placed', 'picking', 'out_for_delivery', 'delivered'] as const;
    const stepLabels = [cms.t('checkout.success.step_placed'), cms.t('checkout.success.step_picking'), cms.t('checkout.success.step_dispatch'), cms.t('checkout.success.step_delivered')];
    const reached = success.timeline.map((t) => t.status);
    return (
      <div className="min-h-screen bg-[#F8FAFC] py-8 sm:py-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }} className="bg-white rounded-3xl border border-stone-200/90 shadow-xl overflow-hidden">
            <div className="bg-[#18181B] text-white p-8 sm:p-10 text-center">
              <div className="w-20 h-20 rounded-full bg-[#F5D103] text-[#18181B] flex items-center justify-center mx-auto mb-4 shadow-lg">
                <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
              </div>
              <span className="inline-block text-xs font-extrabold uppercase tracking-widest bg-white/15 px-3 py-1 rounded-full mb-2">{cms.t('checkout.success.badge')}</span>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-2">{cms.t('checkout.success.title', { name: context?.customer?.firstName ?? '' })}</h1>
              <p className="text-stone-300 text-sm sm:text-base max-w-md mx-auto">
                <InlineText text={pending ? cms.t('checkout.success.pending') : cms.t('checkout.success.text', { number: success.orderNumber })} strongClass="text-[#F5D103]" />
              </p>
              {slot && <p className="mt-3 text-sm"><InlineText text={cms.t('checkout.success.slot', { slot: `${slot.dayLabel}, ${slot.timeLabel}` })} /></p>}
            </div>
            <div className="p-6 sm:p-8 border-b border-stone-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-5">{cms.t('checkout.success.progress')}</h3>
              <ol className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {steps.map((s, i) => {
                  const done = reached.includes(s) || (s === 'picking' && reached.some((r) => ['picked', 'paid'].includes(r)));
                  return (
                    <li key={s} className="flex items-start gap-3 sm:flex-col sm:items-center sm:text-center">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${done ? 'bg-[#18181B] text-[#F5D103]' : 'bg-stone-100 text-stone-400'}`}>{done ? '✓' : i + 1}</span>
                      <span className="text-xs font-bold text-[#18181B]">{stepLabels[i]}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="p-6 sm:p-8 space-y-3">
              {success.lines.map((l) => (
                <div key={l.id} className="flex items-center gap-3 text-sm">
                  <Picture image={l.image} alt="" className="w-10 h-10 rounded-lg object-cover bg-stone-50" />
                  <span className="flex-1 min-w-0 truncate">{l.quantityOrdered != null ? `${l.quantityOrdered} × ` : `${formatGrams(l.weightOrderedGrams ?? 0)} `}{l.name}</span>
                  <span className="font-bold">{formatMoney(l.estimatedTotal)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-3 border-t border-stone-200 font-extrabold">
                <span>{cms.t('checkout.summary.total')}</span>
                <span>{formatMoney(success.totals.estimated.total)}</span>
              </div>
              {context?.email && <p className="text-xs text-stone-500">{cms.t('checkout.success.email_note', { email: context.email })}</p>}
            </div>
            <div className="p-6 sm:p-8 bg-stone-50 flex flex-wrap gap-3 justify-center">
              <button type="button" onClick={() => window.print()} className="px-5 py-2.5 rounded-full border border-stone-300 bg-white text-xs font-bold flex items-center gap-2 cursor-pointer"><Printer className="w-4 h-4" />{cms.t('checkout.success.print')}</button>
              <button type="button" onClick={() => goToAccount(`orders/${success.orderNumber}`)} className="px-5 py-2.5 rounded-full bg-[#18181B] text-[#F5D103] text-xs font-bold cursor-pointer">{cms.t('checkout.success.view')}</button>
              <button type="button" onClick={() => goToShop()} className="px-5 py-2.5 rounded-full bg-[#F5D103] text-[#18181B] text-xs font-bold cursor-pointer">{cms.t('checkout.success.continue')}</button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-[70vh] bg-[#F8FAFC] py-12 px-4 flex items-center justify-center">
      <div className="bg-white rounded-3xl border border-stone-200 p-8 sm:p-12 text-center max-w-md shadow-sm">{children}</div>
    </div>
  );

  if (!items.length && !checkout) {
    return shell(
      <>
        <div className="w-16 h-16 rounded-full bg-amber-100 text-[#B45309] flex items-center justify-center mx-auto mb-4"><ShoppingBag className="w-8 h-8" /></div>
        <h1 className="font-serif-heading font-bold text-2xl text-[#18181B] mb-2">{cms.t('checkout.main.empty_title')}</h1>
        <p className="text-sm text-[#737A72] mb-6">{cms.t('checkout.main.empty_text')}</p>
        <button type="button" onClick={() => goToShop()} className="px-6 py-3 rounded-full bg-[#18181B] text-[#F5D103] text-xs font-bold cursor-pointer">{cms.t('checkout.main.empty_button')}</button>
      </>,
    );
  }

  if (authStatus !== 'loading' && !isCustomer) {
    return shell(
      <>
        <div className="w-16 h-16 rounded-full bg-amber-100 text-[#B45309] flex items-center justify-center mx-auto mb-4"><Lock className="w-8 h-8" /></div>
        <h1 className="font-serif-heading font-bold text-2xl text-[#18181B] mb-2">{cms.t('checkout.main.sign_in_title')}</h1>
        <p className="text-sm text-[#737A72] mb-6">{cms.t('checkout.main.sign_in_text')}</p>
        <button type="button" onClick={() => goToAccount('sign-in?next=/checkout')} className="px-6 py-3 rounded-full bg-[#18181B] text-[#F5D103] text-xs font-bold cursor-pointer">{cms.t('checkout.main.sign_in_button')}</button>
      </>,
    );
  }

  const paymentMode = checkout?.paymentMode;
  const total = totals ? formatMoney(totals.total) : '';
  const ageOk = !checkout?.ageCheck.required || checkout.ageCheck.confirmed;
  const canPlace = !!checkout && !holdExpired && acceptTerms && ageOk && !busy && !processing;

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10">
        <button type="button" onClick={() => goToShop()} className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-600 hover:text-[#B45309] mb-4 cursor-pointer">
          <ArrowLeft className="w-4 h-4" />{cms.t('checkout.main.back')}
        </button>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-6">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-[#B45309] block mb-1">{cms.t('checkout.main.eyebrow')}</span>
            <h1 className="font-serif-heading text-3xl sm:text-4xl font-bold text-[#18181B]">{cms.t('checkout.main.title')}</h1>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500"><ShieldCheck className="w-4 h-4 text-[#B45309]" />{cms.t('checkout.main.secure')}</span>
        </div>
        {paymentMode === 'simulated' && (
          <div className="mb-5 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs font-semibold text-[#92400E] flex items-center gap-2" role="note">
            <AlertTriangle className="w-4 h-4 shrink-0" />{cms.t('checkout.main.test_mode')}
          </div>
        )}
        {error && (
          <div className="mb-5 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-sm font-semibold text-rose-700" role="alert">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-5">
            {/* 1. Address */}
            <section className={card}>
              <StepHeading n={1} title={cms.t('checkout.address.title')} done={!!address?.deliverable} icon={<MapPin className="w-4 h-4 text-[#B45309]" />} />
              {addressesLoading ? (
                <p className="text-sm text-stone-500">{cms.t('global.common.loading')}</p>
              ) : (
                <div className="space-y-2">
                  {addresses.map((a) => (
                    <label key={a.id} className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-colors ${a.id === addressId ? 'border-[#F5D103] bg-amber-50/50' : 'border-stone-200 hover:border-stone-300'}`}>
                      <input type="radio" name="address" checked={a.id === addressId} onChange={() => chooseAddress(a.id)} className="mt-1 accent-[#F5D103]" />
                      <span className="text-sm">
                        <strong className="text-[#18181B]">{a.label}</strong> · {a.fullName}<br />
                        <span className="text-stone-600">{[a.line1, a.line2, a.city, a.postcode].filter(Boolean).join(', ')}</span>
                        {!a.deliverable && <span className="block text-xs font-semibold text-rose-600 mt-1">{cms.t('checkout.address.not_served')}</span>}
                      </span>
                    </label>
                  ))}
                  {addingAddress ? (
                    <form onSubmit={addAddress} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl border border-stone-200 bg-stone-50/60">
                      <label className="sm:col-span-2 text-xs font-semibold text-[#18181B]">{cms.t('checkout.address.full_name')}
                        <input required autoComplete="name" className={field} value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} />
                      </label>
                      <label className="sm:col-span-2 text-xs font-semibold text-[#18181B]">{cms.t('checkout.address.line1')}
                        <input required autoComplete="address-line1" placeholder={cms.t('checkout.address.line1_placeholder')} className={field} value={draft.line1} onChange={(e) => setDraft({ ...draft, line1: e.target.value })} />
                      </label>
                      <label className="sm:col-span-2 text-xs font-semibold text-[#18181B]">{cms.t('checkout.address.line2')}
                        <input autoComplete="address-line2" placeholder={cms.t('checkout.address.line2_placeholder')} className={field} value={draft.line2} onChange={(e) => setDraft({ ...draft, line2: e.target.value })} />
                      </label>
                      <label className="text-xs font-semibold text-[#18181B]">{cms.t('checkout.address.city')}
                        <input required autoComplete="address-level2" className={field} value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
                      </label>
                      <label className="text-xs font-semibold text-[#18181B]">{cms.t('checkout.address.postcode')}
                        <input required autoComplete="postal-code" className={`${field} uppercase`} value={draft.postcode} onChange={(e) => setDraft({ ...draft, postcode: e.target.value.toUpperCase() })} />
                      </label>
                      <label className="sm:col-span-2 text-xs font-semibold text-[#18181B]">{cms.t('checkout.address.phone')}
                        <input type="tel" autoComplete="tel" placeholder={cms.t('checkout.address.phone_placeholder')} className={field} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                      </label>
                      <div className="sm:col-span-2 flex gap-2">
                        <button type="submit" disabled={busy} className="px-5 py-2.5 rounded-full bg-[#18181B] text-[#F5D103] text-xs font-bold cursor-pointer disabled:opacity-60">{cms.t('checkout.address.save')}</button>
                        <button type="button" onClick={() => setAddingAddress(false)} className="px-5 py-2.5 rounded-full border border-stone-300 text-xs font-bold cursor-pointer">{cms.t('checkout.address.cancel')}</button>
                      </div>
                    </form>
                  ) : (
                    <button type="button" onClick={() => setAddingAddress(true)} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#B45309] hover:underline cursor-pointer pt-1"><Plus className="w-3.5 h-3.5" />{cms.t('checkout.address.add')}</button>
                  )}
                </div>
              )}
            </section>

            {/* 2. Slot */}
            <section className={card}>
              <StepHeading n={2} title={cms.t('checkout.slot.title')} done={!!checkout && !holdExpired} icon={<Truck className="w-4 h-4 text-[#B45309]" />} />
              {!address?.deliverable ? (
                <p className="text-sm text-stone-500">{cms.t('checkout.slot.pick_address_first')}</p>
              ) : slotsLoading ? (
                <p className="text-sm text-stone-500">{cms.t('global.common.loading')}</p>
              ) : !slots.length ? (
                <p className="text-sm text-stone-500">{cms.t('checkout.slot.none')}</p>
              ) : (
                <div className="space-y-4">
                  {slotsByDay.map(([day, list]) => (
                    <div key={day}>
                      <p className="text-xs font-extrabold uppercase tracking-wider text-stone-500 mb-2">{day}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {list.map((s) => {
                          const selected = checkout?.slot?.id === s.id && !holdExpired;
                          const full = s.availability === 'full' && !selected;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              disabled={full || busy}
                              onClick={() => void chooseSlot(s)}
                              aria-pressed={selected}
                              className={`text-left p-3 rounded-2xl border transition-all cursor-pointer disabled:cursor-not-allowed ${selected ? 'border-[#F5D103] bg-amber-50/60 shadow-xs' : full ? 'border-stone-100 bg-stone-50 text-stone-400' : 'border-stone-200 hover:border-stone-300 bg-white'}`}
                            >
                              <span className="block text-sm font-bold text-[#18181B]">{s.timeLabel}</span>
                              {s.serviceLabel && <span className="block text-[11px] text-stone-500">{s.serviceLabel}</span>}
                              <span className="block text-[11px] font-semibold mt-1">
                                {full ? cms.t('checkout.slot.full')
                                  : s.availability === 'limited' ? <span className="text-[#B45309]">{cms.t('checkout.slot.limited', { count: s.remaining })}</span>
                                  : s.surcharge ? cms.t('checkout.slot.surcharge', { amount: formatMoney(s.surcharge) }) : ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {checkout && (
                    <p className={`text-xs font-semibold flex items-center gap-1.5 ${holdExpired ? 'text-rose-600' : 'text-[#B45309]'}`}>
                      <Clock className="w-3.5 h-3.5" />
                      {holdExpired ? cms.t('checkout.slot.expired') : cms.t('checkout.slot.held', { time: new Date(holdEnds).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) })}
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* 3. Preferences */}
            {checkout && (
              <section className={card}>
                <StepHeading n={3} title={cms.t('checkout.details.title')} done={ageOk} icon={<Leaf className="w-4 h-4 text-[#B45309]" />} />
                <label className="block text-xs font-semibold text-[#18181B] mb-4">{cms.t('checkout.details.notes')}
                  <textarea rows={2} maxLength={500} placeholder={cms.t('checkout.details.notes_placeholder')} className={`${field} mt-1`} value={notes}
                    onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (checkout.deliveryNotes ?? '') && void update({ deliveryNotes: notes })} />
                </label>
                <fieldset className="mb-2">
                  <legend className="text-xs font-semibold text-[#18181B] mb-2">{cms.t('checkout.details.subs')}</legend>
                  {(['allow', 'dont_allow'] as const).map((v) => (
                    <label key={v} className="flex items-center gap-2 text-sm text-stone-700 mb-1.5 cursor-pointer">
                      <input type="radio" name="subs" checked={checkout.substitutionDefault === v} onChange={() => void update({ substitutionDefault: v })} className="accent-[#F5D103]" />
                      {v === 'allow' ? cms.t('checkout.details.subs_allow') : cms.t('checkout.details.subs_dont')}
                    </label>
                  ))}
                </fieldset>
                {checkout.ageCheck.required && (
                  <div className="mt-4 p-4 rounded-2xl border border-amber-200 bg-amber-50/60">
                    <p className="text-sm font-bold text-[#18181B] mb-1">{cms.t('checkout.details.age_title')}</p>
                    <p className="text-xs text-stone-600 mb-3">{cms.t('checkout.details.age_text', { age: checkout.ageCheck.minAge ?? '' })}</p>
                    {checkout.ageCheck.confirmed ? (
                      <p className="text-xs font-bold text-[#92400E]">{cms.t('checkout.details.age_confirmed')}</p>
                    ) : (
                      <div className="flex items-end gap-2">
                        <label className="text-xs font-semibold text-[#18181B]">{cms.t('checkout.details.age_label')}
                          <input type="date" className={field} value={dob} onChange={(e) => setDob(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
                        </label>
                        <button type="button" disabled={!dob || busy} onClick={() => void update({ dateOfBirth: dob })} className="px-4 py-2.5 rounded-xl bg-[#18181B] text-[#F5D103] text-xs font-bold cursor-pointer disabled:opacity-50">{cms.t('checkout.details.age_confirm')}</button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* 4. Payment */}
            {checkout && (
              <section className={card}>
                <StepHeading n={4} title={cms.t('checkout.payment.title')} icon={<Lock className="w-4 h-4 text-[#B45309]" />} />
                <p className="text-xs text-stone-600 mb-4">{paymentMode === 'simulated' ? cms.t('checkout.payment.simulated') : cms.t('checkout.payment.card_note')}</p>
                {checkout.authAmount && checkout.authAmount.amount > checkout.cart.totals.total.amount && (
                  <p className="text-xs text-stone-500 mb-4">{cms.t('checkout.payment.auth_note', { amount: formatMoney(checkout.authAmount) })}</p>
                )}
                <label className="flex items-start gap-2.5 text-xs text-stone-700 mb-4 cursor-pointer">
                  <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#F5D103]" />
                  <span><InlineText text={cms.t('checkout.payment.terms')} /></span>
                </label>
                {processing && <p className="text-xs font-semibold text-[#B45309] mb-3" aria-live="polite">{cms.t('checkout.payment.processing')}</p>}
                {paymentMode === 'stripe' ? (
                  stripeKey ? (
                    <Elements stripe={getStripe()} options={{ mode: 'payment', amount: (checkout.authAmount ?? checkout.cart.totals.total).amount, currency: checkout.cart.currency.toLowerCase(), captureMethod: 'manual', appearance: { theme: 'stripe', variables: { colorPrimary: '#18181B', borderRadius: '12px' } } }}>
                      <StripePay label={cms.t('checkout.payment.pay', { total })} disabled={!canPlace} onPlace={(confirm) => void place(confirm)} />
                    </Elements>
                  ) : (
                    <p className="text-sm font-semibold text-rose-600">{cms.t('checkout.payment.unavailable')}</p>
                  )
                ) : (
                  <button type="button" disabled={!canPlace} onClick={() => void place()} className="w-full py-4 rounded-full bg-[#18181B] hover:bg-[#E5A800] hover:text-[#18181B] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                    <Lock className="w-4 h-4" />{cms.t('checkout.payment.place', { total })}
                  </button>
                )}
              </section>
            )}
          </div>

          {/* Summary */}
          <aside className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
            <div className={card}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-serif-heading font-bold text-lg text-[#18181B]">{cms.t('checkout.summary.title')}</h2>
                <button type="button" onClick={() => setIsCartOpen(true)} className="text-xs font-bold text-[#B45309] hover:underline cursor-pointer">{cms.t('checkout.summary.edit')}</button>
              </div>
              <ul className="divide-y divide-stone-100 max-h-72 overflow-y-auto mb-4" data-lenis-prevent="true">
                {(view?.lines ?? []).map((l) => (
                  <li key={l.id} className="py-2.5 flex items-center gap-3 text-sm">
                    <Picture image={l.product.image} alt="" className="w-11 h-11 rounded-lg object-cover bg-stone-50 border border-stone-100" />
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-[#18181B] truncate">{l.product.name}</span>
                      <span className="text-xs text-stone-500">{l.quantity != null ? `× ${l.quantity}` : formatGrams(l.weightGrams ?? 0)}</span>
                    </span>
                    <span className="font-bold">{formatMoney(l.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              {totals && (
                <div className="space-y-1.5 text-sm text-stone-600 border-t border-stone-200 pt-3">
                  <div className="flex justify-between"><span>{cms.t('checkout.summary.subtotal')}</span><span className="font-semibold text-[#18181B]">{formatMoney(totals.itemsSubtotal)}</span></div>
                  {(view?.appliedPromotions ?? []).filter((p) => p.type !== 'free_delivery').map((p) => (
                    <div key={p.promotionId} className="flex justify-between text-[#92400E] font-semibold"><span className="truncate pr-2">{p.label}</span><span>-{formatMoney(p.discount)}</span></div>
                  ))}
                  {totals.depositTotal.amount > 0 && <div className="flex justify-between"><span>{cms.t('basket.drawer.deposit')}</span><span>{formatMoney(totals.depositTotal)}</span></div>}
                  <div className="flex justify-between">
                    <span>{cms.t('checkout.summary.delivery')}{selectedSlot ? ` · ${selectedSlot.dayLabel} ${selectedSlot.timeLabel}` : ''}</span>
                    <span className="font-semibold text-[#18181B]">{totals.deliveryFee.amount === 0 ? cms.t('checkout.summary.free') : formatMoney(totals.deliveryFee)}</span>
                  </div>
                  <div className="flex justify-between text-base font-extrabold text-[#18181B] pt-2 border-t border-stone-200">
                    <span>{cms.t('checkout.summary.total')}</span><span>{total}</span>
                  </div>
                  <p className="text-[11px] text-stone-400">{cms.t('checkout.summary.vat', { vat: formatMoney(totals.vatTotal) })}</p>
                  {totals.isEstimate && <p className="text-[11px] text-stone-500">{cms.t('checkout.summary.estimate')}</p>}
                </div>
              )}
              {!checkout && onOpenLocationModal && !cart?.postcode && (
                <button type="button" onClick={onOpenLocationModal} className="mt-3 text-xs font-bold text-[#B45309] hover:underline cursor-pointer">{cms.t('global.header.location_title')}</button>
              )}
            </div>
            {cms.get('checkout.summary.promises').length > 0 && (
              <div className={`${card} text-xs`}>
                <h3 className="font-bold text-sm text-[#18181B] mb-3">{cms.t('checkout.summary.promise_title')}</h3>
                <ul className="space-y-2 text-stone-600">
                  {cms.get('checkout.summary.promises').map((p, i) => (
                    <li key={i}><strong className="text-[#18181B]">{p.title}</strong> {p.text}</li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};
