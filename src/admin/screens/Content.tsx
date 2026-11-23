import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, BookOpen, CreditCard, ExternalLink, Eye, EyeOff, FileText, Globe, Heart, Home, Lock, Rows3, Monitor, Package, Pencil, RefreshCw,
  Search, ShoppingBasket, Smartphone, Store, User,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { ScreenProps } from '../AdminApp';
import { rpc } from '../../lib/api';
import { useAction, useAdminQuery, errorText, dateTime, ago } from '../lib';
import { Badge, Button, Card, Drawer, Empty, ErrorState, Field, Loading, Notice, Screen, SearchInput, Segmented, Select, TextArea, TextInput, Toggle, cx } from '../ui';
import { toast } from '../toast';
import { FIELD_TYPES, FieldEditor, ImageSlot, kindOf, problems, type Schema } from '../cms/fields';

interface SectionInfo { key: string; label: string; help: string | null; enabled: boolean; desktop: boolean; mobile: boolean; position: number; entryCount: number; reorderable: boolean }
interface PageInfo {
  key: string; label: string; help: string | null; kind: 'global' | 'system' | 'static'; route: string | null; isPublished: boolean; updatedAt: string;
  seoTitle: string | null; seoDescription: string | null; seoImage: { desktop: string | null; mobile: string | null; alt: string } | null; sections: SectionInfo[];
}
interface OutlineSection {
  key: string; label: string; help: string | null; position: number; reorderable: boolean; enabled: boolean; desktop: boolean; mobile: boolean;
  fieldCount: number; preview: { text: string | null; image: string | null }; updatedAt: string;
}
interface Entry { key: string; label: string; help: string | null; kind: string; value: unknown; maxLength: number | null; itemSchema: Schema | null; updatedAt: string; updatedBy: string | null }
interface Hit { key: string; kind: string; page: string; section: string; label: string; value: unknown }

const GROUPS: Array<{ kind: PageInfo['kind']; title: string; hint: string }> = [
  { kind: 'global', title: 'Every page', hint: 'Header, menus, footer and small messages' },
  { kind: 'system', title: 'Shop pages', hint: 'The pages shoppers use' },
  { kind: 'static', title: 'Information pages', hint: 'Delivery, FAQs, legal pages' },
];
const PAGE_ICON: Record<string, React.ElementType> = {
  global: Globe, home: Home, shop: Store, basket: ShoppingBasket, product: Package, wishlist: Heart, checkout: CreditCard, account: User, story: BookOpen,
};

// ── who sees a section ──────────────────────────────────────────────────────────────────────────
type Audience = 'all' | 'desktop' | 'mobile' | 'hidden';
const AUDIENCE: Array<{ value: Audience; label: string; short: string }> = [
  { value: 'all', label: 'Everyone', short: 'Everyone' },
  { value: 'desktop', label: 'Computers only', short: 'Computers only' },
  { value: 'mobile', label: 'Phones only', short: 'Phones only' },
  { value: 'hidden', label: 'Nobody (hidden)', short: 'Hidden' },
];
const audienceOf = (s: { enabled: boolean; desktop: boolean; mobile: boolean }): Audience =>
  !s.enabled || (!s.desktop && !s.mobile) ? 'hidden' : s.desktop && s.mobile ? 'all' : s.desktop ? 'desktop' : 'mobile';
const audienceParams = (a: Audience) => a === 'hidden' ? { p_enabled: false }
  : { p_enabled: true, p_visible_desktop: a !== 'mobile', p_visible_mobile: a !== 'desktop' };

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
  // /admin/content/<page> opens a page; /admin/content/<page>/<section> also opens that section's editor
  const [paramPage, paramSection] = (param ?? '').split('/');
  const [pageKey, setPageKey] = useState<string | null>(paramPage || null);
  const [editing, setEditing] = useState<{ page: string; section: string; focus?: string } | null>(paramPage && paramSection ? { page: paramPage, section: paramSection } : null);
  const [q, setQ] = useState('');
  const page = data?.find((p) => p.key === pageKey) ?? data?.find((p) => p.key === 'home') ?? data?.[0];
  const searching = q.trim().length >= 2;

  return (
    <Screen
      title="Website content"
      intro="Change the words, pictures and buttons on the website. Saved changes appear on the live site straight away."
      guide={<ol>
        <li>Pick a <b>page</b> on the left, or type in <b>Find text</b> to search for words you can see on the site.</li>
        <li>The page is shown as its <b>sections, top to bottom</b>. Each one shows a picture and its headline so you can spot it.</li>
        <li>Choose <b>who sees</b> a section: everyone, only computers, only phones, or nobody.</li>
        <li>Press <b>Edit</b>, change things, then <b>Save</b>. The preview on the right shows the page as shoppers see it.</li>
      </ol>}
    >
      {isLoading ? <Loading /> : error || !data ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : (
        <div className="grid lg:grid-cols-[272px_minmax(0,1fr)] gap-6 items-start">
          <aside className="space-y-3 lg:sticky lg:top-20">
            <SearchInput value={q} onChange={setQ} placeholder="Find text on the website…" />
            <div className="lg:hidden">
              <Select aria-label="Page" value={page?.key ?? ''} onChange={(v) => { setPageKey(v); setQ(''); }}
                options={data.map((p) => ({ value: p.key, label: `${GROUPS.find((g) => g.kind === p.kind)?.title} › ${p.label}` }))} />
            </div>
            <nav aria-label="Pages" className="hidden lg:block bg-white rounded-xl border border-[#E4E7EC] p-2">
              {GROUPS.map((g) => (
                <div key={g.kind} className="mb-2 last:mb-0">
                  <div className="px-2.5 pt-2 pb-1">
                    <div className="text-[13px] font-semibold">{g.title}</div>
                    <div className="text-[12px] text-[#7A8594]">{g.hint}</div>
                  </div>
                  {data.filter((p) => p.kind === g.kind).map((p) => {
                    const Icon = PAGE_ICON[p.key] ?? FileText;
                    const active = p.key === page?.key && !searching;
                    return (
                      <button key={p.key} type="button" onClick={() => { setPageKey(p.key); setQ(''); }} aria-current={active ? 'page' : undefined}
                        className={cx('w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[14px] text-left cursor-pointer', active ? 'bg-[#18181B] text-white' : 'text-[#3F4652] hover:bg-[#F1F3F5]')}>
                        <Icon className={cx('w-4 h-4 shrink-0', active ? 'text-[#F5D103]' : 'text-[#7A8594]')} strokeWidth={1.75} />
                        <span className="truncate flex-1">{p.label}</span>
                        {p.kind === 'static' && !p.isPublished && <span className={cx('text-[11px]', active ? 'text-[#9AA3AF]' : 'text-[#9AA3AF]')}>hidden</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </aside>
          <div className="min-w-0">
            {searching ? <SearchResults q={q} pages={data} onOpen={(pg, section, focus) => setEditing({ page: pg, section, focus })} />
              : page && <PageOutline key={page.key} page={page} onEdit={(section) => setEditing({ page: page.key, section })} />}
          </div>
        </div>
      )}
      {editing && data && data.some((p) => p.key === editing.page) && <SectionEditor page={data.find((p) => p.key === editing.page)!} sectionKey={editing.section} focus={editing.focus} onClose={() => setEditing(null)} />}
    </Screen>
  );
}

// ── search ──────────────────────────────────────────────────────────────────────────────────────
const SearchResults: React.FC<{ q: string; pages: PageInfo[]; onOpen: (page: string, section: string, focus: string) => void }> = ({ q, pages, onOpen }) => {
  const { data, isLoading } = useAdminQuery<Hit[]>('admin_cms_search', { p_q: q, p_limit: 40 });
  if (isLoading) return <Loading text="Searching…" />;
  if (!data?.length) return <Card><Empty icon={<Search className="w-5 h-5" />} title={`“${q}” is not in the website content`} text="Try fewer words. Product names, prices and descriptions are changed under Products." /></Card>;
  return (
    <Card title={`“${q}” appears in ${data.length} place${data.length === 1 ? '' : 's'}`} description="Press one to edit it." padded={false}>
      <ul>
        {data.map((h) => {
          const p = pages.find((x) => x.key === h.page);
          const s = p?.sections.find((x) => x.key === h.section);
          const text = typeof h.value === 'string' ? h.value : JSON.stringify(h.value);
          return (
            <li key={h.key} className="border-b border-[#F0F2F5] last:border-0">
              <button type="button" onClick={() => onOpen(h.page, h.section, h.key)} className="w-full text-left px-5 py-3.5 hover:bg-[#FFFCEB] cursor-pointer">
                <div className="text-[12.5px] text-[#5F6B7A]">{p?.label} › {s?.label ?? h.section} › <span className="text-[#18181B] font-medium">{h.label}</span></div>
                <div className="text-[14px] mt-1 line-clamp-2">{text}</div>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

// ── one page: its sections top to bottom ────────────────────────────────────────────────────────
const PageOutline: React.FC<{ page: PageInfo; onEdit: (section: string) => void }> = ({ page, onEdit }) => {
  const outline = useAdminQuery<OutlineSection[]>('admin_cms_page_outline', { p_page: page.key });
  const { run, busy } = useAction();
  const refresh = ['admin_cms_overview', 'admin_cms_page_outline'];
  const sections = useMemo(() => [...(outline.data ?? [])].sort((a, b) => a.position - b.position), [outline.data]);
  const movable = sections.filter((s) => s.reorderable);
  const Icon = PAGE_ICON[page.key] ?? FileText;
  const route = page.route && !page.route.includes('…') ? page.route : page.kind === 'global' ? '/' : null;
  const setAudience = (s: OutlineSection, a: Audience) => run('admin_cms_update_section', { p_page: page.key, p_section: s.key, ...audienceParams(a) },
    { success: `${s.label}: ${AUDIENCE.find((x) => x.value === a)!.label.toLowerCase()}`, refresh });
  const move = (s: OutlineSection, by: number) => {
    const order = movable.map((x) => x.key);
    const i = order.indexOf(s.key);
    const j = i + by;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    void run('admin_cms_reorder_sections', { p_page: page.key, p_section_keys: order }, { success: by < 0 ? 'Moved up' : 'Moved down', refresh });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-violet-100 text-violet-800 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" strokeWidth={1.75} /></div>
          <div className="min-w-0">
            <h2 className="text-[20px] font-semibold leading-tight">{page.label}</h2>
            {page.help && <p className="text-[13.5px] text-[#5F6B7A]">{page.help}</p>}
          </div>
        </div>
        {route && <a href={route} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#D9DDE3] bg-white text-[13.5px] font-medium hover:bg-[#F6F7F9] shrink-0">Open this page <ExternalLink className="w-3.5 h-3.5" /></a>}
      </div>

      {page.kind === 'static' && (
        <Card>
          <Toggle checked={page.isPublished} disabled={busy} onChange={(v) => void run('admin_cms_update_page', { p_page: page.key, p_is_published: v }, { success: v ? 'Page published' : 'Page hidden', refresh: ['admin_cms_overview', 'admin_catalogue_lookups'] })}
            label={page.isPublished ? 'Published — anyone can open this page' : 'Hidden — nobody can open this page yet'}
            description="Publish once the wording is final. Legal pages (terms, privacy, cookies, returns) should be checked by your solicitor first." />
        </Card>
      )}

      <section aria-label="Sections">
        <div className="flex items-baseline justify-between mb-2.5">
          <h3 className="text-[15px] font-semibold">Sections, top to bottom</h3>
          <span className="text-[12.5px] text-[#7A8594]">{sections.filter((s) => audienceOf(s) !== 'hidden').length} of {sections.length} showing</span>
        </div>
        {outline.isLoading ? <Loading /> : outline.error ? <ErrorState error={outline.error} text={errorText(outline.error)} onRetry={() => void outline.refetch()} /> : (
          <ol className="space-y-2.5">
            {sections.map((s, idx) => {
              const aud = audienceOf(s);
              const mi = movable.findIndex((x) => x.key === s.key);
              return (
                <li key={s.key} className={cx('bg-white rounded-xl border transition-colors', aud === 'hidden' ? 'border-dashed border-[#C3C9D2] bg-[#FAFBFC]' : 'border-[#E4E7EC] hover:border-[#9AA3AF]')}>
                  <div className="flex flex-col md:flex-row md:items-center gap-3 p-3 sm:p-4">
                    <button type="button" onClick={() => onEdit(s.key)} className="flex items-center gap-3.5 min-w-0 flex-1 text-left cursor-pointer group">
                      <span className="w-6 text-[13px] text-[#9AA3AF] tabular-nums text-right shrink-0">{idx + 1}</span>
                      <span className={cx('w-24 h-16 rounded-lg overflow-hidden shrink-0 flex items-center justify-center border border-[#EEF0F3]', aud === 'hidden' ? 'opacity-50' : '', s.preview.image ? 'bg-[#F1F3F5]' : 'bg-[#F6F7F9]')}>
                        {s.preview.image ? <img src={s.preview.image} alt="" loading="lazy" className="w-full h-full object-cover" /> : <Rows3 aria-label="No picture in this section" className="w-5 h-5 text-[#C3C9D2]" strokeWidth={1.5} />}
                      </span>
                      <span className="min-w-0">
                        <span className={cx('block text-[15px] font-semibold group-hover:underline underline-offset-2', aud === 'hidden' && 'text-[#7A8594]')}>{s.label}</span>
                        {s.preview.text && <span className="block text-[13.5px] text-[#3F4652] truncate">“{s.preview.text}”</span>}
                        {s.help && <span className="block text-[12.5px] text-[#7A8594] truncate">{s.help}</span>}
                      </span>
                    </button>
                    <div className="flex flex-wrap items-center gap-2 md:justify-end pl-9 md:pl-0">
                      <label className="sr-only" htmlFor={`aud-${s.key}`}>Who sees {s.label}</label>
                      <div className="relative">
                        {aud === 'hidden' ? <EyeOff className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7A8594] pointer-events-none" />
                          : aud === 'all' ? <Eye className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-600 pointer-events-none" />
                          : aud === 'desktop' ? <Monitor className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-sky-700 pointer-events-none" />
                          : <Smartphone className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-sky-700 pointer-events-none" />}
                        <select id={`aud-${s.key}`} value={aud} disabled={busy} onChange={(e) => void setAudience(s, e.target.value as Audience)}
                          className="h-9 pl-8 pr-7 rounded-lg border border-[#D9DDE3] bg-white text-[13.5px] cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-[#F5D103]/70">
                          {AUDIENCE.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                        </select>
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7A8594] pointer-events-none text-[11px]">▾</span>
                      </div>
                      {s.reorderable ? (
                        <span className="inline-flex rounded-lg border border-[#D9DDE3] overflow-hidden">
                          <button type="button" title="Move up" aria-label={`Move ${s.label} up`} disabled={mi <= 0 || busy} onClick={() => move(s, -1)} className="h-9 w-9 flex items-center justify-center hover:bg-[#F6F7F9] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"><ArrowUp className="w-4 h-4" /></button>
                          <button type="button" title="Move down" aria-label={`Move ${s.label} down`} disabled={mi === movable.length - 1 || busy} onClick={() => move(s, 1)} className="h-9 w-9 flex items-center justify-center border-l border-[#D9DDE3] hover:bg-[#F6F7F9] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"><ArrowDown className="w-4 h-4" /></button>
                        </span>
                      ) : <span title="This section always stays in the same place" className="inline-flex items-center gap-1 h-9 px-2 text-[12.5px] text-[#7A8594]"><Lock className="w-3.5 h-3.5" />Fixed place</span>}
                      <Button variant="dark" icon={<Pencil className="w-3.5 h-3.5" />} onClick={() => onEdit(s.key)}>Edit</Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

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
    <Card title="How this page looks on Google" description="And when someone shares the link on WhatsApp or Facebook.">
      <div className="grid xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Field label="Title in Google" help={`${title.length} of about 60 characters`}><TextInput value={title} onChange={setTitle} maxLength={70} placeholder={page.label} /></Field>
          <Field label="Description in Google" help={`${desc.length} of about 160 characters`}><TextArea rows={3} value={desc} onChange={setDesc} maxLength={200} /></Field>
          <Field label="Picture when the link is shared" optional>
            {image ? <ImageSlot value={image} onChange={setImage} /> : <Button size="sm" onClick={() => setImage({ desktop: null, mobile: null, alt: '' })}>Add a picture</Button>}
          </Field>
          <Button variant="primary" loading={busy} disabled={!dirty || (!!image && !image.desktop && !image.mobile)}
            onClick={() => void run('admin_cms_update_page', { p_page: page.key, p_seo_title: title, p_seo_description: desc, p_seo_image: image ?? undefined }, { success: 'Saved', refresh: ['admin_cms_overview'] })}>Save</Button>
        </div>
        <div>
          <div className="text-[12.5px] text-[#5F6B7A] mb-2">Preview</div>
          <div className="rounded-xl border border-[#E4E7EC] p-4 bg-white">
            <div className="text-[12.5px] text-[#3F4652]">varamfoods.co.uk{page.route ?? ''}</div>
            <div className="text-[18px] leading-snug text-[#1A0DAB] mt-0.5">{title || page.label} | Varam Foods</div>
            <div className="text-[13.5px] text-[#4D5156] mt-1 line-clamp-2">{desc || 'Add a description so Google shows something helpful here.'}</div>
          </div>
        </div>
      </div>
    </Card>
  );
};

// ── live preview of the real page ───────────────────────────────────────────────────────────────
const PreviewFrame: React.FC<{ src: string; device: 'desktop' | 'mobile'; version: number }> = ({ src, device, version }) => {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const vw = device === 'mobile' ? 390 : 1366;
  const vh = device === 'mobile' ? 780 : 900;
  const scale = Math.min(1, width / vw);
  return (
    <div ref={box} className="w-full">
      <div className="mx-auto rounded-xl overflow-hidden border border-[#D9DDE3] bg-white shadow-sm" style={{ width: vw * scale, height: vh * scale }}>
        <iframe key={`${src}-${version}-${device}`} src={src} title="Preview of the page" style={{ width: vw, height: vh, transform: `scale(${scale})`, transformOrigin: 'top left', border: 0 }} />
      </div>
    </div>
  );
};

// ── editing one section ─────────────────────────────────────────────────────────────────────────
const SectionEditor: React.FC<{ page: PageInfo; sectionKey: string; focus?: string; onClose: () => void }> = ({ page, sectionKey, focus, onClose }) => {
  const section = page.sections.find((s) => s.key === sectionKey);
  const { data, isLoading, error, refetch } = useAdminQuery<Entry[]>('admin_cms_get_section', { p_page: page.key, p_section: sectionKey });
  const sample = useAdminQuery<{ items: Array<{ slug: string }> }>('admin_list_products', { p_status: 'active', p_limit: 1 }, { enabled: page.key === 'product' });
  const qc = useQueryClient();
  const { run, busy } = useAction();
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [panel, setPanel] = useState<'edit' | 'preview'>('edit');
  const [version, setVersion] = useState(0);
  const [aud, setAud] = useState<Audience>(section ? audienceOf(section) : 'all');
  const changed = Object.keys(edits);
  const issues = (data ?? []).filter((e) => e.key in edits).flatMap((e) => problems(entrySchema(e), edits[e.key], e.label));
  const previewSrc = page.key === 'product' ? (sample.data?.items[0] ? `/product/${sample.data.items[0].slug}` : '/shop')
    : page.route && !page.route.includes('…') ? page.route : '/';
  const usedKinds = [...new Set((data ?? []).map((e) => kindOf(entrySchema(e))))];

  useEffect(() => {
    if (!focus || !data) return;
    window.setTimeout(() => document.getElementById(`cms-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
  }, [focus, data]);

  const close = () => {
    if (changed.length && !window.confirm('You have changes that are not saved. Leave without saving?')) return;
    onClose();
  };
  const changeAudience = async (a: Audience) => {
    const prev = aud;
    setAud(a);
    const ok = await run('admin_cms_update_section', { p_page: page.key, p_section: sectionKey, ...audienceParams(a) },
      { success: a === 'hidden' ? 'Section hidden' : `Shown to: ${AUDIENCE.find((x) => x.value === a)!.label.toLowerCase()}`, refresh: ['admin_cms_overview', 'admin_cms_page_outline'] });
    if (ok === undefined) setAud(prev); else setVersion((v) => v + 1);
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
        toast.success(saved === changed.length ? 'Saved. It is live on the website now.' : `${saved} of ${changed.length} changes saved`);
        await Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'admin_cms_get_section'] }), qc.invalidateQueries({ queryKey: ['admin', 'admin_cms_page_outline'] }), qc.invalidateQueries({ queryKey: ['admin', 'admin_cms_overview'] })]);
        setVersion((v) => v + 1);
      }
    } finally { setSaving(false); }
  };

  return (
    <Drawer open onClose={close} full title={<span className="flex flex-wrap items-center gap-2"><span className="text-[#7A8594] font-normal">{page.label} ›</span> {section?.label ?? sectionKey}</span>}
      subtitle={section?.help ?? undefined}
      footer={<>
        <span className="mr-auto text-[13px] text-[#5F6B7A]">{changed.length ? `${changed.length} change${changed.length === 1 ? '' : 's'} not saved yet` : 'Everything is saved'}</span>
        {changed.length > 0 && <Button variant="ghost" onClick={() => setEdits({})}>Undo my changes</Button>}
        <Button variant="primary" loading={saving} disabled={!changed.length || issues.length > 0} onClick={() => void save()}>Save changes</Button>
      </>}>
      <div className="xl:hidden"><Segmented value={panel} onChange={(v) => setPanel(v as 'edit' | 'preview')} options={[{ value: 'edit', label: 'Edit' }, { value: 'preview', label: 'Preview' }]} /></div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)] gap-6 items-start">
        <div className={cx('space-y-4 min-w-0', panel === 'preview' && 'hidden xl:block')}>
          <Card>
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
              <div>
                <div className="text-[14px] font-semibold">Who sees this section?</div>
                <div className="text-[12.5px] text-[#5F6B7A]">Changes straight away, no need to save.</div>
              </div>
              <Segmented value={aud} onChange={(v) => void changeAudience(v as Audience)} disabled={busy}
                options={[
                  { value: 'all', label: 'Everyone', icon: <Eye className="w-4 h-4" /> },
                  { value: 'desktop', label: 'Computers only', icon: <Monitor className="w-4 h-4" /> },
                  { value: 'mobile', label: 'Phones only', icon: <Smartphone className="w-4 h-4" /> },
                  { value: 'hidden', label: 'Nobody', icon: <EyeOff className="w-4 h-4" /> },
                ]} />
            </div>
          </Card>
          {aud === 'hidden' && <Notice tone="warning">This section is hidden, so shoppers do not see it. You can still edit it.</Notice>}
          {issues.length > 0 && <Notice tone="danger"><b>Fix these before saving:</b><ul className="list-disc pl-5 mt-1">{issues.slice(0, 8).map((i) => <li key={i}>{i}</li>)}</ul></Notice>}
          {isLoading ? <Loading /> : error || !data ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-[#5F6B7A]">
                <span>In this section:</span>
                {usedKinds.map((k) => {
                  const t = FIELD_TYPES[k] ?? FIELD_TYPES.string;
                  const I = t.icon;
                  return <span key={k} className={cx('inline-flex items-center gap-1 h-6 px-1.5 rounded-md font-medium', t.tone)}><I className="w-3.5 h-3.5" />{t.name}</span>;
                })}
              </div>
              {data.map((e) => {
                const value = e.key in edits ? edits[e.key] : e.value;
                const isChanged = e.key in edits;
                return (
                  <div key={e.key} id={`cms-${e.key}`} className={cx('bg-white rounded-xl border p-4 sm:p-5 scroll-mt-4', isChanged ? 'border-[#E5B800] ring-2 ring-[#F5D103]/40' : focus === e.key ? 'border-[#18181B]' : 'border-[#E4E7EC]')}>
                    <FieldEditor schema={entrySchema(e)} value={value} label={e.label} help={e.help} onChange={(v) => setEdits((cur) => ({ ...cur, [e.key]: v }))} />
                    <div className="flex items-center gap-2 text-[12px] mt-3 text-[#7A8594]">
                      {isChanged ? <><Badge tone="yellow">Not saved yet</Badge><button type="button" className="underline cursor-pointer" onClick={() => setEdits(({ [e.key]: _x, ...rest }) => rest)}>undo</button></>
                        : <>Last changed {ago(e.updatedAt)}{e.updatedBy ? ` by ${e.updatedBy}` : ''}</>}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
        <aside className={cx('xl:sticky xl:top-0 space-y-3', panel === 'edit' && 'hidden xl:block')}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented size="sm" value={device} onChange={(v) => setDevice(v as 'desktop' | 'mobile')} options={[{ value: 'desktop', label: 'Computer', icon: <Monitor className="w-3.5 h-3.5" /> }, { value: 'mobile', label: 'Phone', icon: <Smartphone className="w-3.5 h-3.5" /> }]} />
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => setVersion((v) => v + 1)}>Refresh</Button>
              <a href={previewSrc} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[13px] font-semibold text-[#3F4652] hover:bg-[#EEF0F3]">Open <ExternalLink className="w-3.5 h-3.5" /></a>
            </div>
          </div>
          <PreviewFrame src={previewSrc} device={device} version={version} />
          <p className="text-[12.5px] text-[#5F6B7A]">The preview shows the <b>saved</b> page{changed.length ? ' — save to see your changes here' : ''}. Scroll inside it to find this section.{page.kind === 'static' && !page.isPublished ? ' This page is hidden, so the preview may say it cannot be found until you publish it.' : ''}</p>
          <p className="text-[12px] text-[#9AA3AF]">Last saved {dateTime(section ? data?.reduce((m, e) => (e.updatedAt > m ? e.updatedAt : m), '') || page.updatedAt : page.updatedAt)}</p>
        </aside>
      </div>
    </Drawer>
  );
};
