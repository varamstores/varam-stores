import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import { useAuth } from '../../context/AuthContext';
import { useAdminQuery, money, pence, date, ORDER_STATUS, errorText } from '../lib';
import { Card, Chips, ErrorState, Loading, Screen, Stat, Badge } from '../ui';
import type { Money } from '../../types/api';

interface Dashboard {
  range: string; from: string; to: string; showsMoney: boolean; newCustomers: number;
  kpis: { orders: number; cancelled: number; revenue: Money | null; refunded: Money | null; averageBasket: Money | null; expectedRevenue: Money | null };
  trend: Array<{ date: string; orders: number; revenue: number | null }>;
  topProducts: Array<{ name: string; units: number; revenue: Money | null }>;
  categoryShare: Array<{ name: string; revenue: Money }> | null;
  statusCounts: Record<string, number>;
  attention: {
    toPickToday: number; toDispatch: number; onTheRoad: number; awaitingPayment: number; pendingRefunds: number; lowStock: number; outOfStock: number;
    foodInfoMissing: number; reviewsToModerate: number; draftPurchaseOrders: number; emailsFailed: number; emailsWaiting: number;
    emailReady: boolean; invoicesReady: boolean; paymentMode: string;
  };
}

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'year', label: 'This year' },
];

export default function DashboardScreen({ go }: ScreenProps) {
  const { context, hasPermission } = useAuth();
  const [range, setRange] = useState('7d');
  const { data, isLoading, error, refetch } = useAdminQuery<Dashboard>('admin_dashboard', { p_range: range }, { refetchInterval: 60_000 });
  const first = context?.staff?.fullName.split(' ')[0] ?? '';

  const a = data?.attention;
  type Todo = { show: boolean; text: string; count: number; tone: 'red' | 'amber' | 'blue'; to: [string, string?]; perm: string };
  const candidates: Todo[] = a ? [
    { show: a.toPickToday > 0, count: a.toPickToday, text: 'orders to pick for today', tone: 'blue', to: ['picking'], perm: 'packing_queue' },
    { show: a.toDispatch > 0, count: a.toDispatch, text: 'packed orders waiting to go out', tone: 'blue', to: ['deliveries'], perm: 'orders_dispatch' },
    { show: a.pendingRefunds > 0, count: a.pendingRefunds, text: 'refund requests waiting for a decision', tone: 'amber', to: ['refunds'], perm: 'refund_requests' },
    { show: a.outOfStock > 0, count: a.outOfStock, text: 'products are out of stock', tone: 'red', to: ['stock', 'out'], perm: 'inventory_read' },
    { show: a.lowStock > 0, count: a.lowStock, text: 'products are running low', tone: 'amber', to: ['stock', 'low'], perm: 'inventory_read' },
    { show: a.draftPurchaseOrders > 0, count: a.draftPurchaseOrders, text: 'draft purchase orders to check and send', tone: 'amber', to: ['buying'], perm: 'inventory_read' },
    { show: a.reviewsToModerate > 0, count: a.reviewsToModerate, text: 'reviews waiting for approval', tone: 'amber', to: ['reviews'], perm: 'customer_messaging' },
    { show: a.emailsFailed > 0, count: a.emailsFailed, text: 'emails failed to send', tone: 'red', to: ['emails', 'failed'], perm: 'customer_messaging' },
    { show: a.foodInfoMissing > 0, count: a.foodInfoMissing, text: 'food products are missing legal food information (allergens, nutrition)', tone: 'amber', to: ['products', 'food_info'], perm: 'inventory_read' },
    { show: a.awaitingPayment > 0, count: a.awaitingPayment, text: 'checkouts waiting for payment', tone: 'blue', to: ['orders', 'pending_payment'], perm: 'order_status' },
  ] : [];
  const todo = candidates.filter((t) => t.show && hasPermission(t.perm));

  return (
    <Screen
      title={`Hello${first ? `, ${first}` : ''}`}
      intro="What is happening in the shop, and what needs doing next."
      actions={<Chips value={range} onChange={setRange} options={RANGES} />}
    >
      {isLoading ? <Loading /> : error || !data ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : (
        <>
          {(a!.paymentMode === 'simulated' || !a!.emailReady) && (
            <div className="space-y-2">
              {a!.paymentMode === 'simulated' && (
                <Card className="border-amber-300 bg-amber-50"><p className="text-sm text-amber-900"><b>Test mode:</b> checkout is not charging cards yet. Orders can be placed and handled end to end for practice. Switch to Stripe in Settings once the Stripe keys are added.</p></Card>
              )}
              {!a!.emailReady && (
                <Card className="border-amber-300 bg-amber-50"><p className="text-sm text-amber-900"><b>Emails are waiting:</b> the email service is not connected yet, so order and account emails are queued ({a!.emailsWaiting} waiting) and will send once it is.</p></Card>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Orders" value={data.kpis.orders} hint={`${data.kpis.cancelled} cancelled`} onClick={hasPermission('order_status') ? () => go('orders') : undefined} />
            {data.showsMoney ? (
              <>
                <Stat label="Sales (charged)" value={money(data.kpis.revenue)} hint={`${money(data.kpis.refunded)} refunded`} />
                <Stat label="Average basket" value={money(data.kpis.averageBasket)} hint={`${money(data.kpis.expectedRevenue)} still to charge`} />
              </>
            ) : <Stat label="Still to pick" value={a!.toPickToday} hint="for today" />}
            <Stat label="New customers" value={data.newCustomers} onClick={hasPermission('customer_messaging') ? () => go('customers') : undefined} />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card title="Needs your attention" description="Click a line to go straight there." className="lg:col-span-1">
              {todo.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" />All clear. Nothing is waiting.</div>
              ) : (
                <ul className="divide-y divide-slate-100 -my-2">
                  {todo.map((t) => (
                    <li key={t.text}>
                      <button type="button" onClick={() => go(...t.to)} className="w-full flex items-center gap-3 py-2.5 text-left group cursor-pointer">
                        <Badge tone={t.tone}>{t.count}</Badge>
                        <span className="text-sm flex-1">{t.text}</span>
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-[#18181B]" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title={data.showsMoney ? 'Orders and sales' : 'Orders'} description={`${date(data.from)} to ${date(data.to)}`} className="lg:col-span-2">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.trend.map((t) => ({ ...t, label: new Date(`${t.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), sales: t.revenue == null ? null : t.revenue / 100 }))}>
                    <CartesianGrid vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis yAxisId="o" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} width={28} />
                    {data.showsMoney && <YAxis yAxisId="s" orientation="right" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => `£${v}`} />}
                    <Tooltip formatter={(v, name) => (name === 'Sales' ? pence(Math.round(Number(v) * 100)) : v)} cursor={{ fill: '#FEF9C3' }} />
                    <Bar yAxisId="o" dataKey="orders" name="Orders" fill="#18181B" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    {data.showsMoney && <Bar yAxisId="s" dataKey="sales" name="Sales" fill="#F5D103" radius={[3, 3, 0, 0]} maxBarSize={28} />}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card title="Orders by stage" description="Right now, across all days.">
              {Object.keys(data.statusCounts).length === 0 ? <p className="text-sm text-slate-500">No orders in this period.</p> : (
                <ul className="space-y-1.5">
                  {Object.entries(data.statusCounts).sort((x, y) => y[1] - x[1]).map(([s, n]) => (
                    <li key={s} className="flex items-center justify-between text-sm">
                      <button type="button" className="hover:underline cursor-pointer" onClick={() => go('orders', s)}>{ORDER_STATUS[s]?.label ?? s}</button>
                      <span className="font-semibold tabular-nums">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Best sellers" description="Units ordered in this period.">
              {data.topProducts.length === 0 ? <p className="text-sm text-slate-500">No sales in this period yet.</p> : (
                <ol className="space-y-1.5">
                  {data.topProducts.slice(0, 8).map((p, i) => (
                    <li key={p.name} className="flex items-center gap-2 text-sm">
                      <span className="w-5 text-slate-400 tabular-nums">{i + 1}.</span>
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="font-semibold tabular-nums">{p.units}</span>
                      {data.showsMoney && <span className="w-16 text-right text-slate-500 tabular-nums">{money(p.revenue)}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            {data.showsMoney && (
              <Card title="Sales by category">
                {!data.categoryShare?.length ? <p className="text-sm text-slate-500">No sales in this period yet.</p> : (
                  <ul className="space-y-2">
                    {(() => {
                      const total = data.categoryShare.reduce((s, c) => s + c.revenue.amount, 0) || 1;
                      return data.categoryShare.slice(0, 8).map((c) => (
                        <li key={c.name} className="text-sm">
                          <div className="flex justify-between"><span className="truncate">{c.name}</span><span className="tabular-nums">{money(c.revenue)}</span></div>
                          <div className="h-1.5 bg-slate-100 rounded-full mt-1"><div className="h-full bg-[#F5D103] rounded-full" style={{ width: `${Math.round((c.revenue.amount / total) * 100)}%` }} /></div>
                        </li>
                      ));
                    })()}
                  </ul>
                )}
              </Card>
            )}
          </div>
        </>
      )}
    </Screen>
  );
}
