import React, { useState } from 'react';
import { Download, Percent, Plus, Trash2 } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import type { Money } from '../../types/api';
import { useAuth } from '../../context/AuthContext';
import { useAction, useAdminQuery, money, pence, date, errorText, downloadText } from '../lib';
import { Badge, Button, Card, Checkbox, Chips, Drawer, Empty, ErrorState, Field, Loading, MoneyInput, Notice, NumberInput, Screen, Select, Table, Td, TextArea, TextInput, Th, Toggle, Tr, cx, usePager } from '../ui';
import { ProductPicker } from '../pickers';
import { useLookups } from '../lookups';

type OfferType = 'percent_off' | 'fixed_off' | 'multibuy_x_for_y' | 'multibuy_x_for_price' | 'member_price' | 'free_delivery';
interface Coupon { id: string; code: string; isActive: boolean; usedCount: number; maxUses: number | null; personal: boolean }
interface Offer {
  id: string; name: string; label: string; type: OfferType; scope: 'basket' | 'targets'; status: 'draft' | 'active' | 'paused' | 'ended';
  percent: number | null; amountMinor: number | null; buyQty: number | null; payQty: number | null; bundlePriceMinor: number | null; minBasketMinor: number | null; maxDiscountMinor: number | null;
  requiresCoupon: boolean; firstOrderOnly: boolean; membersOnly: boolean; stackable: boolean; priority: number; startsAt: string; endsAt: string | null;
  usageLimitTotal: number | null; usageLimitPerCustomer: number | null; description: string | null;
  targets: Array<{ type: 'product' | 'category' | 'brand'; id: string; name: string | null }>; zoneIds: string[]; coupons: Coupon[]; personalCodes: number;
  timesUsed: number; discountGiven: Money; isLoyaltyReward: boolean;
}

const TYPES: Array<{ value: OfferType; title: string; example: string }> = [
  { value: 'percent_off', title: 'Percentage off', example: 'e.g. 10% off the whole basket, or 20% off chosen products' },
  { value: 'fixed_off', title: 'Money off', example: 'e.g. £5 off orders over £40' },
  { value: 'multibuy_x_for_y', title: 'Buy some, pay for fewer', example: 'e.g. 3 for the price of 2 on chosen products' },
  { value: 'multibuy_x_for_price', title: 'Bundle price', example: 'e.g. any 2 for £5 on chosen products' },
  { value: 'member_price', title: 'Members’ price', example: 'A lower price on chosen products for signed-in customers' },
  { value: 'free_delivery', title: 'Free delivery', example: 'e.g. free delivery with a code, or on a first order' },
];
const STATUS = { draft: { label: 'Draft', tone: 'grey' }, active: { label: 'Live', tone: 'green' }, paused: { label: 'Paused', tone: 'amber' }, ended: { label: 'Ended', tone: 'red' } } as const;

/** One line in plain English, e.g. "10% off the basket over £40, with code SAVE10". */
export function describeOffer(o: Pick<Offer, 'type' | 'scope' | 'percent' | 'amountMinor' | 'buyQty' | 'payQty' | 'bundlePriceMinor' | 'minBasketMinor' | 'targets'>): string {
  const on = o.scope === 'targets' ? (o.targets.length === 1 ? ` on ${o.targets[0].name ?? '1 item'}` : ` on ${o.targets.length} chosen items`) : ' off the basket';
  const over = o.minBasketMinor ? ` over ${pence(o.minBasketMinor)}` : '';
  switch (o.type) {
    case 'percent_off': return `${o.percent ?? '?'}%${o.scope === 'targets' ? ' off' + on.replace(' off the basket', '') : on}${over}`;
    case 'fixed_off': return `${pence(o.amountMinor)}${o.scope === 'targets' ? ' off' + on : on}${over}`;
    case 'multibuy_x_for_y': return `${o.buyQty ?? '?'} for the price of ${o.payQty ?? '?'}${on}`;
    case 'multibuy_x_for_price': return `${o.buyQty ?? '?'} for ${pence(o.bundlePriceMinor)}${on}`;
    case 'member_price': return `Members save ${o.percent != null ? `${o.percent}%` : pence(o.amountMinor)}${on}`;
    case 'free_delivery': return `Free delivery${over}`;
  }
}

export default function OffersScreen(_: ScreenProps) {
  const [status, setStatus] = useState('');
  const { data, isLoading, error, refetch } = useAdminQuery<Offer[]>('admin_list_promotions', { p_status: status || undefined });
  const { pageItems, pager } = usePager(data, 25);
  const [open, setOpen] = useState<string | 'new' | null>(null);
  return (
    <Screen
      title="Offers & codes"
      intro="Discounts, multi-buys, members’ prices, free delivery and promo codes."
      guide={<ol>
        <li>Press <b>New offer</b>, pick the kind of offer and fill in the questions. It starts as a <b>draft</b>, so nothing changes in the shop yet.</li>
        <li>Want it to need a code? Add one (e.g. SPRING10). Without a code it applies automatically to everyone who qualifies.</li>
        <li>Switch it <b>Live</b> when ready. Set an end date, or pause it any time.</li>
        <li>The basket shows shoppers exactly why a code does not work (minimum spend, wrong area, expired…).</li>
      </ol>}
      actions={<Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setOpen('new')}>New offer</Button>}
    >
      <Chips value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'active', label: 'Live' }, { value: 'draft', label: 'Drafts' }, { value: 'paused', label: 'Paused' }, { value: 'ended', label: 'Ended' }]} />
      <Card padded={false}>
        {isLoading ? <Loading /> : error ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : !data?.length ? (
          <Empty icon={<Percent className="w-5 h-5" />} title="No offers yet" action={<Button variant="primary" onClick={() => setOpen('new')}>Create your first offer</Button>} />
        ) : (
          <Table>
            <thead><tr><Th>Offer</Th><Th>Codes</Th><Th>Status</Th><Th className="text-right">Used</Th><Th className="text-right">Discount given</Th><Th>Runs</Th></tr></thead>
            <tbody>
              {pageItems.map((o) => (
                <Tr key={o.id} onClick={() => setOpen(o.id)}>
                  <Td><div className="font-medium">{o.label}</div><div className="text-xs text-slate-500">{describeOffer(o)}{o.firstOrderOnly ? ' · first order only' : ''}</div>{o.isLoyaltyReward && <Badge tone="violet">Loyalty reward</Badge>}</Td>
                  <Td className="text-xs">{o.requiresCoupon ? (o.coupons.length ? o.coupons.slice(0, 3).map((c) => <span key={c.id} className="font-mono mr-1">{c.code}</span>) : 'none yet') : <span className="text-slate-500">Automatic</span>}{o.coupons.length > 3 && ` +${o.coupons.length - 3}`}{o.personalCodes > 0 && <div className="text-slate-500">{o.personalCodes} personal</div>}</Td>
                  <Td><Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge></Td>
                  <Td className="text-right tabular-nums">{o.timesUsed}</Td>
                  <Td className="text-right tabular-nums">{money(o.discountGiven)}</Td>
                  <Td className="text-xs text-slate-500 whitespace-nowrap">{date(o.startsAt)} – {o.endsAt ? date(o.endsAt) : 'no end'}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {pager}
      </Card>
      {open && <OfferEditor id={open === 'new' ? null : open} onClose={() => setOpen(null)} onCreated={(id) => setOpen(id)} />}
    </Screen>
  );
}

// ── editor ──────────────────────────────────────────────────────────────────────────────────────
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

const OfferEditor: React.FC<{ id: string | null; onClose: () => void; onCreated: (id: string) => void }> = ({ id, onClose, onCreated }) => {
  const { data: offers } = useAdminQuery<Offer[]>('admin_list_promotions', { p_status: undefined });
  const existing = id ? offers?.find((o) => o.id === id) ?? null : null;
  if (id && !existing) return <Drawer open onClose={onClose} title="Offer"><Loading /></Drawer>;
  return <OfferForm key={id ?? 'new'} existing={existing} onClose={onClose} onCreated={onCreated} />;
};

const OfferForm: React.FC<{ existing: Offer | null; onClose: () => void; onCreated: (id: string) => void }> = ({ existing, onClose, onCreated }) => {
  const { hasPermission } = useAuth();
  const lookups = useLookups();
  const zones = useAdminQuery<Array<{ id: string; name: string }>>('admin_list_zones', undefined, { enabled: hasPermission('fleet_management') || hasPermission('orders_dispatch'), retry: false });
  const { run, busy } = useAction();
  const [type, setType] = useState<OfferType | null>(existing?.type ?? null);
  const [o, setO] = useState<Partial<Offer>>(existing ?? { scope: 'basket', targets: [], zoneIds: [], stackable: false, firstOrderOnly: false });
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(existing ? existing.requiresCoupon : false);
  const [memberMode, setMemberMode] = useState<'percent' | 'amount'>(existing?.amountMinor != null && existing.type === 'member_price' ? 'amount' : 'percent');
  const set = <K extends keyof Offer>(k: K, v: Offer[K] | null) => setO((x) => ({ ...x, [k]: v }));
  const targetsOnly = type === 'multibuy_x_for_y' || type === 'multibuy_x_for_price' || type === 'member_price';
  const scope = targetsOnly ? 'targets' : type === 'free_delivery' ? 'basket' : o.scope ?? 'basket';
  const readOnly = existing?.isLoyaltyReward;

  if (!type) {
    return (
      <Drawer open onClose={onClose} title="New offer" subtitle="What kind of offer is it?">
        <div className="grid sm:grid-cols-2 gap-3">
          {TYPES.map((t) => (
            <button key={t.value} type="button" onClick={() => setType(t.value)} className="text-left bg-white rounded-lg border border-[#E2E8F0] p-4 hover:border-[#18181B] hover:bg-[#FEF9C3]/40 cursor-pointer">
              <div className="font-semibold">{t.title}</div><div className="text-xs text-slate-500 mt-1">{t.example}</div>
            </button>
          ))}
        </div>
      </Drawer>
    );
  }

  const payload = (status?: Offer['status']) => ({
    id: existing?.id, type, label: o.label, name: o.name || o.label, scope,
    percent: (type === 'percent_off' || (type === 'member_price' && memberMode === 'percent')) ? o.percent : undefined,
    amountMinor: (type === 'fixed_off' || (type === 'member_price' && memberMode === 'amount')) ? o.amountMinor : undefined,
    buyQty: type?.startsWith('multibuy') ? o.buyQty : undefined, payQty: type === 'multibuy_x_for_y' ? o.payQty : undefined,
    bundlePriceMinor: type === 'multibuy_x_for_price' ? o.bundlePriceMinor : undefined,
    minBasketMinor: o.minBasketMinor ?? '', maxDiscountMinor: type === 'percent_off' ? o.maxDiscountMinor ?? '' : '',
    firstOrderOnly: !!o.firstOrderOnly, stackable: !!o.stackable, requiresCoupon: needsCode,
    startsAt: o.startsAt ?? undefined, endsAt: o.endsAt ?? '', usageLimitTotal: o.usageLimitTotal ?? '', usageLimitPerCustomer: o.usageLimitPerCustomer ?? '',
    description: o.description ?? '', targets: scope === 'targets' ? (o.targets ?? []).map((t) => ({ type: t.type, id: t.id })) : [], zoneIds: o.zoneIds ?? [],
    code: !existing && needsCode && code ? code : undefined, status,
  });
  const save = async (status?: Offer['status']) => {
    const out = await run<Offer>('admin_save_promotion', { p: payload(status) }, { success: status === 'active' ? 'Offer is live' : status === 'paused' ? 'Offer paused' : status === 'ended' ? 'Offer ended' : 'Offer saved', refresh: ['admin_list_promotions'] });
    if (out && !existing) onCreated(out.id);
  };
  const t = TYPES.find((x) => x.value === type)!;
  const valueOk = type === 'percent_off' ? (o.percent ?? 0) > 0 && (o.percent ?? 0) <= 100
    : type === 'fixed_off' ? (o.amountMinor ?? 0) > 0
    : type === 'multibuy_x_for_y' ? (o.buyQty ?? 0) >= 2 && (o.payQty ?? 0) >= 1 && (o.payQty ?? 0) < (o.buyQty ?? 0)
    : type === 'multibuy_x_for_price' ? (o.buyQty ?? 0) >= 2 && (o.bundlePriceMinor ?? 0) > 0
    : type === 'member_price' ? (memberMode === 'percent' ? (o.percent ?? 0) > 0 : (o.amountMinor ?? 0) > 0) : true;
  const ready = !!o.label?.trim() && valueOk && (scope === 'basket' || (o.targets ?? []).length > 0) && (!needsCode || !!existing || !!code.trim());
  const addTarget = (tt: 'product' | 'category' | 'brand', tid: string, name: string) => setO((x) => ({ ...x, targets: (x.targets ?? []).some((y) => y.id === tid) ? x.targets : [...(x.targets ?? []), { type: tt, id: tid, name }] }));
  const preview = describeOffer({ type, scope, percent: type === 'member_price' && memberMode === 'amount' ? null : o.percent ?? null, amountMinor: o.amountMinor ?? null, buyQty: o.buyQty ?? null, payQty: o.payQty ?? null,
    bundlePriceMinor: o.bundlePriceMinor ?? null, minBasketMinor: o.minBasketMinor ?? null, targets: o.targets ?? [] });

  return (
    <Drawer open onClose={onClose} wide title={existing ? existing.label : `New offer: ${t.title}`}
      subtitle={existing ? <span className="flex items-center gap-2"><Badge tone={STATUS[existing.status].tone}>{STATUS[existing.status].label}</Badge>{t.title} · used {existing.timesUsed} times · {money(existing.discountGiven)} given</span> : t.example}
      footer={!readOnly && <>
        {existing?.status === 'active' && <Button loading={busy} onClick={() => void save('paused')}>Pause</Button>}
        {existing && existing.status !== 'ended' && <Button variant="danger" loading={busy} onClick={() => void save('ended')}>End now</Button>}
        <Button loading={busy} disabled={!ready} onClick={() => void save()}>{existing ? 'Save changes' : 'Save as draft'}</Button>
        {existing?.status !== 'active' && <Button variant="primary" loading={busy} disabled={!ready} onClick={() => void save('active')}>{existing ? 'Save and switch on' : 'Create and switch on'}</Button>}
      </>}>
      {readOnly && <Notice tone="info">This is a loyalty reward. Change it under Loyalty.</Notice>}
      <Notice tone="success">Shoppers get: <b>{preview}</b>{needsCode ? ' with a code' : ' automatically'}{o.firstOrderOnly ? ', on their first order' : ''}.</Notice>

      <Card title="1. Name">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="What shoppers see" help="On the product, in the basket and on the receipt."><TextInput value={o.label} onChange={(v) => set('label', v)} placeholder="e.g. 3 for 2 on mangoes" maxLength={80} /></Field>
          <Field label="Name for staff" optional><TextInput value={o.name} onChange={(v) => set('name', v)} placeholder="e.g. Mango week May 2026" /></Field>
          <Field label="Terms shown to shoppers" optional className="sm:col-span-2"><TextArea rows={2} value={o.description} onChange={(v) => set('description', v)} placeholder="e.g. Minimum spend £40. One use per customer." /></Field>
        </div>
      </Card>

      {type !== 'free_delivery' && (
        <Card title="2. How much">
          <div className="grid sm:grid-cols-2 gap-4">
            {type === 'percent_off' && <>
              <Field label="Percentage off"><NumberInput decimals value={o.percent} onChange={(v) => set('percent', v)} suffix="%" /></Field>
              <Field label="Most it can take off" optional help="Caps big baskets, e.g. £15."><MoneyInput value={o.maxDiscountMinor} onChange={(v) => set('maxDiscountMinor', v)} /></Field>
            </>}
            {type === 'fixed_off' && <Field label="Money off"><MoneyInput value={o.amountMinor} onChange={(v) => set('amountMinor', v)} /></Field>}
            {type === 'multibuy_x_for_y' && <>
              <Field label="Shopper buys"><NumberInput value={o.buyQty} onChange={(v) => set('buyQty', v)} suffix="items" /></Field>
              <Field label="and pays for"><NumberInput value={o.payQty} onChange={(v) => set('payQty', v)} suffix="items" /></Field>
            </>}
            {type === 'multibuy_x_for_price' && <>
              <Field label="Shopper buys"><NumberInput value={o.buyQty} onChange={(v) => set('buyQty', v)} suffix="items" /></Field>
              <Field label="for a total of"><MoneyInput value={o.bundlePriceMinor} onChange={(v) => set('bundlePriceMinor', v)} /></Field>
            </>}
            {type === 'member_price' && <>
              <Field label="Members save">
                <div className="flex gap-2">
                  <Select value={memberMode} onChange={(v) => setMemberMode(v as 'percent' | 'amount')} className="w-40" options={[{ value: 'percent', label: 'a percentage' }, { value: 'amount', label: 'an amount' }]} />
                  {memberMode === 'percent' ? <NumberInput decimals value={o.percent} onChange={(v) => set('percent', v)} suffix="%" className="flex-1" /> : <MoneyInput value={o.amountMinor} onChange={(v) => set('amountMinor', v)} className="flex-1" />}
                </div>
              </Field>
            </>}
          </div>
        </Card>
      )}

      <Card title={type === 'free_delivery' ? '2. Who gets it' : '3. On what'}>
        {!targetsOnly && type !== 'free_delivery' && (
          <Chips value={scope} onChange={(v) => set('scope', v as Offer['scope'])} options={[{ value: 'basket', label: 'The whole basket' }, { value: 'targets', label: 'Chosen products, categories or brands' }]} />
        )}
        {scope === 'targets' && (
          <div className="space-y-3 mt-3">
            <div className="grid sm:grid-cols-3 gap-2">
              <ProductPicker placeholder="Add a product…" activeOnly exclude={(o.targets ?? []).map((x) => x.id)} onPick={(p) => addTarget('product', p.id, p.name)} />
              <Select value="" onChange={(v) => { const c = lookups.data?.categories.find((x) => x.id === v); if (c) addTarget('category', c.id, c.path); }} placeholder="Add a whole category…" options={(lookups.data?.categories ?? []).map((c) => ({ value: c.id, label: c.path }))} />
              <Select value="" onChange={(v) => { const b = lookups.data?.brands.find((x) => x.id === v); if (b) addTarget('brand', b.id, b.name); }} placeholder="Add a whole brand…" options={(lookups.data?.brands ?? []).map((b) => ({ value: b.id, label: b.name }))} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(o.targets ?? []).map((x) => (
                <span key={x.id} className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs">
                  <span className="text-slate-500">{x.type === 'product' ? 'Product' : x.type === 'category' ? 'Category' : 'Brand'}:</span>{x.name}
                  <button type="button" aria-label="Remove" className="cursor-pointer" onClick={() => set('targets', (o.targets ?? []).filter((y) => y.id !== x.id))}><Trash2 className="w-3 h-3" /></button>
                </span>
              ))}
              {!(o.targets ?? []).length && <span className="text-sm text-[#7A4A0F]">Choose at least one.</span>}
            </div>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Field label="Minimum spend" optional><MoneyInput value={o.minBasketMinor} onChange={(v) => set('minBasketMinor', v)} /></Field>
          <div className="space-y-2 pt-6">
            <Checkbox checked={!!o.firstOrderOnly} onChange={(v) => set('firstOrderOnly', v)} label="First order only" description="Only for customers who have never ordered." />
            <Checkbox checked={!!o.stackable} onChange={(v) => set('stackable', v)} label="Can be used together with other offers" />
          </div>
        </div>
        {zones.data && zones.data.length > 0 && (
          <Field label="Only in these delivery areas" optional help="Leave all unticked for everywhere." className="mt-4">
            <div className="flex flex-wrap gap-3">{zones.data.map((z) => <Checkbox key={z.id} checked={(o.zoneIds ?? []).includes(z.id)} onChange={(v) => set('zoneIds', v ? [...(o.zoneIds ?? []), z.id] : (o.zoneIds ?? []).filter((x) => x !== z.id))} label={z.name} />)}</div>
          </Field>
        )}
      </Card>

      <Card title={type === 'free_delivery' ? '3. Code' : '4. Code'}>
        <Toggle checked={needsCode} onChange={setNeedsCode} label="Shoppers need to type a code" description={needsCode ? 'Only people with the code get the offer.' : 'Everyone who qualifies gets it automatically.'} />
        {needsCode && !existing && <Field label="The code" help="Letters and numbers, 3–32 characters, e.g. SPRING10." className="mt-3 max-w-xs"><TextInput value={code} onChange={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></Field>}
        {existing && needsCode && <Codes offer={existing} />}
      </Card>

      <Card title={type === 'free_delivery' ? '4. When and how often' : '5. When and how often'}>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Starts" help="Empty = straight away."><TextInput type="datetime-local" value={toLocal(o.startsAt ?? null)} onChange={(v) => set('startsAt', v ? new Date(v).toISOString() : null)} /></Field>
          <Field label="Ends" optional><TextInput type="datetime-local" value={toLocal(o.endsAt ?? null)} onChange={(v) => set('endsAt', v ? new Date(v).toISOString() : null)} /></Field>
          <Field label="Total uses allowed" optional help="Across all shoppers."><NumberInput value={o.usageLimitTotal} onChange={(v) => set('usageLimitTotal', v)} min={1} /></Field>
          <Field label="Uses per customer" optional><NumberInput value={o.usageLimitPerCustomer} onChange={(v) => set('usageLimitPerCustomer', v)} min={1} /></Field>
        </div>
      </Card>
    </Drawer>
  );
};

const Codes: React.FC<{ offer: Offer }> = ({ offer }) => {
  const { run, busy } = useAction();
  const [code, setCode] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [prefix, setPrefix] = useState('VF');
  const refresh = ['admin_list_promotions'];
  return (
    <div className="mt-4 space-y-4">
      {offer.coupons.length > 0 && (
        <Table className="border border-[#E2E8F0] rounded-md max-h-72 overflow-y-auto">
          <thead><tr><Th>Code</Th><Th className="text-right">Used</Th><Th>On</Th></tr></thead>
          <tbody>
            {offer.coupons.map((c) => (
              <tr key={c.id}>
                <Td className="font-mono font-semibold">{c.code}</Td>
                <Td className="text-right tabular-nums">{c.usedCount}{c.maxUses != null && ` / ${c.maxUses}`}</Td>
                <Td><Toggle checked={c.isActive} onChange={(v) => void run('admin_set_coupon_active', { p_coupon_id: c.id, p_active: v }, { refresh })} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className={cx('rounded-md border border-[#E2E8F0] p-3 space-y-2')}>
          <div className="text-sm font-semibold">Add a code</div>
          <div className="flex gap-2">
            <TextInput value={code} onChange={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="e.g. SUMMER15" />
            <Button loading={busy} disabled={code.length < 3} onClick={async () => { const ok = await run('admin_create_coupons', { p_promotion_id: offer.id, p_codes: [code] }, { success: 'Code added', refresh }); if (ok !== undefined) setCode(''); }}>Add</Button>
          </div>
        </div>
        <div className="rounded-md border border-[#E2E8F0] p-3 space-y-2">
          <div className="text-sm font-semibold">Make single-use codes</div>
          <p className="text-xs text-slate-500">For leaflets or one-off apologies. Each works once.</p>
          <div className="flex gap-2">
            <TextInput value={prefix} onChange={(v) => setPrefix(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} className="w-24" aria-label="Start of each code" />
            <NumberInput value={count} onChange={setCount} placeholder="How many" className="flex-1" />
            <Button loading={busy} disabled={!count || count < 1 || count > 1000} onClick={async () => { const ok = await run('admin_create_coupons', { p_promotion_id: offer.id, p_count: count, p_prefix: prefix || 'VF' }, { success: `${count} codes made`, refresh }); if (ok !== undefined) setCount(null); }}>Make</Button>
          </div>
        </div>
      </div>
      {offer.coupons.length > 1 && <Button size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={() => downloadText(`codes-${offer.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`, ['code,used,max_uses,active', ...offer.coupons.map((c) => `${c.code},${c.usedCount},${c.maxUses ?? ''},${c.isActive}`)].join('\n'))}>Download codes</Button>}
    </div>
  );
};
