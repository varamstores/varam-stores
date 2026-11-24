import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, PackageCheck, ShoppingBag, Truck } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import type { Money } from '../../types/api';
import { useAuth } from '../../context/AuthContext';
import { useAction, useAdminQuery, usePagedList, money, dateTime, ORDER_STATUS, errorText, londonToday, type Paged } from '../lib';
import { Badge, Button, Card, Empty, ErrorState, Field, Loading, OrderStatus, Pager, SampleTag, Screen, SearchInput, Segmented, Select, Table, Td, Th, TextInput, Tr, cx } from '../ui';
import { OrderPanel, slotText, type SlotInfo } from '../OrderPanel';
import { PickOrder } from './Picking';
import { Deliver, SendOut, type Row as DeliveryRow } from './Deliveries';

// Orders as one board: New → Picking → Ready to send → On the road → Delivered. Every card has ONE
// button for its next step, so nobody has to know which screen to go to. "All orders" is the
// searchable history (cancelled, refunded, older).

interface OrderRow {
  id: string; orderNumber: string; customer: string; zone: string | null; postcode: string | null; slot: SlotInfo | null; status: string;
  total: Money; itemCount: number; van: string | null; placedAt: string | null; createdAt: string; isSample: boolean;
}
interface QueueRow { id: string; orderNumber: string; slot: SlotInfo | null; zone: string | null; notes: string | null; total: Money; status: string; ageCheck: boolean; customer: string; lineCount: number; pickedCount: number; isSample?: boolean }
interface Card { id: string; orderNumber: string; customer: string; where: string | null; slot: SlotInfo | null; status: string; total: Money; items: number | null; progress: [number, number] | null; ageCheck: boolean; note: string | null; isSample: boolean; raw: OrderRow | null }

const COLUMNS = [
  { key: 'new', title: 'New', statuses: ['placed'], help: 'Paid with a card hold. Pick these next.', icon: ShoppingBag },
  { key: 'picking', title: 'Picking', statuses: ['picking', 'picked'], help: 'Someone is picking these now.', icon: PackageCheck },
  { key: 'ready', title: 'Ready to send', statuses: ['paid'], help: 'Packed and charged. Give them to a driver.', icon: Truck },
  { key: 'road', title: 'On the road', statuses: ['out_for_delivery'], help: 'With a driver now.', icon: Truck },
  { key: 'done', title: 'Delivered', statuses: ['delivered'], help: 'The most recent deliveries.', icon: CheckCircle2 },
] as const;

export default function OrdersScreen({ param, go }: ScreenProps) {
  const { hasPermission } = useAuth();
  const isStatus = !!param && param in ORDER_STATUS;
  const [view, setView] = useState<'board' | 'list'>(isStatus ? 'list' : 'board');
  const [picking, setPicking] = useState<string | null>(param?.startsWith('pick/') ? param.slice(5) : null);
  const [open, setOpen] = useState<string | null>(param && !isStatus && !param.startsWith('pick/') ? param : null);
  useEffect(() => {
    if (param?.startsWith('pick/')) setPicking(param.slice(5));
    else if (param && param in ORDER_STATUS) setView('list');
    else if (param) setOpen(param);
  }, [param]);

  if (picking) {
    return <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6"><PickOrder orderId={picking} onBack={() => { setPicking(null); go('orders'); }} /></div>;
  }
  return (
    <Screen
      title="Orders"
      intro="Every order moves left to right. Each card has one button for its next step."
      guide={<ol>
        <li><b>New</b>: paid with a card hold. Press <b>Start picking</b> and pick it item by item.</li>
        <li><b>Picking</b>: when every item is done press <b>Finish &amp; charge</b>. The exact amount is taken (never more than the hold).</li>
        <li><b>Ready to send</b>: press <b>Send out</b>, choose the van and driver. The customer gets an email.</li>
        <li><b>On the road</b>: press <b>Delivered</b> when it is handed over (check ID for age-restricted items). Press any card to see everything about the order.</li>
      </ol>}
      actions={hasPermission('order_status') && <Segmented value={view} onChange={(v) => setView(v as 'board' | 'list')} options={[{ value: 'board', label: 'Order board' }, { value: 'list', label: 'All orders & search' }]} />}
    >
      {view === 'board' ? <Board onOpen={setOpen} onPick={setPicking} /> : <AllOrders initialStatus={isStatus ? param! : ''} onOpen={setOpen} />}
      <OrderPanel orderId={open} onClose={() => setOpen(null)} go={(screen, p) => { setOpen(null); if (screen === 'orders' && p?.startsWith('pick/')) setPicking(p.slice(5)); else go(screen, p); }} />
    </Screen>
  );
}

// ── the board ───────────────────────────────────────────────────────────────────────────────────
const fromOrder = (o: OrderRow): Card => ({ id: o.id, orderNumber: o.orderNumber, customer: o.customer, where: [o.zone, o.postcode].filter(Boolean).join(' · ') || null, slot: o.slot,
  status: o.status, total: o.total, items: o.itemCount, progress: null, ageCheck: false, note: null, isSample: o.isSample, raw: o });
const fromQueue = (o: QueueRow): Card => ({ id: o.id, orderNumber: o.orderNumber, customer: o.customer, where: o.zone, slot: o.slot, status: o.status, total: o.total,
  items: o.lineCount, progress: [o.pickedCount, o.lineCount], ageCheck: o.ageCheck, note: o.notes, isSample: !!o.isSample, raw: null });

const Board: React.FC<{ onOpen: (id: string) => void; onPick: (id: string) => void }> = ({ onOpen, onPick }) => {
  const { hasPermission } = useAuth();
  const canList = hasPermission('order_status');
  const canPick = hasPermission('packing_queue');
  const [day, setDay] = useState('all');
  const opts = { refetchInterval: 30_000, enabled: canList };
  const q = {
    placed: useAdminQuery<Paged<OrderRow>>('admin_list_orders', { p_status: 'placed', p_limit: 200 }, opts),
    picking: useAdminQuery<Paged<OrderRow>>('admin_list_orders', { p_status: 'picking', p_limit: 200 }, opts),
    picked: useAdminQuery<Paged<OrderRow>>('admin_list_orders', { p_status: 'picked', p_limit: 200 }, opts),
    paid: useAdminQuery<Paged<OrderRow>>('admin_list_orders', { p_status: 'paid', p_limit: 200 }, opts),
    road: useAdminQuery<Paged<OrderRow>>('admin_list_orders', { p_status: 'out_for_delivery', p_limit: 200 }, opts),
    done: useAdminQuery<Paged<OrderRow>>('admin_list_orders', { p_status: 'delivered', p_limit: 30 }, opts),
  };
  // pickers without access to the full order list see their picking queue for the chosen day
  const queue = useAdminQuery<QueueRow[]>('staff_picking_queue', { p_date: day === 'tomorrow' ? londonToday(1) : londonToday() }, { refetchInterval: 30_000, enabled: !canList && canPick });
  const loading = canList ? Object.values(q).some((x) => x.isLoading) : queue.isLoading;
  const failed = canList ? Object.values(q).find((x) => x.error)?.error : queue.error;

  const cards: Card[] = useMemo(() => {
    if (!canList) return (queue.data ?? []).map(fromQueue);
    return [q.placed, q.picking, q.picked, q.paid, q.road, q.done].flatMap((x) => (x.data?.items ?? []).map(fromOrder));
  }, [canList, queue.data, q.placed.data, q.picking.data, q.picked.data, q.paid.data, q.road.data, q.done.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = londonToday();
  const tomorrow = londonToday(1);
  const inDay = (c: Card) => day === 'all' || (day === 'today' ? c.slot?.localDate === today : c.slot?.localDate === tomorrow);
  const columns = COLUMNS.filter((col) => canList || col.key === 'new' || col.key === 'picking');
  const bySlot = (a: Card, b: Card) => (a.slot?.startsAt ?? '9').localeCompare(b.slot?.startsAt ?? '9');

  if (loading) return <Loading />;
  if (failed) return <ErrorState error={failed} text={errorText(failed)} onRetry={() => { Object.values(q).forEach((x) => void x.refetch()); void queue.refetch(); }} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13.5px] font-medium">Delivery day</span>
        <Segmented size="sm" value={day} onChange={setDay} options={[...(canList ? [{ value: 'all', label: 'All' }] : []), { value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow' }]} />
      </div>
      <div className="grid grid-flow-col auto-cols-[minmax(270px,1fr)] gap-3 overflow-x-auto pb-2">
        {columns.map((col) => {
          const list = cards.filter((c) => (col.statuses as readonly string[]).includes(c.status) && inDay(c)).sort(bySlot);
          const Icon = col.icon;
          return (
            <section key={col.key} aria-label={col.title} className="bg-[#E3E6EA] rounded-md p-2 flex flex-col min-h-[200px]">
              <header className="px-1.5 pt-1 pb-2.5">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-[#3F4652]" />
                  <h2 className="text-[14px] font-semibold flex-1">{col.title}</h2>
                  <span className="min-w-6 h-6 px-1.5 rounded-full bg-white text-[12.5px] font-semibold flex items-center justify-center tabular-nums">{list.length}</span>
                </div>
                <p className="text-[12px] text-[#4B5563] mt-0.5">{col.help}</p>
              </header>
              <ColumnCards list={list} onOpen={onOpen} onPick={onPick} />
            </section>
          );
        })}
      </div>
    </div>
  );
};

const ColumnCards: React.FC<{ list: Card[]; onOpen: (id: string) => void; onPick: (id: string) => void }> = ({ list, onOpen, onPick }) => {
  const [shown, setShown] = useState(15);
  if (!list.length) return <p className="text-[12.5px] text-[#5F6B7A] px-1.5 py-3">Nothing here.</p>;
  return (
    <div className="space-y-2">
      {list.slice(0, shown).map((c) => <OrderCard key={c.id} c={c} onOpen={() => onOpen(c.id)} onPick={() => onPick(c.id)} />)}
      {list.length > shown && <Button size="sm" variant="ghost" className="w-full" onClick={() => setShown((s) => s + 15)}>Show {Math.min(15, list.length - shown)} more of {list.length - shown}</Button>}
    </div>
  );
};

const OrderCard: React.FC<{ c: Card; onOpen: () => void; onPick: () => void }> = ({ c, onOpen, onPick }) => {
  const { hasPermission } = useAuth();
  const { run, busy } = useAction();
  const [sending, setSending] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const isToday = c.slot?.localDate === londonToday();
  const row: DeliveryRow = c.raw ?? { id: c.id, orderNumber: c.orderNumber, customer: c.customer, zone: c.where, postcode: null, slot: c.slot, status: c.status, total: c.total, itemCount: c.items ?? 0, van: null, isSample: c.isSample };

  let action: React.ReactNode = null;
  if (c.status === 'placed' && hasPermission('packing_queue')) {
    action = <Button variant="primary" className="w-full" loading={busy} onClick={async () => { const ok = await run('staff_start_picking', { p_order_id: c.id }, { refresh: ['admin_list_orders', 'staff_picking_queue'] }); if (ok !== undefined) onPick(); }}>Start picking</Button>;
  } else if (c.status === 'picking' && (hasPermission('packing_queue') || hasPermission('barcode_picking'))) {
    action = <Button variant="dark" className="w-full" onClick={onPick}>Continue picking{c.progress ? ` (${c.progress[0]} of ${c.progress[1]})` : ''}</Button>;
  } else if (c.status === 'picked') {
    action = <Button className="w-full" disabled>Taking payment…</Button>;
  } else if (c.status === 'paid' && hasPermission('orders_dispatch')) {
    action = <Button variant="primary" className="w-full" icon={<Truck className="w-4 h-4" />} onClick={() => setSending(true)}>Send out</Button>;
  } else if (c.status === 'out_for_delivery' && hasPermission('orders_dispatch')) {
    action = <Button variant="dark" className="w-full" icon={<CheckCircle2 className="w-4 h-4" />} onClick={() => setDelivering(true)}>Delivered</Button>;
  }

  return (
    <article className="bg-white rounded-md border border-[#D6DBE1] shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
      <button type="button" onClick={onOpen} className="w-full text-left p-3 pb-2 cursor-pointer hover:bg-[#FAFBFC] rounded-t-md">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-[14.5px]">{c.orderNumber}</span>
          <span className="text-[14px] font-semibold tabular-nums">{money(c.total)}</span>
        </div>
        <div className="text-[13px] text-[#3F4652] mt-0.5 truncate">{c.customer}{c.where ? ` · ${c.where}` : ''}</div>
        <div className={cx('flex items-center gap-1.5 text-[13px] mt-1.5', isToday ? 'text-[#18181B] font-semibold' : 'text-[#5F6B7A]')}>
          <Clock className="w-3.5 h-3.5" />{c.slot?.localDate ? `${isToday ? 'Today' : ''}${isToday ? ', ' : ''}${isToday ? `${c.slot.startLocal}–${c.slot.endLocal}` : slotText(c.slot)}` : 'No delivery time'}
        </div>
        {(c.ageCheck || c.note || c.isSample || c.items) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {c.items != null && <Badge>{c.items} items</Badge>}
            {c.ageCheck && <Badge tone="amber">ID check</Badge>}
            {c.note && <Badge tone="blue" title={c.note}>Has a note</Badge>}
            <SampleTag show={c.isSample} />
          </div>
        )}
      </button>
      {action && <div className="px-3 pb-3 pt-1">{action}</div>}
      {sending && <SendOut order={row} onClose={() => setSending(false)} />}
      {delivering && <Deliver order={row} onClose={() => setDelivering(false)} />}
    </article>
  );
};

// ── all orders (history & search) ───────────────────────────────────────────────────────────────
const STAGES = ['placed', 'picking', 'paid', 'out_for_delivery', 'delivered', 'pending_payment', 'cancelled', 'partially_refunded', 'refunded'];

const AllOrders: React.FC<{ initialStatus: string; onOpen: (id: string) => void }> = ({ initialStatus, onOpen }) => {
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const list = usePagedList<OrderRow, Paged<OrderRow> & { statusCounts: Record<string, number> }>('admin_list_orders', {
    p_q: q || undefined, p_status: status || undefined, p_from: from || undefined, p_to: to || undefined,
  }, { refetchInterval: 30_000 });
  const counts = list.first?.statusCounts ?? {};
  return (
    <Card padded={false}>
      <div className="p-4 space-y-4 border-b border-[#E2E6EB]">
        <SearchInput value={q} onChange={setQ} placeholder="Search by order number, customer name, email or postcode…" />
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Stage"><Select value={status} onChange={setStatus} placeholder="All stages" options={STAGES.map((s) => ({ value: s, label: `${ORDER_STATUS[s].label}${counts[s] != null ? ` (${counts[s]})` : ''}` }))} /></Field>
          <Field label="Placed from"><TextInput type="date" value={from} onChange={setFrom} /></Field>
          <Field label="Placed until"><TextInput type="date" value={to} onChange={setTo} /></Field>
        </div>
      </div>
      {list.isLoading ? <Loading /> : list.error ? <ErrorState error={list.error} text={errorText(list.error)} onRetry={() => void list.refetch()} /> : !list.items.length ? (
        <Empty icon={<ShoppingBag className="w-5 h-5" />} title="No orders found" text={q || status || from || to ? 'Try clearing the search or filters.' : 'Orders appear here as soon as customers place them.'} />
      ) : (
        <>
          <Table>
            <thead><tr><Th>Order</Th><Th>Customer</Th><Th>Delivery</Th><Th>Stage</Th><Th className="text-right">Total</Th><Th>Placed</Th></tr></thead>
            <tbody>
              {list.items.map((o) => (
                <Tr key={o.id} onClick={() => onOpen(o.id)}>
                  <Td><div className="font-semibold">{o.orderNumber}</div><div className="text-xs text-slate-500">{o.itemCount} items <SampleTag show={o.isSample} /></div></Td>
                  <Td><div>{o.customer}</div><div className="text-xs text-slate-500">{o.postcode}</div></Td>
                  <Td className="whitespace-nowrap"><div>{slotText(o.slot)}</div><div className="text-xs text-slate-500">{o.zone}{o.van ? ` · van ${o.van}` : ''}</div></Td>
                  <Td><OrderStatus status={o.status} /></Td>
                  <Td className="text-right font-semibold tabular-nums">{money(o.total)}</Td>
                  <Td className="text-slate-500 whitespace-nowrap">{dateTime(o.placedAt ?? o.createdAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pager {...list.pager} />
        </>
      )}
    </Card>
  );
};
