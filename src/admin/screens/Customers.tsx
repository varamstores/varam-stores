import React, { useState } from 'react';
import { Mail, Users } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import type { Money } from '../../types/api';
import { useAuth } from '../../context/AuthContext';
import { useAction, useAdminQuery, usePagedList, money, date, dateTime, errorText, type Paged } from '../lib';
import { Badge, Button, Card, Chips, Drawer, Empty, ErrorState, Facts, Field, Loading, Modal, NumberInput, OrderStatus, SampleTag, Screen, SearchInput, Select, Table, Td, TextArea, TextInput, Th, Tr, Pager } from '../ui';
import { MessageModal, OrderPanel } from '../OrderPanel';

interface Row { id: string; name: string; tier: string | null; email: string; phone: string | null; points: number; status: string; hasLogin: boolean; isSample: boolean; orderCount: number; totalSpent: Money; lastOrderAt: string | null; memberSince: string; marketingEmail: boolean }
interface Customer extends Row {
  orders: Array<{ id: string; total: Money; status: string; createdAt: string; orderNumber: string }>;
  loyalty: { tier: string | null; balance: number; lifetime: number; history: Array<{ at: string; note: string | null; points: number; reason: string }> } | null;
  reviews: Array<{ id: string; rating: number; body: string; status: string; createdAt: string; product: string | null }>;
  consents: Record<string, { granted: boolean; at: string } | boolean>;
  messages: Array<{ channel: string; subject: string | null; status: string; createdAt: string; template: string | null }>;
  addresses: Array<{ id: string; label: string | null; line1: string; line2: string | null; city: string; postcode: string; isDefault: boolean; deliverable: boolean; zone: { name: string } | null }>;
  internalNotes: string | null;
}
const STATUS = { active: { label: 'Active', tone: 'green' }, vip: { label: 'VIP', tone: 'yellow' }, flagged: { label: 'Flagged', tone: 'red' } } as const;

export default function CustomersScreen({ param, go }: ScreenProps) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<string | null>(param);
  const { items, isLoading, error, refetch, pager } = usePagedList<Row, Paged<Row>>('admin_list_customers', { p_q: q || undefined, p_status: status || undefined });
  return (
    <Screen
      title="Customers"
      intro="Everyone who has an account or has ordered: their orders, points, addresses and what they agreed to receive."
      guide={<ul>
        <li>Mark good customers as <b>VIP</b>, or <b>Flag</b> someone to warn the team (for example repeated failed deliveries). Only staff see this.</li>
        <li><b>Private notes</b> are never shown to the customer.</li>
        <li>You can email a customer about their order or account at any time. Marketing emails only go to people who agreed to them.</li>
      </ul>}
    >
      <Card padded={false}>
        <div className="p-4 flex flex-col md:flex-row gap-2 md:items-center border-b border-slate-100">
          <SearchInput value={q} onChange={setQ} placeholder="Name, email or phone…" className="flex-1" />
          <Chips value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'vip', label: 'VIP' }, { value: 'flagged', label: 'Flagged' }]} />
        </div>
        {isLoading ? <Loading /> : error ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : !items.length ? (
          <Empty icon={<Users className="w-5 h-5" />} title="No customers found" />
        ) : (
          <>
            <Table>
              <thead><tr><Th>Customer</Th><Th className="text-right">Orders</Th><Th className="text-right">Spent</Th><Th className="text-right">Points</Th><Th>Last order</Th><Th>Emails</Th></tr></thead>
              <tbody>
                {items.map((c) => (
                  <Tr key={c.id} onClick={() => setOpen(c.id)}>
                    <Td><div className="font-medium flex items-center gap-1.5">{c.name}{c.status !== 'active' && <Badge tone={STATUS[c.status as keyof typeof STATUS]?.tone ?? 'grey'}>{STATUS[c.status as keyof typeof STATUS]?.label ?? c.status}</Badge>}<SampleTag show={c.isSample} /></div><div className="text-xs text-slate-500">{c.email}</div></Td>
                    <Td className="text-right tabular-nums">{c.orderCount}</Td>
                    <Td className="text-right tabular-nums">{money(c.totalSpent)}</Td>
                    <Td className="text-right tabular-nums">{c.points}{c.tier && <div className="text-[11px] text-slate-500">{c.tier}</div>}</Td>
                    <Td className="text-slate-500">{date(c.lastOrderAt)}</Td>
                    <Td>{c.marketingEmail ? <Badge tone="green">Offers OK</Badge> : <span className="text-xs text-slate-400">Service only</span>}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pager {...pager} />
          </>
        )}
      </Card>
      {open && <CustomerPanel id={open} onClose={() => { setOpen(null); if (param) go('customers'); }} go={go} />}
    </Screen>
  );
}

const CustomerPanel: React.FC<{ id: string; onClose: () => void; go: ScreenProps['go'] }> = ({ id, onClose, go }) => {
  const { hasPermission } = useAuth();
  const { data: c, isLoading, error, refetch } = useAdminQuery<Customer>('admin_get_customer', { p_id: id });
  const { run, busy } = useAction();
  const [notes, setNotes] = useState<string | null>(null);
  const [message, setMessage] = useState(false);
  const [points, setPoints] = useState(false);
  const [order, setOrder] = useState<string | null>(null);
  const consent = (k: string) => { const v = c?.consents?.[k]; return typeof v === 'boolean' ? v : !!v?.granted; };
  return (
    <Drawer open onClose={onClose} wide title={c ? <span className="flex items-center gap-2">{c.name} <SampleTag show={c.isSample} /></span> : 'Customer'} subtitle={c ? `Customer since ${date(c.memberSince)}` : undefined}
      footer={c && <><Button icon={<Mail className="w-4 h-4" />} onClick={() => setMessage(true)}>Email customer</Button></>}>
      {isLoading ? <Loading /> : error || !c ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <Card title="Contact">
              <Facts items={[
                ['Email', <a className="underline underline-offset-2" href={`mailto:${c.email}`}>{c.email}</a>],
                ['Phone', c.phone ? <a className="underline underline-offset-2" href={`tel:${c.phone}`}>{c.phone}</a> : '—'],
                ['Login', c.hasLogin ? 'Has an account' : 'No login (guest or imported)'],
                ['Marketing emails', consent('marketing_email') || c.marketingEmail ? 'Agreed' : 'Not agreed'],
                ['Marketing texts', consent('marketing_sms') ? 'Agreed' : 'Not agreed'],
              ]} />
            </Card>
            <Card title="Status and private notes">
              <Field label="Status"><Select value={c.status} onChange={(v) => void run('admin_update_customer', { p_id: c.id, p_status: v }, { success: 'Status saved', refresh: ['admin_get_customer', 'admin_list_customers'] })}
                options={[{ value: 'active', label: 'Active' }, { value: 'vip', label: 'VIP' }, { value: 'flagged', label: 'Flagged (warn the team)' }]} /></Field>
              <Field label="Private notes" help="Only staff see these." className="mt-3"><TextArea rows={3} value={notes ?? c.internalNotes ?? ''} onChange={setNotes} /></Field>
              {notes !== null && notes !== (c.internalNotes ?? '') && (
                <div className="flex justify-end mt-2"><Button size="sm" variant="primary" loading={busy} onClick={async () => { const ok = await run('admin_update_customer', { p_id: c.id, p_internal_notes: notes }, { success: 'Notes saved', refresh: ['admin_get_customer'] }); if (ok !== undefined) setNotes(null); }}>Save notes</Button></div>
              )}
            </Card>
          </div>

          <Card title={`Orders (${c.orders.length})`} description={`${money(c.totalSpent)} spent`} padded={false}>
            {!c.orders.length ? <p className="px-4 pb-4 text-sm text-slate-500">No orders yet.</p> : (
              <Table>
                <thead><tr><Th>Order</Th><Th>Stage</Th><Th className="text-right">Total</Th><Th>Placed</Th></tr></thead>
                <tbody>{c.orders.map((o) => <Tr key={o.id} onClick={() => setOrder(o.id)}><Td className="font-semibold">{o.orderNumber}</Td><Td><OrderStatus status={o.status} /></Td><Td className="text-right tabular-nums">{money(o.total)}</Td><Td className="text-slate-500">{dateTime(o.createdAt)}</Td></Tr>)}</tbody>
              </Table>
            )}
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card title="Loyalty points" actions={hasPermission('financials') && <Button size="sm" onClick={() => setPoints(true)}>Give or take points</Button>}>
              {c.loyalty ? (
                <>
                  <div className="flex gap-6 mb-3"><div><div className="text-xs text-slate-500">Balance</div><div className="text-2xl font-bold">{c.loyalty.balance}</div></div><div><div className="text-xs text-slate-500">Earned ever</div><div className="text-2xl font-bold">{c.loyalty.lifetime}</div></div>{c.tier && <div><div className="text-xs text-slate-500">Tier</div><div className="text-2xl font-bold">{c.tier}</div></div>}</div>
                  <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">{c.loyalty.history.map((h, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{h.note ?? h.reason.replace(/_/g, ' ')} <span className="text-xs text-slate-400">{date(h.at)}</span></span><span className={`tabular-nums font-semibold ${h.points < 0 ? 'text-[#8A2B2B]' : 'text-[#245740]'}`}>{h.points > 0 ? '+' : ''}{h.points}</span></li>)}</ul>
                </>
              ) : <p className="text-sm text-slate-500">No points yet.</p>}
            </Card>
            <Card title="Addresses">
              {!c.addresses.length ? <p className="text-sm text-slate-500">None saved.</p> : (
                <ul className="space-y-2 text-sm">{c.addresses.map((a) => <li key={a.id}><b>{a.label ?? 'Address'}</b>{a.isDefault && <> <Badge>Default</Badge></>}{!a.deliverable && <> <Badge tone="amber">Outside delivery area</Badge></>}<div className="text-slate-600">{a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city} {a.postcode}</div></li>)}</ul>
              )}
            </Card>
          </div>

          {(c.messages.length > 0 || c.reviews.length > 0) && (
            <div className="grid md:grid-cols-2 gap-4">
              <Card title="Emails sent">
                {!c.messages.length ? <p className="text-sm text-slate-500">None.</p> : <ul className="text-sm space-y-1">{c.messages.map((m, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{m.subject ?? m.template}</span><span className="text-xs text-slate-500 whitespace-nowrap">{dateTime(m.createdAt)}</span></li>)}</ul>}
              </Card>
              <Card title="Reviews">
                {!c.reviews.length ? <p className="text-sm text-slate-500">None.</p> : <ul className="text-sm space-y-2">{c.reviews.map((r) => <li key={r.id}><span className="text-[#B0701E]">{'★'.repeat(r.rating)}</span> <Badge>{r.status}</Badge><div className="text-slate-600 line-clamp-2">{r.body}</div></li>)}</ul>}
              </Card>
            </div>
          )}

          <MessageModal open={message} onClose={() => setMessage(false)} customerId={c.id} defaultSubject="A message from Varam Foods" />
          {points && <PointsModal customerId={c.id} balance={c.loyalty?.balance ?? 0} onClose={() => setPoints(false)} />}
          <OrderPanel orderId={order} onClose={() => setOrder(null)} go={go} />
        </>
      )}
    </Drawer>
  );
};

const PointsModal: React.FC<{ customerId: string; balance: number; onClose: () => void }> = ({ customerId, balance, onClose }) => {
  const { run, busy } = useAction();
  const [mode, setMode] = useState<'give' | 'take'>('give');
  const [n, setN] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const save = async () => {
    const ok = await run('admin_adjust_loyalty', { p_customer_id: customerId, p_points: mode === 'give' ? n : -(n ?? 0), p_reason: reason }, { success: 'Points updated', refresh: ['admin_get_customer', 'admin_list_customers'] });
    if (ok !== undefined) onClose();
  };
  return (
    <Modal open onClose={onClose} title="Give or take points"
      footer={<><Button variant="ghost" onClick={onClose}>Go back</Button><Button variant="primary" loading={busy} disabled={!n || !reason.trim()} onClick={() => void save()}>Save</Button></>}>
      <p className="text-sm text-slate-600">Balance now: <b>{balance}</b> points.</p>
      <div className="flex gap-2"><Button size="sm" variant={mode === 'give' ? 'dark' : 'outline'} onClick={() => setMode('give')}>Give points</Button><Button size="sm" variant={mode === 'take' ? 'dark' : 'outline'} onClick={() => setMode('take')}>Take points</Button></div>
      <Field label="How many points"><NumberInput value={n} onChange={(v) => setN(v == null ? null : Math.abs(v))} /></Field>
      <Field label="Reason" help="The customer sees this in their points history."><TextInput value={reason} onChange={setReason} placeholder="e.g. Sorry for the late delivery" /></Field>
    </Modal>
  );
};
