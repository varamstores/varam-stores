import React, { useRef, useState } from 'react';
import { AlignLeft, ArrowDown, ArrowUp, Bold, ChevronDown, Copy, Hash, Heading2, Heading3, Image as ImageIcon, ImagePlus, Italic, LayoutGrid, Link2, List, ListChecks, ListOrdered, MousePointerClick, Palette, Plus, Shapes, ToggleRight, Trash2, Type, Video } from 'lucide-react';
import { CmsIcon } from '../../cms/icons';
import { RichText } from '../../cms/components';
import { mediaUrl } from '../lib';
import { useLookups } from '../lookups';
import { MediaPicker } from '../pickers';
import { Button, Field, Modal, NumberInput, Select, TextArea, TextInput, Toggle, cx } from '../ui';
import { DestinationPicker, LinkPicker } from './LinkPicker';

// Turns the CMS content description (a small JSON schema per field) into plain forms, so staff
// edit words, pictures, buttons and lists without seeing any code.

export interface Schema {
  type?: string | string[]; 'x-kind'?: string; title?: string; description?: string; maxLength?: number; minLength?: number; enum?: string[];
  properties?: Record<string, Schema>; required?: string[]; items?: Schema; minItems?: number; maxItems?: number;
}
type Img = { desktop: string | null; mobile: string | null; alt: string };
type Lnk = { label: string; href: string };

export const kindOf = (s: Schema): string => {
  if (s['x-kind']) return s['x-kind'];
  if (s.enum) return 'enum';
  const t = Array.isArray(s.type) ? s.type.find((x) => x !== 'null') : s.type;
  if (t === 'array') return s.items?.type === 'string' || s.items?.['x-kind'] === undefined && !s.items?.properties ? 'textlist' : 'list';
  return t ?? 'string';
};

/** What each kind of field is called and how it looks, so words, pictures, buttons and lists are easy to tell apart. */
export const FIELD_TYPES: Record<string, { name: string; icon: React.ElementType; tone: string }> = {
  string: { name: 'Words', icon: Type, tone: 'bg-slate-100 text-slate-700' },
  richtext: { name: 'Paragraphs', icon: AlignLeft, tone: 'bg-slate-100 text-slate-700' },
  image: { name: 'Picture', icon: ImageIcon, tone: 'bg-sky-100 text-sky-800' },
  link: { name: 'Button', icon: MousePointerClick, tone: 'bg-amber-100 text-amber-800' },
  href: { name: 'Link', icon: Link2, tone: 'bg-amber-100 text-amber-800' },
  list: { name: 'List', icon: List, tone: 'bg-violet-100 text-violet-800' },
  textlist: { name: 'List of lines', icon: List, tone: 'bg-violet-100 text-violet-800' },
  icon: { name: 'Icon', icon: Shapes, tone: 'bg-emerald-100 text-emerald-800' },
  color: { name: 'Colour', icon: Palette, tone: 'bg-pink-100 text-pink-800' },
  number: { name: 'Number', icon: Hash, tone: 'bg-slate-100 text-slate-700' },
  boolean: { name: 'On / off', icon: ToggleRight, tone: 'bg-slate-100 text-slate-700' },
  enum: { name: 'Choice', icon: ListChecks, tone: 'bg-slate-100 text-slate-700' },
  collection: { name: 'Product shelf', icon: LayoutGrid, tone: 'bg-emerald-100 text-emerald-800' },
  video: { name: 'Video', icon: Video, tone: 'bg-sky-100 text-sky-800' },
};
export const typeOf = (s: Schema) => FIELD_TYPES[kindOf(s)] ?? FIELD_TYPES.string;

/** Small coloured marker shown before every field's name. */
export const TypeMark: React.FC<{ schema: Schema; withName?: boolean }> = ({ schema, withName }) => {
  const t = typeOf(schema);
  const Icon = t.icon;
  return (
    <span title={t.name} className={cx('inline-flex items-center gap-1 rounded-md align-middle shrink-0', withName ? 'h-6 px-1.5 text-[12px] font-medium' : 'w-6 h-6 justify-center', t.tone)}>
      <Icon className="w-3.5 h-3.5" strokeWidth={2} />{withName && t.name}
    </span>
  );
};
const Labelled: React.FC<{ schema: Schema; label: React.ReactNode }> = ({ schema, label }) => (
  <span className="inline-flex items-center gap-2"><TypeMark schema={schema} /><span>{label}</span></span>
);

/** An empty value for a new list item. */
export function blankFor(s: Schema): unknown {
  switch (kindOf(s)) {
    case 'image': return { desktop: null, mobile: null, alt: '' };
    case 'link': return { label: '', href: '' };
    case 'boolean': return false;
    case 'number': return 0;
    case 'enum': case 'icon': return s.enum?.[0] ?? '';
    case 'list': case 'textlist': return [];
    case 'object': return Object.fromEntries((s.required ?? []).map((k) => [k, blankFor(s.properties![k])]));
    default: return '';
  }
}

/** Problems that would break the site (a button going nowhere, a list too long…), in plain words. */
export function problems(s: Schema, v: unknown, label: string, required = true): string[] {
  const k = kindOf(s);
  if (v === undefined || v === null) return required && ['image', 'link'].includes(k) ? [`${label}: missing`] : [];
  if (k === 'link') { const l = v as Lnk; return [...(!l.label?.trim() ? [`${label}: the button has no words`] : []), ...(!l.href ? [`${label}: choose where it goes`] : [])]; }
  if (k === 'href') return v ? [] : [`${label}: choose where it goes`];
  if (k === 'image') { const i = v as Img; return !i.desktop && !i.mobile ? [`${label}: add a picture`] : []; }
  if (k === 'list' || k === 'textlist') {
    const arr = v as unknown[];
    const out: string[] = [];
    if (s.minItems && arr.length < s.minItems) out.push(`${label}: needs at least ${s.minItems}`);
    if (s.maxItems && arr.length > s.maxItems) out.push(`${label}: at most ${s.maxItems}`);
    if (k === 'list' && s.items) arr.forEach((it, i) => out.push(...problems(s.items!, it, `${label} #${i + 1}`)));
    return out;
  }
  if (k === 'object' && s.properties) {
    const o = v as Record<string, unknown>;
    return Object.entries(s.properties).flatMap(([key, ps]) => problems(ps, o[key], `${label} → ${ps.title ?? key}`, (s.required ?? []).includes(key)));
  }
  if (typeof v === 'string' && s.maxLength && v.length > s.maxLength) return [`${label}: too long (${v.length}/${s.maxLength})`];
  return [];
}

const pretty = (x: string) => x.replace(/[_-]/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** One field, whatever its kind. */
export const FieldEditor: React.FC<{ schema: Schema; value: unknown; onChange: (v: unknown) => void; label: string; help?: string | null; optional?: boolean }> = ({
  schema, value, onChange, label, help, optional,
}) => {
  const k = kindOf(schema);
  const helpText = help ?? schema.description ?? undefined;
  // optional pictures / buttons can be added or removed
  if (optional && (k === 'image' || k === 'link') && (value === undefined || value === null)) {
    return <Field label={<Labelled schema={schema} label={label} />} optional help={helpText}><Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => onChange(blankFor(schema))}>{k === 'image' ? 'Add a picture' : 'Add a button'}</Button></Field>;
  }
  const remove = optional && (k === 'image' || k === 'link') ? <button type="button" className="text-xs text-red-700 underline cursor-pointer ml-2" onClick={() => onChange(undefined)}>remove</button> : null;
  switch (k) {
    case 'image': return <Field label={<><Labelled schema={schema} label={label} />{remove}</>} help={helpText}><ImageSlot value={value as Img} onChange={onChange} /></Field>;
    case 'link': return <Field label={<><Labelled schema={schema} label={label} />{remove}</>} help={helpText}><LinkPicker value={value as Lnk} onChange={onChange} maxLength={schema.properties?.label?.maxLength} /></Field>;
    case 'href': return <div><DestinationPicker value={(value as string) ?? ''} onChange={onChange} label={<Labelled schema={schema} label={label} />} />{helpText && <p className="text-xs text-slate-500 mt-1">{helpText}</p>}</div>;
    case 'richtext': return <Field label={<Labelled schema={schema} label={label} />} help={helpText}><RichTextEditor value={(value as string) ?? ''} onChange={onChange} /></Field>;
    case 'color': return <Field label={<Labelled schema={schema} label={label} />} help={helpText}><ColorField value={(value as string) ?? ''} onChange={onChange} /></Field>;
    case 'icon': return <Field label={<Labelled schema={schema} label={label} />} help={helpText}><IconPicker value={(value as string) ?? ''} options={schema.enum ?? []} onChange={onChange} /></Field>;
    case 'collection': return <Field label={<Labelled schema={schema} label={label} />} help={helpText ?? 'Which product shelf to show. Change its products in Categories & brands → Homepage shelves.'}><ShelfSelect value={(value as string) ?? ''} onChange={onChange} /></Field>;
    case 'video': return <Field label={<Labelled schema={schema} label={label} />} help={helpText ?? 'Web address of the video file (ends in .mp4) or a YouTube link.'}><TextInput value={(value as string) ?? ''} onChange={onChange} placeholder="https://" /></Field>;
    case 'enum': return <Field label={<Labelled schema={schema} label={label} />} help={helpText}><Select value={(value as string) ?? ''} onChange={onChange} options={(schema.enum ?? []).map((e) => ({ value: e, label: pretty(e) }))} /></Field>;
    case 'boolean': return <Toggle checked={value === true} onChange={onChange} label={<Labelled schema={schema} label={label} />} description={helpText} />;
    case 'number': return <Field label={<Labelled schema={schema} label={label} />} help={helpText}><NumberInput decimals value={(value as number) ?? null} onChange={(v) => onChange(v ?? 0)} /></Field>;
    case 'textlist': return <Field label={<Labelled schema={schema} label={label} />} help={helpText}><StringList value={(value as string[]) ?? []} onChange={onChange} /></Field>;
    case 'list': return <ListEditor schema={schema} value={(value as unknown[]) ?? []} onChange={onChange} label={label} help={helpText} />;
    case 'object': return <ObjectEditor schema={schema} value={(value as Record<string, unknown>) ?? {}} onChange={onChange} />;
    default: {
      const text = (value as string) ?? '';
      const long = !schema.maxLength || schema.maxLength > 120;
      const counter = schema.maxLength ? `${text.length}/${schema.maxLength}` : undefined;
      return (
        <Field label={<Labelled schema={schema} label={label} />} optional={optional} help={[helpText, counter].filter(Boolean).join(' · ') || undefined} error={schema.maxLength && text.length > schema.maxLength ? `Too long: ${text.length}/${schema.maxLength}` : null}>
          {long ? <TextArea rows={Math.min(6, Math.max(2, Math.ceil(text.length / 70)))} value={text} onChange={onChange} /> : <TextInput value={text} onChange={onChange} />}
        </Field>
      );
    }
  }
};

export const ObjectEditor: React.FC<{ schema: Schema; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }> = ({ schema, value, onChange }) => (
  <div className="grid sm:grid-cols-2 gap-4">
    {Object.entries(schema.properties ?? {}).map(([key, ps]) => {
      const k = kindOf(ps);
      const wide = ['image', 'link', 'richtext', 'list', 'textlist', 'href', 'icon'].includes(k) || !ps.maxLength || ps.maxLength > 120;
      return (
        <div key={key} className={wide ? 'sm:col-span-2' : ''}>
          <FieldEditor schema={ps} value={value[key]} label={ps.title ?? pretty(key)} optional={!(schema.required ?? []).includes(key)}
            onChange={(v) => { const next = { ...value }; if (v === undefined) delete next[key]; else next[key] = v; onChange(next); }} />
        </div>
      );
    })}
  </div>
);

/** First picture in an item, shown in the collapsed list so items are easy to recognise. */
function itemImage(v: unknown): string | null {
  if (!v || typeof v !== 'object') return null;
  for (const x of Object.values(v as Record<string, unknown>)) {
    if (x && typeof x === 'object' && ('desktop' in x || 'mobile' in x)) { const i = x as Img; return mediaUrl(i.desktop ?? i.mobile); }
  }
  return null;
}

/** First bit of text in an item, used as its title in a collapsed list. */
function itemTitle(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    for (const k of ['title', 'name', 'label', 'heading', 'question', 'text', 'quote', 'author']) {
      const x = (v as Record<string, unknown>)[k];
      if (typeof x === 'string' && x.trim()) return x;
      if (x && typeof x === 'object' && typeof (x as Lnk).label === 'string') return (x as Lnk).label;
    }
    const first = Object.values(v).find((x) => typeof x === 'string' && x.trim() && !x.startsWith('/'));
    if (typeof first === 'string') return first;
  }
  return '';
}

export const ListEditor: React.FC<{ schema: Schema; value: unknown[]; onChange: (v: unknown[]) => void; label: string; help?: string }> = ({ schema, value, onChange, label, help }) => {
  const [open, setOpen] = useState<number | null>(value.length === 1 ? 0 : null);
  const items = schema.items ?? { type: 'string' };
  const max = schema.maxItems;
  const min = schema.minItems ?? 0;
  const move = (i: number, by: number) => { const n = [...value]; const [x] = n.splice(i, 1); n.splice(i + by, 0, x); onChange(n); setOpen(i + by); };
  return (
    <div>
      <div className="text-[13.5px] font-medium mb-1 flex items-center gap-2"><TypeMark schema={schema} />{label}</div>
      {help && <p className="text-xs text-slate-500 mb-2">{help}</p>}
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="rounded-lg border border-[#E2E8F0] bg-white">
            <div className="flex items-center gap-1 px-3 py-2">
              <button type="button" onClick={() => setOpen(open === i ? null : i)} className="flex-1 flex items-center gap-2 text-left text-sm cursor-pointer min-w-0">
                <ChevronDown className={cx('w-4 h-4 shrink-0 transition-transform', open === i && 'rotate-180')} />
                <span className="text-slate-400 tabular-nums">{i + 1}.</span>
                {itemImage(item) && <img src={itemImage(item)!} alt="" className="w-10 h-7 rounded object-cover border border-[#E4E7EC] shrink-0" />}
                <span className="truncate font-medium">{itemTitle(item) || <span className="text-slate-400 font-normal">(empty)</span>}</span>
              </button>
              <Button size="sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="ghost" aria-label="Move down" disabled={i === value.length - 1} onClick={() => move(i, 1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="ghost" aria-label="Duplicate" disabled={!!max && value.length >= max} onClick={() => { const n = [...value]; n.splice(i + 1, 0, structuredClone(item)); onChange(n); }}><Copy className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="ghost" aria-label="Remove" disabled={value.length <= min} onClick={() => { onChange(value.filter((_, j) => j !== i)); setOpen(null); }}><Trash2 className="w-3.5 h-3.5 text-red-600" /></Button>
            </div>
            {open === i && (
              <div className="px-3 pb-3 pt-1 border-t border-slate-100">
                {items.properties
                  ? <ObjectEditor schema={items} value={(item as Record<string, unknown>) ?? {}} onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))} />
                  : <FieldEditor schema={items} value={item} label="Value" onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))} />}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2">
        <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} disabled={!!max && value.length >= max} onClick={() => { onChange([...value, blankFor(items)]); setOpen(value.length); }}>Add another</Button>
        <span className="text-xs text-slate-500">{value.length} item{value.length === 1 ? '' : 's'}{max ? ` (up to ${max})` : ''}{min ? `, at least ${min}` : ''}</span>
      </div>
    </div>
  );
};

const StringList: React.FC<{ value: string[]; onChange: (v: string[]) => void }> = ({ value, onChange }) => (
  <div className="space-y-1.5">
    {value.map((s, i) => (
      <div key={i} className="flex gap-1.5">
        <TextInput value={s} onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))} />
        <Button variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => { const n = [...value]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); }}><ArrowUp className="w-3.5 h-3.5" /></Button>
        <Button variant="ghost" aria-label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5 text-red-600" /></Button>
      </div>
    ))}
    <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => onChange([...value, ''])}>Add a line</Button>
  </div>
);

/** A picture for computers, an optional one for phones, and a description. */
export const ImageSlot: React.FC<{ value: Img | null | undefined; onChange: (v: Img) => void }> = ({ value, onChange }) => {
  const v = value ?? { desktop: null, mobile: null, alt: '' };
  const [picking, setPicking] = useState<'desktop' | 'mobile' | null>(null);
  const slot = (which: 'desktop' | 'mobile', title: string, hint: string) => {
    const url = mediaUrl(v[which]);
    return (
      <div className="flex-1 min-w-[12rem]">
        <div className="text-xs font-semibold mb-1">{title}</div>
        <div className={cx('rounded-lg border border-[#E2E8F0] bg-slate-50 flex items-center justify-center overflow-hidden', which === 'desktop' ? 'h-28' : 'h-28 w-20')}>
          {url ? <img src={url} alt="" className="w-full h-full object-contain" /> : <ImagePlus className="w-6 h-6 text-slate-300" />}
        </div>
        <div className="flex gap-2 mt-1.5">
          <Button size="sm" variant={url ? 'outline' : 'primary'} onClick={() => setPicking(which)}>{url ? 'Change' : 'Choose'}</Button>
          {url && <Button size="sm" variant="ghost" onClick={() => onChange({ ...v, [which]: null })}>Remove</Button>}
        </div>
        <p className="text-[11px] text-slate-500 mt-1">{hint}</p>
      </div>
    );
  };
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-slate-50/60 p-3 space-y-3">
      <div className="flex flex-wrap gap-4">
        {slot('desktop', 'Computer picture', 'Wide pictures work best.')}
        {slot('mobile', 'Phone picture (optional)', 'Leave empty to use the computer picture.')}
      </div>
      <Field label="Describe the picture" help="Read out to blind visitors and used by Google, e.g. “Fresh vegetables in a paper bag”.">
        <TextInput value={v.alt} onChange={(alt) => onChange({ ...v, alt })} />
      </Field>
      <MediaPicker open={!!picking} onClose={() => setPicking(null)} folder="cms" onPick={(path) => { if (picking) onChange({ ...v, [picking]: `/${path.replace(/^\/+/, '')}` }); }} />
    </div>
  );
};

const ColorField: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div className="flex items-center gap-2">
    <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#18181B'} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-10 w-14 rounded border border-[#E2E8F0] cursor-pointer" aria-label="Pick a colour" />
    <TextInput value={value} onChange={onChange} className="w-32 font-mono" placeholder="#18181B" />
  </div>
);

const IconPicker: React.FC<{ value: string; options: string[]; onChange: (v: string) => void }> = ({ value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-sm cursor-pointer hover:border-slate-400">
        <CmsIcon name={value} className="w-5 h-5" /> {pretty(value || 'choose')} <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Choose an icon" size="md">
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {options.map((o) => (
            <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); }} title={pretty(o)}
              className={cx('flex flex-col items-center gap-1 p-2 rounded-lg border text-[10px] cursor-pointer', o === value ? 'border-[#18181B] bg-[#FEF9C3]' : 'border-[#E2E8F0] hover:border-slate-400')}>
              <CmsIcon name={o} className="w-6 h-6" /><span className="truncate w-full text-center">{pretty(o)}</span>
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
};

const ShelfSelect: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const lookups = useLookups();
  return <Select value={value} onChange={onChange} placeholder="Choose a shelf…" options={(lookups.data?.collections ?? []).map((c) => ({ value: c.code, label: c.title }))} />;
};

/** Paragraphs, headings, lists, bold, italic and links, with a live preview. Stored as simple marks (## heading, **bold**). */
export const RichTextEditor: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const area = useRef<HTMLTextAreaElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState({ label: '', href: '' });
  const [preview, setPreview] = useState(false);
  const wrap = (before: string, after = before, placeholder = 'text') => {
    const el = area.current;
    if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const sel = value.slice(s, e) || placeholder;
    onChange(value.slice(0, s) + before + sel + after + value.slice(e));
    window.setTimeout(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + sel.length); }, 0);
  };
  const linePrefix = (prefix: (i: number) => string) => {
    const el = area.current;
    if (!el) return;
    const s = value.lastIndexOf('\n', el.selectionStart - 1) + 1;
    let e = value.indexOf('\n', el.selectionEnd);
    if (e < 0) e = value.length;
    const lines = value.slice(s, e).split('\n').map((l, i) => prefix(i) + l.replace(/^(#{2,3} |[-*] |\d+\. )/, ''));
    const block = (s > 0 && value[s - 2] !== '\n' && value[s - 1] === '\n' ? '\n' : '') + lines.join('\n');
    onChange(value.slice(0, s) + block + value.slice(e));
  };
  const tool = (label: string, icon: React.ReactNode, fn: () => void) => (
    <button type="button" title={label} aria-label={label} onClick={fn} className="h-8 px-2 rounded-md hover:bg-slate-100 inline-flex items-center gap-1 text-xs cursor-pointer">{icon}</button>
  );
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 border-b border-slate-100 bg-slate-50">
        {tool('Big heading', <Heading2 className="w-4 h-4" />, () => linePrefix(() => '## '))}
        {tool('Small heading', <Heading3 className="w-4 h-4" />, () => linePrefix(() => '### '))}
        {tool('Bold', <Bold className="w-4 h-4" />, () => wrap('**'))}
        {tool('Italic', <Italic className="w-4 h-4" />, () => wrap('*'))}
        {tool('Bullet list', <List className="w-4 h-4" />, () => linePrefix(() => '- '))}
        {tool('Numbered list', <ListOrdered className="w-4 h-4" />, () => linePrefix((i) => `${i + 1}. `))}
        {tool('Link', <Link2 className="w-4 h-4" />, () => { const el = area.current; setLink({ label: el ? value.slice(el.selectionStart, el.selectionEnd) : '', href: '' }); setLinkOpen(true); })}
        <button type="button" onClick={() => setPreview(!preview)} className="ml-auto h-8 px-2.5 rounded-md text-xs font-semibold hover:bg-slate-100 cursor-pointer">{preview ? 'Edit' : 'Preview'}</button>
      </div>
      {preview
        ? <div className="p-4 text-sm min-h-[10rem]"><RichText text={value} /></div>
        : <textarea ref={area} value={value} onChange={(e) => onChange(e.target.value)} rows={Math.min(18, Math.max(6, value.split('\n').length + 2))} className="w-full px-3 py-2 text-sm leading-relaxed focus:outline-none resize-y" placeholder="Write here. Leave an empty line between paragraphs." />}
      <p className="px-3 py-1.5 text-[11px] text-slate-500 border-t border-slate-100">Select words and use the buttons above. Leave an empty line to start a new paragraph.</p>
      <Modal open={linkOpen} onClose={() => setLinkOpen(false)} title="Add a link" size="md"
        footer={<><Button variant="ghost" onClick={() => setLinkOpen(false)}>Go back</Button><Button variant="primary" disabled={!link.label.trim() || !link.href} onClick={() => {
          const el = area.current;
          const s = el?.selectionStart ?? value.length, e = el?.selectionEnd ?? value.length;
          onChange(`${value.slice(0, s)}[${link.label.replace(/[[\]]/g, '')}](${link.href})${value.slice(e)}`);
          setLinkOpen(false);
        }}>Add link</Button></>}>
        <LinkPicker value={link} onChange={setLink} />
      </Modal>
    </div>
  );
};
