import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAction, useAdminQuery, dateTime, pence, errorText, mediaUrl } from './lib';
import {
  Badge, Button, Card, Checkbox, ConfirmButton, Drawer, ErrorState, Field, Loading, MoneyInput, Notice, NumberInput, SampleTag, Select, Table, Tabs, Td, TextArea, TextInput, Th, Thumb,
} from './ui';
import { MediaPicker } from './pickers';
import { useLookups, type Lookups } from './lookups';
import { AdjustStock, StockHistory, StockLevels } from './StockForms';
import { NewProductWizard } from './NewProduct';

// Add or edit one product: details, price, food information, photos, stock & suppliers.

interface FoodInfo {
  basis: 'per_100g' | 'per_100ml' | null; energyKj: number | null; energyKcal: number | null; fat: number | null; saturates: number | null; carbohydrate: number | null;
  sugars: number | null; fibre: number | null; protein: number | null; salt: number | null; fboName: string | null; fboAddress: string | null; countryOfOrigin: string | null;
  allergensReviewed: boolean; reviewedAt: string | null; reviewedBy: string | null;
}
export interface Product {
  id: string; sku: string; name: string; slug: string; status: 'draft' | 'active' | 'archived'; badge: string | null; description: string | null;
  brandId: string | null; primaryCategoryId: string | null; categoryIds: string[]; packSize: string | null; saleUnit: 'each' | 'weight';
  estimatedWeightGrams: number | null; minWeightGrams: number | null; weightStepGrams: number | null; netQuantity: number | null; netQuantityUnit: string | null;
  origin: string | null; storage: string | null; sourcing: string | null; ingredients: string | null; maxPerOrder: number | null; featuredRank: number | null;
  isOrganic: boolean; isFood: boolean; isPerishable: boolean; isReturnable: boolean; taxCategoryCode: string | null; taxCategoryReviewed: boolean;
  ageRestrictionCode: string | null; depositSchemeCode: string | null; priceMinor: number | null; rrpMinor: number | null; isSample: boolean;
  images: Array<{ path: string; url: string; alt: string; position: number }>;
  stock: Array<{ locationId: string; location: string; onHand: number; reserved: number; available: number; reorderPoint: number | null; optimalStock: number | null; unitCostMinor: number | null }>;
  suppliers: Array<{ supplierId: string; name: string; isPrimary: boolean; supplierSku: string | null; unitCostMinor: number | null }>;
  priceHistory: Array<{ from: string; to: string | null; amountMinor: number; reason: string | null; setBy: string | null }>;
  foodInfo: FoodInfo | null; contains: string[]; mayContain: string[]; foodInfoComplete: boolean; collections: string[];
  storefrontUrl: string; rating: { count: number; average: number | null };
}

type Details = Pick<Product, 'name' | 'sku' | 'brandId' | 'primaryCategoryId' | 'categoryIds' | 'packSize' | 'saleUnit' | 'estimatedWeightGrams' | 'minWeightGrams' | 'weightStepGrams'
  | 'netQuantity' | 'netQuantityUnit' | 'description' | 'badge' | 'origin' | 'storage' | 'sourcing' | 'maxPerOrder' | 'featuredRank' | 'isOrganic' | 'isFood' | 'isPerishable'
  | 'isReturnable' | 'taxCategoryCode' | 'taxCategoryReviewed' | 'ageRestrictionCode' | 'depositSchemeCode'>;

const BLANK: Details = {
  name: '', sku: '', brandId: null, primaryCategoryId: null, categoryIds: [], packSize: '', saleUnit: 'each', estimatedWeightGrams: null, minWeightGrams: null, weightStepGrams: null,
  netQuantity: null, netQuantityUnit: null, description: '', badge: '', origin: '', storage: '', sourcing: '', maxPerOrder: null, featuredRank: null, isOrganic: false, isFood: true,
  isPerishable: false, isReturnable: true, taxCategoryCode: 'zero_rated', taxCategoryReviewed: false, ageRestrictionCode: null, depositSchemeCode: null,
};
const pickDetails = (p: Product): Details => Object.fromEntries(Object.keys(BLANK).map((k) => [k, p[k as keyof Product]])) as Details;

export const ProductEditor: React.FC<{ productId: string | null; onClose: () => void; onCreated: (id: string) => void }> = ({ productId, onClose, onCreated }) => {
  const lookups = useLookups();
  const { data: p, isLoading, error, refetch } = useAdminQuery<Product>('admin_get_product', { p_id: productId }, { enabled: !!productId });
  const { hasPermission } = useAuth();
  const { run, busy } = useAction();
  const [tab, setTab] = useState('details');
  const canEdit = hasPermission('inventory');

  // Adding a product is a numbered, one-question-at-a-time flow: category → brand → how it is sold → name → price → photo.
  if (!productId) return <NewProductWizard onClose={onClose} onCreated={onCreated} />;

  const status = p?.status;
  return (
    <Drawer
      open
      onClose={onClose}
      wide
      title={p ? <span className="flex flex-wrap items-center gap-2">{p.name} <SampleTag show={p.isSample} /></span> : 'Product'}
      subtitle={p ? <span className="flex flex-wrap items-center gap-2">
        <Badge tone={status === 'active' ? 'green' : status === 'draft' ? 'grey' : 'red'}>{status === 'active' ? 'On sale' : status === 'draft' ? 'Draft — not in the shop' : 'Archived'}</Badge>
        <span>{p.sku}</span>
        {status === 'active' && <a href={p.storefrontUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">View in shop <ExternalLink className="w-3 h-3" /></a>}
      </span> : undefined}
      footer={p && canEdit && (
        <>
          {status === 'archived' ? (
            <Button loading={busy} onClick={() => void run('admin_archive_product', { p_id: p.id, p_archive: false }, { success: 'Brought back as a draft' })}>Bring back (as draft)</Button>
          ) : (
            <ConfirmButton variant="danger" danger title={`Archive ${p.name}?`} confirmLabel="Archive" text="It disappears from the shop and from lists. Past orders keep it. You can bring it back later."
              onConfirm={() => run('admin_archive_product', { p_id: p.id, p_archive: true }, { success: 'Archived' })}>Archive</ConfirmButton>
          )}
          {status === 'active' && <Button loading={busy} onClick={() => void run('admin_save_product', { p: { id: p.id, status: 'draft' } }, { success: 'Taken off sale (now a draft)' })}>Take off sale</Button>}
          {status === 'draft' && <Button variant="primary" loading={busy} onClick={() => void run('admin_save_product', { p: { id: p.id, status: 'active' } }, { success: 'On sale in the shop' })}>Put on sale</Button>}
        </>
      )}
    >
      {isLoading || !lookups.data ? <Loading /> : error || !p ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : (
        <>
          {status === 'draft' && p.priceMinor == null && <Notice tone="warning">Add a price (Price tab) before putting this on sale.</Notice>}
          {p.isFood && !p.foodInfoComplete && <Notice tone="warning">Food information is incomplete. UK law requires ingredients, allergens and nutrition for food sold online (Food information tab).</Notice>}
          <Tabs value={tab} onChange={setTab} tabs={[
            { value: 'details', label: 'Details' }, { value: 'price', label: 'Price' }, { value: 'food', label: 'Food information', hidden: !p.isFood },
            { value: 'photos', label: `Photos (${p.images.length})` }, { value: 'stock', label: 'Stock & suppliers' },
          ]} />
          {tab === 'details' && <DetailsForm key={p.id} lookups={lookups.data} initial={pickDetails(p)} canEdit={canEdit}
            onSave={async (d) => { await run('admin_save_product', { p: { id: p.id, ...d } }, { success: 'Saved', refresh: ['admin_get_product', 'admin_list_products'] }); }} collections={p.collections} />}
          {tab === 'price' && <PriceTab p={p} canEdit={hasPermission('pricing')} />}
          {tab === 'food' && <FoodTab p={p} lookups={lookups.data} canEdit={canEdit} />}
          {tab === 'photos' && <PhotosTab p={p} canEdit={canEdit} />}
          {tab === 'stock' && <StockTab p={p} canEdit={canEdit} />}
        </>
      )}
    </Drawer>
  );
};

// ── details ─────────────────────────────────────────────────────────────────────────────────────
const DetailsForm: React.FC<{ lookups: Lookups; initial: Details; isNew?: boolean; canEdit: boolean; onSave: (d: Details) => Promise<void>; collections?: string[] }> = ({
  lookups, initial, isNew, canEdit, onSave, collections,
}) => {
  const [d, setD] = useState<Details>(initial);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const set = <K extends keyof Details>(k: K, v: Details[K]) => { setD((x) => ({ ...x, [k]: v })); setDirty(true); };
  const cats = lookups.categories.map((c) => ({ value: c.id, label: c.path + (c.isActive ? '' : ' (hidden)') }));
  const missing = !d.name.trim() || !d.sku.trim() || !d.primaryCategoryId || !d.taxCategoryCode || !d.packSize?.trim()
    || (d.saleUnit === 'weight' && (!d.estimatedWeightGrams || !d.minWeightGrams || !d.weightStepGrams));
  const save = async () => {
    setSaving(true);
    try {
      await onSave({ ...d, sku: d.sku.trim().toUpperCase(), netQuantityUnit: d.netQuantity ? d.netQuantityUnit ?? 'g' : null, netQuantity: d.netQuantity || null,
        isReturnable: d.isPerishable ? false : d.isReturnable });
      setDirty(false);
    } finally { setSaving(false); }
  };
  return (
    <div className="space-y-4">
      <Card title="What it is">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Product name" className="sm:col-span-2"><TextInput value={d.name} onChange={(v) => set('name', v)} disabled={!canEdit} placeholder="e.g. Aged Basmati Rice" /></Field>
          <Field label="SKU (your stock code)" help="Capital letters, numbers and dashes, e.g. VRM-RCE-05K. Must be unique."><TextInput value={d.sku} onChange={(v) => set('sku', v.toUpperCase())} disabled={!canEdit} /></Field>
          <Field label="Pack size" help="Shown under the name, e.g. 5 kg, 12 pack, 500 ml."><TextInput value={d.packSize} onChange={(v) => set('packSize', v)} disabled={!canEdit} /></Field>
          <Field label="Brand" optional><Select value={d.brandId} onChange={(v) => set('brandId', v || null)} placeholder="No brand" options={lookups.brands.map((b) => ({ value: b.id, label: b.name }))} disabled={!canEdit} /></Field>
          <Field label="Main category"><Select value={d.primaryCategoryId} onChange={(v) => set('primaryCategoryId', v || null)} placeholder="Choose…" options={cats} disabled={!canEdit} /></Field>
          <Field label="Also show it in" optional help="Extra categories where shoppers can find it." className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {d.categoryIds.filter((id) => id !== d.primaryCategoryId).map((id) => (
                <span key={id} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs">
                  {lookups.categories.find((c) => c.id === id)?.path ?? 'Unknown'}
                  {canEdit && <button type="button" aria-label="Remove" className="cursor-pointer" onClick={() => set('categoryIds', d.categoryIds.filter((x) => x !== id))}>×</button>}
                </span>
              ))}
            </div>
            {canEdit && <Select value="" onChange={(v) => v && !d.categoryIds.includes(v) && set('categoryIds', [...d.categoryIds, v])} placeholder="Add a category…" options={cats.filter((c) => c.value !== d.primaryCategoryId && !d.categoryIds.includes(c.value))} />}
          </Field>
          <Field label="Description" optional className="sm:col-span-2"><TextArea rows={4} value={d.description} onChange={(v) => set('description', v)} disabled={!canEdit} /></Field>
        </div>
      </Card>

      <Card title="How it is sold">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Sold by"><Select value={d.saleUnit} onChange={(v) => set('saleUnit', v as 'each' | 'weight')} disabled={!canEdit}
            options={[{ value: 'each', label: 'Each (a fixed pack)' }, { value: 'weight', label: 'Weight (price per kg, weighed when picked)' }]} /></Field>
          <Field label="Most per order" optional help="Leave empty for the shop-wide limit."><NumberInput value={d.maxPerOrder} onChange={(v) => set('maxPerOrder', v)} min={1} disabled={!canEdit} /></Field>
          {d.saleUnit === 'weight' && (
            <>
              <Field label="Typical weight" help="Used for the estimated price."><NumberInput value={d.estimatedWeightGrams} onChange={(v) => set('estimatedWeightGrams', v)} suffix="grams" disabled={!canEdit} /></Field>
              <Field label="Smallest amount a shopper can order"><NumberInput value={d.minWeightGrams} onChange={(v) => set('minWeightGrams', v)} suffix="grams" disabled={!canEdit} /></Field>
              <Field label="Shoppers choose in steps of"><NumberInput value={d.weightStepGrams} onChange={(v) => set('weightStepGrams', v)} suffix="grams" disabled={!canEdit} /></Field>
            </>
          )}
          <Field label="Contents for the unit price" optional help="e.g. 5 kg → shows the price per kg.">
            <div className="flex gap-2">
              <NumberInput value={d.netQuantity} onChange={(v) => set('netQuantity', v)} decimals className="flex-1" disabled={!canEdit} />
              <Select value={d.netQuantityUnit ?? 'g'} onChange={(v) => set('netQuantityUnit', v)} className="w-28" disabled={!canEdit}
                options={[{ value: 'g', label: 'g' }, { value: 'kg', label: 'kg' }, { value: 'ml', label: 'ml' }, { value: 'l', label: 'litres' }, { value: 'piece', label: 'pieces' }]} />
            </div>
          </Field>
          <Field label="Label on the photo" optional help="Short, e.g. New, Best seller (40 characters)."><TextInput value={d.badge} maxLength={40} onChange={(v) => set('badge', v)} disabled={!canEdit} /></Field>
          <Field label="Position in “Featured” order" optional help="1 shows first. Empty = after the numbered ones."><NumberInput value={d.featuredRank} onChange={(v) => set('featuredRank', v)} min={1} disabled={!canEdit} /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <Checkbox checked={d.isFood} onChange={(v) => set('isFood', v)} disabled={!canEdit} label="Food or drink" description="Needs food information by law." />
          <Checkbox checked={d.isOrganic} onChange={(v) => set('isOrganic', v)} disabled={!canEdit} label="Organic" description="Only if certified." />
          <Checkbox checked={d.isPerishable} onChange={(v) => set('isPerishable', v)} disabled={!canEdit} label="Perishable (fresh, chilled, frozen)" description="Cannot be returned for change of mind." />
          <Checkbox checked={d.isPerishable ? false : d.isReturnable} onChange={(v) => set('isReturnable', v)} disabled={!canEdit || d.isPerishable} label="Can be returned" />
        </div>
      </Card>

      <Card title="Tax and legal">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="VAT rate" help={lookups.taxCategories.find((t) => t.code === d.taxCategoryCode)?.description}>
            <Select value={d.taxCategoryCode} onChange={(v) => set('taxCategoryCode', v)} disabled={!canEdit}
              options={lookups.taxCategories.map((t) => ({ value: t.code, label: `${t.name} (${t.rateBp / 100} %)` }))} />
          </Field>
          <Field label="Age limit" optional>
            <Select value={d.ageRestrictionCode} onChange={(v) => set('ageRestrictionCode', v || null)} placeholder="None" disabled={!canEdit}
              options={lookups.ageRestrictions.map((a) => ({ value: a.code, label: `${a.name}${a.minAge ? ` (${a.minAge}+)` : ''}` }))} />
          </Field>
          {lookups.depositSchemes.length > 0 && (
            <Field label="Bottle/can deposit" optional>
              <Select value={d.depositSchemeCode} onChange={(v) => set('depositSchemeCode', v || null)} placeholder="None" disabled={!canEdit} options={lookups.depositSchemes.map((x) => ({ value: x.code, label: x.name }))} />
            </Field>
          )}
          <div className="sm:col-span-2"><Checkbox checked={d.taxCategoryReviewed} onChange={(v) => set('taxCategoryReviewed', v)} disabled={!canEdit} label="I have checked the VAT rate for this product" description="Your name and the date are recorded." /></div>
        </div>
      </Card>

      <Card title="Shown on the product page" description="Optional extra information for shoppers.">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Origin" optional><TextInput value={d.origin} onChange={(v) => set('origin', v)} placeholder="e.g. Punjab, India" disabled={!canEdit} /></Field>
          <Field label="Storage" optional><TextInput value={d.storage} onChange={(v) => set('storage', v)} placeholder="e.g. Keep in a cool, dry place" disabled={!canEdit} /></Field>
          <Field label="Where it comes from" optional className="sm:col-span-2"><TextArea rows={3} value={d.sourcing} onChange={(v) => set('sourcing', v)} disabled={!canEdit} /></Field>
        </div>
        {collections && collections.length > 0 && <p className="text-xs text-slate-500 mt-3">On homepage shelves: {collections.join(', ')} (change in Categories &amp; brands → Shelves).</p>}
      </Card>

      {canEdit && (
        <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-[#F8FAFC]/95 border-t border-[#E2E8F0] flex justify-end gap-2">
          {missing && <span className="text-xs text-slate-500 self-center mr-auto">Name, SKU, pack size, main category and VAT rate are needed{d.saleUnit === 'weight' ? ', plus the three weights' : ''}.</span>}
          <Button variant="primary" loading={saving} disabled={missing || (!isNew && !dirty)} onClick={() => void save()}>{isNew ? 'Create product' : 'Save details'}</Button>
        </div>
      )}
    </div>
  );
};

// ── price ───────────────────────────────────────────────────────────────────────────────────────
const PriceTab: React.FC<{ p: Product; canEdit: boolean }> = ({ p, canEdit }) => {
  const { run, busy } = useAction();
  const [price, setPrice] = useState<number | null>(null);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [from, setFrom] = useState('');
  const [reason, setReason] = useState('');
  const [rrp, setRrp] = useState<number | null>(p.rrpMinor);
  const per = p.saleUnit === 'weight' ? ' per kg' : '';
  const change = async () => {
    const ok = await run('admin_set_price', { p_product_id: p.id, p_price_minor: price, p_effective_from: when === 'later' && from ? new Date(from).toISOString() : null, p_reason: reason || null },
      { success: when === 'now' ? 'Price changed' : 'Price change scheduled', refresh: ['admin_get_product', 'admin_list_products'] });
    if (ok !== undefined) { setPrice(null); setReason(''); setFrom(''); }
  };
  return (
    <div className="space-y-4">
      <Card title="Price now">
        <div className="text-3xl font-bold tabular-nums">{p.priceMinor == null ? 'No price yet' : `${pence(p.priceMinor)}${per}`}</div>
        {!canEdit && <p className="text-xs text-slate-500 mt-1">Changing prices needs the pricing permission.</p>}
      </Card>
      {canEdit && (
        <Card title="Change the price" description="Old prices are kept: the shop uses them for “was” prices, which by law must have been charged for real.">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={`New price${per}`}><MoneyInput value={price} onChange={setPrice} /></Field>
            <Field label="When">
              <Select value={when} onChange={(v) => setWhen(v as 'now' | 'later')} options={[{ value: 'now', label: 'Straight away' }, { value: 'later', label: 'From a date and time' }]} />
            </Field>
            {when === 'later' && <Field label="Starts"><TextInput type="datetime-local" value={from} onChange={setFrom} /></Field>}
            <Field label="Reason" optional><TextInput value={reason} onChange={setReason} placeholder="e.g. supplier price rise, weekend offer" /></Field>
          </div>
          <div className="flex justify-end mt-4"><Button variant="primary" loading={busy} disabled={!price || (when === 'later' && !from)} onClick={() => void change()}>{when === 'now' ? 'Change price' : 'Schedule price'}</Button></div>
        </Card>
      )}
      {canEdit && (
        <Card title="Recommended retail price (RRP)" description="Optional. The maker’s suggested price, shown for comparison.">
          <div className="flex gap-2 items-end">
            <Field label="RRP" className="w-48"><MoneyInput value={rrp} onChange={setRrp} /></Field>
            <Button loading={busy} disabled={rrp === p.rrpMinor} onClick={() => void run('admin_save_product', { p: { id: p.id, rrpMinor: rrp } }, { success: 'Saved', refresh: ['admin_get_product'] })}>Save RRP</Button>
          </div>
        </Card>
      )}
      <Card title="Price history" padded={false}>
        <Table>
          <thead><tr><Th>From</Th><Th>Until</Th><Th className="text-right">Price</Th><Th>Reason</Th><Th>By</Th></tr></thead>
          <tbody>
            {p.priceHistory.map((h, i) => (
              <tr key={i}>
                <Td className="whitespace-nowrap">{dateTime(h.from)}{new Date(h.from) > new Date() && <> <Badge tone="blue">scheduled</Badge></>}</Td>
                <Td className="whitespace-nowrap text-slate-500">{h.to ? dateTime(h.to) : 'now'}</Td>
                <Td className="text-right tabular-nums font-semibold">{pence(h.amountMinor)}</Td>
                <Td>{h.reason ?? '—'}</Td>
                <Td className="text-slate-500">{h.setBy ?? '—'}</Td>
              </tr>
            ))}
            {!p.priceHistory.length && <tr><Td colSpan={5} className="text-slate-500">No prices yet.</Td></tr>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
};

// ── food information ────────────────────────────────────────────────────────────────────────────
const NUTRIENTS: Array<[keyof FoodInfo, string, string]> = [
  ['energyKj', 'Energy', 'kJ'], ['energyKcal', 'Energy', 'kcal'], ['fat', 'Fat', 'g'], ['saturates', 'of which saturates', 'g'], ['carbohydrate', 'Carbohydrate', 'g'],
  ['sugars', 'of which sugars', 'g'], ['fibre', 'Fibre', 'g'], ['protein', 'Protein', 'g'], ['salt', 'Salt', 'g'],
];

const FoodTab: React.FC<{ p: Product; lookups: Lookups; canEdit: boolean }> = ({ p, lookups, canEdit }) => {
  const { run, busy } = useAction();
  const fi = p.foodInfo;
  const [f, setF] = useState<FoodInfo>({
    basis: fi?.basis ?? 'per_100g', energyKj: fi?.energyKj ?? null, energyKcal: fi?.energyKcal ?? null, fat: fi?.fat ?? null, saturates: fi?.saturates ?? null,
    carbohydrate: fi?.carbohydrate ?? null, sugars: fi?.sugars ?? null, fibre: fi?.fibre ?? null, protein: fi?.protein ?? null, salt: fi?.salt ?? null,
    fboName: fi?.fboName ?? '', fboAddress: fi?.fboAddress ?? '', countryOfOrigin: fi?.countryOfOrigin ?? '', allergensReviewed: fi?.allergensReviewed ?? false,
    reviewedAt: fi?.reviewedAt ?? null, reviewedBy: fi?.reviewedBy ?? null,
  });
  const [ingredients, setIngredients] = useState(p.ingredients ?? '');
  const [contains, setContains] = useState<string[]>(p.contains);
  const [may, setMay] = useState<string[]>(p.mayContain);
  const set = <K extends keyof FoodInfo>(k: K, v: FoodInfo[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggle = (list: string[], setList: (v: string[]) => void, code: string, on: boolean) => setList(on ? [...list, code] : list.filter((c) => c !== code));
  const save = () => run('admin_save_food_info', {
    p_product_id: p.id,
    p: {
      basis: f.basis, energyKj: f.energyKj, energyKcal: f.energyKcal, fat: f.fat, saturates: f.saturates, carbohydrate: f.carbohydrate, sugars: f.sugars, fibre: f.fibre,
      protein: f.protein, salt: f.salt, fboName: f.fboName || null, fboAddress: f.fboAddress || null, countryOfOrigin: f.countryOfOrigin || null, ingredients: ingredients || null,
      contains, mayContain: may, allergensReviewed: f.allergensReviewed,
    },
  }, { success: 'Food information saved', refresh: ['admin_get_product', 'admin_list_products'] });
  return (
    <div className="space-y-4">
      <Card title="Ingredients" description="Copy exactly from the pack. Write allergens in CAPITALS, e.g. wheat FLOUR, MILK.">
        <TextArea rows={4} value={ingredients} onChange={setIngredients} disabled={!canEdit} />
      </Card>
      <Card title="Allergens" description="The 14 allergens UK law requires. Tick what the product contains, and what it may contain (traces).">
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <div className="text-sm font-semibold mb-2">Contains</div>
            <div className="grid grid-cols-1 gap-1.5">{lookups.allergens.map((a) => <Checkbox key={a.code} checked={contains.includes(a.code)} disabled={!canEdit} onChange={(v) => toggle(contains, setContains, a.code, v)} label={a.name} />)}</div>
          </div>
          <div>
            <div className="text-sm font-semibold mb-2">May contain</div>
            <div className="grid grid-cols-1 gap-1.5">{lookups.allergens.map((a) => <Checkbox key={a.code} checked={may.includes(a.code)} disabled={!canEdit || contains.includes(a.code)} onChange={(v) => toggle(may, setMay, a.code, v)} label={a.name} />)}</div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100">
          <Checkbox checked={f.allergensReviewed} disabled={!canEdit} onChange={(v) => set('allergensReviewed', v)} label="I have checked the allergens against the pack"
            description={f.reviewedBy ? `Last checked by ${f.reviewedBy}, ${dateTime(f.reviewedAt)}` : 'Your name and the date are recorded.'} />
        </div>
      </Card>
      <Card title="Nutrition" description="From the pack’s nutrition table.">
        <Field label="Values are" className="max-w-xs mb-3">
          <Select value={f.basis} onChange={(v) => set('basis', v as FoodInfo['basis'])} disabled={!canEdit} options={[{ value: 'per_100g', label: 'per 100 g' }, { value: 'per_100ml', label: 'per 100 ml' }]} />
        </Field>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {NUTRIENTS.map(([k, label, unit]) => (
            <Field key={k} label={label}><NumberInput decimals value={f[k] as number | null} onChange={(v) => set(k, v as never)} suffix={unit} disabled={!canEdit} /></Field>
          ))}
        </div>
      </Card>
      <Card title="Who makes or imports it" description="The food business named on the pack (needed by law).">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Company name"><TextInput value={f.fboName} onChange={(v) => set('fboName', v)} disabled={!canEdit} /></Field>
          <Field label="Country of origin" optional><TextInput value={f.countryOfOrigin} onChange={(v) => set('countryOfOrigin', v)} disabled={!canEdit} /></Field>
          <Field label="UK address" className="sm:col-span-2"><TextArea rows={2} value={f.fboAddress} onChange={(v) => set('fboAddress', v)} disabled={!canEdit} /></Field>
        </div>
      </Card>
      {canEdit && <div className="flex justify-end"><Button variant="primary" loading={busy} onClick={() => void save()}>Save food information</Button></div>}
    </div>
  );
};

// ── photos ──────────────────────────────────────────────────────────────────────────────────────
const PhotosTab: React.FC<{ p: Product; canEdit: boolean }> = ({ p, canEdit }) => {
  const { run, busy } = useAction();
  const [images, setImages] = useState(p.images.map((i) => ({ path: i.path, alt: i.alt })));
  const [picker, setPicker] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setImages(p.images.map((i) => ({ path: i.path, alt: i.alt }))); setDirty(false); }, [p.images]);
  const update = (next: typeof images) => { setImages(next); setDirty(true); };
  const move = (i: number, by: number) => { const n = [...images]; const [x] = n.splice(i, 1); n.splice(i + by, 0, x); update(n); };
  return (
    <div className="space-y-4">
      <Card title="Photos" description="The first photo is the main one. Square pictures (1:1) on a plain background look best."
        actions={canEdit && <Button size="sm" variant="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setPicker(true)}>Add photo</Button>}>
        {!images.length ? <p className="text-sm text-slate-500">No photos yet.</p> : (
          <ul className="space-y-2">
            {images.map((img, i) => (
              <li key={`${img.path}-${i}`} className="flex items-center gap-3 rounded-lg border border-[#E2E8F0] p-2">
                <Thumb src={mediaUrl(img.path)} size={64} />
                <div className="flex-1 min-w-0">
                  {i === 0 && <Badge tone="yellow">Main photo</Badge>}
                  <Field label="Describe the photo" help="For blind shoppers and Google, e.g. “5 kg bag of aged basmati rice”." className="mt-1">
                    <TextInput value={img.alt} onChange={(v) => update(images.map((x, j) => (j === i ? { ...x, alt: v } : x)))} disabled={!canEdit} />
                  </Field>
                </div>
                {canEdit && (
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" aria-label="Move down" disabled={i === images.length - 1} onClick={() => move(i, 1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => update(images.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5 text-[#A63A3A]" /></Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {canEdit && <div className="flex justify-end"><Button variant="primary" loading={busy} disabled={!dirty} onClick={() => void run('admin_set_product_images', { p_product_id: p.id, p_images: images.map((x) => ({ path: x.path, alt: x.alt || p.name })) }, { success: 'Photos saved', refresh: ['admin_get_product', 'admin_list_products'] })}>Save photos</Button></div>}
      <MediaPicker open={picker} onClose={() => setPicker(false)} folder="products" title="Choose a product photo" onPick={(path) => update([...images, { path, alt: p.name }])} />
    </div>
  );
};

// ── stock & suppliers ───────────────────────────────────────────────────────────────────────────
const NO_STOCK: Product['stock'][number] = { locationId: '', location: '', onHand: 0, reserved: 0, available: 0, reorderPoint: null, optimalStock: null, unitCostMinor: null };
const StockTab: React.FC<{ p: Product; canEdit: boolean }> = ({ p, canEdit }) => {
  const { run, busy } = useAction();
  const suppliers = useAdminQuery<Array<{ id: string; name: string; isActive: boolean }>>('admin_list_suppliers');
  const [adjust, setAdjust] = useState<Product['stock'][number] | null>(null);
  const [levels, setLevels] = useState<Product['stock'][number] | null>(null);
  const [newSup, setNewSup] = useState('');
  const [supSku, setSupSku] = useState('');
  const [supCost, setSupCost] = useState<number | null>(null);
  return (
    <div className="space-y-4">
      {p.stock.length === 0 && (
        <Card title="Stock" actions={canEdit && <Button size="sm" variant="primary" onClick={() => setAdjust(NO_STOCK)}>Add stock</Button>}>
          <p className="text-sm text-slate-500">Not stocked yet. Add stock when the first delivery arrives.</p>
        </Card>
      )}
      {p.stock.map((s) => (
        <Card key={s.locationId} title={s.location} actions={canEdit && <>
          <Button size="sm" onClick={() => setLevels(s)}>Reorder levels</Button>
          <Button size="sm" variant="primary" onClick={() => setAdjust(s)}>Change stock</Button>
        </>}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><div className="text-slate-500 text-xs">In stock</div><div className="text-xl font-bold tabular-nums">{s.onHand}</div></div>
            <div><div className="text-slate-500 text-xs">Held for orders</div><div className="text-xl font-bold tabular-nums">{s.reserved}</div></div>
            <div><div className="text-slate-500 text-xs">Free to sell</div><div className={`text-xl font-bold tabular-nums ${s.available <= 0 ? 'text-[#A63A3A]' : s.available <= (s.reorderPoint ?? -1) ? 'text-amber-600' : ''}`}>{s.available}</div></div>
            <div><div className="text-slate-500 text-xs">Buy more at / up to</div><div className="text-xl font-bold tabular-nums">{s.reorderPoint ?? '—'} / {s.optimalStock ?? '—'}</div></div>
          </div>
          {s.unitCostMinor != null && <p className="text-xs text-slate-500 mt-2">Costs you {pence(s.unitCostMinor)} each.</p>}
        </Card>
      ))}
      <Card title="Suppliers" description="Who you buy it from. The main supplier is used for automatic draft purchase orders.">
        {p.suppliers.length === 0 ? <p className="text-sm text-slate-500">No supplier linked.</p> : (
          <ul className="divide-y divide-slate-100">
            {p.suppliers.map((s) => (
              <li key={s.supplierId} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{s.name}</span>{s.isPrimary && <Badge tone="yellow">Main</Badge>}
                <span className="text-slate-500">{s.supplierSku ? `their code ${s.supplierSku}` : ''}{s.unitCostMinor != null ? ` · ${pence(s.unitCostMinor)}` : ''}</span>
                {canEdit && (
                  <span className="ml-auto flex gap-1">
                    {!s.isPrimary && <Button size="sm" variant="ghost" loading={busy} onClick={() => void run('admin_set_product_supplier', { p_product_id: p.id, p_supplier_id: s.supplierId, p_supplier_sku: s.supplierSku, p_unit_cost_minor: s.unitCostMinor, p_is_primary: true }, { refresh: ['admin_get_product'] })}>Make main</Button>}
                    <Button size="sm" variant="ghost" loading={busy} onClick={() => void run('admin_set_product_supplier', { p_product_id: p.id, p_supplier_id: s.supplierId, p_remove: true }, { refresh: ['admin_get_product'] })}>Remove</Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="grid sm:grid-cols-[1fr_9rem_8rem_auto] gap-2 items-end mt-3 pt-3 border-t border-slate-100">
            <Field label="Add a supplier"><Select value={newSup} onChange={setNewSup} placeholder="Choose…" options={(suppliers.data ?? []).filter((s) => s.isActive && !p.suppliers.some((x) => x.supplierId === s.id)).map((s) => ({ value: s.id, label: s.name }))} /></Field>
            <Field label="Their code" optional><TextInput value={supSku} onChange={setSupSku} /></Field>
            <Field label="Cost each" optional><MoneyInput value={supCost} onChange={setSupCost} /></Field>
            <Button disabled={!newSup} loading={busy} onClick={async () => {
              const ok = await run('admin_set_product_supplier', { p_product_id: p.id, p_supplier_id: newSup, p_supplier_sku: supSku || null, p_unit_cost_minor: supCost, p_is_primary: p.suppliers.length === 0 }, { success: 'Supplier linked', refresh: ['admin_get_product'] });
              if (ok !== undefined) { setNewSup(''); setSupSku(''); setSupCost(null); }
            }}>Add</Button>
          </div>
        )}
      </Card>
      <Card title="Stock history"><StockHistory productId={p.id} /></Card>
      {adjust && <AdjustStock productId={p.id} name={p.name} onHand={adjust.onHand} locationId={adjust.locationId || undefined} onClose={() => setAdjust(null)} />}
      {levels && <StockLevels productId={p.id} name={p.name} reorderPoint={levels.reorderPoint} optimalStock={levels.optimalStock} unitCostMinor={levels.unitCostMinor} locationId={levels.locationId || undefined} onClose={() => setLevels(null)} />}
    </div>
  );
};
