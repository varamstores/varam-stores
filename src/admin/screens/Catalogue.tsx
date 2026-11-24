import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAction, useAdminQuery, errorText, mediaUrl } from '../lib';
import { Badge, Button, Card, Checkbox, ConfirmButton, Empty, ErrorState, Field, Loading, Modal, SearchInput, Select, Table, Td, TextInput, Th, Thumb, Tr, usePager } from '../ui';
import { ImageField, ProductPicker } from '../pickers';

interface Category {
  id: string; name: string; slug: string; badge: string | null; image: { url: string } | null; imagePath: string | null; mobileImagePath: string | null; tagline: string | null;
  accentBg: string | null; accentColor: string | null; cardBg: string | null; isActive: boolean; parentId: string | null; position: number; childCount: number; productCount: number; showOnHomepage: boolean;
}
interface Brand { id: string; name: string; slug: string; logo: { url: string } | null; logoPath: string | null; tagline: string | null; isActive: boolean; isPopular: boolean; productCount: number; marqueePosition: number | null }
interface Shelf { code: string; title: string; isActive: boolean; products: Array<{ id: string; name: string; image: { url: string } | null; status: string }> }

// The pieces used by the Categories, Brands and Products screens.

// ── categories ──────────────────────────────────────────────────────────────────────────────────
export const Categories: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('inventory');
  const { data, isLoading, error, refetch } = useAdminQuery<Category[]>('admin_list_categories');
  const { run } = useAction();
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const byParent = useMemo(() => {
    const m = new Map<string | null, Category[]>();
    for (const c of data ?? []) m.set(c.parentId, [...(m.get(c.parentId) ?? []), c]);
    for (const list of m.values()) list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    return m;
  }, [data]);
  const move = (c: Category, by: number) => {
    const siblings = byParent.get(c.parentId) ?? [];
    const i = siblings.findIndex((x) => x.id === c.id);
    const next = [...siblings];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x);
    void run('admin_reorder_categories', { p_parent_id: c.parentId, p_ids: next.map((s) => s.id) }, { refresh: ['admin_list_categories', 'admin_catalogue_lookups'] });
  };
  const rows: Array<{ c: Category; depth: number; index: number; count: number }> = [];
  const walk = (parent: string | null, depth: number) => (byParent.get(parent) ?? []).forEach((c, index, arr) => { rows.push({ c, depth, index, count: arr.length }); walk(c.id, depth + 1); });
  walk(null, 0);
  const { pageItems, pager } = usePager(rows, 30);

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} />;
  return (
    <Card padded={false} title={`${data?.length ?? 0} categories`} actions={canEdit && <Button size="sm" variant="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setEditing({ isActive: true, parentId: null })}>Add category</Button>}>
      <Table>
        <thead><tr><Th>Category</Th><Th className="text-right">Products</Th><Th>Shown</Th><Th /></tr></thead>
        <tbody>
          {pageItems.map(({ c, depth, index, count }) => (
            <Tr key={c.id}>
              <Td>
                <div className="flex items-center gap-3" style={{ paddingLeft: depth * 24 }}>
                  {depth > 0 && <span className="text-slate-300">└</span>}
                  <Thumb src={c.image?.url} size={36} />
                  <div><div className="font-medium">{c.name}</div>{c.tagline && <div className="text-xs text-slate-500">{c.tagline}</div>}</div>
                </div>
              </Td>
              <Td className="text-right tabular-nums">{c.productCount}</Td>
              <Td className="space-x-1">{c.isActive ? <Badge tone="green">In the shop</Badge> : <Badge>Hidden</Badge>}{c.showOnHomepage && <Badge tone="yellow">Homepage</Badge>}</Td>
              <Td className="text-right whitespace-nowrap">
                {canEdit && <>
                  <Button size="sm" variant="ghost" aria-label="Move up" disabled={index === 0} onClick={() => move(c, -1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" aria-label="Move down" disabled={index === count - 1} onClick={() => move(c, 1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" onClick={() => setEditing(c)}>Edit</Button>
                </>}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      {pager}
      {editing && <CategoryForm initial={editing} all={data ?? []} onClose={() => setEditing(null)} />}
    </Card>
  );
};

const CategoryForm: React.FC<{ initial: Partial<Category>; all: Category[]; onClose: () => void }> = ({ initial, all, onClose }) => {
  const { run, busy } = useAction();
  const [c, setC] = useState<Partial<Category>>(initial);
  const set = <K extends keyof Category>(k: K, v: Category[K] | null) => setC((x) => ({ ...x, [k]: v }));
  // a category cannot be moved inside itself or its own sub-categories
  const blocked = new Set<string>();
  if (initial.id) { const add = (id: string) => { blocked.add(id); all.filter((x) => x.parentId === id).forEach((x) => add(x.id)); }; add(initial.id); }
  const save = async () => {
    const ok = await run('admin_save_category', { p: { id: c.id, name: c.name, parentId: c.parentId ?? null, tagline: c.tagline ?? null, imagePath: c.imagePath ?? null, mobileImagePath: c.mobileImagePath ?? null,
      accentColor: c.accentColor || null, accentBg: c.accentBg || null, cardBg: c.cardBg || null, badge: c.badge || null, showOnHomepage: !!c.showOnHomepage, isActive: c.isActive !== false } },
      { success: 'Category saved', refresh: ['admin_list_categories', 'admin_catalogue_lookups'] });
    if (ok !== undefined) onClose();
  };
  return (
    <Modal open onClose={onClose} title={initial.id ? `Edit ${initial.name}` : 'Add a category'} size="md"
      footer={<>
        {initial.id && initial.productCount === 0 && initial.childCount === 0 && (
          <ConfirmButton variant="danger" danger title={`Delete ${initial.name}?`} text="It has no products or sub-categories, so it can be deleted." confirmLabel="Delete"
            onConfirm={async () => { const ok = await run('admin_delete_category', { p_id: initial.id }, { success: 'Deleted' }); if (ok !== undefined) onClose(); }}>Delete</ConfirmButton>
        )}
        <Button variant="ghost" onClick={onClose}>Go back</Button>
        <Button variant="primary" loading={busy} disabled={!c.name?.trim()} onClick={() => void save()}>Save</Button>
      </>}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Name"><TextInput value={c.name} onChange={(v) => set('name', v)} /></Field>
        <Field label="Inside" help="Leave as “Top level” for a main category.">
          <Select value={c.parentId ?? ''} onChange={(v) => set('parentId', v || null)} placeholder="Top level" options={all.filter((x) => !blocked.has(x.id)).map((x) => ({ value: x.id, label: x.name }))} />
        </Field>
        <Field label="Short description" optional className="sm:col-span-2"><TextInput value={c.tagline} onChange={(v) => set('tagline', v)} placeholder="e.g. Farm-fresh Indian veggies & exotic fruits" /></Field>
        <Field label="Picture (computer)" optional className="sm:col-span-2"><ImageField value={c.imagePath} onChange={(v) => set('imagePath', v)} folder="categories" /></Field>
        <Field label="Picture (phone)" optional help="Leave empty to use the computer picture." className="sm:col-span-2"><ImageField value={c.mobileImagePath} onChange={(v) => set('mobileImagePath', v)} folder="categories" /></Field>
        <Field label="Label" optional help="e.g. New, Popular"><TextInput value={c.badge} onChange={(v) => set('badge', v)} /></Field>
        <Field label="Colours" optional help="Text colour and background used on its card.">
          <div className="flex gap-2">
            <input type="color" aria-label="Text colour" value={c.accentColor ?? '#18181B'} onChange={(e) => set('accentColor', e.target.value)} className="h-10 w-14 rounded border border-[#E2E8F0] cursor-pointer" />
            <input type="color" aria-label="Background colour" value={c.accentBg ?? '#F8FAFC'} onChange={(e) => set('accentBg', e.target.value)} className="h-10 w-14 rounded border border-[#E2E8F0] cursor-pointer" />
            {(c.accentColor || c.accentBg) && <Button size="sm" variant="ghost" onClick={() => { set('accentColor', null); set('accentBg', null); }}>Reset</Button>}
          </div>
        </Field>
        <Checkbox checked={c.isActive !== false} onChange={(v) => set('isActive', v)} label="Show in the shop" />
        <Checkbox checked={!!c.showOnHomepage} onChange={(v) => set('showOnHomepage', v)} label="Show on the homepage" description="In the “Shop by category” section." />
      </div>
    </Modal>
  );
};

// ── brands ──────────────────────────────────────────────────────────────────────────────────────
export const Brands: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('inventory');
  const [q, setQ] = useState('');
  const { data, isLoading, error, refetch } = useAdminQuery<Brand[]>('admin_list_brands', { p_q: q || undefined });
  const [editing, setEditing] = useState<Partial<Brand> | null>(null);
  const { pageItems, pager } = usePager(data, 25);
  if (error) return <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} />;
  return (
    <Card padded={false}>
      <div className="p-4 flex flex-col sm:flex-row gap-2 border-b border-slate-100">
        <SearchInput value={q} onChange={setQ} placeholder="Search brands…" className="flex-1" />
        {canEdit && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setEditing({ isActive: true })}>Add brand</Button>}
      </div>
      {isLoading ? <Loading /> : !data?.length ? <Empty title="No brands found" /> : (<>
        <Table>
          <thead><tr><Th>Brand</Th><Th className="text-right">Products</Th><Th>Shown</Th><Th /></tr></thead>
          <tbody>
            {pageItems.map((b) => (
              <Tr key={b.id} onClick={canEdit ? () => setEditing(b) : undefined}>
                <Td><div className="flex items-center gap-3"><Thumb src={b.logo?.url} size={36} /><div><div className="font-medium">{b.name}</div>{b.tagline && <div className="text-xs text-slate-500">{b.tagline}</div>}</div></div></Td>
                <Td className="text-right tabular-nums">{b.productCount}</Td>
                <Td className="space-x-1">{b.isActive ? <Badge tone="green">Visible</Badge> : <Badge>Hidden</Badge>}{b.isPopular && <Badge tone="yellow">In filters</Badge>}{b.marqueePosition != null && <Badge tone="blue">Logo strip</Badge>}</Td>
                <Td className="text-right">{canEdit && <Button size="sm">Edit</Button>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        {pager}
      </>)}
      {editing && <BrandForm initial={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
};

const BrandForm: React.FC<{ initial: Partial<Brand>; onClose: () => void }> = ({ initial, onClose }) => {
  const { run, busy } = useAction();
  const [b, setB] = useState<Partial<Brand>>(initial);
  const save = async () => {
    const ok = await run('admin_save_brand', { p: { id: b.id, name: b.name, logoPath: b.logoPath ?? null, tagline: b.tagline || null, isPopular: !!b.isPopular, isActive: b.isActive !== false } },
      { success: 'Brand saved', refresh: ['admin_list_brands', 'admin_catalogue_lookups'] });
    if (ok !== undefined) onClose();
  };
  return (
    <Modal open onClose={onClose} title={initial.id ? `Edit ${initial.name}` : 'Add a brand'} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Go back</Button><Button variant="primary" loading={busy} disabled={!b.name?.trim()} onClick={() => void save()}>Save</Button></>}>
      <Field label="Name"><TextInput value={b.name} onChange={(v) => setB({ ...b, name: v })} /></Field>
      <Field label="Logo" optional help="A PNG or SVG with a transparent background works best."><ImageField value={b.logoPath} onChange={(v) => setB({ ...b, logoPath: v })} folder="brands" aspect="square" /></Field>
      <Field label="Short description" optional><TextInput value={b.tagline} onChange={(v) => setB({ ...b, tagline: v })} placeholder="e.g. South Indian cooking pastes" /></Field>
      <Checkbox checked={b.isActive !== false} onChange={(v) => setB({ ...b, isActive: v })} label="Visible in the shop" />
      <Checkbox checked={!!b.isPopular} onChange={(v) => setB({ ...b, isPopular: v })} label="Show in the shop’s brand filter" />
    </Modal>
  );
};

// ── logo strip ──────────────────────────────────────────────────────────────────────────────────
export const LogoStrip: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('content');
  const { data, isLoading } = useAdminQuery<Brand[]>('admin_list_brands');
  const { run, busy } = useAction();
  const [ids, setIds] = useState<string[] | null>(null);
  const current = ids ?? (data ?? []).filter((b) => b.marqueePosition != null).sort((a, b) => (a.marqueePosition ?? 0) - (b.marqueePosition ?? 0)).map((b) => b.id);
  const brand = (id: string) => data?.find((b) => b.id === id);
  const move = (i: number, by: number) => { const n = [...current]; const [x] = n.splice(i, 1); n.splice(i + by, 0, x); setIds(n); };
  if (isLoading) return <Loading />;
  return (
    <Card title="Brand logo strip" description="The moving row of logos on the homepage, in this order. Only brands with a logo show."
      actions={canEdit && <Button size="sm" variant="primary" loading={busy} disabled={!ids} onClick={async () => { const ok = await run('admin_set_marquee', { p_brand_ids: current }, { success: 'Logo strip saved' }); if (ok !== undefined) setIds(null); }}>Save order</Button>}>
      <ul className="space-y-1.5">
        {current.map((id, i) => {
          const b = brand(id);
          return (
            <li key={id} className="flex items-center gap-3 rounded-md border border-[#E2E8F0] p-2">
              <span className="w-6 text-xs text-slate-400 tabular-nums">{i + 1}</span>
              <Thumb src={b?.logo?.url} size={32} />
              <span className="flex-1 text-sm font-medium">{b?.name ?? 'Unknown'}{!b?.logoPath && <span className="text-xs text-[#7A4A0F]"> · no logo</span>}</span>
              {canEdit && <>
                <Button size="sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" aria-label="Move down" disabled={i === current.length - 1} onClick={() => move(i, 1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => setIds(current.filter((x) => x !== id))}><Trash2 className="w-3.5 h-3.5 text-[#A63A3A]" /></Button>
              </>}
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <div className="mt-3 max-w-sm">
          <Select value="" onChange={(v) => v && setIds([...current, v])} placeholder="Add a brand to the strip…"
            options={(data ?? []).filter((b) => !current.includes(b.id) && b.isActive).map((b) => ({ value: b.id, label: b.name + (b.logoPath ? '' : ' (no logo)') }))} />
        </div>
      )}
    </Card>
  );
};

// ── homepage shelves ────────────────────────────────────────────────────────────────────────────
export const Shelves: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('content');
  const { data, isLoading, error, refetch } = useAdminQuery<Shelf[]>('admin_list_collections');
  const [editing, setEditing] = useState<Shelf | null>(null);
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} />;
  return (
    <div className="space-y-3">
      <div className="flex justify-end">{canEdit && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setEditing({ code: '', title: '', isActive: true, products: [] })}>New shelf</Button>}</div>
      <div className="grid md:grid-cols-2 gap-3">
        {(data ?? []).map((s) => (
          <Card key={s.code} title={<span className="flex items-center gap-2">{s.title}{!s.isActive && <Badge>Off</Badge>}</span>} description={`${s.products.length} products`}
            actions={canEdit && <Button size="sm" onClick={() => setEditing(s)}>Edit</Button>}>
            <div className="flex flex-wrap gap-1.5">{s.products.slice(0, 12).map((p) => <Thumb key={p.id} src={p.image?.url} alt={p.name} size={40} />)}</div>
          </Card>
        ))}
      </div>
      {editing && <ShelfForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
};

const ShelfForm: React.FC<{ initial: Shelf; onClose: () => void }> = ({ initial, onClose }) => {
  const { run, busy } = useAction();
  const [title, setTitle] = useState(initial.title);
  const [active, setActive] = useState(initial.isActive);
  const [items, setItems] = useState(initial.products);
  const isNew = !initial.code;
  const code = isNew ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : initial.code;
  const move = (i: number, by: number) => { const n = [...items]; const [x] = n.splice(i, 1); n.splice(i + by, 0, x); setItems(n); };
  const save = async () => {
    const ok = await run('admin_save_collection', { p_code: code, p_title: title, p_product_ids: items.map((p) => p.id), p_is_active: active }, { success: 'Shelf saved', refresh: ['admin_list_collections', 'admin_catalogue_lookups'] });
    if (ok !== undefined) onClose();
  };
  return (
    <Modal open onClose={onClose} title={isNew ? 'New homepage shelf' : `Edit “${initial.title}”`} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Go back</Button><Button variant="primary" loading={busy} disabled={!title.trim() || !code} onClick={() => void save()}>Save shelf</Button></>}>
      <Field label="Shelf name" help={isNew ? 'For your reference. The heading shoppers see is set in Website content.' : undefined}><TextInput value={title} onChange={setTitle} /></Field>
      <Checkbox checked={active} onChange={setActive} label="Shelf switched on" />
      <Field label="Add products"><ProductPicker onPick={(p) => setItems((cur) => (cur.some((x) => x.id === p.id) ? cur : [...cur, { id: p.id, name: p.name, image: p.image, status: p.status }]))} exclude={items.map((x) => x.id)} activeOnly /></Field>
      <ul className="space-y-1.5">
        {items.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2 rounded-md border border-[#E2E8F0] p-2">
            <span className="w-5 text-xs text-slate-400">{i + 1}</span>
            <Thumb src={p.image?.url ?? mediaUrl(null)} size={32} />
            <span className="flex-1 text-sm truncate">{p.name}{p.status !== 'active' && <span className="text-xs text-[#7A4A0F]"> · not on sale (hidden)</span>}</span>
            <Button size="sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
            <Button size="sm" variant="ghost" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
            <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => setItems(items.filter((x) => x.id !== p.id))}><Trash2 className="w-3.5 h-3.5 text-[#A63A3A]" /></Button>
          </li>
        ))}
        {!items.length && <li className="text-sm text-slate-500">No products yet. Search above to add some.</li>}
      </ul>
    </Modal>
  );
};
