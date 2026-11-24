import React, { useState } from 'react';
import { ClipboardList, Plus, Trash2, Wand2 } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import type { Money } from '../../types/api';
import { useAuth } from '../../context/AuthContext';
import { useAction, useAdminQuery, errorText, money, pence, date, dateTime } from '../lib';
import { Badge, Button, Card, Checkbox, ConfirmButton, Drawer, Empty, ErrorState, Facts, Field, Loading, Modal, MoneyInput, NumberInput, SampleTag, Screen, Select, Table, Tabs, Td, TextArea, TextInput, Th, Tr, usePager, FilterBar } from '../ui';
import { ProductPicker } from '../pickers';
import { toast } from '../toast';

interface Supplier { id: string; code: string; name: string; email: string | null; phone: string | null; category: string | null; isActive: boolean; isSample: boolean; openOrders: number; leadTimeDays: number | null; productCount: number; contactPerson: string | null; contactsVerified: boolean }
interface PoLine { productId: string; sku: string; name: string; quantityOrdered: number; quantityReceived: number; unitCostMinor: number | null }
interface Po {
  id: string; number: string; status: string; supplier: { id: string; name: string; email: string | null; contactsVerified: boolean }; lines: PoLine[]; total: Money; notes: string | null;
  expectedAt: string | null; sentAt: string | null; receivedAt: string | null; createdAt: string; createdBy: string | null; location: string; isSample: boolean;
}
const PO_STATUS: Record<string, { label: string; tone: 'grey' | 'blue' | 'amber' | 'green' | 'red' }> = {
  draft: { label: 'Draft', tone: 'grey' }, sent: { label: 'Sent', tone: 'blue' }, partially_received: { label: 'Part received', tone: 'amber' },
  received: { label: 'Received', tone: 'green' }, cancelled: { label: 'Cancelled', tone: 'red' },
};

export default function BuyingScreen({ param }: ScreenProps) {
  // /admin/buying/suppliers:<name> opens the Suppliers tab searching for that supplier
  const supplierQ = param?.startsWith('suppliers:') ? param.slice(10) : null;
  const [tab, setTab] = useState(param === 'suppliers' || supplierQ !== null ? 'suppliers' : 'orders');
  return (
    <Screen
      title="Suppliers & buying"
      intro="The companies you buy from, and the purchase orders you send them."
      guide={<ol>
        <li>Add your <b>suppliers</b>, then link products to them (Products → Stock &amp; suppliers) with their code and your cost.</li>
        <li>Create a <b>purchase order</b> (or press <b>Draft orders for low stock</b>: one draft per supplier, topping each product back up to its ideal level).</li>
        <li><b>Send</b> it: the supplier is emailed if their contact details are marked as checked; otherwise send it yourself and mark it sent.</li>
        <li>When the delivery arrives press <b>Receive</b> and enter what came. Stock goes up straight away. Part deliveries are fine.</li>
      </ol>}
    >
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'orders', label: 'Purchase orders' }, { value: 'suppliers', label: 'Suppliers' }]} />
      {tab === 'orders' ? <Orders /> : <Suppliers key={supplierQ ?? ''} initialQ={supplierQ ?? ''} />}
    </Screen>
  );
}

// ── purchase orders ─────────────────────────────────────────────────────────────────────────────
const Orders: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('inventory');
  const [status, setStatus] = useState('');
  const { data, isLoading, error, refetch } = useAdminQuery<Po[]>('admin_list_purchase_orders', { p_status: status || undefined });
  const [poQ, setPoQ] = useState('');
  const [poSup, setPoSup] = useState('');
  const pos = (data ?? []).filter((p) => (!poQ.trim() || `${p.number} ${p.supplier.name} ${p.notes ?? ''}`.toLowerCase().includes(poQ.trim().toLowerCase())) && (!poSup || p.supplier.id === poSup));
  const poSuppliers = [...new Map((data ?? []).map((p) => [p.supplier.id, p.supplier.name])).entries()];
  const { pageItems: poPage, pager: poPager } = usePager(pos, 25);
  const { run, busy } = useAction();
  const [open, setOpen] = useState<Po | 'new' | null>(null);
  const live = open && open !== 'new' ? data?.find((p) => p.id === open.id) ?? open : open;
  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-end">
        {canEdit && <div className="flex gap-2">
          <Button icon={<Wand2 className="w-4 h-4" />} loading={busy} onClick={async () => {
            const r = await run<{ created: number }>('admin_generate_reorder_drafts', undefined, { refresh: ['admin_list_purchase_orders'] });
            if (r) { if (r.created) toast.success(`${r.created} draft order${r.created === 1 ? '' : 's'} created`); else toast.info('Nothing is low, or the low products have no main supplier.'); }
          }}>Draft orders for low stock</Button>
          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setOpen('new')}>New purchase order</Button>
        </div>}
      </div>
      <Card padded={false}>
        <FilterBar search={{ value: poQ, onChange: setPoQ, placeholder: 'Search by order number or supplier…' }} count={isLoading ? null : pos.length} noun={['purchase order', 'purchase orders']}
          filters={[
            { key: 'status', label: 'Status', value: status, onChange: setStatus, allLabel: 'All statuses', options: Object.entries(PO_STATUS).map(([value, s]) => ({ value, label: s.label })) },
            { key: 'supplier', label: 'Supplier', value: poSup, onChange: setPoSup, allLabel: 'All suppliers', options: poSuppliers.map(([id, name]) => ({ value: id, label: name })) },
          ]} />
        {isLoading ? <Loading /> : error ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : !pos.length ? (
          <Empty icon={<ClipboardList className="w-5 h-5" />} title={data?.length ? 'No purchase orders match' : 'No purchase orders'} text={data?.length ? 'Try clearing the search or filters.' : 'Create one, or let the shop draft them for low stock.'} />
        ) : (
          <Table>
            <thead><tr><Th>Order</Th><Th>Supplier</Th><Th>Status</Th><Th className="text-right">Value</Th><Th>Expected</Th><Th>Created</Th></tr></thead>
            <tbody>
              {poPage.map((p) => (
                <Tr key={p.id} onClick={() => setOpen(p)}>
                  <Td className="font-semibold">{p.number} <SampleTag show={p.isSample} /></Td>
                  <Td>{p.supplier.name}<div className="text-xs text-slate-500">{p.lines.length} products</div></Td>
                  <Td><Badge tone={PO_STATUS[p.status]?.tone}>{PO_STATUS[p.status]?.label ?? p.status}</Badge></Td>
                  <Td className="text-right tabular-nums">{money(p.total)}</Td>
                  <Td>{date(p.expectedAt)}</Td>
                  <Td className="text-slate-500 text-xs">{dateTime(p.createdAt)}{p.createdBy ? ` · ${p.createdBy}` : ''}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {poPager}
      </Card>
      {live && <PoDrawer po={live === 'new' ? null : live} onClose={() => setOpen(null)} onCreated={(p) => setOpen(p)} canEdit={canEdit} />}
    </>
  );
};

const PoDrawer: React.FC<{ po: Po | null; onClose: () => void; onCreated: (p: Po) => void; canEdit: boolean }> = ({ po, onClose, onCreated, canEdit }) => {
  const suppliers = useAdminQuery<Supplier[]>('admin_list_suppliers');
  const { run, busy } = useAction();
  const editable = canEdit && (!po || po.status === 'draft');
  const [supplierId, setSupplierId] = useState(po?.supplier.id ?? '');
  const [expected, setExpected] = useState(po?.expectedAt?.slice(0, 10) ?? '');
  const [notes, setNotes] = useState(po?.notes ?? '');
  const [lines, setLines] = useState<Array<{ productId: string; name: string; sku: string; quantity: number | null; unitCostMinor: number | null }>>(
    po?.lines.map((l) => ({ productId: l.productId, name: l.name, sku: l.sku, quantity: l.quantityOrdered, unitCostMinor: l.unitCostMinor })) ?? []);
  const [receiving, setReceiving] = useState(false);
  const total = lines.reduce((s, l) => s + (l.quantity ?? 0) * (l.unitCostMinor ?? 0), 0);
  const save = async () => {
    const out = await run<Po>('admin_save_purchase_order', { p: { id: po?.id, supplierId, expectedAt: expected || null, notes: notes || null, lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitCostMinor: l.unitCostMinor })) } },
      { success: 'Purchase order saved', refresh: ['admin_list_purchase_orders'] });
    if (out && !po) onCreated(out);
  };
  const sup = suppliers.data?.find((s) => s.id === supplierId);
  return (
    <Drawer open onClose={onClose} wide title={po ? <span className="flex items-center gap-2">Purchase order {po.number} <Badge tone={PO_STATUS[po.status]?.tone}>{PO_STATUS[po.status]?.label}</Badge></span> : 'New purchase order'}
      subtitle={po ? `For ${po.location}` : 'Starts as a draft. Nothing is sent until you press Send.'}
      footer={canEdit && <>
        {po && ['draft', 'sent'].includes(po.status) && <ConfirmButton variant="danger" danger title={`Cancel ${po.number}?`} text="Tell the supplier yourself if it was already sent." confirmLabel="Cancel order"
          onConfirm={() => run('admin_cancel_purchase_order', { p_id: po.id }, { success: 'Cancelled', refresh: ['admin_list_purchase_orders'] })}>Cancel order</ConfirmButton>}
        {editable && <Button variant={po ? 'outline' : 'primary'} loading={busy} disabled={!supplierId || !lines.length || lines.some((l) => !l.quantity)} onClick={() => void save()}>{po ? 'Save changes' : 'Save draft'}</Button>}
        {po?.status === 'draft' && (po.supplier.contactsVerified
          ? <ConfirmButton variant="primary" title={`Email ${po.number} to ${po.supplier.name}?`} text={`It goes to ${po.supplier.email}.`} confirmLabel="Send email"
              onConfirm={() => run('admin_send_purchase_order', { p_id: po.id, p_email_supplier: true }, { success: 'Sent to the supplier', refresh: ['admin_list_purchase_orders'] })}>Send to supplier</ConfirmButton>
          : <ConfirmButton variant="primary" title="Mark as sent?" text="This supplier’s email is not marked as checked, so the shop will not email them. Send the order yourself (phone, WhatsApp, email), then confirm here."
              confirmLabel="Mark as sent" onConfirm={() => run('admin_send_purchase_order', { p_id: po.id, p_email_supplier: false }, { success: 'Marked as sent', refresh: ['admin_list_purchase_orders'] })}>Mark as sent</ConfirmButton>)}
        {po && ['sent', 'partially_received'].includes(po.status) && <Button variant="primary" onClick={() => setReceiving(true)}>Receive delivery</Button>}
      </>}>
      {po && !editable && (
        <Card><Facts items={[['Supplier', po.supplier.name], ['Expected', date(po.expectedAt)], ['Sent', dateTime(po.sentAt)], ['Received', dateTime(po.receivedAt)], po.notes ? ['Notes', po.notes] : null]} /></Card>
      )}
      {editable && (
        <Card>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Supplier"><Select value={supplierId} onChange={setSupplierId} placeholder="Choose…" options={(suppliers.data ?? []).filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name }))} /></Field>
            <Field label="Expected delivery" optional help={sup?.leadTimeDays ? `Usually ${sup.leadTimeDays} day(s) after ordering.` : undefined}><TextInput type="date" value={expected} onChange={setExpected} /></Field>
            <Field label="Notes for the supplier" optional className="sm:col-span-2"><TextArea rows={2} value={notes} onChange={setNotes} /></Field>
          </div>
        </Card>
      )}
      <Card title="Products" padded={false} description={editable ? 'Search to add products. Costs fill in from the supplier link when known.' : undefined}>
        {editable && <div className="px-4 pb-3"><ProductPicker exclude={lines.map((l) => l.productId)} onPick={(p) => setLines([...lines, { productId: p.id, name: p.name, sku: p.sku, quantity: 1, unitCostMinor: null }])} /></div>}
        <Table>
          <thead><tr><Th>Product</Th><Th className="text-right">Quantity</Th>{po && po.status !== 'draft' && <Th className="text-right">Received</Th>}<Th className="text-right">Cost each</Th><Th className="text-right">Line total</Th>{editable && <Th />}</tr></thead>
          <tbody>
            {(editable ? lines.map((l) => ({ ...l, received: 0 })) : po?.lines.map((l) => ({ productId: l.productId, name: l.name, sku: l.sku, quantity: l.quantityOrdered as number | null, unitCostMinor: l.unitCostMinor, received: l.quantityReceived })) ?? []).map((l, i) => (
              <tr key={l.productId}>
                <Td><div className="font-medium">{l.name}</div><div className="text-xs text-slate-500">{l.sku}</div></Td>
                <Td className="text-right">{editable ? <NumberInput value={l.quantity} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: v } : x)))} className="w-24 ml-auto" /> : l.quantity}</Td>
                {po && po.status !== 'draft' && <Td className="text-right tabular-nums">{l.received}</Td>}
                <Td className="text-right">{editable ? <MoneyInput value={l.unitCostMinor} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, unitCostMinor: v } : x)))} className="w-28 ml-auto" placeholder="auto" /> : pence(l.unitCostMinor)}</Td>
                <Td className="text-right tabular-nums">{l.unitCostMinor != null && l.quantity ? pence(l.unitCostMinor * l.quantity) : '—'}</Td>
                {editable && <Td className="text-right"><Button size="sm" variant="ghost" aria-label="Remove" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5 text-[#A63A3A]" /></Button></Td>}
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="p-4 text-right font-semibold">Total: {editable ? pence(total) : money(po?.total)}</div>
      </Card>
      {receiving && po && <Receive po={po} onClose={() => setReceiving(false)} />}
    </Drawer>
  );
};

const Receive: React.FC<{ po: Po; onClose: () => void }> = ({ po, onClose }) => {
  const { run, busy } = useAction();
  const [qty, setQty] = useState<Record<string, number | null>>(Object.fromEntries(po.lines.map((l) => [l.productId, Math.max(0, l.quantityOrdered - l.quantityReceived)])));
  const save = async () => {
    const lines = po.lines.map((l) => ({ productId: l.productId, quantityReceived: qty[l.productId] ?? 0 })).filter((l) => l.quantityReceived > 0);
    const ok = await run('admin_receive_purchase_order', { p_id: po.id, p_lines: lines }, { success: 'Delivery booked in — stock updated', refresh: ['admin_list_purchase_orders', 'admin_list_inventory'] });
    if (ok !== undefined) onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Receive ${po.number}`} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Go back</Button><Button variant="primary" loading={busy} disabled={!Object.values(qty).some((v) => (v ?? 0) > 0)} onClick={() => void save()}>Book in</Button></>}>
      <p className="text-sm text-slate-600">Enter how many of each arrived <b>in this delivery</b>. Leave 0 for anything that did not come.</p>
      <Table>
        <thead><tr><Th>Product</Th><Th className="text-right">Still due</Th><Th className="text-right">Arrived now</Th></tr></thead>
        <tbody>
          {po.lines.map((l) => (
            <tr key={l.productId}>
              <Td>{l.name}</Td>
              <Td className="text-right tabular-nums">{l.quantityOrdered - l.quantityReceived}</Td>
              <Td className="text-right"><NumberInput value={qty[l.productId]} onChange={(v) => setQty({ ...qty, [l.productId]: v })} className="w-24 ml-auto" /></Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Modal>
  );
};

// ── suppliers ───────────────────────────────────────────────────────────────────────────────────
const Suppliers: React.FC<{ initialQ?: string }> = ({ initialQ = '' }) => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('inventory');
  const { data, isLoading, error, refetch } = useAdminQuery<Supplier[]>('admin_list_suppliers');
  const [sq, setSq] = useState(initialQ);
  const [sActive, setSActive] = useState('');
  const [sChecked, setSChecked] = useState('');
  const sups = (data ?? []).filter((s) => (!sq.trim() || `${s.name} ${s.email ?? ''} ${s.contactPerson ?? ''} ${s.category ?? ''}`.toLowerCase().includes(sq.trim().toLowerCase()))
    && (!sActive || (sActive === 'yes' ? s.isActive : !s.isActive)) && (!sChecked || (sChecked === 'yes' ? s.contactsVerified : !s.contactsVerified)));
  const { pageItems: supPage, pager: supPager } = usePager(sups, 25);
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} />;
  return (
    <Card padded={false} title={`${data?.length ?? 0} suppliers`} actions={canEdit && <Button size="sm" variant="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setEditing({ isActive: true })}>Add supplier</Button>}>
      <FilterBar search={{ value: sq, onChange: setSq, placeholder: 'Search suppliers by name, contact or what they supply…' }} count={sups.length} noun={['supplier', 'suppliers']}
        filters={[
          { key: 'active', label: 'Status', value: sActive, onChange: setSActive, allLabel: 'All suppliers', options: [{ value: 'yes', label: 'Active' }, { value: 'no', label: 'Inactive' }] },
          { key: 'checked', label: 'Contact details', value: sChecked, onChange: setSChecked, allLabel: 'Any', options: [{ value: 'yes', label: 'Checked (orders are emailed)' }, { value: 'no', label: 'Not checked yet' }] },
        ]} />
      <Table>
        <thead><tr><Th>Supplier</Th><Th>Contact</Th><Th className="text-right">Products</Th><Th className="text-right">Open orders</Th><Th /></tr></thead>
        <tbody>
          {supPage.map((s) => (
            <Tr key={s.id} onClick={canEdit ? () => setEditing(s) : undefined}>
              <Td><div className="font-medium">{s.name} <SampleTag show={s.isSample} /></div><div className="text-xs text-slate-500">{s.category ?? ''}{s.leadTimeDays ? ` · delivers in ${s.leadTimeDays} day(s)` : ''}</div></Td>
              <Td className="text-xs">{s.contactPerson && <div>{s.contactPerson}</div>}<div className="text-slate-500">{s.email}{s.phone ? ` · ${s.phone}` : ''}</div>{!s.contactsVerified && (s.email || s.phone) && <Badge tone="amber">Not checked</Badge>}</Td>
              <Td className="text-right tabular-nums">{s.productCount}</Td>
              <Td className="text-right tabular-nums">{s.openOrders}</Td>
              <Td className="text-right">{!s.isActive ? <Badge>Inactive</Badge> : canEdit && <Button size="sm">Edit</Button>}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      {supPager}
      {editing && <SupplierForm initial={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
};

const SupplierForm: React.FC<{ initial: Partial<Supplier>; onClose: () => void }> = ({ initial, onClose }) => {
  const { run, busy } = useAction();
  const [s, setS] = useState<Partial<Supplier>>(initial);
  const set = <K extends keyof Supplier>(k: K, v: Supplier[K] | null) => setS((x) => ({ ...x, [k]: v }));
  // changing an email or phone means it has not been checked yet
  const setContact = (k: 'email' | 'phone', v: string) => setS((x) => ({ ...x, [k]: v, contactsVerified: false }));
  const save = async () => {
    const ok = await run('admin_save_supplier', { p: { id: s.id, name: s.name, contactPerson: s.contactPerson || null, email: s.email || null, phone: s.phone || null, category: s.category || null,
      leadTimeDays: s.leadTimeDays ?? null, contactsVerified: !!s.contactsVerified, isActive: s.isActive !== false } }, { success: 'Supplier saved', refresh: ['admin_list_suppliers'] });
    if (ok !== undefined) onClose();
  };
  return (
    <Modal open onClose={onClose} title={initial.id ? `Edit ${initial.name}` : 'Add a supplier'} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Go back</Button><Button variant="primary" loading={busy} disabled={!s.name?.trim()} onClick={() => void save()}>Save</Button></>}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Company name" className="sm:col-span-2"><TextInput value={s.name} onChange={(v) => set('name', v)} /></Field>
        <Field label="Contact person" optional><TextInput value={s.contactPerson} onChange={(v) => set('contactPerson', v)} /></Field>
        <Field label="What they supply" optional><TextInput value={s.category} onChange={(v) => set('category', v)} placeholder="e.g. Rice & grains" /></Field>
        <Field label="Order email" optional><TextInput type="email" value={s.email} onChange={(v) => setContact('email', v)} /></Field>
        <Field label="Phone" optional><TextInput type="tel" value={s.phone} onChange={(v) => setContact('phone', v)} /></Field>
        <Field label="Days from order to delivery" optional><NumberInput value={s.leadTimeDays} onChange={(v) => set('leadTimeDays', v)} min={0} /></Field>
      </div>
      <Checkbox checked={!!s.contactsVerified} onChange={(v) => set('contactsVerified', v)} label="I have checked these contact details are right"
        description="Only then does the shop email purchase orders to this supplier." />
      <Checkbox checked={s.isActive !== false} onChange={(v) => set('isActive', v)} label="Active supplier" />
    </Modal>
  );
};
