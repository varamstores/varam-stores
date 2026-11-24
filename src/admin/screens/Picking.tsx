import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, Minus, Plus, Repeat2, Undo2, X } from 'lucide-react';
import type { Money } from '../../types/api';
import { useAuth } from '../../context/AuthContext';
import { useAction, useAdminQuery, money, errorText, formatWeight, newKey } from '../lib';
import { Badge, Button, Card, ErrorState, Field, Loading, Modal, Notice, NumberInput, OrderStatus, SampleTag, WeightInput, cx } from '../ui';
import { ProductPicker, type PickedProduct } from '../pickers';
import { lineAmount, slotText, type StaffOrder } from '../OrderPanel';

// Picking one order, item by item. Opened from the order board ("Start picking" / "Continue picking").
// Every item clearly shows whether it is still to do (white, with buttons) or done (green, with what
// was recorded and a "Change" button), and the bar at the bottom counts what is left.

type Line = StaffOrder['staffLines'][number];

export const PickOrder: React.FC<{ orderId: string; onBack: () => void }> = ({ orderId, onBack }) => {
  const { hasPermission } = useAuth();
  const { data: o, isLoading, error, refetch } = useAdminQuery<StaffOrder>('staff_get_order', { p_order_id: orderId });
  const { run, busy } = useAction();
  const finishKey = useRef(newKey());
  const [replacing, setReplacing] = useState<Line | null>(null);
  const [savingLine, setSavingLine] = useState<string | null>(null);
  const [result, setResult] = useState<{ charged?: Money } | null>(null);

  const originals = useMemo(() => (o?.staffLines ?? []).filter((l) => !l.substituteFor), [o]);
  const subsFor = (id: string) => (o?.staffLines ?? []).filter((l) => l.substituteFor === id);
  const done = originals.filter((l) => l.status !== 'pending').length;
  const canPick = hasPermission('barcode_picking');
  const refresh = ['staff_get_order', 'staff_picking_queue', 'admin_list_orders'];
  const record = async (line: Line, p: Record<string, unknown>) => {
    setSavingLine(line.id);
    try { await run('staff_record_pick', { p_order_id: orderId, p_line_id: line.id, p }, { refresh }); } finally { setSavingLine(null); }
  };

  if (isLoading) return <Loading />;
  if (error || !o) return <div className="p-6"><ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-28">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#3F4652] hover:text-[#18181B] cursor-pointer"><ArrowLeft className="w-4 h-4" />Back to the order board</button>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[26px] font-semibold">Picking {o.orderNumber}</h1><OrderStatus status={o.status} /><SampleTag show={o.isSample} />
      </div>
      <div className="text-[14px] text-[#3F4652]">{slotText(o.slot)} · {o.address?.fullName} · {o.address?.postcode}</div>
      {o.deliveryNotes && <Notice tone="warning">Customer note: “{o.deliveryNotes}”</Notice>}
      {o.minAge && <Notice tone="warning">Contains age-restricted items (over {o.minAge}). The driver must check ID.</Notice>}
      {o.substitutionDefault === 'dont_allow' && <Notice tone="info">The customer does not want substitutes.</Notice>}

      {o.status === 'placed' && (
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <p className="text-[14px]">{originals.length} items to pick. Starting tells everyone you are on it.</p>
            <Button variant="primary" loading={busy} disabled={!hasPermission('packing_queue')} onClick={() => void run('staff_start_picking', { p_order_id: o.id }, { success: 'Picking started', refresh })}>Start picking</Button>
          </div>
        </Card>
      )}
      {result && <Notice tone="success">Finished{result.charged ? <>: charged <b>{money(result.charged)}</b></> : null}. The order is now in <b>Ready to send</b>.</Notice>}
      {!['placed', 'picking'].includes(o.status) && !result && <Notice tone="info">This order has already been picked.</Notice>}

      <div className="space-y-2.5">
        {originals.map((l, i) => (
          <PickLine key={l.id} n={i + 1} line={l} subs={subsFor(l.id)} editable={o.status === 'picking' && canPick} saving={savingLine === l.id} disabled={busy}
            onRecord={(p) => void record(l, p)} onReplace={() => setReplacing(l)} />
        ))}
      </div>

      {o.status === 'picking' && (
        <div className="fixed bottom-0 inset-x-0 lg:left-[260px] bg-white border-t border-[#D6DBE1] px-4 py-3 z-30">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[14px]"><b>{done}</b> of {originals.length} items done{done < originals.length && <span className="text-[#5F6B7A]"> · {originals.length - done} to go</span>}</div>
              <div className="h-1.5 bg-[#E8EBEF] rounded-full mt-1.5 overflow-hidden"><div className="h-full bg-[#2F6B4F] transition-all" style={{ width: `${originals.length ? (done / originals.length) * 100 : 0}%` }} /></div>
            </div>
            <Button variant="primary" loading={busy && !savingLine} disabled={done < originals.length || !hasPermission('packing_queue') || !!savingLine}
              onClick={async () => {
                const out = await run<StaffOrder>('staff_complete_picking', { p_order_id: o.id, p_idempotency_key: finishKey.current },
                  { success: 'Order finished and charged', refresh: [...refresh, 'admin_dashboard'] });
                if (out) setResult({ charged: out.totals.captured ?? undefined });
              }}>
              Finish &amp; charge
            </Button>
          </div>
        </div>
      )}

      <Modal open={!!replacing} onClose={() => setReplacing(null)} title={`Replace ${replacing?.name ?? ''}`} size="md">
        {replacing && <ReplaceForm line={replacing} onDone={async (p) => { await record(replacing, p); setReplacing(null); }} />}
      </Modal>
    </div>
  );
};

const RESULT: Record<string, { label: string; tone: 'green' | 'amber' | 'red' | 'violet' }> = {
  picked: { label: 'Picked', tone: 'green' }, short: { label: 'Fewer than ordered', tone: 'amber' }, missing: { label: 'Missing', tone: 'red' }, substituted: { label: 'Replaced', tone: 'violet' },
};

const PickLine: React.FC<{ n: number; line: Line; subs: Line[]; editable: boolean; saving: boolean; disabled: boolean; onRecord: (p: Record<string, unknown>) => void; onReplace: () => void }> = ({
  n, line, subs, editable, saving, disabled, onRecord, onReplace,
}) => {
  const weighed = line.saleUnit === 'weight';
  const isDone = line.status !== 'pending';
  const [changing, setChanging] = useState(false);
  const [qty, setQty] = useState<number>(line.quantityPicked ?? line.quantityOrdered ?? 1);
  const [grams, setGrams] = useState<number | null>(line.weightPickedGrams || line.weightOrderedGrams || null);
  const showControls = editable && (!isDone || changing);
  const r = RESULT[line.status];
  const save = (p: Record<string, unknown>) => { onRecord(p); setChanging(false); };

  return (
    <div className={cx('rounded-md border p-3 sm:p-4 transition-colors', isDone && !changing ? 'bg-[#F1F7F3] border-[#BFD8CA]' : 'bg-white border-[#D6DBE1]')}>
      <div className="flex items-start gap-3">
        <span className={cx('w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0', isDone ? 'bg-[#2F6B4F] text-white' : 'bg-[#ECEEF1] text-[#3F4652]')}>
          {isDone ? <Check className="w-4 h-4" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[15px]">{line.name}</div>
          <div className="text-[12.5px] text-[#5F6B7A]">{line.sku}{line.packSize ? ` · ${line.packSize}` : ''} · {money(line.unitPrice)}{weighed ? ' per kg' : ' each'}</div>
          <div className="text-[14px] mt-1">Wanted: <b>{weighed ? formatWeight(line.weightOrderedGrams) : line.quantityOrdered}</b>
            {!line.substitutionAllowed && <span className="text-[12.5px] text-[#8A2B2B]"> · no substitute allowed</span>}</div>
        </div>
        {isDone && r && !changing && <Badge tone={r.tone}>{r.label}</Badge>}
      </div>

      {isDone && !changing && (
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-10">
          <span className="inline-flex items-center gap-1.5 text-[14px] text-[#245740] font-medium"><CheckCircle2 className="w-4 h-4" />
            {line.status === 'substituted' ? 'Replaced' : line.status === 'missing' ? 'Recorded as missing' : `Picked ${lineAmount(line)}`}</span>
          {editable && <Button size="sm" variant="ghost" icon={<Undo2 className="w-3.5 h-3.5" />} onClick={() => setChanging(true)}>Change</Button>}
        </div>
      )}
      {subs.map((s) => <div key={s.id} className="mt-2 ml-10 text-[13.5px] bg-[#F0E6EE] rounded-md px-2.5 py-1.5">↳ Replaced with <b>{s.name}</b> ({lineAmount(s)}) · {money(s.finalGross ?? s.estGross)}</div>)}

      {showControls && (
        <div className="mt-3 pl-10 space-y-3">
          {weighed ? (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Weight from the scale" className="w-64"><WeightInput value={grams} onChange={setGrams} /></Field>
              <Button variant="primary" loading={saving} disabled={disabled || !grams} icon={<Check className="w-4 h-4" />} onClick={() => save({ status: 'picked', weightGrams: grams })}>Save weight</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-[#5F6B7A]">Found:</span>
              <div className="flex items-center rounded-md border border-[#C4CAD3] bg-white">
                <button type="button" aria-label="One fewer" className="w-10 h-10 flex items-center justify-center cursor-pointer disabled:opacity-40" disabled={qty <= 0} onClick={() => setQty((q) => Math.max(0, q - 1))}><Minus className="w-4 h-4" /></button>
                <span className="w-10 text-center font-semibold tabular-nums">{qty}</span>
                <button type="button" aria-label="One more" className="w-10 h-10 flex items-center justify-center cursor-pointer disabled:opacity-40" disabled={qty >= (line.quantityOrdered ?? 1)} onClick={() => setQty((q) => Math.min(line.quantityOrdered ?? 1, q + 1))}><Plus className="w-4 h-4" /></button>
              </div>
              <span className="text-[13px] text-[#5F6B7A]">of {line.quantityOrdered}</span>
              <Button variant="primary" loading={saving} disabled={disabled} icon={<Check className="w-4 h-4" />} onClick={() => save({ status: 'picked', quantity: qty })}>
                {qty === line.quantityOrdered ? `Picked all ${qty}` : qty === 0 ? 'None found' : `Picked ${qty} of ${line.quantityOrdered}`}
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="danger" disabled={disabled} icon={<X className="w-3.5 h-3.5" />} onClick={() => save({ status: 'missing' })}>Missing</Button>
            {line.substitutionAllowed && <Button size="sm" disabled={disabled} icon={<Repeat2 className="w-3.5 h-3.5" />} onClick={onReplace}>Replace with something similar</Button>}
            {changing && <Button size="sm" variant="ghost" onClick={() => setChanging(false)}>Keep as it was</Button>}
          </div>
        </div>
      )}
    </div>
  );
};

const ReplaceForm: React.FC<{ line: Line; onDone: (p: Record<string, unknown>) => Promise<void> }> = ({ line, onDone }) => {
  const [pick, setPick] = useState<PickedProduct | null>(null);
  const [qty, setQty] = useState<number | null>(line.quantityOrdered ?? 1);
  const [grams, setGrams] = useState<number | null>(line.weightOrderedGrams);
  const [busy, setBusy] = useState(false);
  const weighed = pick?.saleUnit === 'weight';
  return (
    <div className="space-y-4">
      <p className="text-[14px] text-[#3F4652]">Choose a similar product. The customer pays whichever is cheaper (you can change this rule in Settings).</p>
      {pick ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-[#D6DBE1] p-3">
          <div><div className="font-semibold">{pick.name}</div><div className="text-[12.5px] text-[#5F6B7A]">{pick.sku} · {money(pick.price)}</div></div>
          <Button size="sm" variant="ghost" onClick={() => setPick(null)}>Change</Button>
        </div>
      ) : <ProductPicker activeOnly onPick={setPick} placeholder="Search for the replacement…" />}
      {pick && (weighed
        ? <Field label="Weight from the scale"><WeightInput value={grams} onChange={setGrams} /></Field>
        : <Field label="How many"><NumberInput value={qty} onChange={setQty} min={1} /></Field>)}
      <div className="flex justify-end">
        <Button variant="primary" loading={busy} disabled={!pick || (weighed ? !grams : !qty)}
          onClick={async () => { setBusy(true); try { await onDone({ status: 'substituted', substituteProductId: pick!.id, ...(weighed ? { substituteWeightGrams: grams } : { substituteQuantity: qty }) }); } finally { setBusy(false); } }}>
          Use this replacement
        </Button>
      </div>
    </div>
  );
};
