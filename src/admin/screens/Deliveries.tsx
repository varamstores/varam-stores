import React, { useState } from 'react';
import { CheckCircle2, Truck } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import type { Money } from '../../types/api';
import { useAction, useAdminQuery, money, errorText, dateTime } from '../lib';
import { Button, Card, Checkbox, Empty, ErrorState, Field, Loading, Modal, Notice, SampleTag, Screen, Select, Table, Td, Th, TextInput, Tr } from '../ui';
import { OrderPanel, slotText, type SlotInfo, type StaffOrder } from '../OrderPanel';

export interface Row { id: string; orderNumber: string; customer: string; zone: string | null; postcode: string | null; slot: SlotInfo | null; status: string; total: Money; itemCount: number; van: string | null; isSample: boolean }
interface Fleet { vans: Array<{ id: string; code: string; name: string; isActive: boolean }>; drivers: Array<{ id: string; name: string; isActive: boolean }> }

export default function DeliveriesScreen({ go }: ScreenProps) {
  const ready = useAdminQuery<{ items: Row[] }>('admin_list_orders', { p_status: 'paid', p_limit: 200 }, { refetchInterval: 30_000 });
  const road = useAdminQuery<{ items: Row[] }>('admin_list_orders', { p_status: 'out_for_delivery', p_limit: 200 }, { refetchInterval: 30_000 });
  const [sending, setSending] = useState<Row | null>(null);
  const [delivering, setDelivering] = useState<Row | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const bySlot = (rows: Row[]) => [...rows].sort((a, b) => (a.slot?.startsAt ?? '').localeCompare(b.slot?.startsAt ?? ''));

  return (
    <Screen
      title="Deliveries"
      intro="Send packed orders out with a van and driver, then mark them delivered."
      guide={<ol>
        <li><b>Ready to send</b> lists orders that are picked, packed and charged.</li>
        <li>Press <b>Send out</b>, choose the van and driver. The customer is emailed that their order is on the way.</li>
        <li>When it is handed over press <b>Delivered</b>. For age-restricted items, tick that you checked their ID.</li>
        <li>Vans and drivers are added under <b>Delivery areas &amp; slots → Vans &amp; drivers</b>.</li>
      </ol>}
    >
      <Card title={`Ready to send (${ready.data?.items.length ?? 0})`} description="Earliest delivery slot first." padded={false}>
        {ready.isLoading ? <Loading /> : ready.error ? <ErrorState error={ready.error} text={errorText(ready.error)} onRetry={() => void ready.refetch()} /> : !ready.data?.items.length
          ? <Empty icon={<CheckCircle2 className="w-5 h-5" />} title="Nothing waiting to go out" />
          : (
            <Table>
              <thead><tr><Th>Order</Th><Th>Slot</Th><Th>Where</Th><Th className="text-right">Total</Th><Th /></tr></thead>
              <tbody>
                {bySlot(ready.data.items).map((o) => (
                  <Tr key={o.id}>
                    <Td><button type="button" className="font-semibold underline-offset-2 hover:underline cursor-pointer" onClick={() => setOpen(o.id)}>{o.orderNumber}</button> <SampleTag show={o.isSample} /><div className="text-xs text-slate-500">{o.customer} · {o.itemCount} items</div></Td>
                    <Td className="whitespace-nowrap">{slotText(o.slot)}</Td>
                    <Td>{o.zone}<div className="text-xs text-slate-500">{o.postcode}</div></Td>
                    <Td className="text-right tabular-nums">{money(o.total)}</Td>
                    <Td className="text-right"><Button size="sm" variant="primary" icon={<Truck className="w-3.5 h-3.5" />} onClick={() => setSending(o)}>Send out</Button></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
      </Card>

      <Card title={`On the road (${road.data?.items.length ?? 0})`} padded={false}>
        {road.isLoading ? <Loading /> : road.error ? <ErrorState error={road.error} text={errorText(road.error)} onRetry={() => void road.refetch()} /> : !road.data?.items.length
          ? <Empty title="No orders on the road" />
          : (
            <Table>
              <thead><tr><Th>Order</Th><Th>Slot</Th><Th>Van</Th><Th>Where</Th><Th /></tr></thead>
              <tbody>
                {bySlot(road.data.items).map((o) => (
                  <Tr key={o.id}>
                    <Td><button type="button" className="font-semibold hover:underline cursor-pointer" onClick={() => setOpen(o.id)}>{o.orderNumber}</button> <SampleTag show={o.isSample} /><div className="text-xs text-slate-500">{o.customer}</div></Td>
                    <Td className="whitespace-nowrap">{slotText(o.slot)}</Td>
                    <Td>{o.van ?? '—'}</Td>
                    <Td>{o.zone}<div className="text-xs text-slate-500">{o.postcode}</div></Td>
                    <Td className="text-right"><Button size="sm" variant="dark" onClick={() => setDelivering(o)}>Delivered</Button></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
      </Card>

      {sending && <SendOut order={sending} onClose={() => setSending(null)} />}
      {delivering && <Deliver order={delivering} onClose={() => setDelivering(null)} />}
      <OrderPanel orderId={open} onClose={() => setOpen(null)} go={go} />
    </Screen>
  );
}

export const SendOut: React.FC<{ order: Row; onClose: () => void }> = ({ order, onClose }) => {
  const fleet = useAdminQuery<Fleet>('admin_list_fleet');
  const { run, busy } = useAction();
  const [van, setVan] = useState('');
  const [driver, setDriver] = useState('');
  const [etaStart, setEtaStart] = useState('');
  const [etaEnd, setEtaEnd] = useState('');
  const vans = fleet.data?.vans.filter((v) => v.isActive) ?? [];
  const drivers = fleet.data?.drivers.filter((d) => d.isActive) ?? [];
  const toIso = (t: string) => {
    if (!t || !order.slot?.localDate) return null;
    // local London time on the delivery day → ISO with the right offset
    const guess = new Date(`${order.slot.localDate}T${t}:00Z`);
    const londonHour = Number(guess.toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/London' }));
    let offset = (londonHour - guess.getUTCHours() + 24) % 24; // 0 in winter, 1 in summer
    if (offset > 12) offset -= 24;
    return new Date(guess.getTime() - offset * 3600_000).toISOString();
  };
  const send = async () => {
    const ok = await run('staff_dispatch_order', { p_order_id: order.id, p_van_id: van, p_driver_id: driver, p_eta_start: toIso(etaStart), p_eta_end: toIso(etaEnd) },
      { success: `${order.orderNumber} is on the road` });
    if (ok !== undefined) onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Send out ${order.orderNumber}`}
      footer={<><Button variant="ghost" onClick={onClose}>Go back</Button><Button variant="primary" loading={busy} disabled={!van || !driver} onClick={() => void send()}>Send out</Button></>}>
      {fleet.isLoading ? <Loading /> : (
        <>
          {(!vans.length || !drivers.length) && <Notice tone="warning">Add an active van and driver first (Delivery areas &amp; slots → Vans &amp; drivers).</Notice>}
          <Field label="Van"><Select value={van} onChange={setVan} placeholder="Choose a van" options={vans.map((v) => ({ value: v.id, label: `${v.code} ${v.name}` }))} /></Field>
          <Field label="Driver"><Select value={driver} onChange={setDriver} placeholder="Choose a driver" options={drivers.map((d) => ({ value: d.id, label: d.name }))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Arriving from" optional help={`Default: the slot (${order.slot?.startLocal ?? '—'})`}><TextInput type="time" value={etaStart} onChange={setEtaStart} /></Field>
            <Field label="Arriving by" optional help={`Default: ${order.slot?.endLocal ?? '—'}`}><TextInput type="time" value={etaEnd} onChange={setEtaEnd} /></Field>
          </div>
        </>
      )}
    </Modal>
  );
};

export const Deliver: React.FC<{ order: Row; onClose: () => void }> = ({ order, onClose }) => {
  const detail = useAdminQuery<StaffOrder>('staff_get_order', { p_order_id: order.id });
  const { run, busy } = useAction();
  const [checked, setChecked] = useState(false);
  const needsId = !!detail.data?.minAge;
  return (
    <Modal open onClose={onClose} title={`Mark ${order.orderNumber} delivered`}
      footer={<><Button variant="ghost" onClick={onClose}>Go back</Button>
        <Button variant="primary" loading={busy} disabled={detail.isLoading || (needsId && !checked)}
          onClick={async () => { const ok = await run('staff_mark_delivered', { p_order_id: order.id, p_id_checked: checked }, { success: 'Marked as delivered' }); if (ok !== undefined) onClose(); }}>
          Delivered
        </Button></>}>
      {detail.isLoading ? <Loading /> : (
        <>
          <p className="text-sm text-slate-600">Handed to {detail.data?.address?.fullName ?? order.customer}, {detail.data?.address?.line1}, {order.postcode}. {detail.data?.tracking?.etaStart && `Expected ${dateTime(detail.data.tracking.etaStart)}.`}</p>
          {needsId ? (
            <>
              <Notice tone="warning">This order has age-restricted items (over {detail.data?.minAge}). By law, check photo ID before handing them over. If you could not, do not mark it delivered.</Notice>
              <Checkbox checked={checked} onChange={setChecked} label="I checked their photo ID and they are old enough" />
            </>
          ) : <p className="text-sm">No ID check needed.</p>}
        </>
      )}
    </Modal>
  );
};
