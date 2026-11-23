import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, Monitor, Pencil, Search, Smartphone } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { ScreenProps } from '../AdminApp';
import { rpc } from '../../lib/api';
import { useAction, useAdminQuery, errorText, dateTime } from '../lib';
import { Badge, Button, Card, Drawer, Empty, ErrorState, Field, Loading, Notice, Screen, SearchInput, Select, TextArea, TextInput, Toggle, cx } from '../ui';
import { toast } from '../toast';
import { FieldEditor, ImageSlot, problems, type Schema } from '../cms/fields';

interface SectionInfo { key: string; label: string; help: string | null; enabled: boolean; desktop: boolean; mobile: boolean; position: number; entryCount: number; reorderable: boolean }
interface PageInfo {
  key: string; label: string; help: string | null; kind: 'global' | 'system' | 'static'; route: string | null; isPublished: boolean; updatedAt: string;
  seoTitle: string | null; seoDescription: string | null; seoImage: { desktop: string | null; mobile: string | null; alt: string } | null; sections: SectionInfo[];
}
interface Entry { key: string; label: string; help: string | null; kind: string; value: unknown; maxLength: number | null; itemSchema: Schema | null; updatedAt: string; updatedBy: string | null }
interface Hit { key: string; kind: string; page: string; section: string; label: string; value: unknown }

const GROUPS: Array<{ kind: PageInfo['kind']; title: string }> = [
  { kind: 'global', title: 'On every page' }, { kind: 'system', title: 'Shop pages' }, { kind: 'static', title: 'Information pages' },
];

function entrySchema(e: Entry): Schema {
  switch (e.kind) {
    case 'text': return { type: 'string', maxLength: e.maxLength ?? undefined };
    case 'richtext': return { type: 'string', 'x-kind': 'richtext' };
    case 'image': return { type: 'object', 'x-kind': 'image' };
    case 'link': return { type: 'object', 'x-kind': 'link' };
    case 'number': return { type: 'number' };
    case 'boolean': return { type: 'boolean' };
    case 'color': return { type: 'string', 'x-kind': 'color' };
    default: return e.itemSchema ?? { type: 'string' };
  }
}

export default function ContentScreen({ param }: ScreenProps) {
  const { data, isLoading, error, refetch } = useAdminQuery<PageInfo[]>('admin_cms_overview');
  const [pageKey, setPageKey] = useState<string | null>(param ?? null);
  const [editing, setEditing] = useState<{ page: string; section: string; focus?: string } | null>(null);
  const [q, setQ] = useState('');
  const page = data?.find((p) => p.key === pageKey) ?? data?.find((p) => p.key === 'home') ?? data?.[0];

  return (
    <Screen
      title="Website content"
      intro="Every word, picture, button and section of the website. Changes appear on the live site within a minute."
      guide={<ol>
        <li>Choose a <b>page</b> on the left (or use <b>Find text</b> to search for any words you can see on the site).</li>
        <li>Each page is made of <b>sections</b>. Switch a section off, show it only on computers or only on phones, or move it up and down.</li>
        <li>Press <b>Edit</b> to change its words, pictures and buttons. For a button you only answer “What should it say?” and “Where should it take people?”.</li>
        <li>Press <b>Save</b>. Use “View on the website” to check it.</li>
      </ol>}
    >
      {isLoading ? <Loading /> : error || !data ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : (
        <div className="grid lg:grid-cols-[280px_1fr] gap-4 items-start">
          <div className="space-y-3 lg:sticky lg:top-20">
            <SearchInput value={q} onChange={setQ} placeholder="Find text on the site…" />
            <div className="lg:hidden">
              <Select value={page?.key ?? ''} onChange={(v) => { setPageKey(v); setQ(''); }} options={data.map((p) => ({ value: p.key, label: `${GROUPS.find((g) => g.kind === p.kind)?.title}: ${p.label}` }))} />
            </div>
            <Card padded={false} className="hidden lg:block">
              <nav className="p-2 space-y-3">
                {GROUPS.map((g) => (
                  <div key={g.kind}>
                    <div className="px-2 pb-1 text-[10px] uppercase tracking-widest font-bold text-slate-400">{g.title}</div>
                    {data.filter((p) => p.kind === g.kind).map((p) => (
                      <button key={p.key} type="button" onClick={() => { setPageKey(p.key); setQ(''); }}
                        className={cx('w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm text-left cursor-pointer', p.key === page?.key && !q ? 'bg-[#18181B] text-white' : 'hover:bg-slate-100')}>
                        <span className="truncate">{p.label}</span>
                        {p.kind === 'static' && !p.isPublished && <span className={cx('text-[10px]', p.key === page?.key && !q ? 'text-slate-300' : 'text-slate-400')}>hidden</span>}
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
            </Card>
          </div>
          <div className="min-w-0">
            {q.trim().length >= 2 ? <SearchResults q={q} pages={data} onOpen={(page, section, focus) => setEditing({ page, section, focus })} />
              : page && <PageView key={page.key} page={page} onEdit={(section) => setEditing({ page: page.key, section })} />}
          </div>
        </div>
      )}
      {editing && data && <SectionEditor page={data.find((p) => p.key === editing.page)!} sectionKey={editing.section} focus={editing.focus} onClose={() => setEditing(null)} />}
    </Screen>
  );
}

const SearchResults: React.FC<{ q: string; pages: PageInfo[]; onOpen: (page: string, section: string, focus: string) => void }> = ({ q, pages, onOpen }) => {
  const { data, isLoading } = useAdminQuery<Hit[]>('admin_cms_search', { p_q: q, p_limit: 40 });
  if (isLoading) return <Loading text="Searching…" />;
  if (!data?.length) return <Card><Empty icon={<Search className="w-5 h-5" />} title={`No text matches “${q}”`} text="Try fewer words. Product names and prices are changed in Products, not here." /></Card>;
  return (
    <Card title={`Found in ${data.length} place${data.length === 1 ? '' : 's'}`} padded={false}>
      <ul className="divide-y divide-slate-100">
        {data.map((h) => {
          const p = pages.find((x) => x.key === h.page);
          const s = p?.sections.find((x) => x.key === h.section);
          const text = typeof h.value === 'string' ? h.value : JSON.stringify(h.value);
          return (
            <li key={h.key}>
              <button type="button" onClick={() => onOpen(h.page, h.section, h.key)} className="w-full text-left px-4 py-3 hover:bg-amber-50/50 cursor-pointer">
                <div className="text-xs text-slate-500">{p?.label} → {s?.label ?? h.section} → <b>{h.label}</b></div>
                <div className="text-sm mt-0.5 line-clamp-2">{text}</div>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

const PageView: React.FC<{ page: PageInfo; onEdit: (section: string) => void }> = ({ page, onEdit }) => {
  const { run, busy } = useAction();
  const sorted = useMemo(() => [...page.sections].sort((a, b) => a.position - b.position), [page.sections]);
  const refresh = ['admin_cms_overview'];
  const update = (s: SectionInfo, patch: { p_enabled?: boolean; p_visible_desktop?: boolean; p_visible_mobile?: boolean }) =>
    run('admin_cms_update_section', { p_page: page.key, p_section: s.key, ...patch }, { refresh });
  const move = (s: SectionInfo, by: number) => {
    const order = sorted.filter((x) => x.reorderable).map((x) => x.key);
    const i = order.indexOf(s.key);
    const j = i + by;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    void run('admin_cms_reorder_sections', { p_page: page.key, p_section_keys: order }, { success: 'Order saved', refresh });
  };
  const reorderable = sorted.filter((x) => x.reorderable);
  return (
    <div className="space-y-4">
      <Card title={<span className="flex items-center gap-2">{page.label}{page.kind === 'static' && (page.isPublished ? <Badge tone="green">Published</Badge> : <Badge>Hidden</Badge>)}</span>}
        description={page.help ?? undefined}
        actions={page.route && <a href={page.route} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-[#E2E8F0] text-xs font-semibold hover:bg-slate-50">View on the website <ExternalLink className="w-3.5 h-3.5" /></a>}>
        {page.kind === 'static' && (
          <Toggle checked={page.isPublished} disabled={busy} onChange={(v) => void run('admin_cms_update_page', { p_page: page.key, p_is_published: v }, { success: v ? 'Page published' : 'Page hidden', refresh: ['admin_cms_overview', 'admin_catalogue_lookups'] })}
            label="Published" description="Hidden pages are not linked anywhere and show “page not found”. Publish once the wording is final (legal pages: checked by your solicitor)." />
        )}
        <p className="text-xs text-slate-500 mt-2">Last changed {dateTime(page.updatedAt)}.</p>
      </Card>

      <Card title="Sections" description="Top to bottom, as on the page." padded={false}>
        <ul className="divide-y divide-slate-100">
          {sorted.map((s) => {
            const ri = reorderable.findIndex((x) => x.key === s.key);
            return (
              <li key={s.key} className={cx('px-4 py-3 flex flex-col md:flex-row md:items-center gap-3', !s.enabled && 'bg-slate-50')}>
                <div className="flex-1 min-w-0">
                  <div className={cx('font-semibold text-sm', !s.enabled && 'text-slate-400')}>{s.label}{!s.enabled && <span className="font-normal"> · switched off</span>}</div>
                  {s.help && <div className="text-xs text-slate-500">{s.help}</div>}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Toggle checked={s.enabled} disabled={busy} onChange={(v) => void update(s, { p_enabled: v })} label={<span className="text-xs">Show</span>} />
                  <button type="button" disabled={!s.enabled || busy} onClick={() => void update(s, { p_visible_desktop: !s.desktop })} title={s.desktop ? 'Shown on computers' : 'Hidden on computers'}
                    className={cx('h-8 px-2 rounded-md border inline-flex items-center gap-1 text-xs cursor-pointer disabled:opacity-40', s.desktop ? 'border-[#18181B] bg-[#18181B] text-white' : 'border-[#E2E8F0] text-slate-400 line-through')}><Monitor className="w-3.5 h-3.5" />Computer</button>
                  <button type="button" disabled={!s.enabled || busy} onClick={() => void update(s, { p_visible_mobile: !s.mobile })} title={s.mobile ? 'Shown on phones' : 'Hidden on phones'}
                    className={cx('h-8 px-2 rounded-md border inline-flex items-center gap-1 text-xs cursor-pointer disabled:opacity-40', s.mobile ? 'border-[#18181B] bg-[#18181B] text-white' : 'border-[#E2E8F0] text-slate-400 line-through')}><Smartphone className="w-3.5 h-3.5" />Phone</button>
                  {s.reorderable && <>
                    <Button size="sm" variant="ghost" aria-label="Move up" disabled={ri <= 0 || busy} onClick={() => move(s, -1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" aria-label="Move down" disabled={ri === reorderable.length - 1 || busy} onClick={() => move(s, 1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
                  </>}
                  <Button size="sm" variant="primary" icon={<Pencil className="w-3.5 h-3.5" />} onClick={() => onEdit(s.key)}>Edit</Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {page.kind !== 'global' && <SeoCard page={page} />}
    </div>
  );
};

const SeoCard: React.FC<{ page: PageInfo }> = ({ page }) => {
  const { run, busy } = useAction();
  const [title, setTitle] = useState(page.seoTitle ?? '');
  const [desc, setDesc] = useState(page.seoDescription ?? '');
  const [image, setImage] = useState(page.seoImage);
  useEffect(() => { setTitle(page.seoTitle ?? ''); setDesc(page.seoDescription ?? ''); setImage(page.seoImage); }, [page.seoTitle, page.seoDescription, page.seoImage]);
  const dirty = title !== (page.seoTitle ?? '') || desc !== (page.seoDescription ?? '') || JSON.stringify(image) !== JSON.stringify(page.seoImage);
  return (
    <Card title="Google & sharing" description="How this page appears in Google results and when someone shares the link on WhatsApp or Facebook.">
      <div className="space-y-4">
        <div className="rounded-lg border border-[#E2E8F0] p-3 bg-white">
          <div className="text-[#1a0dab] text-base truncate">{title || page.label} | Varam Foods</div>
          <div className="text-xs text-emerald-700">varamfoods.co.uk{page.route ?? ''}</div>
          <div className="text-sm text-slate-600 line-clamp-2">{desc || 'Add a description so Google shows something helpful here.'}</div>
        </div>
        <Field label="Title in Google" help={`${title.length}/60 · Keep it short and clear.`}><TextInput value={title} onChange={setTitle} maxLength={70} /></Field>
        <Field label="Description in Google" help={`${desc.length}/160`}><TextArea rows={2} value={desc} onChange={setDesc} maxLength={200} /></Field>
        <Field label="Picture when shared" optional>
          {image ? <ImageSlot value={image} onChange={setImage} /> : <Button size="sm" onClick={() => setImage({ desktop: null, mobile: null, alt: '' })}>Add a sharing picture</Button>}
        </Field>
        <div className="flex justify-end">
          <Button variant="primary" loading={busy} disabled={!dirty || (!!image && !image.desktop && !image.mobile)}
            onClick={() => void run('admin_cms_update_page', { p_page: page.key, p_seo_title: title, p_seo_description: desc, p_seo_image: image ?? undefined }, { success: 'Saved', refresh: ['admin_cms_overview'] })}>Save</Button>
        </div>
      </div>
    </Card>
  );
};

const SectionEditor: React.FC<{ page: PageInfo; sectionKey: string; focus?: string; onClose: () => void }> = ({ page, sectionKey, focus, onClose }) => {
  const section = page.sections.find((s) => s.key === sectionKey);
  const { data, isLoading, error, refetch } = useAdminQuery<Entry[]>('admin_cms_get_section', { p_page: page.key, p_section: sectionKey });
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const changed = Object.keys(edits);
  const issues = (data ?? []).filter((e) => e.key in edits).flatMap((e) => problems(entrySchema(e), edits[e.key], e.label));

  useEffect(() => {
    if (!focus || !data) return;
    window.setTimeout(() => document.getElementById(`cms-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
  }, [focus, data]);

  const close = () => {
    if (changed.length && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    onClose();
  };
  const save = async () => {
    setSaving(true);
    let saved = 0;
    try {
      for (const key of changed) {
        const e = data!.find((x) => x.key === key)!;
        try {
          await rpc('admin_cms_update_entry', { p_key: key, p_value: edits[key] });
          saved++;
          setEdits(({ [key]: _done, ...rest }) => rest);
        } catch (err) {
          toast.error(`“${e.label}” was not saved: ${errorText(err)}`);
          break;
        }
      }
      if (saved) {
        toast.success(saved === changed.length ? 'Saved — live on the website within a minute' : `${saved} of ${changed.length} saved`);
        await Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'admin_cms_get_section'] }), qc.invalidateQueries({ queryKey: ['admin', 'admin_cms_overview'] }), qc.invalidateQueries({ queryKey: ['cms'] })]);
      }
    } finally { setSaving(false); }
  };

  return (
    <Drawer open onClose={close} wide title={`${page.label} → ${section?.label ?? sectionKey}`} subtitle={section?.help ?? undefined}
      footer={<>
        {page.route && <a href={page.route} target="_blank" rel="noreferrer" className="mr-auto inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-[#18181B]">View on the website <ExternalLink className="w-3.5 h-3.5" /></a>}
        {changed.length > 0 && <Button variant="ghost" onClick={() => setEdits({})}>Undo changes</Button>}
        <Button variant="primary" loading={saving} disabled={!changed.length || issues.length > 0} onClick={() => void save()}>{changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Saved'}</Button>
      </>}>
      {isLoading ? <Loading /> : error || !data ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : (
        <>
          {section && !section.enabled && <Notice tone="warning">This section is switched off, so visitors do not see it. Switch it on in the list of sections.</Notice>}
          {issues.length > 0 && <Notice tone="danger"><b>Fix before saving:</b><ul className="list-disc pl-5 mt-1">{issues.slice(0, 8).map((i) => <li key={i}>{i}</li>)}</ul></Notice>}
          {data.map((e) => {
            const value = e.key in edits ? edits[e.key] : e.value;
            return (
              <div key={e.key} id={`cms-${e.key}`} className={cx('bg-white rounded-xl border p-4 scroll-mt-4', e.key in edits ? 'border-[#F5D103] ring-1 ring-[#F5D103]' : focus === e.key ? 'border-[#18181B]' : 'border-[#E2E8F0]')}>
                <FieldEditor schema={entrySchema(e)} value={value} label={e.label} help={e.help} onChange={(v) => setEdits((cur) => ({ ...cur, [e.key]: v }))} />
                <div className="text-[11px] text-slate-400 mt-2">{e.key in edits ? 'Changed — not saved yet' : `Last changed ${dateTime(e.updatedAt)}${e.updatedBy ? ` by ${e.updatedBy}` : ''}`}</div>
              </div>
            );
          })}
        </>
      )}
    </Drawer>
  );
};
