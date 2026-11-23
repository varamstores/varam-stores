import React, { useState } from 'react';
import { useAction, useAdminQuery, dateTime } from './lib';
import { Badge, Button, Field, Loading, Modal, MoneyInput, NumberInput, Select, Table, Td, Th, TextInput } from './ui';

// Stock changes, shared by the product editor and the Stock screen.

const REASONS = [
  { value: 'restock', label: 'Delivery arrived (add stock)', sign: 1 },
  { value: 'return', label: 'Customer return, can be sold again (add)', sign: 1 },
  { value: 'write_off', label: 'Damaged, out of date or lost (remove)', sign: -1 },
  { value: 'adjustment', label: 'Correction after counting (add or remove)', sign: 0 },
];

export const AdjustStock: React.FC<{ productId: string; name: string; onHand: number; locationId?: string; onClose: () => void }> = ({ productId, name, onHand, locationId, onClose }) => {
  const { run, busy } = useAction();
  const [reason, setReason] = useState('restock');
  const [amount, setAmount] = useState<number | null>(null);
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [note, setNote] = useState('');
  const r = REASONS.find((x) => x.value === reason)!;
  const delta = amount == null ? null : (r.sign === 0 ? (direction === 'add' ? 1 : -1) : r.sign) * Math.abs(amount);
  const save = async () => {
    const ok = await run('admin_adjust_stock', { p_product_id: productId, p_delta: delta, p_reason: reason, p_note: note || null, p_location_id: locationId ?? null }, { success: 'Stock updated' });
    if (ok !== undefined) onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Change stock: ${name}`}
      footer={<><Button variant="ghost" onClick={onClose}>Go back</Button><Button variant="primary" loading={busy} disabled={!delta} onClick={() => void save()}>Save</Button></>}>
      <p className="text-sm text-slate-600">In stock now: <b>{onHand}</b>. Orders, picking and purchase orders change stock automatically; use this for everything else.</p>
      <Field label="What happened?"><Select value={reason} onChange={setReason} options={REASONS.map((x) => ({ value: x.value, label: x.label }))} /></Field>
      {r.sign === 0 && (
        <div className="flex gap-2">
          <Button size="sm" variant={direction === 'add' ? 'dark' : 'outline'} onClick={() => setDirection('add')}>Add</Button>
          <Button size="sm" variant={direction === 'remove' ? 'dark' : 'outline'} onClick={() => setDirection('remove')}>Remove</Button>
        </div>
      )}
      <Field label="How many" help={delta ? `New stock: ${onHand + delta}` : undefined}><NumberInput value={amount} onChange={(v) => setAmount(v == null ? null : Math.abs(v))} min={1} /></Field>
      <Field label="Note" optional><TextInput value={note} onChange={setNote} placeholder="e.g. invoice 1234, 3 jars broken" /></Field>
    </Modal>
  );
};

export const StockLevels: React.FC<{ productId: string; name: string; reorderPoint: number | null; optimalStock: number | null; unitCostMinor: number | null; locationId?: string; onClose: () => void }> = ({
  productId, name, reorderPoint, optimalStock, unitCostMinor, locationId, onClose,
}) => {
  const { run, busy } = useAction();
  const [reorder, setReorder] = useState<number | null>(reorderPoint ?? 0);
  const [ideal, setIdeal] = useState<number | null>(optimalStock);
  const [cost, setCost] = useState<number | null>(unitCostMinor);
  const save = async () => {
    const ok = await run('admin_set_stock_levels', { p_product_id: productId, p_reorder_point: reorder ?? 0, p_optimal_stock: ideal, p_unit_cost_minor: cost, p_location_id: locationId ?? null }, { success: 'Saved' });
    if (ok !== undefined) onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Reorder levels: ${name}`}
      footer={<><Button variant="ghost" onClick={onClose}>Go back</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save</Button></>}>
      <Field label="Buy more when stock is at or below" help="The product shows as “low” and, if switched on in Settings, a draft purchase order is created each morning."><NumberInput value={reorder} onChange={setReorder} min={0} /></Field>
      <Field label="Fill back up to" optional help="How many you want after a delivery. Draft orders buy up to this number."><NumberInput value={ideal} onChange={setIdeal} min={0} /></Field>
      <Field label="What one costs you" optional help="Your buying price per unit, used on purchase orders."><MoneyInput value={cost} onChange={setCost} /></Field>
    </Modal>
  );
};

interface Movement { at: string; by: string | null; note: string | null; delta: number; order: string | null; reason: string; affects: string }
const MOVE_WORDS: Record<string, string> = {
  restock: 'Delivery', return: 'Return', write_off: 'Written off', adjustment: 'Correction', seed: 'Opening stock', order_reserve: 'Held for an order',
  order_release: 'Released (order changed or cancelled)', pick: 'Picked for an order', csv_import: 'Stock count (CSV)', po_receipt: 'Purchase order received',
};

export const StockHistory: React.FC<{ productId: string }> = ({ productId }) => {
  const { data, isLoading } = useAdminQuery<Movement[]>('admin_list_stock_movements', { p_product_id: productId, p_limit: 100 });
  if (isLoading) return <Loading />;
  if (!data?.length) return <p className="text-sm text-slate-500">No stock changes yet.</p>;
  return (
    <Table>
      <thead><tr><Th>When</Th><Th>What</Th><Th className="text-right">Change</Th><Th>By</Th></tr></thead>
      <tbody>
        {data.map((m, i) => (
          <tr key={i}>
            <Td className="whitespace-nowrap text-slate-500">{dateTime(m.at)}</Td>
            <Td>{MOVE_WORDS[m.reason] ?? m.reason.replace(/_/g, ' ')}{m.order && <span className="text-slate-500"> · {m.order}</span>}{m.affects === 'reserved' && <Badge tone="grey">held</Badge>}{m.note && <div className="text-xs text-slate-500">{m.note}</div>}</Td>
            <Td className={`text-right tabular-nums font-semibold ${m.delta < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{m.delta > 0 ? '+' : ''}{m.delta}</Td>
            <Td className="text-slate-500">{m.by ?? 'automatic'}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
};
