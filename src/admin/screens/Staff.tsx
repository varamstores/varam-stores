import React, { useState } from 'react';
import { MailPlus, Plus } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import { useAuth } from '../../context/AuthContext';
import { useAction, useAdminQuery, errorText, ago } from '../lib';
import { Badge, Button, Card, Checkbox, ConfirmButton, ErrorState, Field, Loading, Modal, Notice, SampleTag, Screen, Table, Tabs, Td, TextInput, Th, Tr, usePager, FilterBar } from '../ui';

interface StaffMember { id: string; fullName: string; email: string; role: string; roleName: string; status: string; hasLogin: boolean; invitePending: boolean; lastSignInAt: string | null; lastActiveAt: string | null; isSample: boolean; isMe: boolean }
interface Role { code: string; name: string; description: string; permissions: string[] }
interface StaffData { staff: StaffMember[]; roles: Role[]; permissions: Array<{ code: string; description: string }> }

// Permission names in everyday words.
export const PERMISSION_NAMES: Record<string, string> = {
  full_access: 'Everything (Store Manager)', financials: 'Money: sales figures, approve refunds, invoices, VAT, points',
  user_management: 'Staff: invite, change roles, deactivate', pricing: 'Prices, offers, codes and loyalty', inventory: 'Products, stock, suppliers and purchase orders (change)',
  inventory_read: 'Products and stock (view only)', content: 'Website content, homepage shelves, logo strip', order_status: 'Orders: view, cancel unpaid orders',
  packing_queue: 'Picking list: start and finish picking', barcode_picking: 'Record picked items, weights and substitutes', orders_dispatch: 'Send orders out and mark delivered',
  fleet_management: 'Delivery areas, times, vans and drivers', customer_messaging: 'Customers, reviews and emails', refund_requests: 'Ask for refunds (a manager approves)',
  courier_routing: 'Route planning (not used yet)', driver_chat: 'Driver messages (not used yet)',
};
const STATUS: Record<string, { label: string; tone: 'green' | 'amber' | 'grey' | 'red' }> = {
  active: { label: 'Working', tone: 'green' }, on_break: { label: 'On a break', tone: 'amber' }, offline: { label: 'Off shift', tone: 'grey' }, deactivated: { label: 'Deactivated', tone: 'red' },
};

export default function StaffScreen(_: ScreenProps) {
  const { hasPermission } = useAuth();
  const { data, isLoading, error, refetch } = useAdminQuery<StaffData>('admin_list_staff');
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [st, setSt] = useState('');
  const people = (data?.staff ?? []).filter((s) => (!q.trim() || `${s.fullName} ${s.email}`.toLowerCase().includes(q.trim().toLowerCase())) && (!role || s.role === role)
    && (!st || (st === 'invited' ? s.invitePending : st === 'nologin' ? !s.hasLogin : s.status === st)));
  const { pageItems, pager } = usePager(people, 25);
  const [tab, setTab] = useState('people');
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  return (
    <Screen
      title="Staff & roles"
      intro="Who can use the store portal, and what each role is allowed to do."
      guide={<ol>
        <li>Press <b>Invite someone</b>, enter their name and email and choose a role. They get an email with a link to set their password. If they already have an account with the shop, they can sign in straight away.</li>
        <li>Each person sees only the screens their role allows.</li>
        <li>When someone leaves, <b>deactivate</b> them: they can no longer sign in to the portal, and their past actions stay in the activity log.</li>
        <li>There is always at least one Store Manager; the last one cannot be removed.</li>
      </ol>}
      actions={<Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setInviting(true)}>Invite someone</Button>}
    >
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'people', label: 'People' }, { value: 'roles', label: 'What each role can do' }]} />
      {isLoading ? <Loading /> : error || !data ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : tab === 'people' ? (
        <Card padded={false}>
          <FilterBar search={{ value: q, onChange: setQ, placeholder: 'Search staff by name or email…' }} count={people.length} noun={['person', 'people']}
            filters={[
              { key: 'role', label: 'Role', value: role, onChange: setRole, allLabel: 'All roles', options: data.roles.map((r) => ({ value: r.code, label: r.name })) },
              { key: 'status', label: 'Status', value: st, onChange: setSt, allLabel: 'Everyone', options: [{ value: 'active', label: 'Working' }, { value: 'on_break', label: 'On a break' }, { value: 'offline', label: 'Off shift' }, { value: 'deactivated', label: 'Deactivated' }, { value: 'invited', label: 'Invitation sent' }, { value: 'nologin', label: 'No login' }] },
            ]} />
          <Table>
            <thead><tr><Th>Person</Th><Th>Role</Th><Th>Status</Th><Th>Last signed in</Th></tr></thead>
            <tbody>
              {pageItems.map((s) => (
                <Tr key={s.id} onClick={() => setEditing(s)}>
                  <Td><div className="font-medium">{s.fullName} {s.isMe && <Badge tone="yellow">You</Badge>} <SampleTag show={s.isSample} /></div><div className="text-xs text-slate-500">{s.email}</div></Td>
                  <Td>{s.roleName}</Td>
                  <Td>{s.invitePending ? <Badge tone="blue">Invitation sent</Badge> : !s.hasLogin ? <Badge>No login</Badge> : <Badge tone={STATUS[s.status]?.tone ?? 'grey'}>{STATUS[s.status]?.label ?? s.status}</Badge>}</Td>
                  <Td className="text-slate-500">{s.hasLogin ? ago(s.lastSignInAt) : '—'}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {pager}
        </Card>
      ) : <Roles data={data} canEdit={hasPermission('full_access')} />}
      {inviting && data && <InviteForm roles={data.roles} onClose={() => setInviting(false)} />}
      {editing && data && <EditStaff s={editing} roles={data.roles} onClose={() => setEditing(null)} />}
    </Screen>
  );
}

const RoleChoice: React.FC<{ roles: Role[]; value: string; onChange: (v: string) => void }> = ({ roles, value, onChange }) => (
  <div className="space-y-2">
    {roles.map((r) => (
      <label key={r.code} className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer ${value === r.code ? 'border-[#18181B] bg-[#FEF9C3]/40' : 'border-[#E2E8F0]'}`}>
        <input type="radio" name="role" checked={value === r.code} onChange={() => onChange(r.code)} className="mt-1 accent-[#18181B]" />
        <span><span className="block text-sm font-semibold">{r.name}</span><span className="block text-xs text-slate-500">{r.description}</span></span>
      </label>
    ))}
  </div>
);

const InviteForm: React.FC<{ roles: Role[]; onClose: () => void }> = ({ roles, onClose }) => {
  const { run, busy } = useAction();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [done, setDone] = useState<{ emailSent: boolean } | null>(null);
  const send = async () => {
    const out = await run<{ invited: { email: string; emailSent: boolean } }>('admin_invite_staff', { p_full_name: name, p_email: email, p_role: role }, { refresh: ['admin_list_staff'] });
    if (out) setDone(out.invited);
  };
  return (
    <Modal open onClose={onClose} title="Invite someone to the store portal" size="md"
      footer={done ? <Button variant="primary" onClick={onClose}>Done</Button> : <><Button variant="ghost" onClick={onClose}>Go back</Button><Button variant="primary" icon={<MailPlus className="w-4 h-4" />} loading={busy} disabled={!name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) || !role} onClick={() => void send()}>Send invitation</Button></>}>
      {done ? (
        <Notice tone="success">{done.emailSent ? <>Invitation sent to <b>{email}</b>. They click the link in the email, choose a password, and land in the portal.</> : <><b>{email}</b> already had an account, so they were added straight away. They sign in at <b>/admin</b> with their usual password.</>}</Notice>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Full name"><TextInput value={name} onChange={setName} /></Field>
            <Field label="Email"><TextInput type="email" value={email} onChange={setEmail} /></Field>
          </div>
          <Field label="Role"><RoleChoice roles={roles} value={role} onChange={setRole} /></Field>
        </>
      )}
    </Modal>
  );
};

const EditStaff: React.FC<{ s: StaffMember; roles: Role[]; onClose: () => void }> = ({ s, roles, onClose }) => {
  const { run, busy } = useAction();
  const [role, setRole] = useState(s.role);
  const [name, setName] = useState(s.fullName);
  const refresh = ['admin_list_staff'];
  const deactivated = s.status === 'deactivated';
  return (
    <Modal open onClose={onClose} title={s.fullName} size="md"
      footer={<>
        {s.invitePending && !deactivated && <Button loading={busy} onClick={() => void run('admin_resend_staff_invite', { p_staff_id: s.id }, { success: 'Invitation sent again', refresh })}>Send invitation again</Button>}
        {deactivated
          ? <Button loading={busy} onClick={async () => { const ok = await run('admin_update_staff', { p_id: s.id, p_status: 'offline' }, { success: 'Reactivated', refresh }); if (ok !== undefined) onClose(); }}>Reactivate</Button>
          : !s.isMe && <ConfirmButton variant="danger" danger title={`Deactivate ${s.fullName}?`} confirmLabel="Deactivate" text="They can no longer use the store portal. Their past work stays in the records. You can reactivate them later."
              onConfirm={async () => { const ok = await run('admin_update_staff', { p_id: s.id, p_status: 'deactivated' }, { success: 'Deactivated', refresh }); if (ok !== undefined) onClose(); }}>Deactivate</ConfirmButton>}
        <Button variant="primary" loading={busy} disabled={role === s.role && name === s.fullName}
          onClick={async () => { const ok = await run('admin_update_staff', { p_id: s.id, p_role: role !== s.role ? role : null, p_full_name: name !== s.fullName ? name : null }, { success: 'Saved', refresh }); if (ok !== undefined) onClose(); }}>Save</Button>
      </>}>
      <p className="text-sm text-slate-500">{s.email}{s.isMe ? ' · this is you' : ''}</p>
      <Field label="Name"><TextInput value={name} onChange={setName} /></Field>
      <Field label="Role"><RoleChoice roles={roles} value={role} onChange={setRole} /></Field>
    </Modal>
  );
};

const Roles: React.FC<{ data: StaffData; canEdit: boolean }> = ({ data, canEdit }) => {
  const { run, busy } = useAction();
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const perms = data.permissions.filter((p) => !['courier_routing', 'driver_chat'].includes(p.code));
  return (
    <Card padded={false} description={canEdit ? 'Tick what each role may do, then save that role. The Store Manager always keeps everything.' : 'Only a Store Manager can change this.'}>
      <Table>
        <thead><tr><Th>Allowed to…</Th>{data.roles.map((r) => <Th key={r.code} className="text-center">{r.name}</Th>)}</tr></thead>
        <tbody>
          {perms.map((p) => (
            <tr key={p.code}>
              <Td>{PERMISSION_NAMES[p.code] ?? p.description}</Td>
              {data.roles.map((r) => {
                const list = draft[r.code] ?? r.permissions;
                const locked = !canEdit || (r.code === 'store_manager' && p.code === 'full_access');
                return <Td key={r.code} className="text-center"><div className="inline-flex"><Checkbox label="" checked={list.includes(p.code) || (list.includes('full_access') && p.code !== 'full_access')} disabled={locked || (list.includes('full_access') && p.code !== 'full_access')}
                  onChange={(v) => setDraft({ ...draft, [r.code]: v ? [...list, p.code] : list.filter((x) => x !== p.code) })} /></div></Td>;
              })}
            </tr>
          ))}
          {canEdit && (
            <tr>
              <Td />
              {data.roles.map((r) => <Td key={r.code} className="text-center">{draft[r.code] && <Button size="sm" variant="primary" loading={busy} onClick={async () => {
                const ok = await run('admin_set_role_permissions', { p_role: r.code, p_permissions: draft[r.code] }, { success: `${r.name} updated`, refresh: ['admin_list_staff'] });
                if (ok !== undefined) setDraft(({ [r.code]: _, ...rest }) => rest);
              }}>Save</Button>}</Td>)}
            </tr>
          )}
        </tbody>
      </Table>
      <p className="text-xs text-slate-500 p-4">People see the change the next time their page loads.</p>
    </Card>
  );
};
