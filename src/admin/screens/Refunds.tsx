import { useRef, useState } from 'react';
import { Undo2 } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import type { Money } from '../../types/api';
import { useAuth } from '../../context/AuthContext';
import { useAction, useAdminQuery, money, dateTime, errorText, newKey } from '../lib';
import { Badge, Card, Chips, ConfirmButton, Empty, ErrorState, Loading, Screen, Table, Td, Th, Tr } from '../ui';
import { OrderPanel } from '../OrderPanel';

interface RefundRequest {
  id: string; orderId: string; orderNumber: string; status: string; reason: string; amount: Money | null; requestedBy: string | null; createdAt: string;
  customer: string | null; lines?: Array<{ name: string }> | null; decidedBy?: string | null; decidedAt?: string | null; error?: string | null;
}

const TONES = { pending: 'amber', approved: 'blue', processed: 'green', rejected: 'grey', failed: 'red' } as const;
const WORDS: Record<string, string> = { pending: 'Waiting', approved: 'Approved', processed: 'Refunded', rejected: 'Rejected', failed: 'Failed' };

export default function RefundsScreen({ go }: ScreenProps) {
  const { hasPermission } = useAuth();
  const [status, setStatus] = useState('pending');
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useAdminQuery<RefundRequest[]>('admin_list_refund_requests', { p_status: status });
  const { run } = useAction();
  const keys = useRef(new Map<string, string>());
  const keyFor = (id: string) => { if (!keys.current.has(id)) keys.current.set(id, newKey()); return keys.current.get(id)!; };
  const canDecide = hasPermission('financials');

  return (
    <Screen
      title="Refunds"
      intro="Refund requests raised on orders. A manager approves them; the money then goes back to the customer’s card."
      guide={<ol>
        <li>Anyone with refund rights opens an order and presses <b>Refund…</b> (whole items or an amount, with a reason).</li>
        <li>A manager with finance rights <b>approves</b> or <b>rejects</b> it here.</li>
        <li>Approving sends the money back through the card company (it reaches the customer in 5–10 days), issues a credit note, takes back loyalty points earned on it and emails the customer.</li>
      </ol>}
    >
      <Chips value={status} onChange={setStatus} options={[{ value: 'pending', label: 'Waiting' }, { value: 'processed', label: 'Refunded' }, { value: 'rejected', label: 'Rejected' }, { value: 'failed', label: 'Failed' }]} />
      <Card padded={false}>
        {isLoading ? <Loading /> : error ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : !data?.length ? (
          <Empty icon={<Undo2 className="w-5 h-5" />} title={status === 'pending' ? 'No refunds waiting' : 'Nothing here'} />
        ) : (
          <Table>
            <thead><tr><Th>Order</Th><Th>Refund</Th><Th>Reason</Th><Th>Asked by</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {data.map((r) => (
                <Tr key={r.id}>
                  <Td><button type="button" className="font-semibold hover:underline cursor-pointer" onClick={() => setOpen(r.orderId)}>{r.orderNumber}</button><div className="text-xs text-slate-500">{r.customer}</div></Td>
                  <Td className="whitespace-nowrap font-semibold tabular-nums">{r.amount ? money(r.amount) : 'Chosen items'}{r.lines?.length ? <div className="text-xs font-normal text-slate-500">{r.lines.map((l) => l.name).join(', ')}</div> : null}</Td>
                  <Td className="max-w-xs">{r.reason}{r.error && <div className="text-xs text-red-700 mt-0.5">{r.error}</div>}</Td>
                  <Td className="text-slate-600 whitespace-nowrap">{r.requestedBy ?? '—'}<div className="text-xs text-slate-400">{dateTime(r.createdAt)}</div></Td>
                  <Td><Badge tone={TONES[r.status as keyof typeof TONES] ?? 'grey'}>{WORDS[r.status] ?? r.status}</Badge></Td>
                  <Td className="text-right whitespace-nowrap">
                    {r.status === 'pending' && canDecide && (
                      <div className="flex justify-end gap-2">
                        <ConfirmButton size="sm" title="Reject this refund?" text="The customer is not refunded. Tell them why yourself if needed." confirmLabel="Reject"
                          onConfirm={() => run('admin_decide_refund', { p_request_id: r.id, p_approve: false, p_idempotency_key: keyFor(r.id) }, { success: 'Refund rejected' })}>Reject</ConfirmButton>
                        <ConfirmButton size="sm" variant="primary" title={`Refund ${r.amount ? money(r.amount) : 'these items'}?`} confirmLabel="Approve and refund"
                          text="The money goes back to the customer’s card, a credit note is issued and the customer is emailed. This cannot be undone."
                          onConfirm={() => run('admin_decide_refund', { p_request_id: r.id, p_approve: true, p_idempotency_key: keyFor(r.id) }, { success: 'Refunded' })}>Approve</ConfirmButton>
                      </div>
                    )}
                    {r.status === 'pending' && !canDecide && <span className="text-xs text-slate-500">A manager decides</span>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <OrderPanel orderId={open} onClose={() => setOpen(null)} go={go} />
    </Screen>
  );
}
