import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Minus, PackageCheck, Plus, Repeat2, X } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import type { Money } from '../../types/api';
import { useAuth } from '../../context/AuthContext';
import { useAction, useAdminQuery, money, errorText, londonToday, formatWeight, newKey } from '../lib';
import { Badge, Button, Card, Chips, Empty, ErrorState, Field, Loading, Modal, Notice, NumberInput, OrderStatus, SampleTag, Screen, TextInput, cx } from '../ui';
import { ProductPicker, type PickedProduct } from '../pickers';
import { lineAmount, slotText, type SlotInfo, type StaffOrder } from '../OrderPanel';

interface QueueItem {
  id: string; orderNumber: string; slot: SlotInfo | null; zone: string | null; notes: string | null; total: Money; status: string; ageCheck: boolean;
  customer: string; lineCount: number; pickedCount: number; hasWeighed: boolean; substitutionDefault: string | null; isSample?: boolean;
}

export default function PickingScreen({ param, go }: ScreenProps) {
  const [day, setDay] = useState(londonToday());
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<string | null>(param);
  const { data, isLoading, error, refetch } = useAdminQuery<QueueItem[]>('staff_picking_queue', { p_date: day, p_status: status || undefined }, { refetchInterval: 30_000, enabled: !open });

  if (open) return <PickOrder orderId={open} onBack={() => { setOpen(null); go('picking'); }} />;

  return (
    <Screen
      title="Picking"
      intro="Orders to pick for a delivery day, in delivery-slot order. Open one to pick it item by item."
      guide={<ol>
        <li>Open the next order and press <b>Start picking</b>.</li>
        <li>For each item press <b>Picked</b>. If you have fewer, use <b>−</b> to set how many you found. Weighed items: type the weight from the scale.</li>
        <li>Out of stock? Press <b>Missing</b>, or <b>Replace</b> to send something similar (only when the customer allowed it). They pay the lower of the two prices.</li>
        <li>When every item has a result, press <b>Finish &amp; charge</b>. The exact amount is taken from the card hold and the customer gets an email.</li>
      </ol>}
      actions={<TextInput type="date" value={day} onChange={(v) => setDay(v || londonToday())} aria-label="Delivery day" className="w-44" />}
    >
      <div className="flex flex-wrap gap-2 items-center">
        <Button size="sm" variant={day === londonToday() ? 'dark' : 'outline'} onClick={() => setDay(londonToday())}>Today</Button>
        <Button size="sm" variant={day === londonToday(1) ? 'dark' : 'outline'} onClick={() => setDay(londonToday(1))}>Tomorrow</Button>
        <div className="ml-auto"><Chips value={status} onChange={setStatus} options={[{ value: '', label: 'Still to do' }, { value: 'placed', label: 'Not started' }, { value: 'picking', label: 'In progress' }]} /></div>
      </div>
      {isLoading ? <Loading /> : error ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : !data?.length ? (
        <Card><Empty icon={<PackageCheck className="w-5 h-5" />} title="Nothing to pick" text="No orders are waiting for this day." /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.map((o) => (
            <button key={o.id} type="button" onClick={() => setOpen(o.id)} className="text-left bg-white rounded-xl border border-[#E2E8F0] p-4 hover:border-[#18181B] cursor-pointer space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{o.orderNumber}</span>
                <span className="flex gap-1"><SampleTag show={o.isSample} /><OrderStatus status={o.status} /></span>
              </div>
              <div className="text-sm">{slotText(o.slot)}{o.zone ? ` · ${o.zone}` : ''}</div>
              <div className="text-sm text-slate-600">{o.customer}</div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-[#2F6B4F]" style={{ width: `${o.lineCount ? (o.pickedCount / o.lineCount) * 100 : 0}%` }} /></div>
              <div className="flex flex-wrap gap-1.5 text-xs text-slate-500">
                <span>{o.pickedCount} of {o.lineCount} items done</span>
                {o.hasWeighed && <Badge tone="blue">Weighed items</Badge>}
                {o.ageCheck && <Badge tone="amber">ID check</Badge>}
                {o.substitutionDefault === 'dont_allow' && <Badge tone="red">No substitutes</Badge>}
              </div>
              {o.notes && <div className="text-xs text-[#7A4A0F] bg-[#F8F0E3] rounded-md px-2 py-1">“{o.notes}”</div>}
            </button>
          ))}
        </div>
      )}
    </Screen>
  );
}

type Line = StaffOrder['staffLines'][number];

const PickOrder: React.FC<{ orderId: string; onBack: () => void }> = ({ orderId, onBack }) => {
  const { hasPermission } = useAuth();
  const { data: o, isLoading, error, refetch } = useAdminQuery<StaffOrder & { notes?: string | null }>('staff_get_order', { p_order_id: orderId });
  const { run, busy } = useAction();
  const finishKey = useRef(newKey());
  const [replacing, setReplacing] = useState<Line | null>(null);
  const [result, setResult] = useState<{ total?: Money; charged?: Money } | null>(null);

  const originals = useMemo(() => (o?.staffLines ?? []).filter((l) => !l.substituteFor), [o]);
  const subsFor = (id: string) => (o?.staffLines ?? []).filter((l) => l.substituteFor === id);
  const done = originals.filter((l) => l.status !== 'pending').length;
  const canPick = hasPermission('barcode_picking');
  const record = (line: Line, p: Record<string, unknown>) => run('staff_record_pick', { p_order_id: orderId, p_line_id: line.id, p }, { refresh: ['staff_get_order', 'staff_picking_queue'] });

  if (isLoading) return <Loading />;
  if (error || !o) return <div className="p-6"><ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /></div>;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 space-y-4 pb-28">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-[#18181B] cursor-pointer"><ArrowLeft className="w-4 h-4" />All orders to pick</button>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{o.orderNumber}</h1><OrderStatus status={o.status} /><SampleTag show={o.isSample} />
      </div>
      <div className="text-sm text-slate-600">{slotText(o.slot)} · {o.address?.fullName} · {o.address?.postcode}</div>
      {o.deliveryNotes && <Notice tone="warning">Customer note: “{o.deliveryNotes}”</Notice>}
      {o.minAge && <Notice tone="warning">Contains age-restricted items (over {o.minAge}). The driver must check ID.</Notice>}
      {o.substitutionDefault === 'dont_allow' && <Notice tone="info">The customer does not want substitutes.</Notice>}

      {o.status === 'placed' && (
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <p className="text-sm">{originals.length} items to pick. Starting tells everyone you are on it.</p>
            <Button variant="primary" loading={busy} disabled={!hasPermission('packing_queue')} onClick={() => void run('staff_start_picking', { p_order_id: o.id }, { success: 'Picking started', refresh: ['staff_get_order', 'staff_picking_queue'] })}>Start picking</Button>
          </div>
        </Card>
      )}
      {result && (
        <Notice tone="success">Finished{result.charged ? <>: charged <b>{money(result.charged)}</b></> : null}. The order is ready to send.</Notice>
      )}
      {!['placed', 'picking'].includes(o.status) && !result && <Notice tone="info">This order is past picking ({o.status.replace(/_/g, ' ')}).</Notice>}

      <div className="space-y-2">
        {originals.map((l) => (
          <PickLine key={l.id} line={l} subs={subsFor(l.id)} editable={o.status === 'picking' && canPick} busy={busy}
            onRecord={(p) => void record(l, p)} onReplace={() => setReplacing(l)} />
        ))}
      </div>

      {o.status === 'picking' && (
        <div className="fixed bottom-0 inset-x-0 lg:left-64 bg-white border-t border-[#E2E8F0] px-4 py-3 z-30">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <div className="text-sm flex-1"><b>{done}</b> of {originals.length} done{done < originals.length && <span className="text-slate-500"> · finish every item first</span>}</div>
            <Button variant="primary" loading={busy} disabled={done < originals.length || !hasPermission('packing_queue')}
              onClick={async () => {
                const out = await run<StaffOrder>('staff_complete_picking', { p_order_id: o.id, p_idempotency_key: finishKey.current },
                  { success: 'Order finished and charged', refresh: ['staff_get_order', 'staff_picking_queue', 'admin_dashboard'] });
                if (out) setResult({ total: out.totals.final?.total, charged: out.totals.captured ?? undefined });
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

const PickLine: React.FC<{ line: Line; subs: Line[]; editable: boolean; busy: boolean; onRecord: (p: Record<string, unknown>) => void; onReplace: () => void }> = ({
  line, subs, editable, busy, onRecord, onReplace,
}) => {
  const weighed = line.saleUnit === 'weight';
  const [qty, setQty] = useState<number>(line.quantityPicked ?? line.quantityOrdered ?? 1);
  const [grams, setGrams] = useState<number | null>(line.weightPickedGrams ?? null);
  const status = line.status;
  return (
    <div className={cx('bg-white rounded-xl border p-3 sm:p-4', status === 'pending' ? 'border-[#E2E8F0]' : status === 'picked' ? 'border-[#BFD8CA]' : 'border-[#E3CBA6]')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{line.name}</div>
          <div className="text-xs text-slate-500">{line.sku}{line.packSize ? ` · ${line.packSize}` : ''} · {money(line.unitPrice)}{weighed ? ' per kg' : ' each'}</div>
          <div className="text-sm mt-1">Wanted: <b>{weighed ? formatWeight(line.weightOrderedGrams) : `${line.quantityOrdered}`}</b>{status !== 'pending' && <> · Result: <b>{status === 'substituted' ? 'replaced' : lineAmount(line)}</b></>}</div>
          {!line.substitutionAllowed && <div className="text-xs text-[#8A2B2B] mt-0.5">No substitute allowed for this item</div>}
        </div>
        <Badge tone={status === 'pending' ? 'grey' : status === 'picked' ? 'green' : status === 'substituted' ? 'violet' : 'amber'}>
          {status === 'pending' ? 'To pick' : status === 'picked' ? 'Picked' : status === 'short' ? 'Short' : status === 'missing' ? 'Missing' : 'Replaced'}
        </Badge>
      </div>
      {subs.map((s) => <div key={s.id} className="mt-2 text-sm bg-[#F0E6EE] rounded-md px-2 py-1">↳ Replaced with <b>{s.name}</b> ({lineAmount(s)}) · {money(s.finalGross ?? s.estGross)}</div>)}
      {editable && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          {weighed ? (
            <>
              <Field label="Weight from the scale" className="w-44"><NumberInput value={grams} onChange={setGrams} suffix="grams" /></Field>
              <Button variant="primary" disabled={busy || !grams} icon={<Check className="w-4 h-4" />} onClick={() => onRecord({ status: 'picked', weightGrams: grams })}>Save weight</Button>
            </>
          ) : (
            <>
              <div className="flex items-center rounded-lg border border-[#E2E8F0] bg-white">
                <button type="button" aria-label="One fewer" className="w-10 h-10 flex items-center justify-center cursor-pointer disabled:opacity-40" disabled={qty <= 0} onClick={() => setQty((q) => Math.max(0, q - 1))}><Minus className="w-4 h-4" /></button>
                <span className="w-10 text-center font-semibold tabular-nums">{qty}</span>
                <button type="button" aria-label="One more" className="w-10 h-10 flex items-center justify-center cursor-pointer disabled:opacity-40" disabled={qty >= (line.quantityOrdered ?? 1)} onClick={() => setQty((q) => Math.min(line.quantityOrdered ?? 1, q + 1))}><Plus className="w-4 h-4" /></button>
              </div>
              <Button variant="primary" disabled={busy} icon={<Check className="w-4 h-4" />} onClick={() => onRecord({ status: 'picked', quantity: qty })}>
                {qty === line.quantityOrdered ? 'Picked' : `Picked ${qty}`}
              </Button>
            </>
          )}
          <Button disabled={busy} icon={<X className="w-4 h-4" />} onClick={() => onRecord({ status: 'missing' })}>Missing</Button>
          {line.substitutionAllowed && <Button disabled={busy} icon={<Repeat2 className="w-4 h-4" />} onClick={onReplace}>Replace</Button>}
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
      <p className="text-sm text-slate-600">Choose a similar product. The customer pays whichever is cheaper (you can change this rule in Settings).</p>
      {pick ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[#E2E8F0] p-3">
          <div><div className="font-semibold">{pick.name}</div><div className="text-xs text-slate-500">{pick.sku} · {money(pick.price)}</div></div>
          <Button size="sm" variant="ghost" onClick={() => setPick(null)}>Change</Button>
        </div>
      ) : <ProductPicker activeOnly exclude={[]} onPick={setPick} placeholder="Search for the replacement…" />}
      {pick && (weighed
        ? <Field label="Weight from the scale"><NumberInput value={grams} onChange={setGrams} suffix="grams" /></Field>
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
