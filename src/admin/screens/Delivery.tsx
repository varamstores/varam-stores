import React, { useMemo, useState } from 'react';
import { Copy, MapPin, Plus, Trash2 } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import { useAuth } from '../../context/AuthContext';
import { useAction, useAdminQuery, errorText, pence } from '../lib';
import { Badge, Button, Card, Checkbox, Drawer, Empty, ErrorState, Field, Loading, Modal, MoneyInput, Notice, NumberInput, SampleTag, Screen, Select, Table, Tabs, Td, TextArea, TextInput, Th, Toggle, Tr } from '../ui';

interface Window { id?: string; weekday: number; start: string; end: string; capacity: number | null; cutoffMinutes: number | null; label: string | null; feeMinor: number | null; isActive: boolean }
interface Zone {
  id: string; code: string; name: string; label: string; minBasketMinor: number | null; isActive: boolean; isPopular: boolean; popularPosition: number | null;
  postcodes: string[]; fees: Array<{ fromMinor: number; feeMinor: number }>; windows: Window[]; ordersThisWeek: number;
}
interface Slot { id: string; localDate: string; startLocal: string; endLocal: string; capacity: number; booked: number; orders: number; status: 'open' | 'closed'; serviceLabel: string | null; availability: string }
interface Fleet { vans: Array<{ id: string; code: string; name: string; isRefrigerated: boolean | null; isActive: boolean; isSample: boolean }>; drivers: Array<{ id: string; name: string; phone: string | null; isActive: boolean; isSample: boolean }> }

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function feesText(fees: Zone['fees']): string {
  if (!fees.length) return 'No delivery charge set';
  const sorted = [...fees].sort((a, b) => a.fromMinor - b.fromMinor);
  return sorted.map((f, i) => (i === 0 ? (f.feeMinor ? `${pence(f.feeMinor)} delivery` : 'Free delivery') : f.feeMinor ? `${pence(f.feeMinor)} from ${pence(f.fromMinor)}` : `free from ${pence(f.fromMinor)}`)).join(', ');
}

export default function DeliveryScreen(_: ScreenProps) {
  const [tab, setTab] = useState('areas');
  return (
    <Screen
      title="Delivery areas & slots"
      intro="Where you deliver, what it costs, and the delivery times shoppers can book."
      guide={<ul>
        <li>Each <b>area</b> is a list of postcode districts (like AL10). Shoppers type their postcode and see the area’s delivery times and charges.</li>
        <li><b>Weekly times</b> are your regular delivery windows (e.g. Monday 08:00–10:00, 20 orders). Bookable slots are made from them automatically for the days ahead.</li>
        <li>Need to close one particular slot, or take more orders in it? Use <b>Upcoming slots</b>. Orders already booked are never moved.</li>
        <li>Vans and drivers are chosen when orders are sent out.</li>
      </ul>}
    >
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'areas', label: 'Areas' }, { value: 'fleet', label: 'Vans & drivers' }]} />
      {tab === 'areas' ? <Areas /> : <FleetTab />}
    </Screen>
  );
}

const Areas: React.FC = () => {
  const { data, isLoading, error, refetch } = useAdminQuery<Zone[]>('admin_list_zones');
  const [open, setOpen] = useState<string | 'new' | null>(null);
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('fleet_management');
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} />;
  const zone = open && open !== 'new' ? data?.find((z) => z.id === open) ?? null : null;
  return (
    <>
      {canEdit && <div className="flex justify-end"><Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setOpen('new')}>Add area</Button></div>}
      {!data?.length ? <Card><Empty icon={<MapPin className="w-5 h-5" />} title="No delivery areas yet" /></Card> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.map((z) => (
            <button key={z.id} type="button" onClick={() => setOpen(z.id)} className="text-left bg-white rounded-xl border border-[#E2E8F0] p-4 hover:border-[#18181B] cursor-pointer space-y-2">
              <div className="flex items-center justify-between gap-2"><span className="font-bold">{z.name}</span><span className="flex gap-1">{!z.isActive && <Badge tone="red">Off</Badge>}{z.isPopular && <Badge tone="yellow">Popular</Badge>}</span></div>
              <div className="text-xs text-slate-500">Shoppers see “{z.label}”</div>
              <div className="flex flex-wrap gap-1">{z.postcodes.slice(0, 12).map((p) => <span key={p} className="px-1.5 py-0.5 rounded bg-slate-100 text-[11px] font-mono">{p}</span>)}{z.postcodes.length > 12 && <span className="text-xs text-slate-500">+{z.postcodes.length - 12}</span>}</div>
              <div className="text-sm">{feesText(z.fees)}{z.minBasketMinor ? ` · minimum order ${pence(z.minBasketMinor)}` : ''}</div>
              <div className="text-xs text-slate-500">{z.windows.filter((w) => w.isActive).length} weekly delivery times · {z.ordersThisWeek} orders in the next 7 days</div>
            </button>
          ))}
        </div>
      )}
      {open && <AreaDrawer zone={zone} isNew={open === 'new'} canEdit={canEdit} onClose={() => setOpen(null)} onCreated={(id) => setOpen(id)} />}
    </>
  );
};

const AreaDrawer: React.FC<{ zone: Zone | null; isNew: boolean; canEdit: boolean; onClose: () => void; onCreated: (id: string) => void }> = ({ zone, isNew, canEdit, onClose, onCreated }) => {
  const [tab, setTab] = useState('details');
  if (!isNew && !zone) return <Drawer open onClose={onClose} title="Area"><Loading /></Drawer>;
  return (
    <Drawer open onClose={onClose} wide title={isNew ? 'Add a delivery area' : zone!.name} subtitle={isNew ? 'It starts with the same delivery times and charges as your first area. Change them after saving.' : feesText(zone!.fees)}>
      {!isNew && <Tabs value={tab} onChange={setTab} tabs={[{ value: 'details', label: 'Details & postcodes' }, { value: 'fees', label: 'Delivery charges' }, { value: 'windows', label: 'Weekly times' }, { value: 'slots', label: 'Upcoming slots' }]} />}
      {(isNew || tab === 'details') && <AreaDetails zone={zone} canEdit={canEdit} onCreated={onCreated} />}
      {!isNew && tab === 'fees' && <Fees zone={zone!} canEdit={canEdit} />}
      {!isNew && tab === 'windows' && <Windows zone={zone!} canEdit={canEdit} />}
      {!isNew && tab === 'slots' && <Slots zone={zone!} canEdit={canEdit} />}
    </Drawer>
  );
};

const AreaDetails: React.FC<{ zone: Zone | null; canEdit: boolean; onCreated: (id: string) => void }> = ({ zone, canEdit, onCreated }) => {
  const { run, busy } = useAction();
  const [name, setName] = useState(zone?.name ?? '');
  const [label, setLabel] = useState(zone?.label ?? '');
  const [postcodes, setPostcodes] = useState((zone?.postcodes ?? []).join(', '));
  const [min, setMin] = useState<number | null>(zone?.minBasketMinor ?? null);
  const [active, setActive] = useState(zone?.isActive ?? true);
  const [popular, setPopular] = useState(zone?.isPopular ?? false);
  const [position, setPosition] = useState<number | null>(zone?.popularPosition ?? null);
  const list = postcodes.split(/[\s,;]+/).map((p) => p.trim().toUpperCase()).filter(Boolean);
  const save = async () => {
    const out = await run<Zone>('admin_save_zone', { p: { id: zone?.id, name, label: label || name, postcodes: list, minBasketMinor: min ?? '', isActive: active, isPopular: popular, popularPosition: position } },
      { success: 'Area saved', refresh: ['admin_list_zones'] });
    if (out && !zone) onCreated(out.id);
  };
  return (
    <Card>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Area name"><TextInput value={name} onChange={setName} placeholder="e.g. Hatfield" disabled={!canEdit} /></Field>
        <Field label="What shoppers see" help="e.g. Hatfield, AL10"><TextInput value={label} onChange={setLabel} disabled={!canEdit} /></Field>
        <Field label="Postcode districts" help="The first part of the postcode, separated by commas: AL10, AL9. For part of a district use e.g. AL10 9." className="sm:col-span-2">
          <TextArea rows={3} value={postcodes} onChange={setPostcodes} disabled={!canEdit} className="font-mono" />
        </Field>
        <Field label="Minimum order" optional><MoneyInput value={min} onChange={setMin} disabled={!canEdit} /></Field>
        <div className="space-y-3 pt-6">
          <Toggle checked={active} onChange={setActive} disabled={!canEdit} label="Delivering here" description="Off = shoppers in these postcodes are told you do not deliver there yet." />
          <Toggle checked={popular} onChange={setPopular} disabled={!canEdit} label="Show in the list of popular areas" />
          {popular && <Field label="Position in that list"><NumberInput value={position} onChange={setPosition} min={1} disabled={!canEdit} /></Field>}
        </div>
      </div>
      {canEdit && <div className="flex justify-end mt-4"><Button variant="primary" loading={busy} disabled={!name.trim() || name.trim().length < 2} onClick={() => void save()}>{zone ? 'Save' : 'Create area'}</Button></div>}
    </Card>
  );
};

const Fees: React.FC<{ zone: Zone; canEdit: boolean }> = ({ zone, canEdit }) => {
  const { run, busy } = useAction();
  const [rows, setRows] = useState(zone.fees.length ? [...zone.fees].sort((a, b) => a.fromMinor - b.fromMinor) : [{ fromMinor: 0, feeMinor: 0 }]);
  const valid = rows[0]?.fromMinor === 0 && new Set(rows.map((r) => r.fromMinor)).size === rows.length;
  return (
    <Card title="Delivery charges" description="The charge depends on the basket value. The first row is for every basket; add rows for cheaper (or free) delivery above an amount.">
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <Field label={i === 0 ? 'Baskets from' : 'From a basket of'} className="w-40"><MoneyInput value={r.fromMinor} disabled={i === 0 || !canEdit} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, fromMinor: v ?? 0 } : x)))} /></Field>
            <Field label="Delivery costs" className="w-40"><MoneyInput value={r.feeMinor} disabled={!canEdit} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, feeMinor: v ?? 0 } : x)))} /></Field>
            {i > 0 && canEdit && <Button variant="ghost" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4 text-red-600" /></Button>}
          </div>
        ))}
      </div>
      {canEdit && <Button size="sm" className="mt-3" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setRows([...rows, { fromMinor: (rows[rows.length - 1]?.fromMinor ?? 0) + 5000, feeMinor: 0 }])}>Add a level</Button>}
      <Notice tone="success">Shoppers see: <b>{feesText(rows)}</b>.</Notice>
      {canEdit && <div className="flex justify-end mt-3"><Button variant="primary" loading={busy} disabled={!valid} onClick={() => void run('admin_set_zone_fees', { p_zone_id: zone.id, p_fees: rows }, { success: 'Delivery charges saved', refresh: ['admin_list_zones'] })}>Save charges</Button></div>}
      <p className="text-xs text-slate-500 mt-2">New charges apply to baskets from now on; orders already placed keep the charge they were shown.</p>
    </Card>
  );
};

const Windows: React.FC<{ zone: Zone; canEdit: boolean }> = ({ zone, canEdit }) => {
  const { run, busy } = useAction();
  const [rows, setRows] = useState<Window[]>([...zone.windows].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)));
  const update = (i: number, patch: Partial<Window>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const copyMonday = () => {
    const mon = rows.filter((r) => r.weekday === 1);
    if (!mon.length) return;
    const keep = rows.filter((r) => r.weekday === 1 || r.weekday >= 6);
    setRows([...keep, ...[2, 3, 4, 5].flatMap((d) => mon.map((m) => ({ ...m, id: undefined, weekday: d })))].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)));
  };
  const problems = rows.some((r) => !r.start || !r.end || r.end <= r.start || !r.capacity)
    || new Set(rows.map((r) => `${r.weekday}-${r.start}`)).size !== rows.length;
  return (
    <Card title="Weekly delivery times" description="Shoppers can book these every week. Slots for the coming days are rebuilt when you save; slots that already have bookings stay as they are."
      actions={canEdit && <Button size="sm" icon={<Copy className="w-3.5 h-3.5" />} onClick={copyMonday}>Copy Monday to Tue–Fri</Button>}>
      <Table>
        <thead><tr><Th>Day</Th><Th>From</Th><Th>To</Th><Th>Orders</Th><Th>Order by</Th><Th>Name</Th><Th>Extra charge</Th><Th>On</Th><Th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.isActive ? '' : 'opacity-60'}>
              <Td><Select value={String(r.weekday)} onChange={(v) => update(i, { weekday: Number(v) })} disabled={!canEdit} className="w-32" options={DAYS.slice(1).map((d, k) => ({ value: String(k + 1), label: d }))} /></Td>
              <Td><TextInput type="time" value={r.start} onChange={(v) => update(i, { start: v })} disabled={!canEdit} className="w-28" /></Td>
              <Td><TextInput type="time" value={r.end} onChange={(v) => update(i, { end: v })} disabled={!canEdit} className="w-28" /></Td>
              <Td><NumberInput value={r.capacity} onChange={(v) => update(i, { capacity: v })} disabled={!canEdit} className="w-20" /></Td>
              <Td><Select value={String(r.cutoffMinutes ?? 120)} onChange={(v) => update(i, { cutoffMinutes: Number(v) })} disabled={!canEdit} className="w-36"
                options={[60, 120, 180, 240, 360, 720, 1440].map((m) => ({ value: String(m), label: m < 1440 ? `${m / 60} h before` : 'day before' }))} /></Td>
              <Td><TextInput value={r.label} onChange={(v) => update(i, { label: v || null })} placeholder="e.g. Morning" disabled={!canEdit} className="w-32" /></Td>
              <Td><MoneyInput value={r.feeMinor} onChange={(v) => update(i, { feeMinor: v })} placeholder="none" disabled={!canEdit} className="w-24" /></Td>
              <Td><Checkbox checked={r.isActive} onChange={(v) => update(i, { isActive: v })} disabled={!canEdit} label="" /></Td>
              <Td>{canEdit && <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5 text-red-600" /></Button>}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
          <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setRows([...rows, { weekday: 1, start: '09:00', end: '11:00', capacity: 20, cutoffMinutes: 120, label: null, feeMinor: null, isActive: true }])}>Add a time</Button>
          <div className="flex items-center gap-3">
            {problems && <span className="text-xs text-red-700">Each time needs an end after its start and a number of orders; two times cannot start together on the same day.</span>}
            <Button variant="primary" loading={busy} disabled={problems} onClick={() => void run('admin_set_zone_windows', { p_zone_id: zone.id, p_windows: rows.map(({ id: _id, ...w }) => w) }, { success: 'Delivery times saved', refresh: ['admin_list_zones', 'admin_list_slots'] })}>Save times</Button>
          </div>
        </div>
      )}
    </Card>
  );
};

const Slots: React.FC<{ zone: Zone; canEdit: boolean }> = ({ zone, canEdit }) => {
  const { data, isLoading } = useAdminQuery<Slot[]>('admin_list_slots', { p_zone_id: zone.id, p_days: 14 });
  const { run, busy } = useAction();
  const [editing, setEditing] = useState<Slot | null>(null);
  const [cap, setCap] = useState<number | null>(null);
  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of data ?? []) m.set(s.localDate, [...(m.get(s.localDate) ?? []), s]);
    return [...m.entries()];
  }, [data]);
  if (isLoading) return <Loading />;
  if (!byDay.length) return <Card><Empty title="No upcoming slots" text="Add weekly times first." /></Card>;
  return (
    <div className="space-y-3">
      {byDay.map(([day, slots]) => (
        <Card key={day} title={new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {slots.map((s) => (
              <div key={s.id} className={`rounded-lg border p-3 ${s.status === 'closed' ? 'bg-slate-50 border-slate-200' : 'border-[#E2E8F0]'}`}>
                <div className="flex items-center justify-between"><span className="font-semibold">{s.startLocal}–{s.endLocal}</span>{s.status === 'closed' ? <Badge tone="red">Closed</Badge> : s.booked >= s.capacity ? <Badge tone="amber">Full</Badge> : <Badge tone="green">Open</Badge>}</div>
                <div className="text-xs text-slate-500">{s.serviceLabel ?? ''}</div>
                <div className="h-1.5 bg-slate-100 rounded-full mt-2"><div className="h-full bg-[#18181B] rounded-full" style={{ width: `${Math.min(100, (s.booked / Math.max(1, s.capacity)) * 100)}%` }} /></div>
                <div className="text-xs mt-1">{s.booked} of {s.capacity} booked</div>
                {canEdit && (
                  <div className="flex gap-1.5 mt-2">
                    <Button size="sm" onClick={() => { setEditing(s); setCap(s.capacity); }}>Change size</Button>
                    <Button size="sm" variant={s.status === 'open' ? 'danger' : 'outline'} loading={busy} onClick={() => void run('admin_update_slot', { p_slot_id: s.id, p_status: s.status === 'open' ? 'closed' : 'open' }, { success: s.status === 'open' ? 'Slot closed' : 'Slot opened', refresh: ['admin_list_slots'] })}>{s.status === 'open' ? 'Close' : 'Open'}</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="How many orders can this slot take?"
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Go back</Button><Button variant="primary" loading={busy} disabled={cap == null || cap < (editing?.booked ?? 0)}
          onClick={async () => { const ok = await run('admin_update_slot', { p_slot_id: editing!.id, p_capacity: cap }, { success: 'Saved', refresh: ['admin_list_slots'] }); if (ok !== undefined) setEditing(null); }}>Save</Button></>}>
        <p className="text-sm text-slate-600">{editing?.booked} already booked, so it cannot go below that.</p>
        <Field label="Orders"><NumberInput value={cap} onChange={setCap} min={editing?.booked ?? 0} /></Field>
      </Modal>
    </div>
  );
};

// ── vans & drivers ──────────────────────────────────────────────────────────────────────────────
const FleetTab: React.FC = () => {
  const { data, isLoading, error, refetch } = useAdminQuery<Fleet>('admin_list_fleet');
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('fleet_management');
  const [van, setVan] = useState<Partial<Fleet['vans'][number]> | null>(null);
  const [driver, setDriver] = useState<Partial<Fleet['drivers'][number]> | null>(null);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} />;
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card title="Vans" padded={false} actions={canEdit && <Button size="sm" variant="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setVan({ isActive: true })}>Add van</Button>}>
        <Table>
          <tbody>{data.vans.map((v) => <Tr key={v.id} onClick={canEdit ? () => setVan(v) : undefined}><Td className="font-mono font-semibold w-16">{v.code}</Td><Td>{v.name} <SampleTag show={v.isSample} />{v.isRefrigerated && <> <Badge tone="blue">Chilled</Badge></>}</Td><Td className="text-right">{!v.isActive && <Badge>Off the road</Badge>}</Td></Tr>)}</tbody>
        </Table>
      </Card>
      <Card title="Drivers" padded={false} actions={canEdit && <Button size="sm" variant="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setDriver({ isActive: true })}>Add driver</Button>}>
        <Table>
          <tbody>{data.drivers.map((d) => <Tr key={d.id} onClick={canEdit ? () => setDriver(d) : undefined}><Td className="font-medium">{d.name} <SampleTag show={d.isSample} /></Td><Td className="text-slate-500">{d.phone ?? '—'}</Td><Td className="text-right">{!d.isActive && <Badge>Inactive</Badge>}</Td></Tr>)}</tbody>
        </Table>
      </Card>
      {van && <VanForm initial={van} onClose={() => setVan(null)} />}
      {driver && <DriverForm initial={driver} onClose={() => setDriver(null)} />}
    </div>
  );
};

const VanForm: React.FC<{ initial: Partial<Fleet['vans'][number]>; onClose: () => void }> = ({ initial, onClose }) => {
  const { run, busy } = useAction();
  const [v, setV] = useState(initial);
  return (
    <Modal open onClose={onClose} title={initial.id ? `Van ${initial.code}` : 'Add a van'}
      footer={<><Button variant="ghost" onClick={onClose}>Go back</Button><Button variant="primary" loading={busy} disabled={!v.code?.trim() || !v.name?.trim()}
        onClick={async () => { const ok = await run('admin_save_van', { p: { id: v.id, code: v.code, name: v.name, isRefrigerated: !!v.isRefrigerated, isActive: v.isActive !== false } }, { success: 'Van saved', refresh: ['admin_list_fleet'] }); if (ok !== undefined) onClose(); }}>Save</Button></>}>
      <Field label="Short code" help="Painted on the van or easy to say, e.g. #05."><TextInput value={v.code} onChange={(x) => setV({ ...v, code: x.toUpperCase() })} /></Field>
      <Field label="Name"><TextInput value={v.name} onChange={(x) => setV({ ...v, name: x })} placeholder="e.g. Hatfield Express" /></Field>
      <Checkbox checked={!!v.isRefrigerated} onChange={(x) => setV({ ...v, isRefrigerated: x })} label="Chilled (refrigerated)" />
      <Checkbox checked={v.isActive !== false} onChange={(x) => setV({ ...v, isActive: x })} label="On the road (can be chosen for deliveries)" />
    </Modal>
  );
};

const DriverForm: React.FC<{ initial: Partial<Fleet['drivers'][number]>; onClose: () => void }> = ({ initial, onClose }) => {
  const { run, busy } = useAction();
  const [d, setD] = useState(initial);
  return (
    <Modal open onClose={onClose} title={initial.id ? initial.name ?? 'Driver' : 'Add a driver'}
      footer={<><Button variant="ghost" onClick={onClose}>Go back</Button><Button variant="primary" loading={busy} disabled={!d.name?.trim()}
        onClick={async () => { const ok = await run('admin_save_driver', { p: { id: d.id, name: d.name, phone: d.phone ?? '', isActive: d.isActive !== false } }, { success: 'Driver saved', refresh: ['admin_list_fleet'] }); if (ok !== undefined) onClose(); }}>Save</Button></>}>
      <Field label="Name" help="Customers see the first name only."><TextInput value={d.name} onChange={(x) => setD({ ...d, name: x })} /></Field>
      <Field label="Mobile" optional><TextInput type="tel" value={d.phone} onChange={(x) => setD({ ...d, phone: x })} /></Field>
      <Checkbox checked={d.isActive !== false} onChange={(x) => setD({ ...d, isActive: x })} label="Working (can be chosen for deliveries)" />
    </Modal>
  );
};
