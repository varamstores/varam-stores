import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Truck, MapPin, Heart, Award, ChevronRight, ArrowLeft, Download, Trash2, Check } from 'lucide-react';
import { rpc } from '../../lib/api';
import { formatMoney, formatGrams } from '../../lib/money';
import { accountKeys, saveAddress, useAddresses, useBuyAgain, useMyOrder, useMyOrders, usePreferences, useProfile, type Preferences } from '../../lib/account';
import { useSlotLabeller } from '../../lib/delivery';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { useNavigation } from '../../context/NavigationContext';
import { useCms } from '../../cms/CmsProvider';
import { Picture } from '../../cms/components';
import { useErrorMessage } from '../../cms/hooks';
import { ProductCard } from '../ProductCard';
import type { Address, CartView, OrderStatus, OrderSummary } from '../../types/api';
import { inputClass } from './AuthScreens';

const panel = 'bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-7 shadow-2xs';
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });

export interface Loyalty {
  enabled: boolean;
  balance: number;
  lifetime: number;
  tier: { code: string; name: string } | null;
  nextTier: { code: string; name: string; pointsNeeded: number } | null;
  pointValue: { amount: number; currency: string };
  pointsPerPound: number;
}

export function useLoyalty(enabled = true) {
  return useQuery({ queryKey: accountKeys.loyalty, queryFn: () => rpc<Loyalty>('get_my_loyalty'), enabled });
}

export function useStatusLabel() {
  const cms = useCms();
  return (s: OrderStatus): string => {
    const v = cms.lookup(`account.status.${s}`);
    return typeof v === 'string' ? v : s;
  };
}

const StatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const label = useStatusLabel();
  const tone = status === 'cancelled' ? 'bg-stone-100 text-stone-600 border-stone-200'
    : status === 'delivered' ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
    : 'bg-amber-100 text-[#92400E] border-amber-200/60';
  return <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${tone}`}>{label(status)}</span>;
};

const OrderRow: React.FC<{ o: OrderSummary }> = ({ o }) => {
  const cms = useCms();
  const label = useSlotLabeller();
  const { goToAccount } = useNavigation();
  const slot = o.slot ? label(o.slot) : null;
  return (
    <button type="button" onClick={() => goToAccount(`orders/${o.orderNumber}`)} className="w-full text-left p-4 rounded-2xl border border-stone-200 hover:border-[#F5D103] transition-colors cursor-pointer flex items-center gap-4">
      <div className="flex -space-x-2 shrink-0">
        {o.images.slice(0, 3).map((img, i) => <Picture key={i} image={img} alt="" className="w-10 h-10 rounded-lg object-cover border-2 border-white bg-stone-50" />)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-xs font-bold text-stone-700">{o.orderNumber}</span>
          <StatusBadge status={o.status} />
        </div>
        <p className="text-xs text-stone-500 truncate">
          {slot ? cms.t('account.orders.delivery', { slot: `${slot.dayLabel}, ${slot.timeLabel}` }) : dateFmt.format(new Date(o.createdAt))} · {cms.t('account.orders.items', { count: o.itemCount })}
        </p>
      </div>
      <span className="text-sm font-extrabold text-[#18181B]">{formatMoney(o.total)}</span>
      <ChevronRight className="w-4 h-4 text-stone-400" />
    </button>
  );
};

const RewardsSlot = React.lazy(() => import('./AdvancedTabs').then((m) => ({ default: m.RewardsPanel })));

export const OverviewTab: React.FC = () => {
  const cms = useCms();
  const { context } = useAuth();
  const { goToShop, goToAccount, goToWishlist } = useNavigation();
  const { wishlistCount } = useWishlist();
  const { data: active } = useMyOrders('active');
  const { data: past } = useMyOrders('past');
  const { data: loyalty } = useLoyalty();
  const { data: buyAgain = [] } = useBuyAgain();
  const c = context?.customer;
  const next = active?.items[0];
  const stats = [
    { icon: Truck, label: cms.t('account.overview.active_orders'), value: active?.total ?? 0, go: () => goToAccount('orders') },
    { icon: Package, label: cms.t('account.overview.past_orders'), value: past?.total ?? 0, go: () => goToAccount('orders?state=past') },
    { icon: Heart, label: cms.t('account.overview.saved_items'), value: wishlistCount, go: goToWishlist },
    ...(loyalty?.enabled ? [{ icon: Award, label: cms.t('account.overview.points'), value: loyalty.balance, go: () => goToAccount() }] : []),
  ];
  return (
    <div className="space-y-5">
      <div className={panel}>
        <h1 className="font-serif-heading font-bold text-2xl sm:text-3xl text-[#18181B]">{cms.t('account.overview.greeting', { name: c?.firstName ?? '' })}</h1>
        {c && <p className="text-xs text-stone-500 mt-1">{cms.t('account.overview.member_since', { date: dateFmt.format(new Date(c.memberSince)) })}</p>}
        {loyalty?.enabled && loyalty.tier && (
          <p className="text-xs font-semibold text-[#B45309] mt-2">
            {cms.t('account.overview.tier', { tier: loyalty.tier.name })}
            {loyalty.nextTier && ` · ${cms.t('account.overview.next_tier', { points: loyalty.nextTier.pointsNeeded, tier: loyalty.nextTier.name })}`}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((s) => (
          <button key={s.label} type="button" onClick={s.go} className="text-left p-4 rounded-2xl bg-white border border-stone-200 hover:border-[#F5D103] cursor-pointer">
            <s.icon className="w-5 h-5 text-[#B45309] mb-2" />
            <span className="block text-xl font-extrabold text-[#18181B]">{s.value}</span>
            <span className="text-[11px] text-stone-500">{s.label}</span>
          </button>
        ))}
      </div>
      <div className={panel}>
        <h2 className="font-bold text-base text-[#18181B] mb-3">{cms.t('account.overview.next_delivery')}</h2>
        {next ? <OrderRow o={next} /> : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-stone-500">{cms.t('account.overview.no_active')}</p>
            <button type="button" onClick={() => goToShop()} className="px-4 py-2 rounded-full bg-[#F5D103] text-[#18181B] text-xs font-bold cursor-pointer shrink-0">{cms.t('account.overview.shop_now')}</button>
          </div>
        )}
      </div>
      <React.Suspense fallback={null}><RewardsSlot /></React.Suspense>
      {buyAgain.length > 0 && (
        <div>
          <h2 className="font-bold text-base text-[#18181B] mb-3">{cms.t('account.overview.buy_again')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {buyAgain.slice(0, 8).map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </div>
      )}
    </div>
  );
};

export const OrdersTab: React.FC<{ orderNumber: string | null }> = ({ orderNumber }) => {
  const cms = useCms();
  const initialPast = new URLSearchParams(window.location.search).get('state') === 'past';
  const [state, setState] = useState<'active' | 'past'>(initialPast ? 'past' : 'active');
  const { data, isLoading } = useMyOrders(state);
  if (orderNumber) return <OrderDetail orderNumber={orderNumber} />;
  return (
    <div className={panel}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-serif-heading font-bold text-2xl text-[#18181B]">{cms.t('account.orders.title')}</h1>
        <div className="flex gap-1 p-1 rounded-full bg-stone-100">
          {(['active', 'past'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setState(s)} aria-pressed={state === s} className={`px-4 py-1.5 rounded-full text-xs font-bold cursor-pointer ${state === s ? 'bg-white shadow-xs text-[#18181B]' : 'text-stone-500'}`}>
              {s === 'active' ? cms.t('account.orders.active') : cms.t('account.orders.past')}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? <p className="text-sm text-stone-500">{cms.t('global.common.loading')}</p>
        : !data?.items.length ? <p className="text-sm text-stone-500">{state === 'active' ? cms.t('account.orders.none_active') : cms.t('account.orders.none_past')}</p>
        : <div className="space-y-2.5">{data.items.map((o) => <OrderRow key={o.orderNumber} o={o} />)}</div>}
    </div>
  );
};

const OrderDetail: React.FC<{ orderNumber: string }> = ({ orderNumber }) => {
  const cms = useCms();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const label = useSlotLabeller();
  const statusLabel = useStatusLabel();
  const { goToAccount } = useNavigation();
  const { showToast, refresh } = useCart();
  const { data: o, isLoading, isError } = useMyOrder(orderNumber);
  const [busy, setBusy] = useState(false);
  const [weeks, setWeeks] = useState(14);
  if (isLoading) return <div className={panel}><p className="text-sm text-stone-500">{cms.t('global.common.loading')}</p></div>;
  if (isError || !o) return <div className={panel}><p className="text-sm text-stone-500">{cms.t('global.errors.not_found')}</p></div>;
  const slot = o.slot ? label(o.slot) : null;
  const final = o.totals.final;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      showToast(ok);
      await qc.invalidateQueries({ queryKey: ['account'] });
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <button type="button" onClick={() => goToAccount('orders')} className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-600 hover:text-[#B45309] cursor-pointer">
        <ArrowLeft className="w-4 h-4" />{cms.t('account.orders.back')}
      </button>
      <div className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h1 className="font-mono font-bold text-xl text-[#18181B]">{o.orderNumber}</h1>
          <StatusBadge status={o.status} />
        </div>
        <p className="text-xs text-stone-500">{cms.t('account.orders.placed_on', { date: dateFmt.format(new Date(o.placedAt ?? o.createdAt)) })}</p>
        {slot && <p className="text-sm font-semibold text-[#18181B] mt-2">{cms.t('account.orders.delivery', { slot: `${slot.dayLabel}, ${slot.timeLabel}` })}</p>}
        <p className="text-xs text-stone-500 mt-1">{[o.address.line1, o.address.line2, o.address.city, o.address.postcode].filter(Boolean).join(', ')}</p>
        {o.tracking && (
          <div className="mt-4 p-3 rounded-2xl bg-amber-50 border border-amber-200/70 text-sm">
            <p className="font-bold text-[#18181B]">{cms.t('account.orders.tracking')}</p>
            {o.tracking.driverFirstName && <p>{cms.t('account.orders.driver', { name: o.tracking.driverFirstName })}</p>}
            {o.tracking.etaStart && o.tracking.etaEnd && (
              <p>{cms.t('account.orders.eta', { window: `${new Date(o.tracking.etaStart).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })} – ${new Date(o.tracking.etaEnd).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}` })}</p>
            )}
          </div>
        )}
        <ol className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
          {o.timeline.map((t, i) => (
            <li key={i} className="text-xs text-stone-600 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-[#B45309]" />
              <strong className="text-[#18181B]">{statusLabel(t.status)}</strong>
              <span>{new Date(t.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className={panel}>
        <ul className="divide-y divide-stone-100">
          {o.lines.map((l) => (
            <li key={l.id} className="py-3 flex items-center gap-3 text-sm">
              <Picture image={l.image} alt="" className="w-12 h-12 rounded-lg object-cover bg-stone-50 border border-stone-100" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#18181B] truncate">{l.name}</p>
                <p className="text-xs text-stone-500">
                  {l.quantityOrdered != null ? `× ${l.quantityOrdered}` : formatGrams(l.weightOrderedGrams ?? 0)}
                  {l.status === 'picked' && l.weightPickedGrams != null && ` · ${cms.t('account.orders.picked', { amount: formatGrams(l.weightPickedGrams) })}`}
                  {l.status === 'substituted' && ` · ${cms.t('account.orders.substituted')}`}
                  {l.status === 'missing' && ` · ${cms.t('account.orders.missing')}`}
                </p>
              </div>
              <span className="font-bold">{formatMoney(l.finalTotal ?? l.estimatedTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-stone-200 pt-3 mt-2 space-y-1 text-sm">
          {o.promotions.map((p, i) => <div key={i} className="flex justify-between text-[#92400E] font-semibold"><span>{p.label}</span><span>-{formatMoney(p.discount)}</span></div>)}
          <div className="flex justify-between"><span className="text-stone-600">{cms.t('checkout.summary.delivery')}</span><span>{o.totals.estimated.delivery.amount === 0 ? cms.t('checkout.summary.free') : formatMoney(o.totals.estimated.delivery)}</span></div>
          <div className="flex justify-between text-base font-extrabold text-[#18181B] pt-1">
            <span>{final ? cms.t('account.orders.final') : cms.t('account.orders.estimated')}</span>
            <span>{formatMoney((final ?? o.totals.estimated).total)}</span>
          </div>
          {o.payment?.last4 && <p className="text-xs text-stone-500">{cms.t('account.orders.payment', { method: `${o.payment.brand ?? ''} •••• ${o.payment.last4}`.trim() })}</p>}
          {o.invoice && <p className="text-xs text-stone-500">{cms.t('account.orders.invoice', { number: o.invoice.number })}</p>}
        </div>
        <div className="flex flex-wrap gap-2 mt-5">
          {o.canReorder && (
            <button type="button" disabled={busy} onClick={() => void act(async () => { const v = await rpc<CartView>('reorder', { p_order_number: o.orderNumber }); void v; await refresh(); }, cms.t('account.orders.reordered'))}
              className="px-5 py-2.5 rounded-full bg-[#F5D103] text-[#18181B] text-xs font-bold cursor-pointer disabled:opacity-50">{cms.t('account.orders.reorder')}</button>
          )}
          {o.status === 'delivered' && (
            <span className="inline-flex items-center gap-2">
              <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} aria-label={cms.t('account.orders.repeat_every')} className="text-xs border border-stone-200 rounded-full px-3 py-2 bg-white">
                {[7, 14, 21, 28].map((d) => <option key={d} value={d}>{d === 7 ? cms.t('account.orders.week') : cms.t('account.orders.weeks', { weeks: d / 7 })}</option>)}
              </select>
              <button type="button" disabled={busy} onClick={() => void act(() => rpc('create_repeat_from_order', { p_order_number: o.orderNumber, p_frequency_days: weeks }), cms.t('account.orders.repeat_created'))}
                className="px-5 py-2.5 rounded-full border border-stone-300 text-xs font-bold text-[#18181B] cursor-pointer disabled:opacity-50">{cms.t('account.orders.repeat')}</button>
            </span>
          )}
          {o.canCancel && (
            <button type="button" disabled={busy} onClick={() => { if (window.confirm(cms.t('account.orders.cancel_confirm'))) void act(() => rpc('cancel_my_order', { p_order_number: o.orderNumber }), cms.t('account.orders.cancelled')); }}
              className="px-5 py-2.5 rounded-full border border-stone-300 text-xs font-bold text-stone-700 cursor-pointer disabled:opacity-50">{cms.t('account.orders.cancel')}</button>
          )}
        </div>
      </div>
    </div>
  );
};

const emptyAddress = { label: '', fullName: '', line1: '', line2: '', city: '', postcode: '', phone: '', deliveryNotes: '' };

export const AddressesTab: React.FC = () => {
  const cms = useCms();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { showToast } = useCart();
  const { data: addresses = [], isLoading } = useAddresses();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState(emptyAddress);
  const [busy, setBusy] = useState(false);

  const start = (a?: Address) => {
    setEditing(a?.id ?? 'new');
    setDraft(a ? { label: a.label, fullName: a.fullName, line1: a.line1, line2: a.line2 ?? '', city: a.city, postcode: a.postcode, phone: a.phone ?? '', deliveryNotes: a.deliveryNotes ?? '' } : emptyAddress);
  };
  const call = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: accountKeys.addresses });
      showToast(cms.t('global.toasts.saved'));
      setEditing(null);
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <form className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl border border-stone-200 bg-stone-50/60"
      onSubmit={(e) => { e.preventDefault(); void call(() => saveAddress({ ...(editing !== 'new' ? { id: editing! } : {}), ...draft, line2: draft.line2 || null, phone: draft.phone || null, deliveryNotes: draft.deliveryNotes || null })); }}>
      <label className="text-xs font-semibold text-[#18181B]">{cms.t('account.addresses.label')}<input className={inputClass} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></label>
      <label className="text-xs font-semibold text-[#18181B]">{cms.t('checkout.address.full_name')}<input required autoComplete="name" className={inputClass} value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} /></label>
      <label className="sm:col-span-2 text-xs font-semibold text-[#18181B]">{cms.t('checkout.address.line1')}<input required autoComplete="address-line1" className={inputClass} value={draft.line1} onChange={(e) => setDraft({ ...draft, line1: e.target.value })} /></label>
      <label className="sm:col-span-2 text-xs font-semibold text-[#18181B]">{cms.t('checkout.address.line2')}<input autoComplete="address-line2" className={inputClass} value={draft.line2} onChange={(e) => setDraft({ ...draft, line2: e.target.value })} /></label>
      <label className="text-xs font-semibold text-[#18181B]">{cms.t('checkout.address.city')}<input required autoComplete="address-level2" className={inputClass} value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} /></label>
      <label className="text-xs font-semibold text-[#18181B]">{cms.t('checkout.address.postcode')}<input required autoComplete="postal-code" className={`${inputClass} uppercase`} value={draft.postcode} onChange={(e) => setDraft({ ...draft, postcode: e.target.value.toUpperCase() })} /></label>
      <label className="text-xs font-semibold text-[#18181B]">{cms.t('checkout.address.phone')}<input type="tel" autoComplete="tel" className={inputClass} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label>
      <label className="text-xs font-semibold text-[#18181B]">{cms.t('account.addresses.notes')}<input className={inputClass} value={draft.deliveryNotes} onChange={(e) => setDraft({ ...draft, deliveryNotes: e.target.value })} /></label>
      <div className="sm:col-span-2 flex gap-2">
        <button type="submit" disabled={busy} className="px-5 py-2.5 rounded-full bg-[#18181B] text-[#F5D103] text-xs font-bold cursor-pointer disabled:opacity-60">{cms.t('checkout.address.save')}</button>
        <button type="button" onClick={() => setEditing(null)} className="px-5 py-2.5 rounded-full border border-stone-300 text-xs font-bold cursor-pointer">{cms.t('checkout.address.cancel')}</button>
      </div>
    </form>
  );

  return (
    <div className={panel}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-serif-heading font-bold text-2xl text-[#18181B]">{cms.t('account.addresses.title')}</h1>
        {editing === null && <button type="button" onClick={() => start()} className="px-4 py-2 rounded-full bg-[#F5D103] text-[#18181B] text-xs font-bold cursor-pointer">{cms.t('account.addresses.add')}</button>}
      </div>
      {editing === 'new' && <div className="mb-4">{form}</div>}
      {isLoading ? <p className="text-sm text-stone-500">{cms.t('global.common.loading')}</p>
        : !addresses.length && editing !== 'new' ? <p className="text-sm text-stone-500">{cms.t('account.addresses.empty')}</p>
        : (
          <ul className="space-y-3">
            {addresses.map((a) => editing === a.id ? <li key={a.id}>{form}</li> : (
              <li key={a.id} className="p-4 rounded-2xl border border-stone-200 flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm">
                  <p className="font-bold text-[#18181B] flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-[#B45309]" />{a.label}
                    {a.isDefault && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-[#92400E] text-[10px] font-bold">{cms.t('account.addresses.default')}</span>}
                    {!a.deliverable && <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold">{cms.t('account.addresses.not_served')}</span>}
                  </p>
                  <p className="text-stone-600">{a.fullName}</p>
                  <p className="text-stone-600">{[a.line1, a.line2, a.city, a.postcode].filter(Boolean).join(', ')}</p>
                </div>
                <div className="flex gap-2 text-xs font-bold">
                  {!a.isDefault && <button type="button" onClick={() => void call(() => rpc('set_default_address', { p_id: a.id }))} className="text-[#B45309] hover:underline cursor-pointer">{cms.t('account.addresses.make_default')}</button>}
                  <button type="button" onClick={() => start(a)} className="text-stone-700 hover:underline cursor-pointer">{cms.t('account.addresses.edit')}</button>
                  <button type="button" onClick={() => { if (window.confirm(cms.t('account.addresses.delete_confirm'))) void call(() => rpc('delete_my_address', { p_id: a.id })); }} className="text-rose-600 hover:underline cursor-pointer">{cms.t('account.addresses.delete')}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
};

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <label className="flex items-center justify-between gap-3 py-2.5 text-sm text-stone-700 cursor-pointer">
    <span>{label}</span>
    <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-[#F5D103]" />
  </label>
);

export const PreferencesTab: React.FC = () => {
  const cms = useCms();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { showToast } = useCart();
  const { data: prefs } = usePreferences();
  const { data: profile } = useProfile();
  const save = async (p: Partial<Preferences>) => {
    try {
      qc.setQueryData(accountKeys.preferences, await rpc<Preferences>('update_my_preferences', { p }));
      showToast(cms.t('global.toasts.saved'));
    } catch (err) {
      showToast(errorMessage(err));
    }
  };
  const consent = async (purpose: string, granted: boolean) => {
    try {
      await rpc('set_my_consent', { p_purpose: purpose, p_granted: granted });
      await qc.invalidateQueries({ queryKey: accountKeys.profile });
      showToast(cms.t('global.toasts.saved'));
    } catch (err) {
      showToast(errorMessage(err));
    }
  };
  if (!prefs) return <div className={panel}><p className="text-sm text-stone-500">{cms.t('global.common.loading')}</p></div>;
  const granted = (p: string) => profile?.consents?.[p]?.granted === true;
  return (
    <div className="space-y-5">
      <div className={panel}>
        <h1 className="font-serif-heading font-bold text-2xl text-[#18181B] mb-4">{cms.t('account.preferences.title')}</h1>
        <fieldset className="mb-4">
          <legend className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">{cms.t('account.preferences.subs')}</legend>
          {(['allow', 'dont_allow'] as const).map((v) => (
            <label key={v} className="flex items-center gap-2 text-sm mb-1.5 cursor-pointer">
              <input type="radio" name="subs" checked={prefs.substitutionDefault === v} onChange={() => void save({ substitutionDefault: v })} className="accent-[#F5D103]" />
              {v === 'allow' ? cms.t('account.preferences.subs_allow') : cms.t('account.preferences.subs_dont')}
            </label>
          ))}
        </fieldset>
        <fieldset className="mb-4">
          <legend className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">{cms.t('account.preferences.ripeness')}</legend>
          {(['ready', 'shelf_life'] as const).map((v) => (
            <label key={v} className="flex items-center gap-2 text-sm mb-1.5 cursor-pointer">
              <input type="radio" name="ripeness" checked={prefs.ripeness === v} onChange={() => void save({ ripeness: v })} className="accent-[#F5D103]" />
              {v === 'ready' ? cms.t('account.preferences.ripeness_ready') : cms.t('account.preferences.ripeness_shelf')}
            </label>
          ))}
        </fieldset>
        <div className="divide-y divide-stone-100">
          <Toggle label={cms.t('account.preferences.sms_alerts')} checked={prefs.smsDeliveryAlerts} onChange={(v) => void save({ smsDeliveryAlerts: v })} />
          <Toggle label={cms.t('account.preferences.email_invoices')} checked={prefs.emailInvoices} onChange={(v) => void save({ emailInvoices: v })} />
          <Toggle label={cms.t('account.preferences.doorstep_bell')} checked={prefs.doorstepBell} onChange={(v) => void save({ doorstepBell: v })} />
          <Toggle label={cms.t('account.preferences.eco_packaging')} checked={prefs.ecoPackaging} onChange={(v) => void save({ ecoPackaging: v })} />
        </div>
      </div>
      <div className={panel}>
        <h2 className="font-bold text-base text-[#18181B] mb-1">{cms.t('account.preferences.marketing_title')}</h2>
        <p className="text-xs text-stone-500 mb-2">{cms.t('account.preferences.marketing_text')}</p>
        <div className="divide-y divide-stone-100">
          <Toggle label={cms.t('account.preferences.marketing_email')} checked={granted('marketing_email')} onChange={(v) => void consent('marketing_email', v)} />
          <Toggle label={cms.t('account.preferences.marketing_sms')} checked={granted('marketing_sms')} onChange={(v) => void consent('marketing_sms', v)} />
          <Toggle label={cms.t('account.preferences.marketing_whatsapp')} checked={granted('marketing_whatsapp')} onChange={(v) => void consent('marketing_whatsapp', v)} />
        </div>
      </div>
    </div>
  );
};

export const ProfileTab: React.FC = () => {
  const cms = useCms();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { showToast } = useCart();
  const { updatePassword, refresh } = useAuth();
  const { data: profile } = useProfile();
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (profile) setForm({ firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone ?? '' });
  }, [profile]);
  if (!profile) return <div className={panel}><p className="text-sm text-stone-500">{cms.t('global.common.loading')}</p></div>;
  return (
    <div className="space-y-5">
      <form className={panel} onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        rpc('update_my_profile', { p_first_name: form.firstName, p_last_name: form.lastName, p_phone: form.phone })
          .then(async () => { await qc.invalidateQueries({ queryKey: accountKeys.profile }); await refresh(); showToast(cms.t('global.toasts.saved')); }, (err) => showToast(errorMessage(err)))
          .finally(() => setBusy(false));
      }}>
        <h1 className="font-serif-heading font-bold text-2xl text-[#18181B] mb-4">{cms.t('account.profile.title')}</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-[#18181B]">{cms.t('account.auth.first_name')}<input required autoComplete="given-name" className={inputClass} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
          <label className="text-xs font-semibold text-[#18181B]">{cms.t('account.auth.last_name')}<input required autoComplete="family-name" className={inputClass} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
          <label className="text-xs font-semibold text-[#18181B]">{cms.t('account.profile.phone')}<input type="tel" autoComplete="tel" className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label className="text-xs font-semibold text-[#18181B]">{cms.t('account.auth.email')}<input readOnly className={`${inputClass} bg-stone-50 text-stone-500`} value={profile.email} /></label>
        </div>
        <p className="text-[11px] text-stone-500 mt-2">{cms.t('account.profile.email_note')}</p>
        <button type="submit" disabled={busy} className="mt-4 px-6 py-2.5 rounded-full bg-[#18181B] text-[#F5D103] text-xs font-bold cursor-pointer disabled:opacity-60">{cms.t('account.profile.save')}</button>
      </form>
      <form className={panel} onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        updatePassword(password).then(() => { setPassword(''); showToast(cms.t('account.auth.password_saved')); }, (err) => showToast(errorMessage(err))).finally(() => setBusy(false));
      }}>
        <h2 className="font-bold text-base text-[#18181B] mb-3">{cms.t('account.profile.password_title')}</h2>
        <label className="block text-xs font-semibold text-[#18181B] max-w-sm">{cms.t('account.profile.new_password')}
          <input type="password" required minLength={8} autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" disabled={busy} className="mt-4 px-6 py-2.5 rounded-full border border-stone-300 text-xs font-bold cursor-pointer disabled:opacity-60">{cms.t('account.profile.change_password')}</button>
      </form>
    </div>
  );
};

export const PrivacyTab: React.FC = () => {
  const cms = useCms();
  const errorMessage = useErrorMessage();
  const { showToast } = useCart();
  const { signOut } = useAuth();
  const { goToHome } = useNavigation();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const data = await rpc<unknown>('export_my_data');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `varam-foods-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <div className={panel}>
        <h1 className="font-serif-heading font-bold text-2xl text-[#18181B] mb-4">{cms.t('account.privacy.title')}</h1>
        <h2 className="font-bold text-base text-[#18181B] mb-1">{cms.t('account.privacy.export_title')}</h2>
        <p className="text-sm text-stone-600 mb-3">{cms.t('account.privacy.export_text')}</p>
        <button type="button" disabled={busy} onClick={() => void download()} className="px-5 py-2.5 rounded-full border border-stone-300 text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60"><Download className="w-4 h-4" />{cms.t('account.privacy.export_button')}</button>
      </div>
      <div className={`${panel} border-rose-200`}>
        <h2 className="font-bold text-base text-rose-700 mb-1">{cms.t('account.privacy.delete_title')}</h2>
        <p className="text-sm text-stone-600 mb-3">{cms.t('account.privacy.delete_text')}</p>
        <label className="block text-xs font-semibold text-[#18181B] max-w-xs">{cms.t('account.privacy.delete_prompt')}
          <input className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </label>
        <button type="button" disabled={busy || confirm !== 'DELETE'}
          onClick={() => {
            setBusy(true);
            rpc('delete_my_account', { p_confirm: confirm })
              .then(async () => { showToast(cms.t('account.privacy.deleted')); await signOut(); goToHome(); }, (err) => showToast(errorMessage(err)))
              .finally(() => setBusy(false));
          }}
          className="mt-3 px-5 py-2.5 rounded-full bg-rose-600 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50">
          <Trash2 className="w-4 h-4" />{cms.t('account.privacy.delete_button')}
        </button>
      </div>
    </div>
  );
};

