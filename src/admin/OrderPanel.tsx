import React, { useState } from 'react';
import { FileText, Mail, PackageCheck, Truck, Undo2, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { Money } from '../types/api';
import { useAction, useAdminQuery, money, dateTime, ORDER_STATUS, errorText, pence, formatWeight } from './lib';
import { Badge, Button, Card, Checkbox, ConfirmButton, Drawer, ErrorState, Facts, Field, Loading, Modal, MoneyInput, Notice, OrderStatus, SampleTag, Table, Td, Th, TextArea, TextInput, Tr, cx } from './ui';

// One order, everything staff need, with the actions the person's role allows.

export interface SlotInfo { id: string | null; localDate: string | null; startLocal: string | null; endLocal: string | null; serviceLabel: string | null; startsAt: string | null }
export function slotText(s: SlotInfo | null | undefined): string {
  if (!s?.localDate) return 'No slot';
  const d = new Date(`${s.localDate}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${d}, ${s.startLocal}–${s.endLocal}`;
}

interface StaffLine {
  id: string; lineNo: number; type: string; sku: string; name: string; packSize: string | null; saleUnit: 'each' | 'weight'; status: string;
  quantityOrdered: number | null; quantityPicked: number | null; weightOrderedGrams: number | null; weightPickedGrams: number | null;
  unitPrice: Money; estGross: Money; finalGross: Money | null; substituteFor: string | null; substitutionAllowed: boolean; pickedBy: string | null;
}
interface Totals { items: Money; discount: Money; delivery: Money; deposit: Money; vat: Money; total: Money }
export interface StaffOrder {
  id: string; orderNumber: string; status: string; placedAt: string | null; createdAt: string; isSample: boolean; currency: string;
  customer: { id: string; name: string; email: string; phone: string | null; status: string; isSample: boolean } | null;
  contact: { email: string; phone: string | null };
  address: { fullName: string; line1: string; line2: string | null; city: string; postcode: string } | null;
  slot: SlotInfo | null; deliveryNotes: string | null; cancelReason: string | null; substitutionDefault: string | null;
  staffLines: StaffLine[];
  totals: { estimated: Totals; final: Totals | null; authorised: Money | null; captured: Money | null; refunded: Money | null };
  payment: { provider: string; status: string; brand: string | null; last4: string | null; wallet: string | null } | null;
  refundRequests: Array<{ id: string; status: string; reason: string; amount: Money | null; requestedBy: string | null; createdAt: string }>;
  refunds: Array<{ amount: Money; status: string; createdAt: string }>;
  creditNotes: Array<{ number: string; issuedAt: string; gross?: Money }>;
  invoice: { number: string; issuedAt: string } | null;
  messages: Array<{ channel: string; template: string | null; subject: string | null; status: string; createdAt: string }>;
  history: Array<{ at: string; from: string | null; to: string; actor: string | null; actorType: string; reason: string | null }>;
  van: { id: string; code: string; name: string } | null; driver: { id: string; name: string } | null;
  tracking: { etaStart: string | null; etaEnd: string | null; trackingCode: string | null } | null;
  minAge: number | null; idCheckRequired?: boolean; idCheckedAt?: string | null;
  promotions: Array<{ label: string; code: string | null; discount?: Money }>;
}

const PICK: Record<string, { label: string; tone: 'grey' | 'green' | 'amber' | 'red' | 'violet' }> = {
  pending: { label: 'To pick', tone: 'grey' }, picked: { label: 'Picked', tone: 'green' }, short: { label: 'Short', tone: 'amber' },
  missing: { label: 'Missing', tone: 'red' }, substituted: { label: 'Replaced', tone: 'violet' },
};

export function lineAmount(l: StaffLine): string {
  if (l.saleUnit === 'weight') {
    const o = formatWeight(l.weightOrderedGrams);
    return l.weightPickedGrams != null && l.status !== 'pending' ? `${formatWeight(l.weightPickedGrams)} of ${o}` : o;
  }
  return l.quantityPicked != null && l.status !== 'pending' ? `${l.quantityPicked} of ${l.quantityOrdered}` : `× ${l.quantityOrdered}`;
}

export const OrderPanel: React.FC<{ orderId: string | null; onClose: () => void; go?: (screen: string, param?: string) => void }> = ({ orderId, onClose, go }) => {
  const { data: o, isLoading, error, refetch } = useAdminQuery<StaffOrder>('staff_get_order', { p_order_id: orderId }, { enabled: !!orderId });
  const { hasPermission } = useAuth();
  const { run } = useAction();
  const [refundOpen, setRefundOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);

  const s = o ? ORDER_STATUS[o.status] : null;
  const captured = o?.totals.captured?.amount ?? 0;
  const refunded = o?.totals.refunded?.amount ?? 0;
  const canCancel = !!o && ['pending_payment', 'placed', 'picking'].includes(o.status) && hasPermission('order_status');
  const canRefund = !!o && captured > refunded && hasPermission('refund_requests') && !o.refundRequests.some((r) => r.status === 'pending');
  const canInvoice = !!o && captured > 0 && !o.invoice && hasPermission('financials');

  return (
    <Drawer
      open={!!orderId}
      onClose={onClose}
      wide
      title={o ? <span className="flex flex-wrap items-center gap-2">Order {o.orderNumber} <OrderStatus status={o.status} /> <SampleTag show={o.isSample} /></span> : 'Order'}
      subtitle={o ? `Placed ${dateTime(o.placedAt ?? o.createdAt)}${s ? ` · ${s.help}` : ''}` : undefined}
      footer={o && (
        <>
          {go && ['placed', 'picking'].includes(o.status) && hasPermission('packing_queue') && <Button icon={<PackageCheck className="w-4 h-4" />} onClick={() => go('picking', o.id)}>Pick this order</Button>}
          {go && ['paid', 'out_for_delivery'].includes(o.status) && hasPermission('orders_dispatch') && <Button icon={<Truck className="w-4 h-4" />} onClick={() => go('deliveries')}>Go to deliveries</Button>}
          {o.customer && hasPermission('customer_messaging') && <Button icon={<Mail className="w-4 h-4" />} onClick={() => setMessageOpen(true)}>Message customer</Button>}
          {canInvoice && <Button icon={<FileText className="w-4 h-4" />} onClick={() => void run('admin_issue_invoice', { p_order_id: o.id }, { success: 'Invoice issued' })}>Issue VAT invoice</Button>}
          {canRefund && <Button icon={<Undo2 className="w-4 h-4" />} onClick={() => setRefundOpen(true)}>Refund…</Button>}
          {canCancel && (
            <ConfirmButton variant="danger" icon={<XCircle className="w-4 h-4" />} danger title={`Cancel order ${o.orderNumber}?`} confirmLabel="Cancel the order"
              text="The card hold is released, stock and the delivery slot are freed, any promo code can be used again, and the customer gets an email. This cannot be undone."
              reason="Reason (the customer sees this)"
              onConfirm={(reason) => run('admin_cancel_order', { p_order_id: o.id, p_reason: reason }, { success: 'Order cancelled' })}>
              Cancel order
            </ConfirmButton>
          )}
        </>
      )}
    >
      {isLoading ? <Loading /> : error || !o ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : (
        <>
          {o.cancelReason && <Notice tone="danger">Cancelled: {o.cancelReason}</Notice>}
          {o.refundRequests.filter((r) => r.status === 'pending').map((r) => (
            <Notice key={r.id} tone="warning" action={go && hasPermission('financials') ? <Button size="sm" onClick={() => go('refunds')}>Decide</Button> : undefined}>
              Refund of {r.amount ? money(r.amount) : 'chosen items'} requested{r.requestedBy ? ` by ${r.requestedBy}` : ''}: “{r.reason}”. Waiting for a manager.
            </Notice>
          ))}

          <div className="grid md:grid-cols-2 gap-4">
            <Card title="Customer">
              <Facts items={[
                ['Name', o.customer ? (go && hasPermission('customer_messaging')
                  ? <button type="button" className="underline underline-offset-2 cursor-pointer" onClick={() => go('customers', o.customer!.id)}>{o.customer.name}</button>
                  : o.customer.name) : o.address?.fullName],
                ['Email', <a className="underline underline-offset-2" href={`mailto:${o.contact.email}`}>{o.contact.email}</a>],
                ['Phone', o.contact.phone ? <a className="underline underline-offset-2" href={`tel:${o.contact.phone}`}>{o.contact.phone}</a> : '—'],
                o.customer?.status === 'vip' ? ['Status', <Badge tone="yellow">VIP</Badge>] : o.customer?.status === 'flagged' ? ['Status', <Badge tone="red">Flagged</Badge>] : null,
                ['Substitutes', o.substitutionDefault === 'dont_allow' ? 'Not allowed' : 'Allowed (per item)'],
              ]} />
            </Card>
            <Card title="Delivery">
              <Facts items={[
                ['When', slotText(o.slot)],
                ['Address', o.address ? <>{o.address.line1}{o.address.line2 ? `, ${o.address.line2}` : ''}<br />{o.address.city} {o.address.postcode}</> : '—'],
                o.deliveryNotes ? ['Notes', <span className="font-medium text-[#7A4A0F]">{o.deliveryNotes}</span>] : null,
                o.minAge ? ['ID check', <Badge tone="amber">Over {o.minAge} — check ID on delivery{o.idCheckedAt ? ' (checked)' : ''}</Badge>] : null,
                o.van ? ['Van', `${o.van.code} ${o.van.name}`] : null,
                o.driver ? ['Driver', o.driver.name] : null,
                o.tracking?.etaStart ? ['Arriving', `${dateTime(o.tracking.etaStart)}–${o.tracking.etaEnd ? new Date(o.tracking.etaEnd).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : ''}`] : null,
              ]} />
            </Card>
          </div>

          <Card title={`Items (${o.staffLines.filter((l) => !l.substituteFor).length})`} padded={false}>
            <Table>
              <thead><tr><Th>Product</Th><Th>Amount</Th><Th>Picking</Th><Th className="text-right">Price</Th></tr></thead>
              <tbody>
                {o.staffLines.map((l) => (
                  <Tr key={l.id} className={cx(l.substituteFor && 'bg-[#F0E6EE]/40')}>
                    <Td>
                      <div className={cx('font-medium', l.substituteFor && 'pl-4')}>{l.substituteFor ? '↳ ' : ''}{l.name}</div>
                      <div className={cx('text-xs text-slate-500', l.substituteFor && 'pl-4')}>{l.sku}{l.packSize ? ` · ${l.packSize}` : ''}{l.substituteFor ? ' · substitute' : !l.substitutionAllowed ? ' · no substitutes' : ''}</div>
                    </Td>
                    <Td className="whitespace-nowrap">{lineAmount(l)}</Td>
                    <Td><Badge tone={PICK[l.status]?.tone ?? 'grey'}>{PICK[l.status]?.label ?? l.status}</Badge>{l.pickedBy && <div className="text-[11px] text-slate-500 mt-0.5">{l.pickedBy}</div>}</Td>
                    <Td className="text-right whitespace-nowrap tabular-nums">
                      {l.finalGross ? <>{money(l.finalGross)}{l.finalGross.amount !== l.estGross.amount && <div className="text-[11px] text-slate-400 line-through">{money(l.estGross)}</div>}</> : money(l.estGross)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card title="Money">
              <Facts items={[
                ['Items', money((o.totals.final ?? o.totals.estimated).items)],
                (o.totals.final ?? o.totals.estimated).discount.amount ? ['Discount', `− ${money((o.totals.final ?? o.totals.estimated).discount)}`] : null,
                ['Delivery', money((o.totals.final ?? o.totals.estimated).delivery)],
                (o.totals.final ?? o.totals.estimated).deposit.amount ? ['Deposit', money((o.totals.final ?? o.totals.estimated).deposit)] : null,
                ['Total', <b>{money((o.totals.final ?? o.totals.estimated).total)}{!o.totals.final && <span className="font-normal text-slate-500"> (estimate until picked)</span>}</b>],
                ['of which VAT', money((o.totals.final ?? o.totals.estimated).vat)],
                ['Card held', money(o.totals.authorised)],
                ['Charged', money(o.totals.captured)],
                refunded > 0 ? ['Refunded', <span className="text-[#8A2B2B]">{pence(refunded)}</span>] : null,
                ['Paid with', o.payment ? (o.payment.provider === 'simulated' ? 'Test mode (no card)' : o.payment.provider === 'sample' ? 'Example data' : `${o.payment.brand ?? 'Card'}${o.payment.last4 ? ` •••• ${o.payment.last4}` : ''}${o.payment.wallet ? ` (${o.payment.wallet})` : ''}`) : '—'],
                o.promotions.length ? ['Offers', o.promotions.map((p) => p.code ?? p.label).join(', ')] : null,
                ['VAT invoice', o.invoice ? `${o.invoice.number} · ${dateTime(o.invoice.issuedAt)}` : 'Not issued'],
                o.creditNotes.length ? ['Credit notes', o.creditNotes.map((c) => c.number).join(', ')] : null,
              ]} />
            </Card>
            <Card title="History">
              <ol className="relative border-l border-slate-200 ml-1.5 space-y-3">
                {[...o.history].reverse().map((h, i) => (
                  <li key={i} className="pl-4 relative">
                    <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#18181B]" />
                    <div className="text-sm font-medium">{ORDER_STATUS[h.to]?.label ?? h.to}</div>
                    <div className="text-xs text-slate-500">{dateTime(h.at)}{h.actor ? ` · ${h.actor}` : h.actorType === 'system' ? ' · automatic' : ''}</div>
                    {h.reason && <div className="text-xs text-slate-600 mt-0.5">{h.reason}</div>}
                  </li>
                ))}
              </ol>
              {o.messages.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-500 mb-1.5">Messages to the customer</div>
                  <ul className="space-y-1 text-sm">
                    {o.messages.map((m, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{m.subject ?? m.template}</span><Badge tone={m.status === 'sent' ? 'green' : m.status === 'failed' ? 'red' : 'grey'}>{m.status}</Badge></li>)}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          <RefundModal open={refundOpen} onClose={() => setRefundOpen(false)} order={o} available={captured - refunded} />
          {o.customer && <MessageModal open={messageOpen} onClose={() => setMessageOpen(false)} customerId={o.customer.id} orderId={o.id} defaultSubject={`Your order ${o.orderNumber}`} />}
        </>
      )}
    </Drawer>
  );
};

const RefundModal: React.FC<{ open: boolean; onClose: () => void; order: StaffOrder; available: number }> = ({ open, onClose, order, available }) => {
  const { run, busy } = useAction();
  const [mode, setMode] = useState<'lines' | 'amount'>('lines');
  const [lines, setLines] = useState<string[]>([]);
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const refundable = order.staffLines.filter((l) => l.finalGross && l.finalGross.amount > 0);
  const submit = async () => {
    const p = mode === 'lines' ? { reason, lines: lines.map((lineId) => ({ lineId })) } : { reason, amountMinor: amount };
    const ok = await run('admin_request_refund', { p_order_id: order.id, p }, { success: 'Refund requested — a manager will approve it' });
    if (ok !== undefined) { onClose(); setLines([]); setAmount(null); setReason(''); }
  };
  const valid = reason.trim() && (mode === 'lines' ? lines.length > 0 : amount != null && amount > 0 && amount <= available);
  return (
    <Modal open={open} onClose={onClose} title={`Refund on ${order.orderNumber}`} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Go back</Button><Button variant="primary" loading={busy} disabled={!valid} onClick={() => void submit()}>Ask for approval</Button></>}>
      <p className="text-sm text-slate-600">Up to <b>{pence(available)}</b> can be refunded. A manager (finance permission) approves it, then the money goes back to the customer’s card.</p>
      <div className="flex gap-2">
        <Button size="sm" variant={mode === 'lines' ? 'dark' : 'outline'} onClick={() => setMode('lines')}>Refund items</Button>
        <Button size="sm" variant={mode === 'amount' ? 'dark' : 'outline'} onClick={() => setMode('amount')}>Refund an amount</Button>
      </div>
      {mode === 'lines' ? (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {refundable.map((l) => (
            <Checkbox key={l.id} checked={lines.includes(l.id)} onChange={(v) => setLines((cur) => (v ? [...cur, l.id] : cur.filter((x) => x !== l.id)))}
              label={<span className="flex justify-between gap-3"><span>{l.name} <span className="text-slate-500">({lineAmount(l)})</span></span><span className="tabular-nums">{money(l.finalGross)}</span></span>} />
          ))}
          {refundable.length === 0 && <p className="text-sm text-slate-500">No charged items. Use “Refund an amount”.</p>}
        </div>
      ) : (
        <Field label="Amount to refund" help={`Most: ${pence(available)}`}><MoneyInput value={amount} onChange={setAmount} /></Field>
      )}
      <Field label="Reason" help="For example: “2 eggs broken”. Shown to the manager and on the credit note."><TextArea rows={2} value={reason} onChange={setReason} /></Field>
    </Modal>
  );
};

export const MessageModal: React.FC<{ open: boolean; onClose: () => void; customerId: string; orderId?: string; defaultSubject?: string }> = ({ open, onClose, customerId, orderId, defaultSubject = '' }) => {
  const { run, busy } = useAction();
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState('');
  const send = async () => {
    const ok = await run('admin_send_customer_message', { p_customer_id: customerId, p_channel: 'email', p_subject: subject, p_body: body, p_order_id: orderId ?? null },
      { success: 'Email queued — it goes out within a minute' });
    if (ok !== undefined) { setBody(''); onClose(); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Email the customer" size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Go back</Button><Button variant="primary" loading={busy} disabled={!subject.trim() || !body.trim()} onClick={() => void send()}>Send email</Button></>}>
      <p className="text-sm text-slate-600">For service messages about their order or account. Marketing needs their consent and is sent from Customers.</p>
      <Field label="Subject"><TextInput value={subject} onChange={setSubject} /></Field>
      <Field label="Message"><TextArea rows={7} value={body} onChange={setBody} placeholder="Hello, …" /></Field>
    </Modal>
  );
};
