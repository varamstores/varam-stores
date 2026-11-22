import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Repeat, Gift } from 'lucide-react';
import { rpc } from '../../lib/api';
import { formatMoney, formatGrams } from '../../lib/money';
import { accountKeys } from '../../lib/account';
import { useCart } from '../../context/CartContext';
import { useCms } from '../../cms/CmsProvider';
import { InlineText, Picture } from '../../cms/components';
import { useErrorMessage } from '../../cms/hooks';
import type { Money, ProductSummary } from '../../types/api';
import { useLoyalty } from './AccountTabs';

const panel = 'bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-7 shadow-2xs';
const dateFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

interface Alert { id: string; kind: 'back_in_stock' | 'price_drop'; status: string; createdAt: string; notifiedAt: string | null; priceAtSet: Money | null; product: ProductSummary }
interface RepeatOrder { id: string; name: string; frequencyDays: number; nextDate: string; status: 'active' | 'paused'; items: { product: ProductSummary; quantity: number | null; weightGrams: number | null }[] }

export const AlertsTab: React.FC = () => {
  const cms = useCms();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { showToast } = useCart();
  const { data: alerts = [], isLoading } = useQuery({ queryKey: accountKeys.alerts, queryFn: () => rpc<Alert[]>('list_my_alerts') });
  const remove = async (id: string) => {
    try {
      qc.setQueryData(accountKeys.alerts, await rpc<Alert[]>('delete_product_alert', { p_id: id }));
    } catch (err) {
      showToast(errorMessage(err));
    }
  };
  return (
    <div className={panel}>
      <h1 className="font-serif-heading font-bold text-2xl text-[#18181B] mb-1 flex items-center gap-2"><Bell className="w-5 h-5 text-[#B45309]" />{cms.t('account.alerts.title')}</h1>
      <p className="text-sm text-stone-600 mb-4">{cms.t('account.alerts.text')}</p>
      {isLoading ? <p className="text-sm text-stone-500">{cms.t('global.common.loading')}</p>
        : !alerts.length ? <p className="text-sm text-stone-500">{cms.t('account.alerts.empty')}</p>
        : (
          <ul className="divide-y divide-stone-100">
            {alerts.map((a) => (
              <li key={a.id} className="py-3 flex items-center gap-3">
                <Picture image={a.product.image} alt="" className="w-12 h-12 rounded-lg object-cover bg-stone-50 border border-stone-100" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#18181B] truncate">{a.product.name}</p>
                  <p className="text-xs text-stone-500">
                    {a.kind === 'back_in_stock' ? cms.t('account.alerts.back_in_stock') : cms.t('account.alerts.price_drop', { price: formatMoney(a.priceAtSet) })}
                    {a.notifiedAt && ` · ${cms.t('account.alerts.notified', { date: dateFmt.format(new Date(a.notifiedAt)) })}`}
                  </p>
                </div>
                {a.status === 'active' && (
                  <button type="button" onClick={() => void remove(a.id)} className="text-xs font-bold text-rose-600 hover:underline cursor-pointer">{cms.t('account.alerts.remove')}</button>
                )}
              </li>
            ))}
          </ul>
        )}
    </div>
  );
};

export const RepeatOrdersTab: React.FC = () => {
  const cms = useCms();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { showToast, refresh } = useCart();
  const { data: list = [], isLoading } = useQuery({ queryKey: accountKeys.subscriptions, queryFn: () => rpc<RepeatOrder[]>('list_my_repeat_orders') });
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(id);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: accountKeys.subscriptions });
      if (ok) showToast(ok);
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={panel}>
      <h1 className="font-serif-heading font-bold text-2xl text-[#18181B] mb-1 flex items-center gap-2"><Repeat className="w-5 h-5 text-[#B45309]" />{cms.t('account.repeat.title')}</h1>
      <p className="text-sm text-stone-600 mb-4">{cms.t('account.repeat.text')}</p>
      {isLoading ? <p className="text-sm text-stone-500">{cms.t('global.common.loading')}</p>
        : !list.length ? <p className="text-sm text-stone-500">{cms.t('account.repeat.empty')}</p>
        : (
          <ul className="space-y-3">
            {list.map((r) => (
              <li key={r.id} className="p-4 rounded-2xl border border-stone-200">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <p className="font-bold text-[#18181B]">{r.name}
                    {r.status === 'paused' && <span className="ml-2 px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-[10px] font-bold">{cms.t('account.repeat.paused')}</span>}
                  </p>
                  <p className="text-xs text-stone-500">
                    {r.frequencyDays === 7 ? cms.t('account.repeat.every_week') : cms.t('account.repeat.every', { weeks: r.frequencyDays / 7 })}
                    {r.status === 'active' && ` · ${cms.t('account.repeat.next', { date: dateFmt.format(new Date(`${r.nextDate}T00:00:00Z`)) })}`}
                  </p>
                </div>
                <p className="text-xs text-stone-600 mb-3">
                  {r.items.map((i) => `${i.quantity != null ? `${i.quantity} × ` : `${formatGrams(i.weightGrams ?? 0)} `}${i.product.name}`).join(', ')}
                </p>
                <div className="flex flex-wrap gap-3 text-xs font-bold">
                  <button type="button" disabled={busy === r.id} onClick={() => void act(r.id, async () => { await rpc('run_repeat_order_now', { p_id: r.id }); await refresh(); }, cms.t('account.repeat.added'))} className="text-[#B45309] hover:underline cursor-pointer">{cms.t('account.repeat.run_now')}</button>
                  {r.status === 'active' && <button type="button" disabled={busy === r.id} onClick={() => void act(r.id, () => rpc('update_repeat_order', { p_id: r.id, p: { action: 'skip' } }))} className="text-stone-700 hover:underline cursor-pointer">{cms.t('account.repeat.skip')}</button>}
                  <button type="button" disabled={busy === r.id} onClick={() => void act(r.id, () => rpc('update_repeat_order', { p_id: r.id, p: { action: r.status === 'active' ? 'pause' : 'resume' } }))} className="text-stone-700 hover:underline cursor-pointer">
                    {r.status === 'active' ? cms.t('account.repeat.pause') : cms.t('account.repeat.resume')}
                  </button>
                  <select value={r.frequencyDays} disabled={busy === r.id} aria-label={cms.t('account.orders.repeat_every')}
                    onChange={(e) => void act(r.id, () => rpc('update_repeat_order', { p_id: r.id, p: { frequencyDays: Number(e.target.value) } }))}
                    className="text-xs border border-stone-200 rounded-lg px-2 py-1 bg-white">
                    {[7, 14, 21, 28].map((d) => <option key={d} value={d}>{d === 7 ? cms.t('account.orders.week') : cms.t('account.orders.weeks', { weeks: d / 7 })}</option>)}
                  </select>
                  <button type="button" disabled={busy === r.id} onClick={() => { if (window.confirm(cms.t('account.repeat.delete_confirm'))) void act(r.id, () => rpc('delete_repeat_order', { p_id: r.id })); }} className="text-rose-600 hover:underline cursor-pointer">{cms.t('account.repeat.delete')}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
};

/** Points balance and rewards that can be bought with them (shown on the overview). */
export const RewardsPanel: React.FC = () => {
  const cms = useCms();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { showToast } = useCart();
  const { data: loyalty } = useLoyalty();
  const { data: rewards = [] } = useQuery({ queryKey: ['loyalty-rewards'], queryFn: () => rpc<{ id: string; title: string; pointsCost: number }[]>('list_loyalty_rewards'), enabled: !!loyalty?.enabled });
  const [code, setCode] = useState<string | null>(null);
  if (!loyalty?.enabled) return null;
  return (
    <div className={panel}>
      <h2 className="font-bold text-base text-[#18181B] mb-1 flex items-center gap-2"><Gift className="w-4 h-4 text-[#B45309]" />{cms.t('account.rewards.title')}</h2>
      <p className="text-sm text-stone-600"><InlineText text={cms.t('account.rewards.balance', { points: loyalty.balance, value: formatMoney({ amount: loyalty.balance * loyalty.pointValue.amount, currency: loyalty.pointValue.currency }) })} strongClass="text-[#18181B]" /></p>
      <p className="text-xs text-stone-500 mb-3">{cms.t('account.rewards.earn', { rate: (loyalty as unknown as { pointsPerPound?: number }).pointsPerPound ?? '' })}</p>
      {code && <p className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm"><InlineText text={cms.t('account.rewards.redeemed', { code })} strongClass="font-mono" /></p>}
      {!rewards.length ? <p className="text-sm text-stone-500">{cms.t('account.rewards.none')}</p> : (
        <ul className="space-y-2">
          {rewards.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-stone-200">
              <span className="text-sm font-semibold text-[#18181B]">{r.title}<span className="block text-xs font-normal text-stone-500">{cms.t('account.rewards.cost', { points: r.pointsCost })}</span></span>
              <button type="button" disabled={loyalty.balance < r.pointsCost}
                onClick={async () => {
                  try {
                    const res = await rpc<{ code: string }>('redeem_loyalty_reward', { p_reward_id: r.id });
                    setCode(res.code);
                    await qc.invalidateQueries({ queryKey: accountKeys.loyalty });
                  } catch (err) {
                    showToast(errorMessage(err));
                  }
                }}
                className="px-4 py-2 rounded-full bg-[#F5D103] text-[#18181B] text-xs font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                {cms.t('account.rewards.redeem')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
