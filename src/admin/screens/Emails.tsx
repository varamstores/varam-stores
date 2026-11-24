import React, { useRef, useState } from 'react';
import { Mail, RotateCw } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import { useAction, useAdminQuery, dateTime, errorText } from '../lib';
import { Badge, Button, Card, Chips, Drawer, Empty, ErrorState, Field, Loading, Notice, Screen, Table, Td, TextArea, TextInput, Th, Tr, usePager } from '../ui';

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
  const checklist = useAdminQuery<Array<{ key: string; done: boolean }>>('admin_setup_checklist');
  const connected = checklist.data?.find((s) => s.key === 'emails')?.done;
  const [logOpen, setLogOpen] = useState(param === 'failed');
  return (
    <Screen
      title="Emails"
      intro="The wording of the emails the shop sends to customers. Change any of them; the shop fills in names, orders and links for you."
      guide={<ol>
        <li>Press an email to open it, then change the subject and the message.</li>
        <li>Grey <b>fill-in fields</b> like {'{{first_name}}'} are replaced for each customer (e.g. “Asha”). Click one to put it where your cursor is.</li>
        <li>Some links are required by law (for example unsubscribe) and cannot be removed.</li>
        <li>Press <b>Save wording</b>. The next email of that kind uses the new words.</li>
      </ol>}
      actions={<Button variant="ghost" onClick={() => setLogOpen(true)}>See what was sent</Button>}
    >
      {checklist.data && !connected && (
        <Notice tone="info"><b>Emails are not connected yet.</b> They are sent through Resend from your own address (for example orders@varamfoods.co.uk). Until your developer adds the Resend key, emails wait in a queue and go out once it is connected. Sign-in emails (password reset, staff invitations) use the same address.</Notice>
      )}
      <Templates />
      <Drawer open={logOpen} onClose={() => setLogOpen(false)} wide title="Emails sent" subtitle="Every email the shop has sent or is about to send. If one failed, fix the cause (often the address) and press Try again.">
        <Outbox initial={param === 'failed' ? 'failed' : ''} />
      </Drawer>
    </Screen>
  );
}

// Which part of the shop each email belongs to, so the list reads in plain groups.
function groupOf(t: Template): string {
  if (t.isMarketing) return 'Marketing (only to people who agreed)';
  if (/^(order|refund|repeat)/.test(t.code)) return 'Orders';
  if (/^(purchase|supplier)/.test(t.code)) return 'Suppliers';
  return 'Account & other';
}

const Templates: React.FC = () => {
  const { data, isLoading, error, refetch } = useAdminQuery<Template[]>('admin_list_message_templates');
  const [open, setOpen] = useState<Template | null>(null);
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} />;
  const groups = [...new Set((data ?? []).map(groupOf))].sort((a, b) => ['Orders', 'Account & other', 'Marketing (only to people who agreed)', 'Suppliers'].indexOf(a) - ['Orders', 'Account & other', 'Marketing (only to people who agreed)', 'Suppliers'].indexOf(b));
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Card key={g} title={g} padded={false}>
          <ul>
            {(data ?? []).filter((t) => groupOf(t) === g).map((t) => (
              <li key={`${t.code}-${t.channel}`} className="border-b border-[#E8EBEF] last:border-0">
                <button type="button" onClick={() => setOpen(t)} className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 text-left hover:bg-[#FFFCEB] cursor-pointer group">
                  <Mail className="w-4 h-4 text-[#7A8594] shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-medium">{t.name}{t.channel !== 'email' && <span className="text-[12px] text-[#7A8594]"> · {t.channel.toUpperCase()}</span>}</span>
                    <span className="block text-[13px] text-[#5F6B7A] truncate">{t.subject ?? '—'}</span>
                  </span>
                  <span className="text-[12px] text-[#7A8594] hidden sm:block">Changed {dateTime(t.updatedAt)}</span>
                  <span className="text-[20px] leading-none text-[#C3C9D2] group-hover:text-[#18181B]">›</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {open && <TemplateEditor t={open} onClose={() => setOpen(null)} />}
    </div>
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
  const { data, isLoading, error, refetch } = useAdminQuery<Message[]>('admin_list_outbox', { p_status: status || undefined, p_limit: 500 }, { refetchInterval: 20_000 });
  const { pageItems, pager } = usePager(data, 25);
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
              {pageItems.map((m) => (
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
        {pager}
      </Card>
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.subject ?? 'Message'} subtitle={open ? `To ${open.to} · ${STATUS_WORD[open.status] ?? open.status}` : undefined}>
        {open && <div className="bg-white rounded-lg border border-[#E2E8F0] p-4 text-sm whitespace-pre-line">{open.body}</div>}
      </Drawer>
    </>
  );
};
