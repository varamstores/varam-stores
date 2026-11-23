import React, { useState } from 'react';
import { CheckCircle2, ChevronDown } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import { useAuth } from '../../context/AuthContext';
import { useAction, useAdminQuery, errorText, dateTime } from '../lib';
import { Badge, Button, Card, ErrorState, Field, Loading, MoneyInput, Notice, NumberInput, Screen, Select, Table, Tabs, Td, TextInput, Th, Toggle, cx } from '../ui';

interface Setting { key: string; label: string; help: string | null; kind: string; options: Array<{ value: string; label: string }> | null; min: number | null; max: number | null; editable: boolean; value: unknown; updatedAt: string; updatedBy: string | null }
interface Group { group: string; settings: Setting[] }
interface Company {
  company: { id: string; name: string; companyNumber: string | null; vatNumber: string | null; address: { line1?: string; line2?: string; city?: string; postcode?: string }; invoicePrefix: string; creditNotePrefix: string } | null;
  taxRates: Array<{ id: string; category: string; categoryName: string; rateBp: number; validFrom: string; validTo: string | null; confirmedBy: string | null; confirmedAt: string | null; note: string | null }>;
  invoicesEnabled: boolean;
}

export default function SettingsScreen(_: ScreenProps) {
  const { hasPermission } = useAuth();
  const canSettings = hasPermission('full_access');
  const canMoney = hasPermission('financials');
  const [tab, setTab] = useState(canSettings ? 'shop' : 'company');
  return (
    <Screen
      title="Settings"
      intro="How the shop works: contact details, checkout, delivery, stock, loyalty, emails and legal details."
      guide={<ul>
        <li>Switches and drop-downs save as soon as you change them. Boxes you type in have their own <b>Save</b> button.</li>
        <li>Every change is recorded in the activity log with your name.</li>
        <li>Grey settings at the bottom are fixed by the developer.</li>
      </ul>}
    >
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'shop', label: 'Shop settings', hidden: !canSettings && !canMoney }, { value: 'company', label: 'Company & VAT', hidden: !canMoney }]} />
      {tab === 'shop' ? <ShopSettings canEdit={canSettings} /> : <CompanyTab />}
    </Screen>
  );
}

const ShopSettings: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const { data, isLoading, error, refetch } = useAdminQuery<Group[]>('admin_get_settings');
  const [showFixed, setShowFixed] = useState(false);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} />;
  return (
    <div className="space-y-4">
      {!canEdit && <Notice tone="info">Only a Store Manager can change these.</Notice>}
      {data.map((g) => {
        const fixed = g.settings.every((s) => !s.editable);
        if (fixed) return (
          <Card key={g.group}>
            <button type="button" onClick={() => setShowFixed(!showFixed)} className="w-full flex items-center justify-between text-sm font-semibold text-slate-500 cursor-pointer">{g.group}<ChevronDown className={cx('w-4 h-4 transition-transform', showFixed && 'rotate-180')} /></button>
            {showFixed && <div className="mt-3 divide-y divide-slate-100">{g.settings.map((s) => <div key={s.key} className="py-2 flex justify-between gap-4 text-sm"><span className="text-slate-500">{s.label}</span><span className="font-mono text-xs break-all">{String(s.value)}</span></div>)}</div>}
          </Card>
        );
        return (
          <Card key={g.group} title={g.group} padded={false}>
            <div className="divide-y divide-slate-100">{g.settings.map((s) => <SettingRow key={s.key} s={s} canEdit={canEdit && s.editable} />)}</div>
          </Card>
        );
      })}
    </div>
  );
};

const SettingRow: React.FC<{ s: Setting; canEdit: boolean }> = ({ s, canEdit }) => {
  const { run, busy } = useAction();
  const save = (value: unknown) => run('admin_update_setting', { p_key: s.key, p_value: value }, { success: `Saved: ${s.label}`, refresh: ['admin_get_settings', 'admin_dashboard', 'admin_get_loyalty'] });
  const initialText = s.kind === 'percent' ? (s.value == null ? null : Number(s.value) / 100) : s.value;
  // undefined = showing the saved value; anything else = being edited
  const [edit, setDraft] = useState<unknown>(undefined);
  const draft = edit === undefined ? initialText : edit;
  const changed = edit !== undefined && JSON.stringify(edit) !== JSON.stringify(initialText);
  const toValue = () => (s.kind === 'percent' ? Math.round(Number(draft) * 100) : s.kind === 'integer' || s.kind === 'money' ? Number(draft) : draft);
  const typed = !['boolean', 'select'].includes(s.kind);
  return (
    <div className="px-4 sm:px-5 py-4 grid md:grid-cols-[1fr_minmax(260px,380px)] gap-3 md:gap-6 items-start">
      <div>
        <div className="text-sm font-semibold">{s.label}</div>
        {s.help && <div className="text-xs text-slate-500 mt-0.5">{s.help}</div>}
        {s.updatedBy && <div className="text-[11px] text-slate-400 mt-1">Changed by {s.updatedBy}, {dateTime(s.updatedAt)}</div>}
      </div>
      <div className="flex items-start gap-2">
        {s.kind === 'boolean' ? <Toggle checked={s.value === true} disabled={!canEdit || busy} onChange={(v) => void save(v)} label={s.value === true ? 'On' : 'Off'} />
          : s.kind === 'select' ? <Select value={String(s.value ?? '')} disabled={!canEdit || busy} onChange={(v) => void save(v)} options={s.options ?? []} className="flex-1" />
          : s.kind === 'integer' ? <NumberInput value={draft as number | null} onChange={setDraft} min={s.min ?? undefined} max={s.max ?? undefined} disabled={!canEdit} className="flex-1" />
          : s.kind === 'percent' ? <NumberInput decimals value={draft as number | null} onChange={setDraft} suffix="%" disabled={!canEdit} className="flex-1" />
          : s.kind === 'money' ? <MoneyInput value={draft as number | null} onChange={setDraft} disabled={!canEdit} className="flex-1" />
          : <TextInput type={s.kind === 'email' ? 'email' : s.kind === 'url' ? 'url' : s.kind === 'phone' ? 'tel' : 'text'} value={draft as string} onChange={setDraft} disabled={!canEdit} className="flex-1" />}
        {typed && canEdit && changed && <Button variant="primary" loading={busy} disabled={draft === null && s.kind !== 'text'} onClick={async () => { const ok = await save(toValue()); if (ok !== undefined) setDraft(undefined); }}>Save</Button>}
      </div>
      {typed && (s.min != null || s.max != null) && <div className="md:col-start-2 -mt-2 text-[11px] text-slate-400">{s.kind === 'percent' ? `${(s.min ?? 0) / 100}% to ${(s.max ?? 0) / 100}%` : `${s.min} to ${s.max}`}</div>}
    </div>
  );
};

const CompanyTab: React.FC = () => {
  const { data, isLoading, error, refetch } = useAdminQuery<Company>('admin_get_company');
  const { run, busy } = useAction();
  const [c, setC] = useState<NonNullable<Company['company']> | null>(null);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} />;
  const v = c ?? data.company ?? { id: '', name: '', companyNumber: '', vatNumber: '', address: {}, invoicePrefix: 'INV', creditNotePrefix: 'CN' };
  const set = (patch: Partial<typeof v>) => setC({ ...v, ...patch });
  const setAddr = (k: 'line1' | 'line2' | 'city' | 'postcode', val: string) => setC({ ...v, address: { ...v.address, [k]: val } });
  return (
    <div className="space-y-4">
      {!data.company && <Notice tone="warning">Add your company details to issue VAT invoices. Until then customers get order confirmations but no VAT invoice.</Notice>}
      {data.company && !data.invoicesEnabled && <Notice tone="info" action={undefined}>Details saved. Switch on <b>Issue VAT invoices</b> under Shop settings → Legal &amp; invoices when you are ready.</Notice>}
      {data.invoicesEnabled && <Notice tone="success">VAT invoices are being issued for charged orders.</Notice>}
      <Card title="Company details" description="Printed on every VAT invoice and credit note.">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Registered company name" className="sm:col-span-2"><TextInput value={v.name} onChange={(x) => set({ name: x })} placeholder="e.g. Varam Foods Ltd" /></Field>
          <Field label="Company number" optional help="8 characters from Companies House."><TextInput value={v.companyNumber} onChange={(x) => set({ companyNumber: x })} /></Field>
          <Field label="VAT number" optional help="e.g. GB123456789"><TextInput value={v.vatNumber} onChange={(x) => set({ vatNumber: x })} /></Field>
          <Field label="Registered address" className="sm:col-span-2"><TextInput value={v.address.line1} onChange={(x) => setAddr('line1', x)} placeholder="Address line 1" /></Field>
          <Field label={<span className="sr-only">Address line 2</span>} className="sm:col-span-2"><TextInput value={v.address.line2} onChange={(x) => setAddr('line2', x)} placeholder="Address line 2 (optional)" /></Field>
          <Field label="Town"><TextInput value={v.address.city} onChange={(x) => setAddr('city', x)} /></Field>
          <Field label="Postcode"><TextInput value={v.address.postcode} onChange={(x) => setAddr('postcode', x.toUpperCase())} /></Field>
          <Field label="Invoice numbers start with" help="e.g. INV → INV-000123"><TextInput value={v.invoicePrefix} onChange={(x) => set({ invoicePrefix: x.toUpperCase() })} /></Field>
          <Field label="Credit note numbers start with"><TextInput value={v.creditNotePrefix} onChange={(x) => set({ creditNotePrefix: x.toUpperCase() })} /></Field>
        </div>
        <div className="flex justify-end mt-4">
          <Button variant="primary" loading={busy} disabled={!c || !v.name.trim() || !v.address.line1?.trim()}
            onClick={async () => { const ok = await run('admin_save_company', { p: { name: v.name, companyNumber: v.companyNumber, vatNumber: v.vatNumber, address: v.address, invoicePrefix: v.invoicePrefix, creditNotePrefix: v.creditNotePrefix } }, { success: 'Company details saved', refresh: ['admin_get_company', 'admin_get_settings'] }); if (ok !== undefined) setC(null); }}>
            Save company details
          </Button>
        </div>
      </Card>
      <Card title="VAT rates" padded={false} description="The rates the shop charges. Ask your accountant to confirm each one, then press Confirm.">
        <Table>
          <thead><tr><Th>Category</Th><Th className="text-right">Rate</Th><Th>Since</Th><Th>Checked</Th></tr></thead>
          <tbody>
            {data.taxRates.map((r) => (
              <tr key={r.id}>
                <Td><div className="font-medium">{r.categoryName}</div>{r.note && <div className="text-xs text-slate-500">{r.note}</div>}</Td>
                <Td className="text-right tabular-nums">{r.rateBp / 100}%</Td>
                <Td className="text-slate-500">{new Date(r.validFrom).getFullYear()}{r.validTo ? ` – ${new Date(r.validTo).getFullYear()}` : ''}</Td>
                <Td>{r.confirmedAt ? <span className="inline-flex items-center gap-1 text-emerald-700 text-sm"><CheckCircle2 className="w-4 h-4" />{r.confirmedBy}, {dateTime(r.confirmedAt)}</span>
                  : <span className="flex items-center gap-2"><Badge tone="amber">Not checked</Badge><Button size="sm" loading={busy} onClick={() => void run('admin_confirm_tax_rate', { p_id: r.id }, { success: 'Confirmed', refresh: ['admin_get_company'] })}>Confirm</Button></span>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
};
