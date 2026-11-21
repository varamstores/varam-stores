// Generates backend/db/seed/*.sql from the frontend mock files (src/data/*.ts) so that ALL mock
// data lives in Postgres. The generated SQL is committed, so the seed keeps working after the
// mock files are deleted. Deterministic UUIDs (v5) make every run produce identical SQL.
//   node --experimental-strip-types scripts/build-seed.mjs [--dry-run]
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { BACKEND_DIR, REPO_DIR } from './lib/env.mjs';

const dryRun = process.argv.includes('--dry-run');
const mod = (p) => import(pathToFileURL(path.join(REPO_DIR, 'src', p)).href);
const P = await mod('data/products.ts');
const { categories } = await mod('data/categories.ts');
const { brandGroups, marqueeBrands } = await mod('data/brands.ts');
const { customerReviews } = await mod('data/reviews.ts');
const A = await mod('data/adminMockData.ts');

const SEED_AT = '2026-11-21T00:00:00Z';
const warnings = [];

// ── helpers ─────────────────────────────────────────────────────────────────
const NS = Buffer.from('6f1c2a5e8f3b4c1d9e2a7b5d4c3a2f10', 'hex');
function uuid5(name) {
  const h = createHash('sha1').update(Buffer.concat([NS, Buffer.from(name, 'utf8')])).digest();
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
const id = (kind, key) => uuid5(`${kind}:${key}`);
const q = (v) => v === null || v === undefined ? 'null'
  : typeof v === 'number' ? String(v)
  : typeof v === 'boolean' ? String(v)
  : typeof v === 'object' ? `'${JSON.stringify(v).replace(/'/g, "''")}'`
  : `'${String(v).replace(/'/g, "''")}'`;
const pence = (x) => (x === null || x === undefined ? null : Math.round(x * 100));
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const asset = (p) => {
  if (!p) return null;
  const rel = p.replace(/^\//, '');
  if (!existsSync(path.join(REPO_DIR, 'public', rel))) warnings.push(`image not found in public/: ${p}`);
  return rel;
};
const e164 = (s) => { const v = s.replace(/[\s().-]/g, ''); if (!/^\+[1-9][0-9]{7,14}$/.test(v)) throw new Error(`bad phone ${s}`); return v; };
const divRoundHalfUp = (num, den) => num >= 0 ? Math.floor((2 * num + den) / (2 * den)) : -Math.floor((2 * -num + den) / (2 * den));
const vatFromGross = (gross, rateBp) => divRoundHalfUp(gross * rateBp, 10000 + rateBp);

function insert(table, rows, conflict = 'do nothing') {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  for (const r of rows) {
    const k = Object.keys(r);
    if (k.length !== cols.length || k.some((c, i) => c !== cols[i])) throw new Error(`row shape mismatch in ${table}`);
  }
  return `insert into ${table} (${cols.join(', ')}) values\n` +
    rows.map((r) => '  (' + cols.map((c) => q(r[c])).join(', ') + ')').join(',\n') +
    `\non conflict ${conflict};\n\n`;
}

// ── categories (12 shop categories + 3 used by products; approved 2026-11-21) ─
const NEW_CATEGORIES = [
  { id: 'bakery-dairy',  name: 'Bakery & Dairy',  image: null },
  { id: 'health-beauty', name: 'Health & Beauty', image: '/categories/health-beauty.jpg' },
  { id: 'kitchenwares',  name: 'Kitchenwares',    image: '/categories/kitchenwares.png' },
];
const categoryRows = [], categoryTr = [];
const catId = (slug) => id('category', slug);
categories.forEach((c, i) => {
  categoryRows.push({ id: catId(c.id), slug: c.id, parent_id: null, position: i + 1, image_url: asset(c.image),
    accent_bg: c.accentBg ?? null, accent_color: c.accentColor ?? null, card_bg: c.cardBg ?? null, badge: c.badge ?? null,
    show_on_homepage: true, is_active: true, is_sample: false });
  categoryTr.push({ category_id: catId(c.id), locale: 'en-GB', name: c.name, tagline: c.tagline ?? null });
});
NEW_CATEGORIES.forEach((c, i) => {
  categoryRows.push({ id: catId(c.id), slug: c.id, parent_id: null, position: categories.length + i + 1, image_url: asset(c.image),
    accent_bg: null, accent_color: null, card_bg: null, badge: null, show_on_homepage: false, is_active: true, is_sample: false });
  categoryTr.push({ category_id: catId(c.id), locale: 'en-GB', name: c.name, tagline: null });
});
const childRows = [], childTr = [];
categories.forEach((c) => (c.subcategories ?? []).forEach((name, i) => {
  const slug = `${c.id}-${slugify(name)}`;
  childRows.push({ id: catId(slug), slug, parent_id: catId(c.id), position: i + 1, image_url: null, accent_bg: null,
    accent_color: null, card_bg: null, badge: null, show_on_homepage: false, is_active: true, is_sample: false });
  childTr.push({ category_id: catId(slug), locale: 'en-GB', name, tagline: null });
}));

// ── brands ──────────────────────────────────────────────────────────────────
const marquee = new Map(marqueeBrands.map((m, i) => [m.id, { ...m, position: i + 1 }]));
const allBrands = brandGroups.flatMap((g) => g.brands);
const brandRows = allBrands.map((b) => {
  const m = marquee.get(b.id);
  return { id: id('brand', b.id), slug: b.slug, legacy_ref: b.id, name: m?.name && m.name !== b.name ? b.name : b.name,
    logo_url: asset(m?.logo), tagline: m?.category ?? null, is_popular: !!b.isPopular, marquee_position: m?.position ?? null,
    is_active: true, is_sample: false };
});
for (const m of marquee.keys()) if (!allBrands.some((b) => b.id === m)) throw new Error(`marquee brand ${m} missing from groups`);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const brandsByLength = [...allBrands].sort((a, b) => norm(b.name).length - norm(a.name).length);
function brandFor(productName) {
  const n = norm(productName);
  const b = brandsByLength.find((br) => norm(br.name).length >= 3 && n.startsWith(norm(br.name)));
  return b ?? null;
}

// ── products ────────────────────────────────────────────────────────────────
const CATEGORY_MAP = { dairy: 'bakery-dairy', vegetables: 'vegetables-fruits', fruits: 'vegetables-fruits', meat: 'seafood-meat',
  'health-beauty': 'health-beauty', kitchenwares: 'kitchenwares' };
const REFILE = { 'prod-12': 'bakery-dairy', 'prod-13': 'bakery-dairy', 'prod-25': 'bakery-dairy', 'prod-24': 'bakery-dairy',
  'prod-5': 'bakery-dairy', 'prod-16': 'bakery-dairy' };
// Proposed UK VAT categories — UNCONFIRMED until the accountant reviews them.
const STANDARD_RATED = new Set(['prod-sweets-1', 'prod-sweets-2', 'prod-20', 'prod-23', 'prod-pooja-1', 'prod-pooja-2',
  'prod-kitchen-1', 'prod-kitchen-2', 'prod-beauty-1', 'prod-beauty-2']);
const NON_FOOD = new Set(['prod-pooja-1', 'prod-pooja-2', 'prod-kitchen-1', 'prod-kitchen-2', 'prod-beauty-1', 'prod-beauty-2']);
const PERISHABLE = new Set(['prod-1', 'prod-2', 'prod-3', 'prod-4', 'prod-5', 'prod-8', 'prod-9', 'prod-11', 'prod-12', 'prod-13',
  'prod-14', 'prod-15', 'prod-16', 'prod-18', 'prod-20', 'prod-21', 'prod-22', 'prod-23', 'prod-24', 'prod-25', 'prod-26',
  'prod-frozen-1', 'prod-frozen-2']);
const SOLD_BY_WEIGHT = new Set(['prod-1', 'prod-2', 'prod-3']);           // mock unit 'kg'; 1 kg steps as the UI does today
const NET_OVERRIDE = { 'prod-kitchen-2': [1, 'piece'] };                    // '5 Litre Capacity' is a size, not contents

function parseNet(unit) {
  const u = unit.toLowerCase();
  let m;
  if ((m = u.match(/\((\d+(?:\.\d+)?)\s*(g|kg|ml|l)\)/))) return [Number(m[1]), m[2]];
  if ((m = u.match(/^(\d+(?:\.\d+)?)\s*(kg|g|ml|litre|liter|l)\b/))) return [Number(m[1]), m[2].startsWith('lit') ? 'l' : m[2]];
  if ((m = u.match(/^(\d+)\s*(pack|piece|jumbo pack|set)\b/))) return [Number(m[1]), 'piece'];
  return [null, null];
}

const INVENTORY_TO_PRODUCT = { 'INV-01': 'prod-6', 'INV-02': 'prod-7', 'INV-03': 'prod-8', 'INV-04': 'prod-9', 'INV-05': 'prod-10' };
const inventoryByProduct = new Map(A.initialInventory.filter((i) => INVENTORY_TO_PRODUCT[i.id]).map((i) => [INVENTORY_TO_PRODUCT[i.id], i]));
const DRAFT_FROM_INVENTORY = A.initialInventory.filter((i) => !INVENTORY_TO_PRODUCT[i.id]);

const productRows = [], productTr = [], productImg = [], productCat = [], priceRows = [], foodRows = [];
const productIndex = new Map();        // legacy id → { id, sku, name, tax, unit }
const slugs = new Set();
P.products.forEach((p, i) => {
  const pid = id('product', p.id);
  let slug = slugify(p.name);
  if (slugs.has(slug)) throw new Error(`duplicate product slug ${slug}`);
  slugs.add(slug);
  const cat = REFILE[p.id] ?? CATEGORY_MAP[p.category] ?? p.category;
  if (!categoryRows.some((c) => c.slug === cat)) throw new Error(`product ${p.id} → unknown category ${cat}`);
  const weight = SOLD_BY_WEIGHT.has(p.id);
  const [netQ, netU] = weight ? [null, null] : (NET_OVERRIDE[p.id] ?? parseNet(p.unit));
  if (!weight && netQ === null) warnings.push(`no net quantity parsed for ${p.id} "${p.name}" unit "${p.unit}" (unit price will be unavailable)`);
  const brand = brandFor(p.name);
  const inv = inventoryByProduct.get(p.id);
  const sku = inv?.sku ?? `VRM-${String(i + 1).padStart(4, '0')}`;
  const tax = STANDARD_RATED.has(p.id) ? 'standard' : 'zero_rated';
  const perishable = PERISHABLE.has(p.id);
  productRows.push({ id: pid, slug, legacy_ref: p.id, sku, brand_id: brand ? id('brand', brand.id) : null,
    primary_category_id: catId(cat), status: 'active', featured_rank: i + 1, tax_category_code: tax,
    sale_unit: weight ? 'weight' : 'each', pack_size_label: p.unit, net_quantity: netQ, net_quantity_unit: netU,
    estimated_weight_grams: weight ? 1000 : null, min_weight_grams: weight ? 1000 : null, weight_step_grams: weight ? 1000 : null,
    rrp_minor: pence(p.originalPrice), is_organic: !!p.isOrganic, is_food: !NON_FOOD.has(p.id),
    is_perishable: perishable, is_returnable: !perishable, badge: p.badge ?? null, published_at: SEED_AT, is_sample: false });
  productTr.push({ product_id: pid, locale: 'en-GB', name: p.name, description: p.description ?? '', origin_text: p.origin ?? null,
    storage_text: p.storage ?? null, sourcing_text: p.sourcing ?? null, ingredients_text: null });
  const imgs = [p.image, ...(p.galleryImages ?? [])].filter(Boolean);
  imgs.forEach((src, k) => productImg.push({ id: id('product_image', `${p.id}:${k}`), product_id: pid, url: asset(src), alt: p.name, position: k }));
  productCat.push({ product_id: pid, category_id: catId(cat) });
  priceRows.push({ id: id('price', p.id), product_id: pid, price_list: 'base', amount_minor: pence(p.price), currency: 'GBP',
    valid_from: SEED_AT, valid_to: null, reason: 'Initial price from the frontend catalogue' });
  if (!NON_FOOD.has(p.id)) {
    const n = p.nutrition;
    let basis = null, kcal = null, carbs = null, protein = null, fat = null;
    const cal = n?.calories?.match(/^\s*([\d.]+)\s*kcal\s*\/\s*100\s*(g|ml)\s*$/i);
    if (cal) {
      basis = cal[2].toLowerCase() === 'ml' ? 'per_100ml' : 'per_100g';
      kcal = Number(cal[1]);
      const g = (s) => { const m = s?.match(/^\s*([\d.]+)\s*g\s*$/i); return m ? Number(m[1]) : null; };
      carbs = g(n.carbs); protein = g(n.protein); fat = g(n.fat);
    } else if (n) {
      warnings.push(`${p.id} nutrition is not per 100 g/ml ("${n.calories}") — kept as legacy text only`);
    }
    foodRows.push({ product_id: pid, nutrition_basis: basis, energy_kj: null, energy_kcal: kcal, fat_g: fat, saturates_g: null,
      carbohydrate_g: carbs, sugars_g: null, fibre_g: null, protein_g: protein, salt_g: null, fbo_name: null, fbo_address: null,
      country_of_origin: null, allergens_reviewed: false, legacy_nutrition: n ?? null });
  }
  productIndex.set(p.id, { id: pid, sku, name: p.name, tax, unit: p.unit, price: pence(p.price) });
  if (!brand && /^[A-Z][a-z]+ /.test(p.name)) { /* generic names are expected to have no brand */ }
});

// Mock inventory items with no catalogue product → draft products (hidden from shoppers).
const DRAFT_META = { 'INV-06': { cat: 'edible-oils', brand: 'grb', unit: '500 ml jar', net: [500, 'ml'] },
                     'INV-07': { cat: 'atta-flours', brand: 'aashirvaad', unit: '10 kg sack', net: [10, 'kg'] } };
for (const inv of DRAFT_FROM_INVENTORY) {
  const meta = DRAFT_META[inv.id];
  if (!meta) throw new Error(`unmapped inventory item ${inv.id}`);
  const pid = id('product', inv.id);
  const slug = slugify(inv.name);
  if (slugs.has(slug)) throw new Error(`duplicate product slug ${slug}`);
  slugs.add(slug);
  if (!allBrands.some((b) => b.id === meta.brand)) throw new Error(`brand ${meta.brand} missing`);
  productRows.push({ id: pid, slug, legacy_ref: inv.id, sku: inv.sku, brand_id: id('brand', meta.brand), primary_category_id: catId(meta.cat),
    status: 'draft', featured_rank: null, tax_category_code: 'zero_rated', sale_unit: 'each', pack_size_label: meta.unit,
    net_quantity: meta.net[0], net_quantity_unit: meta.net[1], estimated_weight_grams: null, min_weight_grams: null, weight_step_grams: null,
    rrp_minor: null, is_organic: false, is_food: true, is_perishable: false, is_returnable: true, badge: null, published_at: null, is_sample: false });
  productTr.push({ product_id: pid, locale: 'en-GB', name: inv.name, description: '', origin_text: null, storage_text: null, sourcing_text: null, ingredients_text: null });
  productCat.push({ product_id: pid, category_id: catId(meta.cat) });
  priceRows.push({ id: id('price', inv.id), product_id: pid, price_list: 'base', amount_minor: pence(inv.retailPrice), currency: 'GBP',
    valid_from: SEED_AT, valid_to: null, reason: 'Initial price from the frontend admin inventory mock' });
  foodRows.push({ product_id: pid, nutrition_basis: null, energy_kj: null, energy_kcal: null, fat_g: null, saturates_g: null,
    carbohydrate_g: null, sugars_g: null, fibre_g: null, protein_g: null, salt_g: null, fbo_name: null, fbo_address: null,
    country_of_origin: null, allergens_reviewed: false, legacy_nutrition: null });
  productIndex.set(inv.id, { id: pid, sku: inv.sku, name: inv.name, tax: 'zero_rated', unit: meta.unit, price: pence(inv.retailPrice) });
}

// ── homepage shelves ────────────────────────────────────────────────────────
const SHELVES = [
  ['fresh-picks', "Today's Fresh Picks", P.freshPicksProducts],
  ['bakery-dairy', 'Morning Bakery & Farm Dairy', P.bakeryDairyProducts],
  ['most-selling', 'Most Selling Products', P.mostSellingProducts],
  ['pantry-superfoods', 'Pantry Staples & Superfoods', P.pantrySuperfoodProducts],
];
const collectionRows = SHELVES.map(([code, title]) => ({ id: id('collection', code), code, title, is_active: true }));
const collectionItems = SHELVES.flatMap(([code, , list]) => list.map((p, i) => ({ collection_id: id('collection', code), product_id: id('product', p.id), position: i + 1 })));

// ── suppliers + product↔supplier (from admin mock) ─────────────────────────
const supplierRows = A.initialSuppliers.map((s) => ({ id: id('supplier', s.id), code: s.id, name: s.name, category: s.category,
  lead_time_days: s.leadTimeDays, contact_person: s.contactPerson, email: s.email.toLowerCase(), phone_e164: e164(s.phone),
  rating: s.rating, contacts_verified: false, is_active: true, is_sample: false }));
const supplierByName = new Map(A.initialSuppliers.map((s) => [s.name, s.id]));
const productSupplierRows = [];
for (const inv of A.initialInventory) {
  const legacy = INVENTORY_TO_PRODUCT[inv.id] ?? inv.id;
  const sup = supplierByName.get(inv.supplier);
  if (!sup) { warnings.push(`inventory ${inv.id} supplier "${inv.supplier}" is not in the supplier list — no link created`); continue; }
  productSupplierRows.push({ product_id: id('product', legacy), supplier_id: id('supplier', sup), supplier_sku: null,
    unit_cost_minor: pence(inv.unitCost), is_primary: true });
}

// ── fulfilment, delivery zones, fees, slot templates ────────────────────────
const HUB = id('location', 'HUB-1');
const ZONES = [
  { code: 'HATFIELD',  name: 'Hatfield',           label: 'Hatfield, AL10',  prefixes: ['AL10'], herts: true },
  { code: 'ST-ALBANS', name: 'St Albans',          label: 'St Albans, AL1',  prefixes: ['AL1'],  herts: true },
  { code: 'WELWYN',    name: 'Welwyn Garden City', label: 'Welwyn, AL8',     prefixes: ['AL8'],  herts: true },
  { code: 'HERTFORD',  name: 'Hertford',           label: 'Hertford, SG14',  prefixes: ['SG14'], herts: true },
  { code: 'N-LONDON',  name: 'North London',       label: 'London, N10',     prefixes: ['N10'],  herts: false },
];
const zoneRows = ZONES.map((z, i) => ({ id: id('zone', z.code), code: z.code, name: z.name, display_label: z.label, location_id: HUB,
  min_basket_minor: null, currency: 'GBP', is_popular: true, popular_position: i + 1, is_active: true, is_sample: false }));
const zonePrefixRows = ZONES.flatMap((z) => z.prefixes.map((p) => ({ postcode_prefix: p, zone_id: id('zone', z.code) })));
const feeRows = ZONES.flatMap((z) => [
  { id: id('fee', `${z.code}:0`), zone_id: id('zone', z.code), from_basket_minor: 0, fee_minor: 350, valid_from: SEED_AT },
  { id: id('fee', `${z.code}:5000`), zone_id: id('zone', z.code), from_basket_minor: 5000, fee_minor: 0, valid_from: SEED_AT },
]);
const WINDOWS = [['08:00', '10:00', 'Morning Fresh'], ['14:00', '16:00', 'Afternoon Standard'], ['18:00', '20:00', 'Evening Express']];
const templateRows = ZONES.flatMap((z) => [1, 2, 3, 4, 5, 6, 7].flatMap((wd) => WINDOWS.map(([s, e, label]) => ({
  id: id('slot_template', `${z.code}:${wd}:${s}`), zone_id: id('zone', z.code), weekday: wd, start_local: s, end_local: e,
  capacity: 20, cutoff_minutes_before: 120, service_label: label, fee_minor: null, is_active: true }))));

// ── promotions, coupons, loyalty ────────────────────────────────────────────
const PROMOS = [
  { key: 'FRESH20', name: 'FRESH20 — 20% off first organic basket', label: '20% OFF First Organic Basket', type: 'percent_off', percent_bp: 2000,
    min: 4000, first: true, status: 'active', desc: 'From the account vouchers list (min spend £40, first basket). Newsletter sign-ups receive this code.' },
  { key: 'VARAM10', name: 'VARAM10 — £10 off Autumn Harvest', label: '£10 OFF Autumn Harvest', type: 'fixed_off', amount: 1000, min: 5000, status: 'active',
    desc: 'From the account vouchers list (min spend £50).' },
  { key: 'HERTSFREE', name: 'HERTSFREE — free same-day delivery across Hertfordshire', label: 'Free Same-Day Delivery across Hertfordshire',
    type: 'free_delivery', min: 3000, status: 'active', hertsOnly: true, desc: 'From the account vouchers list (min spend £30, always active).' },
  { key: 'VARAM20', name: 'VARAM20 — 20% off (VIP weekend offer)', label: '20% off your next grocery delivery', type: 'percent_off', percent_bp: 2000,
    status: 'draft', desc: 'From the admin VIP message template ("valid this weekend only"); no dates given, so it is a draft until scheduled.' },
  { key: 'REWARD500', name: 'Loyalty reward — £5 off any basket over £40', label: '£5 Off Any Basket Over £40', type: 'fixed_off', amount: 500, min: 4000,
    status: 'active', noCoupon: true, desc: 'Issued as a single-use coupon when a customer redeems 500 points.' },
];
const promoRows = PROMOS.map((p) => ({ id: id('promotion', p.key), name: p.name, label: p.label, type: p.type, scope: 'basket',
  percent_bp: p.percent_bp ?? null, amount_minor: p.amount ?? null, buy_qty: null, pay_qty: null, bundle_price_minor: null,
  min_basket_minor: p.min ?? null, max_discount_minor: null, requires_coupon: true, first_order_only: !!p.first, members_only: false,
  stackable: false, priority: 100, starts_at: SEED_AT, ends_at: null, usage_limit_total: null,
  usage_limit_per_customer: p.first ? 1 : null, status: p.status, description: p.desc, is_sample: false }));
const couponRows = PROMOS.filter((p) => !p.noCoupon).map((p) => ({ id: id('coupon', p.key), promotion_id: id('promotion', p.key), code: p.key,
  max_uses: null, used_count: 0, customer_id: null, starts_at: null, ends_at: null, is_active: true }));
const promoZoneRows = PROMOS.filter((p) => p.hertsOnly).flatMap((p) => ZONES.filter((z) => z.herts).map((z) => ({ promotion_id: id('promotion', p.key), zone_id: id('zone', z.code) })));
const tierRows = [
  { code: 'member', name: 'Member', min_lifetime_points: 0, earn_multiplier_bp: 10000 },
  { code: 'gold',   name: 'Gold',   min_lifetime_points: 1000, earn_multiplier_bp: 10000 },
  { code: 'vip',    name: 'VIP',    min_lifetime_points: 2000, earn_multiplier_bp: 10000 },
];
const rewardRows = [{ id: id('reward', 'REWARD500'), title: '£5 Off Any Basket Over £40', points_cost: 500, promotion_id: id('promotion', 'REWARD500'), is_active: true }];
const tierFor = (lifetime) => [...tierRows].reverse().find((t) => lifetime >= t.min_lifetime_points).code;

// ── tax rates (UK; unconfirmed until the accountant signs off) ──────────────
const taxRows = [
  { id: id('tax', 'GB:zero_rated'), country_code: 'GB', tax_category_code: 'zero_rated', rate_bp: 0,    valid_from: '2011-01-04T00:00:00Z', note: 'UK zero rate — proposed, confirm with accountant' },
  { id: id('tax', 'GB:reduced'),    country_code: 'GB', tax_category_code: 'reduced',    rate_bp: 500,  valid_from: '2011-01-04T00:00:00Z', note: 'UK reduced rate — proposed, confirm with accountant' },
  { id: id('tax', 'GB:standard'),   country_code: 'GB', tax_category_code: 'standard',   rate_bp: 2000, valid_from: '2011-01-04T00:00:00Z', note: 'UK standard rate — proposed, confirm with accountant' },
];
const rateBp = { zero_rated: 0, reduced: 500, standard: 2000 };

// ── message templates (from the admin portal) ───────────────────────────────
const TEMPLATES = [
  { code: 'eta_update', name: 'Delivery ETA Update', marketing: false, subject: 'Delivery Van ETA Update — Varam Foods',
    body: 'Hello {{customer_name}}, our Hatfield delivery van is approximately 3 stops away and will arrive between 6:00 PM – 7:00 PM. Thank you!' },
  { code: 'sub_query', name: 'Substitution Permission Query', marketing: false, subject: 'Out-of-Stock Substitution Check',
    body: 'Hello {{customer_name}}, one item in your order is currently unavailable. May we substitute with our organic equivalent at no extra charge?' },
  { code: 'vip_offer', name: 'VIP Customer Loyalty Offer', marketing: true, subject: 'Special VIP Offer from Varam Foods',
    body: 'Hello {{customer_name}}, enjoy 20% off your next grocery delivery with code VARAM20. Valid this weekend only!' },
];
const templateMsgRows = TEMPLATES.flatMap((t) => ['email', 'sms', 'whatsapp'].map((ch) => ({ code: t.code, channel: ch, locale: 'en-GB',
  name: t.name, is_marketing: t.marketing, subject: ch === 'email' ? t.subject : null, body: t.body })));

// ═══ SAMPLE DATA (is_sample = true; purge with app.purge_sample_data()) ═════
const sampleEmail = (name) => `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@example.com`;
// Some mock orders belong to people missing from the mock customer list: derive them from the order.
const mockCustomers = [...A.initialCustomers];
for (const o of A.initialOrders) {
  if (mockCustomers.some((c) => c.name === o.customerName)) continue;
  const parts = o.address.split(',').map((s) => s.trim()).filter((s) => s.toUpperCase() !== o.customerPostcode.toUpperCase());
  mockCustomers.push({ id: `ORDER-${o.id}`, name: o.customerName, address: parts.join(', '), postcode: o.customerPostcode,
    status: 'active', loyaltyCoins: 0, notes: null });
  warnings.push(`customer "${o.customerName}" exists only in order ${o.id} — created from the order details`);
}
const customers = mockCustomers.map((c, i) => {
  const [first, ...rest] = c.name.split(' ');
  const [line1, ...cityParts] = c.address.split(',').map((s) => s.trim());
  return { mock: c, id: id('customer', c.id), first, last: rest.join(' '), email: sampleEmail(c.name),
    phone: `+4477009000${String(i + 1).padStart(2, '0')}`, line1, city: cityParts.join(', '), postcode: c.postcode };
});
const customerByName = new Map(customers.map((c) => [c.mock.name, c]));
const customerRows = customers.map((c) => ({ id: c.id, user_id: null, email: c.email, first_name: c.first, last_name: c.last,
  phone_e164: c.phone, status: c.mock.status, internal_notes: c.mock.notes ?? null, member_since: SEED_AT, is_sample: true }));
const prefRows = customers.map((c) => ({ customer_id: c.id }));
const addressRows = customers.map((c) => ({ id: id('address', c.mock.id), customer_id: c.id, label: 'Home', full_name: c.mock.name,
  line1: c.line1, line2: null, city: c.city, postcode: c.postcode, country_code: 'GB', phone_e164: null, delivery_notes: null, is_default: true }));
const loyaltyRows = customers.map((c) => ({ customer_id: c.id, points_balance: c.mock.loyaltyCoins, lifetime_points: c.mock.loyaltyCoins,
  tier_code: tierFor(c.mock.loyaltyCoins) }));
const loyaltyTx = customers.filter((c) => c.mock.loyaltyCoins > 0).map((c) => ({ customer_id: c.id, points: c.mock.loyaltyCoins,
  reason: 'opening_balance', note: 'Sample opening balance from the frontend mock', created_at: SEED_AT }));

const ROLE = { 'Store Manager': 'store_manager', 'Dispatch Lead': 'dispatch_lead', 'Warehouse Picker': 'warehouse_picker', 'Customer Support': 'customer_support' };
const staffRows = A.initialStaff.map((s) => ({ id: id('staff', s.id), user_id: null, email: sampleEmail(s.name), full_name: s.name,
  role_code: ROLE[s.role], status: s.status, is_sample: true }));

const VANS = [
  { code: '#04', name: 'Hatfield Express',  label: 'Van #04 (Hatfield Express)',  fridge: true },
  { code: '#02', name: 'St Albans Chilled', label: 'Van #02 (St Albans Chilled)', fridge: true },
  { code: '#01', name: 'Welwyn Hub',        label: 'Van #01 (Welwyn Hub)',        fridge: null },
];
const vanRows = VANS.map((v) => ({ id: id('van', v.code), code: v.code, name: v.name, is_refrigerated: v.fridge, location_id: HUB, is_active: true, is_sample: true }));
const vanByLabel = new Map(VANS.map((v) => [v.label, id('van', v.code)]));
const driverNames = [...new Set(A.initialOrders.map((o) => o.assignedDriver).filter((d) => d && d !== 'Unassigned'))];
const driverRows = driverNames.map((d) => ({ id: id('driver', d), display_name: d, phone_e164: null, staff_id: null, is_active: true, is_sample: true }));

// Stock: mock inventory where it exists, otherwise 50 units (50 kg for weighed items). Sample.
const stockRows = [], movementRows = [];
for (const [legacy, info] of productIndex) {
  const inv = A.initialInventory.find((x) => (INVENTORY_TO_PRODUCT[x.id] ?? x.id) === legacy);
  const weight = SOLD_BY_WEIGHT.has(legacy);
  const onHand = inv ? inv.currentStock : weight ? 50000 : 50;
  stockRows.push({ location_id: HUB, product_id: info.id, on_hand: onHand, reserved: 0, reorder_point: inv ? inv.reorderPoint : weight ? 10000 : 10,
    optimal_stock: inv ? inv.optimalStock : null, unit_cost_minor: inv ? pence(inv.unitCost) : null, is_sample: true });
  if (onHand > 0) movementRows.push({ location_id: HUB, product_id: info.id, delta: onHand, reason: 'seed', note: 'Sample opening stock', created_at: SEED_AT });
}

// Orders
const ORDER_LINE_PRODUCT = { 'Basmati Rice Aged 5kg': 'prod-6', 'Pure Sunflower Oil 1L': 'prod-7', 'Fresh Baby Spinach': 'prod-8',
  'Prime British Chicken Breast': 'prod-9', 'California Premium Almonds': 'prod-10' };
const STATUS = { pending: 'placed', packing: 'picking', in_transit: 'out_for_delivery', delivered: 'delivered', cancelled: 'cancelled' };
const PATH = ['placed', 'picking', 'picked', 'paid', 'out_for_delivery', 'delivered'];
const MINUTES = { placed: 0, picking: 30, picked: 60, paid: 61, out_for_delivery: 90, delivered: 150, cancelled: 60 };
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
function londonTime(date, time) {
  const [d, mon, y] = date.split(' ');
  const m = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  let h = Number(m[1]);
  if (m[3]?.toUpperCase() === 'PM' && h < 12) h += 12;
  if (m[3]?.toUpperCase() === 'AM' && h === 12) h = 0;
  const offset = MONTHS[mon] >= 4 && MONTHS[mon] <= 10 ? '+01:00' : '+00:00';   // Oct 2026 dates are all BST (before 25 Oct)
  return new Date(`${y}-${String(MONTHS[mon]).padStart(2, '0')}-${d.padStart(2, '0')}T${String(h).padStart(2, '0')}:${m[2]}:00${offset}`);
}
const addMin = (t, mins) => new Date(t.getTime() + mins * 60000).toISOString();
function paymentSnapshot(s) {
  if (/apple pay/i.test(s)) return { method: 'apple_pay', brand: null, last4: null };
  if (/google pay/i.test(s)) return { method: 'google_pay', brand: null, last4: null };
  const last4 = s.match(/(\d{4})\)?\s*$/)?.[1] ?? null;
  return { method: 'card', brand: /visa/i.test(s) ? 'visa' : /master/i.test(s) ? 'mastercard' : null, last4 };
}
const orderRows = [], lineRows = [], historyRows = [], paymentRows = [];
for (const o of A.initialOrders) {
  const cust = customerByName.get(o.customerName);
  if (!cust) throw new Error(`order ${o.id}: unknown customer ${o.customerName}`);
  const oid = id('order', o.id);
  const status = STATUS[o.status];
  const placed = londonTime(o.date, o.time);
  const captured = ['out_for_delivery', 'delivered'].includes(status);
  const zone = ZONES.find((z) => z.prefixes.some((p) => o.customerPostcode.startsWith(p + ' ')));
  let items = 0, vat = 0;
  o.items.forEach((it, k) => {
    const legacy = ORDER_LINE_PRODUCT[it.productName];
    if (!legacy) throw new Error(`order ${o.id}: unmapped item ${it.productName}`);
    const pr = productIndex.get(legacy);
    const unit = pence(it.price);
    if (unit !== pr.price) warnings.push(`order ${o.id} line "${it.productName}" price ${unit} differs from catalogue ${pr.price}`);
    const gross = unit * it.quantity;
    const lineVat = vatFromGross(gross, rateBp[pr.tax]);
    items += gross; vat += lineVat;
    const picked = captured || status === 'picked' || status === 'paid';
    lineRows.push({ id: id('order_line', `${o.id}:${k + 1}`), order_id: oid, line_no: k + 1, line_type: 'product', product_id: pr.id,
      name_snapshot: pr.name, sku_snapshot: pr.sku, pack_size_snapshot: pr.unit, sale_unit: 'each', quantity_ordered: it.quantity,
      weight_ordered_grams: null, quantity_picked: picked ? it.quantity : null, unit_price_minor: unit, est_gross_minor: gross,
      est_discount_minor: 0, final_gross_minor: picked ? gross : null, final_discount_minor: picked ? 0 : null,
      tax_category_code: pr.tax, vat_rate_bp: rateBp[pr.tax], est_vat_minor: lineVat, final_vat_minor: picked ? lineVat : null,
      substitution_allowed: o.isSubstituteAllowed, pick_status: picked ? 'picked' : 'pending' });
  });
  const fee = items >= 5000 ? 0 : 350;
  const total = items + fee;
  const reached = status === 'cancelled' ? ['placed', 'cancelled'] : PATH.slice(0, PATH.indexOf(status) + 1);
  const at = (s) => (reached.includes(s) ? addMin(placed, MINUTES[s]) : null);
  orderRows.push({ id: oid, number: o.id, customer_id: cust.id, legal_entity_id: null, location_id: HUB, zone_id: zone ? id('zone', zone.code) : null,
    slot_id: null, status, currency: 'GBP', contact_email: cust.email, contact_phone_e164: cust.phone,
    address_snapshot: { fullName: o.customerName, line1: cust.line1, line2: null, city: cust.city, postcode: o.customerPostcode, countryCode: 'GB' },
    delivery_notes: o.notes ?? null, substitution_default: o.isSubstituteAllowed ? 'allow' : 'dont_allow',
    est_items_minor: items, est_discount_minor: 0, est_deposit_minor: 0, delivery_fee_minor: fee, est_total_minor: total, est_vat_minor: vat,
    final_items_minor: captured ? items : null, final_discount_minor: captured ? 0 : null, final_deposit_minor: captured ? 0 : null,
    final_total_minor: captured ? total : null, final_vat_minor: captured ? vat : null,
    authorised_minor: status === 'cancelled' ? total : total, captured_minor: captured ? total : null, refunded_minor: 0,
    van_id: vanByLabel.get(o.assignedVan) ?? null, driver_id: driverNames.includes(o.assignedDriver) ? id('driver', o.assignedDriver) : null,
    placed_at: at('placed'), picked_at: at('picked'), paid_at: at('paid'), dispatched_at: at('out_for_delivery'), delivered_at: at('delivered'),
    cancelled_at: at('cancelled'), cancel_reason: status === 'cancelled' ? (o.notes ?? 'Cancelled') : null, created_at: placed.toISOString(), is_sample: true });
  let prev = 'pending_payment';
  historyRows.push({ order_id: oid, from_status: null, to_status: 'pending_payment', actor_type: 'seed', reason: 'Sample order from the frontend mock', created_at: addMin(placed, -1) });
  for (const s of reached) {
    historyRows.push({ order_id: oid, from_status: prev, to_status: s, actor_type: 'seed', reason: null, created_at: at(s) });
    prev = s;
  }
  paymentRows.push({ id: id('payment', o.id), order_id: oid, provider: 'sample', provider_intent_ref: null, kind: 'authorise_now',
    status: status === 'cancelled' ? 'voided' : captured ? 'captured' : 'authorised', amount_authorised_minor: total,
    amount_captured_minor: captured ? total : null, currency: 'GBP', payment_method_snapshot: paymentSnapshot(o.paymentMethod),
    authorised_at: at('placed'), captured_at: captured ? at('paid') : null });
}

const parseAgo = (s) => { const m = s.match(/(\d+)\s*(day|week|month)/); const n = m ? Number(m[1]) : 0; const unit = m?.[2];
  return new Date(new Date(SEED_AT).getTime() - n * (unit === 'week' ? 7 : unit === 'month' ? 30 : 1) * 86400000).toISOString(); };
const reviewRows = customerReviews.map((r) => ({ id: id('review', r.id), product_id: null, customer_id: null, order_id: null,
  display_name: r.name, location_label: r.location, avatar_url: r.avatar, rating: r.rating, body: r.text, is_verified: !!r.verified,
  status: 'approved', is_sample: true, created_at: parseAgo(r.date) }));

// ── write ───────────────────────────────────────────────────────────────────
const header = (title) => `-- ${title}\n-- GENERATED by scripts/build-seed.mjs from the frontend mocks. Do not edit by hand.\n\n`;
const live = header('Live catalogue + business configuration') +
  insert('app.tax_rates', taxRows) +
  insert('app.fulfilment_locations', [{ id: HUB, code: 'HUB-1', name: 'Hertfordshire hub (address to confirm)', type: 'warehouse', address: {}, postcode: null, is_sample: false }]) +
  insert('app.categories', categoryRows) + insert('app.categories', childRows) +
  insert('app.category_translations', [...categoryTr, ...childTr]) +
  insert('app.brands', brandRows) +
  insert('app.products', productRows) +
  insert('app.product_translations', productTr) +
  insert('app.product_categories', productCat) +
  insert('app.product_images', productImg) +
  insert('app.product_prices', priceRows) +
  insert('app.product_food_info', foodRows) +
  insert('app.collections', collectionRows) +
  insert('app.collection_items', collectionItems) +
  insert('app.suppliers', supplierRows) +
  insert('app.product_suppliers', productSupplierRows) +
  insert('app.delivery_zones', zoneRows) +
  insert('app.delivery_zone_postcodes', zonePrefixRows) +
  insert('app.delivery_fee_rules', feeRows) +
  insert('app.slot_templates', templateRows) +
  insert('app.loyalty_tiers', tierRows) +
  insert('app.promotions', promoRows) +
  insert('app.coupons', couponRows) +
  insert('app.promotion_zones', promoZoneRows) +
  insert('app.loyalty_rewards', rewardRows) +
  insert('app.message_templates', templateMsgRows);

const sample = header('SAMPLE people, orders, reviews, fleet and stock (is_sample = true)') +
  insert('app.customers', customerRows) +
  insert('app.customer_preferences', prefRows) +
  insert('app.addresses', addressRows) +
  insert('app.loyalty_accounts', loyaltyRows) +
  insert('app.loyalty_transactions', loyaltyTx, '') .replace(/\non conflict ;\n/, ';\n') +
  insert('app.staff', staffRows) +
  insert('app.vans', vanRows) +
  insert('app.drivers', driverRows) +
  insert('app.stock_levels', stockRows) +
  insert('app.stock_movements', movementRows, '').replace(/\non conflict ;\n/, ';\n') +
  insert('app.orders', orderRows) +
  insert('app.order_lines', lineRows) +
  insert('app.order_status_history', historyRows, '').replace(/\non conflict ;\n/, ';\n') +
  insert('app.payments', paymentRows) +
  insert('app.reviews', reviewRows);

const counts = { categories: categoryRows.length, subcategories: childRows.length, brands: brandRows.length, products: productRows.length,
  images: productImg.length, shelves: collectionRows.length, suppliers: supplierRows.length, zones: zoneRows.length, slotTemplates: templateRows.length,
  promotions: promoRows.length, coupons: couponRows.length, customers: customerRows.length, staff: staffRows.length, orders: orderRows.length,
  orderLines: lineRows.length, reviews: reviewRows.length, stockRows: stockRows.length };
console.log(JSON.stringify(counts));
console.log('Brand links:', productRows.filter((p) => p.brand_id).map((p) => `${p.legacy_ref}→${allBrands.find((b) => id('brand', b.id) === p.brand_id).name}`).join(', '));
for (const w of warnings) console.log('! ' + w);
if (!dryRun) {
  const dir = path.join(BACKEND_DIR, 'db', 'seed');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, '0001_live_catalogue_config.sql'), live);
  writeFileSync(path.join(dir, '0002_sample_people_orders.sql'), sample);
  console.log('Wrote db/seed/0001_live_catalogue_config.sql and db/seed/0002_sample_people_orders.sql');
}
