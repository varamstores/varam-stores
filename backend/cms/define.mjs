// CMS content definitions: helpers used by backend/cms/pages/*.mjs.
//
// A definition declares STRUCTURE (pages, sections, entry keys, kinds, labels, help) and the
// INITIAL value of every entry. `npm run cms:sync` writes structure to Postgres every time, but
// writes a value only when the entry does not exist yet, so edits made in the admin CMS are never
// overwritten. It also generates src/cms/content.gen.ts, so the frontend gets a compile error for
// any key that does not exist.

// Icons the admin can choose for list items (rendered by src/cms/icons.tsx — keep in sync).
export const ICONS = [
  'truck', 'leaf', 'shield-check', 'clock', 'heart', 'star', 'gift', 'percent', 'tag', 'sparkles',
  'shopping-basket', 'shopping-bag', 'package', 'map-pin', 'phone', 'mail', 'message-circle',
  'credit-card', 'refresh-cw', 'award', 'thumbs-up', 'users', 'sun', 'snowflake', 'flame', 'wheat',
  'apple', 'carrot', 'milk', 'fish', 'egg', 'cookie', 'coffee', 'zap', 'badge-check', 'lock',
  'recycle', 'store', 'home', 'calendar', 'info', 'help-circle', 'instagram', 'facebook',
  'youtube', 'linkedin', 'x', 'smartphone', 'globe', 'check-circle', 'timer', 'hand-heart', 'sprout',
];

const IMAGE_SCHEMA = {
  type: 'object', 'x-kind': 'image',
  properties: { desktop: { type: ['string', 'null'] }, mobile: { type: ['string', 'null'] }, alt: { type: 'string' } },
  anyOf: [{ required: ['desktop'] }, { required: ['mobile'] }],
};
const LINK_SCHEMA = {
  type: 'object', 'x-kind': 'link',
  properties: { label: { type: 'string' }, href: { type: 'string' } }, required: ['label', 'href'],
};

// ── fields inside list items ───────────────────────────────────────────────────────────────────
// Each returns { schema, ts }. `title`/`description` in the schema label the field in the admin.
const ann = (title, o = {}) => ({ title, ...(o.help ? { description: o.help } : {}) });
export const f = {
  text:     (title, o = {}) => ({ schema: { type: 'string', ...(o.max ? { maxLength: o.max } : {}), ...ann(title, o) }, ts: 'string' }),
  richtext: (title, o = {}) => ({ schema: { type: 'string', 'x-kind': 'richtext', ...ann(title, o) }, ts: 'string' }),
  image:    (title, o = {}) => ({ schema: { ...IMAGE_SCHEMA, ...ann(title, o) }, ts: 'CmsImage' }),
  link:     (title, o = {}) => ({ schema: { ...LINK_SCHEMA, ...ann(title, o) }, ts: 'CmsLink' }),
  href:     (title, o = {}) => ({ schema: { type: 'string', 'x-kind': 'href', ...ann(title, o) }, ts: 'string' }),
  number:   (title, o = {}) => ({ schema: { type: 'number', ...ann(title, o) }, ts: 'number' }),
  boolean:  (title, o = {}) => ({ schema: { type: 'boolean', ...ann(title, o) }, ts: 'boolean' }),
  color:    (title, o = {}) => ({ schema: { type: 'string', 'x-kind': 'color', pattern: '^#[0-9A-Fa-f]{3,8}$', ...ann(title, o) }, ts: 'string' }),
  icon:     (title, o = {}) => ({ schema: { type: 'string', 'x-kind': 'icon', enum: ICONS, ...ann(title, o) }, ts: 'CmsIconName' }),
  select:   (title, options, o = {}) => ({ schema: { type: 'string', enum: options, ...ann(title, o) }, ts: options.map((x) => JSON.stringify(x)).join(' | ') }),
  textlist: (title, o = {}) => ({ schema: { type: 'array', 'x-kind': 'textlist', items: { type: 'string' }, ...ann(title, o) }, ts: 'string[]' }),
};

function objectOf(fields) {
  const props = {}, required = [], ts = [];
  for (const [name, def] of Object.entries(fields)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) throw new Error(`Bad field name "${name}"`);
    const optional = def.optional === true;
    props[name] = def.schema;
    if (!optional) required.push(name);
    ts.push(`${name}${optional ? '?' : ''}: ${def.ts}`);
  }
  return { schema: { type: 'object', properties: props, required, additionalProperties: false }, ts: `{ ${ts.join('; ')} }` };
}
export const optional = (def) => ({ ...def, optional: true });

// ── top-level entries ──────────────────────────────────────────────────────────────────────────
// name: last key segment; label: what the admin sees; value: initial content.
const entry = (kind, name, label, value, o = {}, extra = {}) => ({
  name, kind, label, value, help: o.help ?? null, maxLength: o.max ?? null, itemSchema: null, ts: null, ...extra,
});
export const text     = (name, label, value, o) => entry('text', name, label, value, o, { ts: 'string' });
export const richtext = (name, label, value, o) => entry('richtext', name, label, value, o, { ts: 'string' });
export const image    = (name, label, value, o) => entry('image', name, label, value, o, { ts: 'CmsImage' });
export const link     = (name, label, value, o) => entry('link', name, label, value, o, { ts: 'CmsLink' });
export const number   = (name, label, value, o) => entry('number', name, label, value, o, { ts: 'number' });
export const boolean  = (name, label, value, o) => entry('boolean', name, label, value, o, { ts: 'boolean' });
export const color    = (name, label, value, o) => entry('color', name, label, value, o, { ts: 'string' });
export const icon     = (name, label, value, o) => entry('json', name, label, value, o, {
  itemSchema: f.icon(label).schema, ts: 'CmsIconName' });
export const select   = (name, label, options, value, o) => entry('json', name, label, value, o, {
  itemSchema: f.select(label, options).schema, ts: options.map((x) => JSON.stringify(x)).join(' | ') });
export const textlist = (name, label, value, o) => entry('list', name, label, value, o, {
  itemSchema: { type: 'array', items: { type: 'string' } }, ts: 'string[]' });
/** A repeatable list of items; `fields` describes one item, e.g. { title: f.text('Title'), image: f.image('Photo') }. */
export function list(name, label, fields, value, o = {}) {
  const item = objectOf(fields);
  return entry('list', name, label, value, o, {
    itemSchema: { type: 'array', items: item.schema, ...(o.min ? { minItems: o.min } : {}), ...(o.maxItems ? { maxItems: o.maxItems } : {}) },
    ts: `Array<${item.ts}>`,
  });
}

// ── sections and pages ─────────────────────────────────────────────────────────────────────────
export function section(key, label, help, entries, o = {}) {
  return { key, label, help, entries, reorderable: o.reorderable ?? true, enabled: o.enabled ?? true,
    desktop: o.desktop ?? true, mobile: o.mobile ?? true };
}
/**
 * kind: 'global' (appears on every page: header, footer, microcopy) · 'system' (an app screen:
 * home, shop, checkout…) · 'static' (an editable content page: terms, privacy…).
 */
export function page(key, label, o, sections) {
  return { key, label, route: o.route ?? null, kind: o.kind ?? 'system', help: o.help ?? null,
    seoTitle: o.seo?.title ?? null, seoDescription: o.seo?.description ?? null, seoImage: o.seo?.image ?? null,
    isPublished: o.published ?? true, sections };
}

/** Image value helper: img('/hero/a.webp', 'Alt text') or img('/a.webp', 'Alt', '/a-mobile.webp'). */
export const img = (desktop, alt = '', mobile = null) => ({ desktop, mobile, alt });

/** Which product collection a homepage shelf shows (Products → Collections in the admin). */
export const collection = (name, label, value, o) => entry('json', name, label, value, o, {
  itemSchema: { type: 'string', 'x-kind': 'collection', minLength: 1, title: label }, ts: 'string' });
/** A video file or page URL (mp4/webm link). */
export const video = (name, label, value, o) => entry('json', name, label, value, o, {
  itemSchema: { type: 'string', 'x-kind': 'video', title: label }, ts: 'string' });
