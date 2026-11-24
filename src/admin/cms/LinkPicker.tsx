import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { rpc } from '../../lib/api';
import { useLookups, type Lookups } from '../lookups';
import { Button, Field, Select, TextInput } from '../ui';
import { ProductPicker } from '../pickers';

// Buttons and links for people who do not write web addresses. Staff answer two questions —
// "What should it say?" and "Where should it take people?" — and pick a destination from a list.
// The result is the same href the site already understands (e.g. /shop?category=rice-millets).

export type Dest =
  | 'home' | 'shop' | 'category' | 'brand' | 'sale' | 'organic' | 'search' | 'product' | 'page' | 'story' | 'wishlist' | 'account'
  | 'section' | 'video' | 'website' | 'email' | 'phone' | 'other';

export const DESTINATIONS: Array<{ value: Dest; label: string; group: string }> = [
  { value: 'home', label: 'Home page', group: 'Pages in the shop' },
  { value: 'shop', label: 'All products', group: 'Pages in the shop' },
  { value: 'category', label: 'A category (e.g. Rice & Millets)', group: 'Pages in the shop' },
  { value: 'brand', label: 'A brand’s products', group: 'Pages in the shop' },
  { value: 'product', label: 'One product', group: 'Pages in the shop' },
  { value: 'sale', label: 'Products on offer', group: 'Pages in the shop' },
  { value: 'organic', label: 'Organic products', group: 'Pages in the shop' },
  { value: 'search', label: 'Search results for a word', group: 'Pages in the shop' },
  { value: 'page', label: 'An information page (Delivery, FAQ, Terms…)', group: 'Pages in the shop' },
  { value: 'story', label: 'Our Story page', group: 'Pages in the shop' },
  { value: 'wishlist', label: 'Saved items', group: 'Pages in the shop' },
  { value: 'account', label: 'Customer’s account', group: 'Pages in the shop' },
  { value: 'section', label: 'A part of the homepage', group: 'On the homepage' },
  { value: 'video', label: 'Play the brand video (homepage banner)', group: 'On the homepage' },
  { value: 'website', label: 'Another website', group: 'Elsewhere' },
  { value: 'email', label: 'Write an email', group: 'Elsewhere' },
  { value: 'phone', label: 'Phone call', group: 'Elsewhere' },
  { value: 'other', label: 'Other address (advanced)', group: 'Elsewhere' },
];

/** Homepage parts that have an anchor the site can scroll to. */
export const SECTIONS = [
  { id: 'categories', label: 'Shop by category' },
  { id: 'trusted-brands', label: 'Brands we stock (logo strip)' },
  { id: 'promotions', label: 'Offer cards' },
  { id: 'story', label: 'Our story section' },
];
const ACCOUNT_TABS = [
  { value: '', label: 'Account overview' }, { value: 'orders', label: 'Their orders' }, { value: 'addresses', label: 'Their addresses' },
  { value: 'rewards', label: 'Loyalty points' }, { value: 'preferences', label: 'Email preferences' },
];

interface Parsed { dest: Dest; arg: string }

/** Turns any existing href back into "destination + detail". */
export function parseHref(href: string | null | undefined): Parsed {
  const h = (href ?? '').trim();
  if (!h) return { dest: 'home', arg: '' };
  if (h === '#video') return { dest: 'video', arg: '' };
  if (/^\/?#/.test(h)) return { dest: 'section', arg: h.replace(/^\/?#/, '') };
  if (/^mailto:/i.test(h)) return { dest: 'email', arg: h.replace(/^mailto:/i, '') };
  if (/^tel:/i.test(h)) return { dest: 'phone', arg: h.replace(/^tel:/i, '') };
  if (/^https?:\/\//i.test(h)) return { dest: 'website', arg: h };
  if (!h.startsWith('/')) return { dest: 'other', arg: h };
  const [path, query = ''] = h.split('?');
  const p = new URLSearchParams(query);
  const keys = [...p.keys()];
  if (path === '/' && !query) return { dest: 'home', arg: '' };
  if (path === '/shop') {
    if (!keys.length) return { dest: 'shop', arg: '' };
    if (keys.length === 1 && p.get('category')) return { dest: 'category', arg: p.get('category')! };
    if (keys.length === 1 && p.get('brand') && !p.get('brand')!.includes(',')) return { dest: 'brand', arg: p.get('brand')! };
    if (keys.length === 1 && p.get('sale') === '1') return { dest: 'sale', arg: '' };
    if (keys.length === 1 && p.get('organic') === '1') return { dest: 'organic', arg: '' };
    if (keys.length === 1 && p.get('q')) return { dest: 'search', arg: p.get('q')! };
    return { dest: 'other', arg: h };
  }
  const m = path.match(/^\/product\/([^/]+)$/);
  if (m) return { dest: 'product', arg: decodeURIComponent(m[1]) };
  const pg = path.match(/^\/pages\/([^/]+)$/);
  if (pg) return { dest: 'page', arg: pg[1] };
  if (path === '/story' || path === '/our-story') return { dest: 'story', arg: '' };
  if (path === '/wishlist') return { dest: 'wishlist', arg: '' };
  const acc = path.match(/^\/account(?:\/(.*))?$/);
  if (acc) return { dest: 'account', arg: acc[1] ?? '' };
  return { dest: 'other', arg: h };
}

/** Builds the href. Returns '' when a required detail is still missing. */
export function buildHref(dest: Dest, arg: string): string {
  const a = arg.trim();
  switch (dest) {
    case 'home': return '/';
    case 'shop': return '/shop';
    case 'category': return a ? `/shop?category=${encodeURIComponent(a)}` : '';
    case 'brand': return a ? `/shop?brand=${encodeURIComponent(a)}` : '';
    case 'sale': return '/shop?sale=1';
    case 'organic': return '/shop?organic=1';
    case 'search': return a ? `/shop?q=${encodeURIComponent(a)}` : '';
    case 'product': return a ? `/product/${encodeURIComponent(a)}` : '';
    case 'page': return a ? `/pages/${encodeURIComponent(a)}` : '';
    case 'story': return '/story';
    case 'wishlist': return '/wishlist';
    case 'account': return a ? `/account/${a}` : '/account';
    case 'section': return a ? `#${a}` : '';
    case 'video': return '#video';
    case 'website': return /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(a) ? a : '';
    case 'email': return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a) ? `mailto:${a}` : '';
    case 'phone': return a.replace(/[^\d+]/g, '').length >= 7 ? `tel:${a.replace(/[^\d+]/g, '')}` : '';
    case 'other': return a.startsWith('/') || a.startsWith('#') ? a : '';
  }
}

/** "the Rice & Millets category" — what the link does, in words. */
export function describeHref(href: string, lookups?: Lookups, productName?: string | null): string {
  if (!href) return 'nowhere yet — choose where it should go';
  const { dest, arg } = parseHref(href);
  switch (dest) {
    case 'home': return 'the home page';
    case 'shop': return 'all products';
    case 'category': return `the “${lookups?.categories.find((c) => c.slug === arg)?.name ?? arg}” category`;
    case 'brand': return `${lookups?.brands.find((b) => b.slug === arg)?.name ?? arg} products`;
    case 'sale': return 'products on offer';
    case 'organic': return 'organic products';
    case 'search': return `search results for “${arg}”`;
    case 'product': return `the product “${productName ?? arg}”`;
    case 'page': return `the “${lookups?.staticPages.find((p) => p.key === arg)?.label ?? arg}” page`;
    case 'story': return 'the Our Story page';
    case 'wishlist': return 'the shopper’s saved items';
    case 'account': return ACCOUNT_TABS.find((t) => t.value === arg)?.label.toLowerCase() ?? 'the customer’s account';
    case 'section': return `the “${SECTIONS.find((s) => s.id === arg)?.label ?? arg}” part of the homepage`;
    case 'video': return 'plays the brand video';
    case 'website': return `${arg} (opens in a new tab)`;
    case 'email': return `a new email to ${arg}`;
    case 'phone': return `calls ${arg}`;
    case 'other': return arg;
  }
}

function useProductName(slug: string | null) {
  return useQuery({
    queryKey: ['admin', 'product-name', slug],
    queryFn: async () => (await rpc<{ name: string } | null>('get_product', { p_slug_or_legacy_ref: slug }))?.name ?? null,
    enabled: !!slug, staleTime: 300_000, retry: false,
  }).data ?? null;
}

/** Just "Where should it take people?" (for fields that hold only an address). */
export const DestinationPicker: React.FC<{ value: string; onChange: (href: string) => void; label?: React.ReactNode }> = ({ value, onChange, label = 'Where should it take people?' }) => {
  const lookups = useLookups();
  const initial = parseHref(value);
  const [dest, setDest] = useState<Dest>(initial.dest);
  const [arg, setArg] = useState(initial.arg);
  // keep in step when a different value is loaded (e.g. "Discard changes")
  useEffect(() => { const p = parseHref(value); if (buildHref(dest, arg) !== value) { setDest(p.dest); setArg(p.arg); } }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const productName = useProductName(dest === 'product' && arg ? arg : null);
  const update = (d: Dest, a: string) => { setDest(d); setArg(a); onChange(buildHref(d, a)); };
  const L = lookups.data;
  const href = buildHref(dest, arg);
  const groups = [...new Set(DESTINATIONS.map((d) => d.group))];

  return (
    <div className="space-y-2">
      <Field label={label}>
        <div className="relative">
          <select value={dest} onChange={(e) => update(e.target.value as Dest, '')} className="w-full h-10 px-3 pr-9 rounded-lg border border-[#E2E8F0] bg-white text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#F5D103] appearance-none">
            {groups.map((g) => <optgroup key={g} label={g}>{DESTINATIONS.filter((d) => d.group === g).map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</optgroup>)}
          </select>
          <ArrowRight className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" />
        </div>
      </Field>
      {dest === 'category' && <Field label="Which category?"><Select value={arg} onChange={(v) => update(dest, v)} placeholder="Choose…" options={(L?.categories ?? []).filter((c) => c.isActive).map((c) => ({ value: c.slug, label: c.path }))} /></Field>}
      {dest === 'brand' && <Field label="Which brand?"><Select value={arg} onChange={(v) => update(dest, v)} placeholder="Choose…" options={(L?.brands ?? []).filter((b) => b.isActive).map((b) => ({ value: b.slug, label: b.name }))} /></Field>}
      {dest === 'page' && <Field label="Which page?"><Select value={arg} onChange={(v) => update(dest, v)} placeholder="Choose…" options={(L?.staticPages ?? []).map((p) => ({ value: p.key, label: p.label + (p.isPublished ? '' : ' (not published yet)') }))} /></Field>}
      {dest === 'section' && <Field label="Which part?"><Select value={arg} onChange={(v) => update(dest, v)} placeholder="Choose…" options={SECTIONS.map((s) => ({ value: s.id, label: s.label }))} /></Field>}
      {dest === 'account' && <Field label="Which part of the account?"><Select value={arg} onChange={(v) => update(dest, v)} options={ACCOUNT_TABS} /></Field>}
      {dest === 'search' && <Field label="Search for"><TextInput value={arg} onChange={(v) => update(dest, v)} placeholder="e.g. mango" /></Field>}
      {dest === 'website' && <Field label="Website address" help="Starts with https://"><TextInput value={arg} onChange={(v) => update(dest, v)} placeholder="https://" /></Field>}
      {dest === 'email' && <Field label="Email address"><TextInput type="email" value={arg} onChange={(v) => update(dest, v)} /></Field>}
      {dest === 'phone' && <Field label="Phone number"><TextInput type="tel" value={arg} onChange={(v) => update(dest, v)} placeholder="e.g. 01707 123456" /></Field>}
      {dest === 'other' && <Field label="Address" help="A path in this shop starting with /, e.g. /shop?category=rice-millets&sale=1"><TextInput value={arg} onChange={(v) => update(dest, v)} /></Field>}
      {dest === 'product' && (arg
        ? <div className="flex items-center justify-between gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm"><span className="truncate">{productName ?? arg}</span><Button size="sm" variant="ghost" onClick={() => update(dest, '')}>Change</Button></div>
        : <ProductPicker activeOnly onPick={(p) => update(dest, p.slug)} placeholder="Find the product…" />)}
      <div className={`flex items-start gap-1.5 text-xs rounded-md px-2.5 py-1.5 ${href ? 'bg-[#EAF3EE] text-[#245740]' : 'bg-[#F8F0E3] text-[#7A4A0F]'}`}>
        <ArrowRight className="w-3.5 h-3.5 mt-px shrink-0" />
        <span>Goes to: <b>{describeHref(href, L, productName)}</b></span>
      </div>
    </div>
  );
};

/** A button or link: "What should it say?" + "Where should it take people?". Value: { label, href }. */
export const LinkPicker: React.FC<{ value: { label: string; href: string } | null | undefined; onChange: (v: { label: string; href: string }) => void; maxLength?: number }> = ({ value, onChange, maxLength }) => {
  const v = value ?? { label: '', href: '' };
  return (
    <div className="grid sm:grid-cols-2 gap-3 rounded-lg border border-[#E2E8F0] bg-slate-50/60 p-3">
      <Field label="What should the button say?" help={maxLength ? `${v.label.length}/${maxLength}` : undefined}>
        <TextInput value={v.label} maxLength={maxLength} onChange={(label) => onChange({ ...v, label })} placeholder="e.g. Shop groceries" />
      </Field>
      <DestinationPicker value={v.href} onChange={(href) => onChange({ ...v, href })} />
    </div>
  );
};
