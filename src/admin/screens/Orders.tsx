import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import type { Money } from '../../types/api';
import { usePaged, money, dateTime, ORDER_STATUS, errorText, type Paged } from '../lib';
import { Button, Card, Chips, Empty, ErrorState, Field, Loading, OrderStatus, SampleTag, Screen, SearchInput, Table, Td, Th, TextInput, Tr } from '../ui';
import { OrderPanel, slotText, type SlotInfo } from '../OrderPanel';

interface OrderRow {
  id: string; orderNumber: string; customer: string; zone: string | null; postcode: string | null; slot: SlotInfo | null; status: string;
  total: Money; itemCount: number; van: string | null; placedAt: string | null; createdAt: string; isSample: boolean;
}
interface OrderList extends Paged<OrderRow> { statusCounts: Record<string, number> }

const STAGES = ['placed', 'picking', 'paid', 'out_for_delivery', 'delivered', 'pending_payment', 'cancelled', 'partially_refunded', 'refunded'];

export default function OrdersScreen({ param, go }: ScreenProps) {
  const isStatus = !!param && param in ORDER_STATUS;
  const [status, setStatus] = useState(isStatus ? param! : '');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState<string | null>(param && !isStatus ? param : null);
  const { first, items, isLoading, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = usePaged<OrderRow, OrderList>('admin_list_orders', {
    p_q: q || undefined, p_status: status || undefined, p_from: from || undefined, p_to: to || undefined,
  }, { refetchInterval: 30_000 });

  const counts = first?.statusCounts ?? {};
  const all = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Screen
      title="Orders"
      intro="Every order, newest first. Click one to see the items, the customer, the money and its history."
      guide={<ol>
        <li><b>New</b> orders are paid with a card hold and wait to be picked (see Picking).</li>
        <li>When picking is finished the exact amount is <b>charged</b> (never more than was held) and the order is <b>Ready to send</b>.</li>
        <li>Deliveries sends it out with a van and driver (<b>On the road</b>), then marks it <b>Delivered</b>.</li>
        <li>Unpaid orders can be <b>cancelled</b>. Charged orders are <b>refunded</b> instead: anyone with refund rights asks, a manager approves.</li>
      </ol>}
    >
      <Card padded={false}>
        <div className="p-4 space-y-3 border-b border-slate-100">
          <div className="flex flex-col md:flex-row gap-2">
            <SearchInput value={q} onChange={setQ} placeholder="Order number, customer name, email or postcode…" className="flex-1" />
            <div className="flex gap-2">
              <Field label={<span className="sr-only">From</span>}><TextInput type="date" value={from} onChange={setFrom} aria-label="From date" /></Field>
              <Field label={<span className="sr-only">To</span>}><TextInput type="date" value={to} onChange={setTo} aria-label="To date" /></Field>
            </div>
          </div>
          <Chips value={status} onChange={setStatus} options={[{ value: '', label: 'All', count: all }, ...STAGES.filter((s) => counts[s] || s === status).map((s) => ({ value: s, label: ORDER_STATUS[s].label, count: counts[s] ?? 0 }))]} />
        </div>
        {isLoading ? <Loading /> : error ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : !items.length ? (
          <Empty icon={<ShoppingBag className="w-5 h-5" />} title="No orders found" text={q || status || from || to ? 'Try clearing the search or filters.' : 'Orders appear here as soon as customers place them.'} />
        ) : (
          <>
            <Table>
              <thead><tr><Th>Order</Th><Th>Customer</Th><Th>Delivery</Th><Th>Stage</Th><Th className="text-right">Total</Th><Th>Placed</Th></tr></thead>
              <tbody>
                {items.map((o) => (
                  <Tr key={o.id} onClick={() => setOpen(o.id)}>
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
            <div className="flex items-center justify-between p-3 text-xs text-slate-500">
              <span>Showing {items.length} of {first?.total ?? items.length}</span>
              {hasNextPage && <Button size="sm" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>Show more</Button>}
            </div>
          </>
        )}
      </Card>
      <OrderPanel orderId={open} onClose={() => setOpen(null)} go={go} />
    </Screen>
  );
}
