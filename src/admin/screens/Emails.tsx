import React, { useRef, useState } from 'react';
import { Mail, RotateCw } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import { useAction, useAdminQuery, dateTime, errorText } from '../lib';
import { Badge, Button, Card, Chips, Drawer, Empty, ErrorState, Field, Loading, Notice, Screen, Table, Tabs, Td, TextArea, TextInput, Th, Tr } from '../ui';

interface Template { code: string; name: string; locale: string; channel: string; subject: string | null; body: string; updatedAt: string; isMarketing: boolean; placeholders: string[] }
interface Message { id: string; channel: string; template: string | null; to: string; subject: string | null; body: string; status: string; attempts: number; error: string | null; isMarketing: boolean; order: string | null; createdAt: string; sentAt: string | null }

// What each {{placeholder}} becomes, in words staff understand.
const PLACEHOLDER_HELP: Record<string, string> = {
  first_name: 'Customer’s first name', order_number: 'Order number', order_url: 'Link to the order', total: 'Order total', slot: 'Delivery day and time',
  confirm_url: 'Confirmation link (required)', unsubscribe_url: 'Unsubscribe link (required)', basket_url: 'Link to their basket', count: 'Number of items',
  product_name: 'Product name', product_url: 'Link to the product', price: 'Price', old_price: 'Old price', code: 'Discount code', amount: 'Amount',
  reason: 'Reason', site_url: 'Shop address', support_email: 'Support email', items: 'List of items', eta: 'Arrival time', driver: 'Driver’s first name',
  tracking_url: 'Tracking link', invoice_number: 'Invoice number', points: 'Points', supplier_name: 'Supplier name', po_number: 'Purchase order number', lines: 'Products and quantities',
};
const STATUS_TONE = { queued: 'blue', sending: 'blue', sent: 'green', failed: 'red', suppressed: 'grey' } as const;
const STATUS_WORD: Record<string, string> = { queued: 'Waiting to send', sending: 'Sending', sent: 'Sent', failed: 'Failed', suppressed: 'Not sent (no consent)' };

export default function EmailsScreen({ param }: ScreenProps) {
  const [tab, setTab] = useState(param === 'failed' ? 'outbox' : 'templates');
  return (
    <Screen
      title="Emails"
      intro="The wording of every email the shop sends, and a log of what was sent to whom."
      guide={<ul>
        <li>Edit the words freely. Text in <b>{'{{double brackets}}'}</b> is filled in for each customer, e.g. {'{{first_name}}'} becomes “Asha”. Click a grey chip to insert one.</li>
        <li>Some links are required by law (e.g. unsubscribe) and cannot be removed.</li>
        <li><b>Sent emails</b> shows every message. If one failed, fix the cause (often the email address) and press <b>Try again</b>.</li>
      </ul>}
    >
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'templates', label: 'Email wording' }, { value: 'outbox', label: 'Sent emails' }]} />
      {tab === 'templates' ? <Templates /> : <Outbox initial={param === 'failed' ? 'failed' : ''} />}
    </Screen>
  );
}

const Templates: React.FC = () => {
  const { data, isLoading, error, refetch } = useAdminQuery<Template[]>('admin_list_message_templates');
  const [open, setOpen] = useState<Template | null>(null);
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} />;
  return (
    <Card padded={false}>
      <Table>
        <thead><tr><Th>Email</Th><Th>Subject</Th><Th>Type</Th><Th>Last changed</Th></tr></thead>
        <tbody>
          {(data ?? []).map((t) => (
            <Tr key={`${t.code}-${t.channel}`} onClick={() => setOpen(t)}>
              <Td className="font-medium">{t.name}</Td>
              <Td className="text-slate-600 max-w-sm truncate">{t.subject ?? '—'}</Td>
              <Td>{t.isMarketing ? <Badge tone="violet">Marketing</Badge> : <Badge>Service</Badge>}{t.channel !== 'email' && <Badge tone="blue">{t.channel.toUpperCase()}</Badge>}</Td>
              <Td className="text-slate-500 text-xs">{dateTime(t.updatedAt)}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      {open && <TemplateEditor t={open} onClose={() => setOpen(null)} />}
    </Card>
  );
};

const TemplateEditor: React.FC<{ t: Template; onClose: () => void }> = ({ t, onClose }) => {
  const { run, busy } = useAction();
  const [subject, setSubject] = useState(t.subject ?? '');
  const [body, setBody] = useState(t.body);
  const area = useRef<HTMLTextAreaElement>(null);
  const insert = (p: string) => {
    const el = area.current;
    const tag = `{{${p}}}`;
    if (!el) { setBody((b) => b + tag); return; }
    const s = el.selectionStart, e = el.selectionEnd;
    setBody((b) => b.slice(0, s) + tag + b.slice(e));
    window.setTimeout(() => { el.focus(); el.setSelectionRange(s + tag.length, s + tag.length); }, 0);
  };
  const preview = body.replace(/\{\{(\w+)\}\}/g, (_, k: string) => `[${PLACEHOLDER_HELP[k] ?? k}]`);
  return (
    <Drawer open onClose={onClose} wide title={t.name} subtitle={t.isMarketing ? 'Marketing email: only sent to people who agreed.' : 'Service email: sent when it is needed.'}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="primary" loading={busy} disabled={subject === (t.subject ?? '') && body === t.body}
        onClick={async () => { const ok = await run('admin_save_message_template', { p_code: t.code, p_channel: t.channel, p_subject: subject || null, p_body: body }, { success: 'Email wording saved', refresh: ['admin_list_message_templates'] }); if (ok !== undefined) onClose(); }}>Save wording</Button></>}>
      {t.channel === 'email' && <Field label="Subject line"><TextInput value={subject} onChange={setSubject} /></Field>}
      <div>
        <div className="text-[13px] font-semibold mb-1">Fill-in fields — click to insert at the cursor</div>
        <div className="flex flex-wrap gap-1.5">{t.placeholders.map((p) => <button key={p} type="button" onClick={() => insert(p)} title={PLACEHOLDER_HELP[p] ?? p} className="px-2 py-1 rounded-md bg-slate-100 hover:bg-[#FEF9C3] text-xs font-mono cursor-pointer">{`{{${p}}}`} <span className="font-sans text-slate-500">{PLACEHOLDER_HELP[p] ?? ''}</span></button>)}</div>
      </div>
      <Field label="Message"><TextArea ref={area} rows={14} value={body} onChange={setBody} className="font-mono text-[13px]" /></Field>
      <Card title="Preview" description="Fill-in fields are shown in [square brackets].">
        <div className="text-sm whitespace-pre-line">{subject && <div className="font-semibold mb-2">{subject.replace(/\{\{(\w+)\}\}/g, (_, k: string) => `[${PLACEHOLDER_HELP[k] ?? k}]`)}</div>}{preview}</div>
      </Card>
    </Drawer>
  );
};

const Outbox: React.FC<{ initial: string }> = ({ initial }) => {
  const [status, setStatus] = useState(initial);
  const { data, isLoading, error, refetch } = useAdminQuery<Message[]>('admin_list_outbox', { p_status: status || undefined, p_limit: 200 }, { refetchInterval: 20_000 });
  const { run, busy } = useAction();
  const [open, setOpen] = useState<Message | null>(null);
  return (
    <>
      <Chips value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'queued', label: 'Waiting' }, { value: 'sent', label: 'Sent' }, { value: 'failed', label: 'Failed' }]} />
      {data?.some((m) => m.status === 'queued') && <Notice tone="info">Emails marked “Waiting to send” go out within a minute once the email service is connected.</Notice>}
      <Card padded={false}>
        {isLoading ? <Loading /> : error ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : !data?.length ? <Empty icon={<Mail className="w-5 h-5" />} title="No emails yet" /> : (
          <Table>
            <thead><tr><Th>To</Th><Th>Subject</Th><Th>Status</Th><Th>When</Th><Th /></tr></thead>
            <tbody>
              {data.map((m) => (
                <Tr key={m.id} onClick={() => setOpen(m)}>
                  <Td className="max-w-[14rem] truncate">{m.to}</Td>
                  <Td className="max-w-sm"><div className="truncate">{m.subject ?? m.template}</div>{m.order && <div className="text-xs text-slate-500">Order {m.order}</div>}</Td>
                  <Td><Badge tone={STATUS_TONE[m.status as keyof typeof STATUS_TONE] ?? 'grey'}>{STATUS_WORD[m.status] ?? m.status}</Badge>{m.error && <div className="text-xs text-[#8A2B2B] mt-0.5 max-w-xs truncate">{m.error}</div>}</Td>
                  <Td className="text-xs text-slate-500 whitespace-nowrap">{dateTime(m.sentAt ?? m.createdAt)}</Td>
                  <Td className="text-right">{m.status === 'failed' && <Button size="sm" icon={<RotateCw className="w-3.5 h-3.5" />} disabled={busy} onClick={(e) => { e.stopPropagation(); void run('admin_retry_message', { p_id: m.id }, { success: 'Queued again', refresh: ['admin_list_outbox'] }); }}>Try again</Button>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.subject ?? 'Message'} subtitle={open ? `To ${open.to} · ${STATUS_WORD[open.status] ?? open.status}` : undefined}>
        {open && <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 text-sm whitespace-pre-line">{open.body}</div>}
      </Drawer>
    </>
  );
};
