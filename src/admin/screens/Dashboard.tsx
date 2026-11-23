import React, { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Boxes, CheckCircle2, ClipboardList, Clock, MailWarning, PackageCheck, PackageX, Star, Truck, Undo2, Utensils } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import { useAuth } from '../../context/AuthContext';
import { useAdminQuery, money, pence, date, ORDER_STATUS, errorText } from '../lib';
import { Card, ErrorState, Loading, Notice, Screen, Segmented, cx } from '../ui';
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

const RANGES = [{ value: 'today', label: 'Today' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: 'year', label: 'This year' }];

function greeting(): string {
  const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/London' }));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** A big tile for today's work: the number, what it means, and where pressing it goes. */
const WorkTile: React.FC<{ icon: React.ElementType; count: number; label: string; action: string; onClick: () => void; tone: 'amber' | 'violet' | 'sky' | 'red' }> = ({ icon: Icon, count, label, action, onClick, tone }) => {
  const idle = count === 0;
  const tones = { amber: 'bg-amber-100 text-amber-800', violet: 'bg-violet-100 text-violet-800', sky: 'bg-sky-100 text-sky-800', red: 'bg-red-100 text-red-700' };
  return (
    <button type="button" onClick={onClick} className={cx('group text-left rounded-xl border p-4 sm:p-5 cursor-pointer transition-colors', idle ? 'bg-white border-[#E4E7EC] hover:border-[#9AA3AF]' : 'bg-white border-[#18181B] hover:bg-[#FFFCEB]')}>
      <div className="flex items-center justify-between">
        <span className={cx('w-10 h-10 rounded-lg flex items-center justify-center', idle ? 'bg-[#F1F3F5] text-[#7A8594]' : tones[tone])}><Icon className="w-5 h-5" strokeWidth={1.75} /></span>
        <span className={cx('text-[34px] leading-none font-semibold tabular-nums', idle && 'text-[#C3C9D2]')}>{count}</span>
      </div>
      <div className="mt-4 text-[15px] font-medium">{label}</div>
      <div className="mt-1 text-[13px] text-[#5F6B7A] group-hover:text-[#18181B]">{idle ? 'Nothing waiting' : `${action} ›`}</div>
    </button>
  );
};

export default function DashboardScreen({ go }: ScreenProps) {
  const { context, hasPermission } = useAuth();
  const [range, setRange] = useState('7d');
  const { data, isLoading, error, refetch } = useAdminQuery<Dashboard>('admin_dashboard', { p_range: range }, { refetchInterval: 60_000 });
  const first = context?.staff?.fullName.split(' ')[0] ?? '';
  const a = data?.attention;

  type Item = { show: boolean; icon: React.ElementType; count: number; text: string; tone: 'red' | 'amber' | 'grey'; to: [string, string?]; perm: string };
  const items: Item[] = a ? [
    { show: a.outOfStock > 0, icon: PackageX, count: a.outOfStock, text: 'products are out of stock', tone: 'red', to: ['stock', 'out'], perm: 'inventory_read' },
    { show: a.emailsFailed > 0, icon: MailWarning, count: a.emailsFailed, text: 'emails could not be sent', tone: 'red', to: ['emails', 'failed'], perm: 'customer_messaging' },
    { show: a.lowStock > 0, icon: Boxes, count: a.lowStock, text: 'products are running low', tone: 'amber', to: ['stock', 'low'], perm: 'inventory_read' },
    { show: a.draftPurchaseOrders > 0, icon: ClipboardList, count: a.draftPurchaseOrders, text: 'draft purchase orders to check and send', tone: 'amber', to: ['buying'], perm: 'inventory_read' },
    { show: a.reviewsToModerate > 0, icon: Star, count: a.reviewsToModerate, text: 'reviews waiting for approval', tone: 'amber', to: ['reviews'], perm: 'customer_messaging' },
    { show: a.foodInfoMissing > 0, icon: Utensils, count: a.foodInfoMissing, text: 'food products missing allergens or nutrition (needed by law)', tone: 'amber', to: ['products', 'food_info'], perm: 'inventory_read' },
    { show: a.awaitingPayment > 0, icon: Clock, count: a.awaitingPayment, text: 'checkouts waiting for payment', tone: 'grey', to: ['orders', 'pending_payment'], perm: 'order_status' },
  ] : [];
  const todo = items.filter((t) => t.show && hasPermission(t.perm));
  const tiles = a ? [
    hasPermission('packing_queue') && <WorkTile key="pick" icon={PackageCheck} count={a.toPickToday} label="Orders to pick today" action="Start picking" tone="amber" onClick={() => go('picking')} />,
    hasPermission('orders_dispatch') && <WorkTile key="send" icon={Truck} count={a.toDispatch} label="Packed, ready to send" action="Send them out" tone="violet" onClick={() => go('deliveries')} />,
    hasPermission('orders_dispatch') && <WorkTile key="road" icon={Truck} count={a.onTheRoad} label="On the road now" action="Mark delivered" tone="sky" onClick={() => go('deliveries')} />,
    (hasPermission('refund_requests') || hasPermission('financials')) && <WorkTile key="refund" icon={Undo2} count={a.pendingRefunds} label="Refunds waiting for a decision" action="Decide" tone="red" onClick={() => go('refunds')} />,
  ].filter(Boolean) : [];

  return (
    <Screen title={`${greeting()}${first ? `, ${first}` : ''}`} intro="Today’s work first, then anything that needs fixing, then how sales are going.">
      {isLoading ? <Loading /> : error || !data ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : (
        <>
          {(a!.paymentMode === 'simulated' || !a!.emailReady) && (
            <Notice tone="warning">
              <b>Not fully live yet.</b>
              <ul className="list-disc pl-5 mt-1 space-y-0.5">
                {a!.paymentMode === 'simulated' && <li>Card payments are in <b>test mode</b>: orders can be handled end to end, but no card is charged. Switch to Stripe in Settings once the Stripe keys are added.</li>}
                {!a!.emailReady && <li>Emails are <b>queued, not sent</b>, until the email service is connected{a!.emailsWaiting ? ` (${a!.emailsWaiting} waiting)` : ''}.</li>}
              </ul>
            </Notice>
          )}

          {tiles.length > 0 && (
            <section aria-label="Today’s work" className={cx('grid gap-3', tiles.length >= 4 ? 'grid-cols-2 xl:grid-cols-4' : tiles.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2')}>{tiles}</section>
          )}

          <div className="grid xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-4">
            <Card title="Needs attention" description={todo.length ? 'Press a line to go straight there.' : undefined} padded={!todo.length}>
              {todo.length === 0 ? (
                <div className="flex items-center gap-2.5 text-[14px] text-emerald-800"><CheckCircle2 className="w-5 h-5 text-emerald-600" />All clear — nothing needs fixing.</div>
              ) : (
                <ul>
                  {todo.map((t) => {
                    const Icon = t.icon;
                    return (
                      <li key={t.text} className="border-b border-[#F0F2F5] last:border-0">
                        <button type="button" onClick={() => go(...t.to)} className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 text-left hover:bg-[#FFFCEB] cursor-pointer group">
                          <span className={cx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', t.tone === 'red' ? 'bg-red-50 text-red-600' : t.tone === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-[#F1F3F5] text-[#5F6B7A]')}><Icon className="w-4 h-4" /></span>
                          <span className="flex-1 text-[14px]"><b className="tabular-nums">{t.count}</b> {t.text}</span>
                          <span className="text-[20px] leading-none text-[#C3C9D2] group-hover:text-[#18181B]">›</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title="Sales" description={`${date(data.from)} – ${date(data.to)}`} actions={<Segmented size="sm" value={range} onChange={setRange} options={RANGES} />}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
                <Figure label="Orders" value={String(data.kpis.orders)} sub={data.kpis.cancelled ? `${data.kpis.cancelled} cancelled` : undefined} />
                {data.showsMoney ? <>
                  <Figure label="Charged" value={money(data.kpis.revenue)} sub={data.kpis.refunded?.amount ? `${money(data.kpis.refunded)} refunded` : undefined} />
                  <Figure label="Average basket" value={money(data.kpis.averageBasket)} />
                  <Figure label="Still to charge" value={money(data.kpis.expectedRevenue)} sub="orders not yet picked" />
                </> : <Figure label="New customers" value={String(data.newCustomers)} />}
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.trend.map((t) => ({ ...t, label: new Date(`${t.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), sales: t.revenue == null ? null : t.revenue / 100 }))}>
                    <CartesianGrid vertical={false} stroke="#EEF0F3" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#5F6B7A' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis yAxisId="o" allowDecimals={false} tick={{ fontSize: 12, fill: '#5F6B7A' }} tickLine={false} axisLine={false} width={28} />
                    {data.showsMoney && <YAxis yAxisId="s" orientation="right" tick={{ fontSize: 12, fill: '#5F6B7A' }} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => `£${v}`} />}
                    <Tooltip formatter={(v, name) => (name === 'Sales' ? pence(Math.round(Number(v) * 100)) : v)} cursor={{ fill: '#FFF8D6' }} />
                    <Bar yAxisId="o" dataKey="orders" name="Orders" fill="#18181B" radius={[4, 4, 0, 0]} maxBarSize={26} />
                    {data.showsMoney && <Bar yAxisId="s" dataKey="sales" name="Sales" fill="#F5D103" radius={[4, 4, 0, 0]} maxBarSize={26} />}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {data.showsMoney && <div className="flex gap-4 mt-2 text-[12.5px] text-[#5F6B7A]"><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#18181B]" />Orders</span><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#F5D103]" />Sales (£)</span></div>}
            </Card>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Card title="Best sellers" description="Units ordered in this period">
              {data.topProducts.length === 0 ? <p className="text-[14px] text-[#5F6B7A]">No sales in this period yet.</p> : (
                <ol className="space-y-2">
                  {data.topProducts.slice(0, 8).map((p, i) => (
                    <li key={p.name} className="flex items-center gap-3 text-[14px]">
                      <span className="w-5 text-right text-[#9AA3AF] tabular-nums">{i + 1}</span>
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="font-medium tabular-nums">{p.units}</span>
                      {data.showsMoney && <span className="w-20 text-right text-[#5F6B7A] tabular-nums">{money(p.revenue)}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            <Card title="Orders by stage" description="All open and recent orders">
              {Object.keys(data.statusCounts).length === 0 ? <p className="text-[14px] text-[#5F6B7A]">No orders yet.</p> : (
                <ul className="space-y-1">
                  {Object.entries(data.statusCounts).sort((x, y) => y[1] - x[1]).map(([s, n]) => (
                    <li key={s}>
                      <button type="button" className="w-full flex items-center justify-between gap-2 py-1.5 text-[14px] hover:underline cursor-pointer" onClick={() => go('orders', s)}>
                        <span>{ORDER_STATUS[s]?.label ?? s}</span><span className="font-medium tabular-nums">{n}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {data.showsMoney && (
              <Card title="Sales by category">
                {!data.categoryShare?.length ? <p className="text-[14px] text-[#5F6B7A]">No sales in this period yet.</p> : (
                  <ul className="space-y-3">
                    {(() => {
                      const total = data.categoryShare.reduce((s, c) => s + c.revenue.amount, 0) || 1;
                      return data.categoryShare.slice(0, 7).map((c) => (
                        <li key={c.name} className="text-[14px]">
                          <div className="flex justify-between gap-2"><span className="truncate">{c.name}</span><span className="tabular-nums text-[#5F6B7A]">{money(c.revenue)}</span></div>
                          <div className="h-1.5 bg-[#EEF0F3] rounded-full mt-1.5"><div className="h-full bg-[#18181B] rounded-full" style={{ width: `${Math.max(2, Math.round((c.revenue.amount / total) * 100))}%` }} /></div>
                        </li>
                      ));
                    })()}
                  </ul>
                )}
              </Card>
            )}
          </div>
          {!data.showsMoney && <p className="text-[12.5px] text-[#7A8594] flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />Money figures are only shown to roles with the finance permission.</p>}
        </>
      )}
    </Screen>
  );
}

const Figure: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div>
    <div className="text-[12.5px] text-[#5F6B7A]">{label}</div>
    <div className="text-[22px] font-semibold tabular-nums leading-tight mt-1">{value}</div>
    {sub && <div className="text-[12px] text-[#7A8594] mt-0.5">{sub}</div>}
  </div>
);
