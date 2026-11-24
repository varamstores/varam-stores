import React, { useMemo, useState } from 'react';
import { Check, ImagePlus, Package, Plus, Scale } from 'lucide-react';
import { rpc } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { errorText, mediaUrl, pence } from './lib';
import { useLookups } from './lookups';
import { MediaPicker } from './pickers';
import { Button, Checkbox, Drawer, Field, Loading, MoneyInput, Notice, NumberInput, SearchInput, Select, TextArea, TextInput, cx } from './ui';
import { toast } from './toast';

// Adding a product, one question at a time, in the order a shop thinks about it:
// 1 category → 2 brand → 3 how it is sold → 4 name & pack → 5 price → 6 photo.
// Missing categories and brands can be added on the spot. The product is created as a draft
// and opens in the full editor (food information, stock…) when done.

const STEPS = ['Category', 'Brand', 'How it’s sold', 'Name', 'Price', 'Photo'] as const;

interface Draft {
  categoryId: string | null; brandId: string | null; noBrand: boolean;
  saleUnit: 'each' | 'weight'; estimatedWeightGrams: number | null; minWeightGrams: number | null; weightStepGrams: number | null;
  isFood: boolean; isPerishable: boolean; taxCategoryCode: string; ageRestrictionCode: string | null;
  name: string; packSize: string; sku: string; description: string;
  priceMinor: number | null; rrpMinor: number | null; photo: string | null; photoAlt: string;
}
const START: Draft = {
  categoryId: null, brandId: null, noBrand: false, saleUnit: 'each', estimatedWeightGrams: 500, minWeightGrams: 250, weightStepGrams: 250,
  isFood: true, isPerishable: false, taxCategoryCode: 'zero_rated', ageRestrictionCode: null,
  name: '', packSize: '', sku: '', description: '', priceMinor: null, rrpMinor: null, photo: null, photoAlt: '',
};

/** VRM-RIC-BASMATI style suggestion from the category and name; staff can change it. */
function suggestSku(category: string | undefined, name: string): string {
  const cat = (category ?? 'GEN').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'GEN';
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const body = words.slice(0, 3).map((w) => w.slice(0, 4)).join('-') || 'ITEM';
  return `VRM-${cat}-${body}`.slice(0, 32).replace(/-+$/, '');
}

export const NewProductWizard: React.FC<{ onClose: () => void; onCreated: (id: string) => void }> = ({ onClose, onCreated }) => {
  const lookups = useLookups();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(START);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const L = lookups.data;
  const category = L?.categories.find((c) => c.id === d.categoryId);
  const brand = L?.brands.find((b) => b.id === d.brandId);

  const stepOk = [
    !!d.categoryId,
    d.noBrand || !!d.brandId,
    d.saleUnit === 'each' || (!!d.estimatedWeightGrams && !!d.minWeightGrams && !!d.weightStepGrams),
    !!d.name.trim() && !!d.packSize.trim() && /^[A-Z0-9][A-Z0-9-]{2,31}$/.test(d.sku),
    true, // price can be added later
    true, // photo can be added later
  ];

  const create = async () => {
    setBusy(true);
    try {
      const p = await rpc<{ id: string }>('admin_save_product', { p: {
        name: d.name.trim(), sku: d.sku, primaryCategoryId: d.categoryId, brandId: d.noBrand ? null : d.brandId, packSize: d.packSize.trim(),
        saleUnit: d.saleUnit, estimatedWeightGrams: d.saleUnit === 'weight' ? d.estimatedWeightGrams : null, minWeightGrams: d.saleUnit === 'weight' ? d.minWeightGrams : null,
        weightStepGrams: d.saleUnit === 'weight' ? d.weightStepGrams : null, isFood: d.isFood, isPerishable: d.isPerishable, isReturnable: !d.isPerishable,
        taxCategoryCode: d.taxCategoryCode, ageRestrictionCode: d.ageRestrictionCode, description: d.description.trim() || null, rrpMinor: d.rrpMinor,
      } });
      if (d.priceMinor) await rpc('admin_set_price', { p_product_id: p.id, p_price_minor: d.priceMinor, p_reason: 'First price' });
      if (d.photo) await rpc('admin_set_product_images', { p_product_id: p.id, p_images: [{ path: d.photo, alt: d.photoAlt.trim() || d.name.trim() }] });
      await qc.invalidateQueries({ queryKey: ['admin'] });
      toast.success('Product created as a draft. Add the food information, then put it on sale.');
      onCreated(p.id);
    } catch (err) {
      toast.error(errorText(err));
    } finally { setBusy(false); }
  };

  return (
    <Drawer open onClose={onClose} wide title="Add a product" subtitle="Answer one question at a time. Nothing appears in the shop until you put it on sale."
      footer={<>
        <span className="mr-auto text-[13px] text-[#5F6B7A]">Step {step + 1} of {STEPS.length}</span>
        {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button>}
        {step < STEPS.length - 1
          ? <Button variant="primary" disabled={!stepOk[step]} onClick={() => setStep(step + 1)}>{step >= 4 ? 'Skip or continue' : 'Next'}</Button>
          : <Button variant="primary" loading={busy} disabled={!stepOk.every(Boolean)} onClick={() => void create()}>Create product</Button>}
      </>}>
      <ol className="grid grid-cols-3 sm:grid-cols-6 gap-2" aria-label="Steps">
        {STEPS.map((s, i) => {
          const done = i < step && stepOk[i];
          const current = i === step;
          return (
            <li key={s}>
              <button type="button" disabled={i > step && !stepOk.slice(0, i).every(Boolean)} onClick={() => setStep(i)}
                className={cx('w-full text-left rounded-lg border px-2.5 py-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60',
                  current ? 'bg-[#18181B] border-[#18181B] text-white' : done ? 'bg-white border-[#BFD8CA]' : 'bg-white border-[#D6DBE1]')}>
                <span className={cx('inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold mr-1.5 align-[1px]',
                  current ? 'bg-[#F5D103] text-[#18181B]' : done ? 'bg-[#2F6B4F] text-white' : 'bg-[#ECEEF1] text-[#4B5563]')}>{done ? <Check className="w-3 h-3" /> : i + 1}</span>
                <span className="text-[13px] font-medium whitespace-nowrap">{s}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {!L ? <Loading /> : (
        <section className="bg-white rounded-xl border border-[#D6DBE1] p-4 sm:p-6 space-y-5">
          {step === 0 && <CategoryStep value={d.categoryId} onChange={(v) => set('categoryId', v)} />}
          {step === 1 && <BrandStep value={d.brandId} noBrand={d.noBrand} onChange={(id, none) => setD((x) => ({ ...x, brandId: id, noBrand: none }))} />}
          {step === 2 && (
            <>
              <Question n={3} title="How is it sold?" />
              <div className="grid sm:grid-cols-2 gap-3">
                <Choice icon={Package} selected={d.saleUnit === 'each'} onClick={() => set('saleUnit', 'each')} title="In a pack" text="A fixed item with one price, e.g. a 5 kg bag of rice, a jar of pickle." />
                <Choice icon={Scale} selected={d.saleUnit === 'weight'} onClick={() => set('saleUnit', 'weight')} title="By weight" text="Loose items priced per kg and weighed when picked, e.g. tomatoes, okra." />
              </div>
              {d.saleUnit === 'weight' && (
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="Typical weight" help="Used for the estimated price."><NumberInput value={d.estimatedWeightGrams} onChange={(v) => set('estimatedWeightGrams', v)} suffix="grams" /></Field>
                  <Field label="Smallest amount to order"><NumberInput value={d.minWeightGrams} onChange={(v) => set('minWeightGrams', v)} suffix="grams" /></Field>
                  <Field label="Shoppers choose in steps of"><NumberInput value={d.weightStepGrams} onChange={(v) => set('weightStepGrams', v)} suffix="grams" /></Field>
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-3">
                  <Checkbox checked={d.isFood} onChange={(v) => setD((x) => ({ ...x, isFood: v, taxCategoryCode: v ? 'zero_rated' : 'standard' }))} label="It is food or drink" description="Food needs ingredients and allergens before it goes on sale (UK law)." />
                  <Checkbox checked={d.isPerishable} onChange={(v) => set('isPerishable', v)} label="It is fresh, chilled or frozen" description="Fresh items cannot be returned for a change of mind." />
                </div>
                <div className="space-y-3">
                  <Field label="VAT rate" help="Most food is 0%. Confectionery, soft drinks, hot food and non-food are usually 20%. Check with your accountant.">
                    <Select value={d.taxCategoryCode} onChange={(v) => set('taxCategoryCode', v)} options={L.taxCategories.map((t) => ({ value: t.code, label: `${t.name} (${t.rateBp / 100}%)` }))} />
                  </Field>
                  <Field label="Age limit" optional><Select value={d.ageRestrictionCode} onChange={(v) => set('ageRestrictionCode', v || null)} placeholder="None" options={L.ageRestrictions.map((a) => ({ value: a.code, label: `${a.name}${a.minAge ? ` (${a.minAge}+)` : ''}` }))} /></Field>
                </div>
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <Question n={4} title="What is it called?" hint={`In ${category?.path ?? 'its category'}${brand && !d.noBrand ? `, by ${brand.name}` : ''}.`} />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Product name" className="sm:col-span-2" help="As shoppers will see it, e.g. “Aged Basmati Rice”.">
                  <TextInput value={d.name} autoFocus onChange={(v) => setD((x) => ({ ...x, name: v, sku: !x.sku || x.sku === suggestSku(category?.name, x.name) ? suggestSku(category?.name, v) : x.sku }))} />
                </Field>
                <Field label={d.saleUnit === 'weight' ? 'How it is described' : 'Pack size'} help={d.saleUnit === 'weight' ? 'e.g. “Loose, per kg”' : 'e.g. 5 kg, 500 ml, 12 pack'}><TextInput value={d.packSize} onChange={(v) => set('packSize', v)} /></Field>
                <Field label="Stock code (SKU)" help="Made for you; change it if you have your own code. Capital letters, numbers and dashes."><TextInput value={d.sku} onChange={(v) => set('sku', v.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} className="font-mono" /></Field>
                <Field label="Short description" optional className="sm:col-span-2"><TextArea rows={3} value={d.description} onChange={(v) => set('description', v)} /></Field>
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <Question n={5} title="What does it cost?" hint="You can also add the price later. A product needs a price before it can go on sale." />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label={d.saleUnit === 'weight' ? 'Price per kg' : 'Price'}><MoneyInput value={d.priceMinor} onChange={(v) => set('priceMinor', v)} /></Field>
                <Field label="Maker’s recommended price (RRP)" optional><MoneyInput value={d.rrpMinor} onChange={(v) => set('rrpMinor', v)} /></Field>
              </div>
            </>
          )}
          {step === 5 && <PhotoStep path={d.photo} alt={d.photoAlt} name={d.name} onChange={(photo, photoAlt) => setD((x) => ({ ...x, photo, photoAlt }))} />}
        </section>
      )}

      {step === 5 && (
        <section className="bg-white rounded-xl border border-[#D6DBE1] p-4 sm:p-5">
          <div className="text-[14px] font-semibold mb-2">Ready to create</div>
          <dl className="grid grid-cols-[130px_1fr] gap-y-1.5 text-[14px]">
            <dt className="text-[#5F6B7A]">Category</dt><dd>{category?.path ?? '—'}</dd>
            <dt className="text-[#5F6B7A]">Brand</dt><dd>{d.noBrand ? 'No brand' : brand?.name ?? '—'}</dd>
            <dt className="text-[#5F6B7A]">Sold</dt><dd>{d.saleUnit === 'weight' ? 'By weight (per kg)' : 'In a pack'}{d.isFood ? ', food' : ''}{d.isPerishable ? ', fresh' : ''}</dd>
            <dt className="text-[#5F6B7A]">Name</dt><dd>{d.name || '—'} <span className="text-[#7A8594]">({d.packSize || '—'}, {d.sku || '—'})</span></dd>
            <dt className="text-[#5F6B7A]">Price</dt><dd>{d.priceMinor ? pence(d.priceMinor) : 'Add later'}</dd>
            <dt className="text-[#5F6B7A]">Photo</dt><dd>{d.photo ? 'Added' : 'Add later'}</dd>
          </dl>
          {!stepOk.every(Boolean) && <Notice tone="warning">Some steps are not finished. Go back to the ones without a tick.</Notice>}
        </section>
      )}
    </Drawer>
  );
};

const Question: React.FC<{ n: number; title: string; hint?: string }> = ({ n, title, hint }) => (
  <div>
    <h3 className="text-[18px] font-semibold flex items-center gap-2.5"><span className="w-7 h-7 rounded-full bg-[#18181B] text-[#F5D103] text-[13px] font-bold flex items-center justify-center">{n}</span>{title}</h3>
    {hint && <p className="text-[13.5px] text-[#5F6B7A] mt-1 ml-[38px]">{hint}</p>}
  </div>
);

const Choice: React.FC<{ icon: React.ElementType; selected: boolean; onClick: () => void; title: string; text: string }> = ({ icon: Icon, selected, onClick, title, text }) => (
  <button type="button" onClick={onClick} aria-pressed={selected}
    className={cx('text-left rounded-xl border-2 p-4 cursor-pointer transition-colors', selected ? 'border-[#18181B] bg-[#FBF8EA]' : 'border-[#D6DBE1] bg-white hover:border-[#8B95A3]')}>
    <div className="flex items-center gap-2.5"><Icon className="w-5 h-5" strokeWidth={1.75} /><span className="font-semibold text-[15px]">{title}</span>{selected && <Check className="w-4 h-4 ml-auto text-[#2F6B4F]" />}</div>
    <p className="text-[13px] text-[#5F6B7A] mt-1.5">{text}</p>
  </button>
);

/** A searchable list of options shown as rows, plus "add a new one". */
const PickList: React.FC<{ items: Array<{ id: string; label: string; sub?: string }>; value: string | null; onPick: (id: string) => void; placeholder: string; empty: string }> = ({ items, value, onPick, placeholder, empty }) => {
  const [q, setQ] = useState('');
  const shown = useMemo(() => items.filter((i) => !q || `${i.label} ${i.sub ?? ''}`.toLowerCase().includes(q.toLowerCase())), [items, q]);
  return (
    <div className="space-y-2">
      <SearchInput value={q} onChange={setQ} placeholder={placeholder} />
      <div className="max-h-72 overflow-y-auto rounded-lg border border-[#D6DBE1] divide-y divide-[#EEF0F3]">
        {shown.length === 0 ? <p className="p-3 text-[13.5px] text-[#5F6B7A]">{empty}</p> : shown.map((i) => (
          <button key={i.id} type="button" onClick={() => onPick(i.id)} className={cx('w-full flex items-center gap-2 px-3 py-2.5 text-left text-[14px] cursor-pointer', value === i.id ? 'bg-[#FBF8EA]' : 'hover:bg-[#F6F7F9]')}>
            <span className={cx('w-4 h-4 rounded-full border-2 shrink-0', value === i.id ? 'border-[#18181B] bg-[#18181B] shadow-[inset_0_0_0_3px_white]' : 'border-[#B9C0CA]')} />
            <span className="flex-1">{i.label}{i.sub && <span className="block text-[12px] text-[#7A8594]">{i.sub}</span>}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const CategoryStep: React.FC<{ value: string | null; onChange: (id: string) => void }> = ({ value, onChange }) => {
  const lookups = useLookups();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const [busy, setBusy] = useState(false);
  const cats = lookups.data?.categories ?? [];
  const add = async () => {
    setBusy(true);
    try {
      const c = await rpc<{ id: string }>('admin_save_category', { p: { name: name.trim(), parentId: parent || null, isActive: true } });
      await qc.invalidateQueries({ queryKey: ['admin', 'admin_catalogue_lookups'] });
      await qc.invalidateQueries({ queryKey: ['admin', 'admin_list_categories'] });
      onChange(c.id); setAdding(false); setName(''); toast.success('Category added');
    } catch (err) { toast.error(errorText(err)); } finally { setBusy(false); }
  };
  return (
    <>
      <Question n={1} title="Which category does it go in?" hint="Shoppers find it here in the shop menu. Choose the most specific one." />
      <PickList items={cats.filter((c) => c.isActive || c.id === value).map((c) => ({ id: c.id, label: c.name, sub: c.path !== c.name ? c.path : undefined }))} value={value} onPick={onChange} placeholder="Search categories…" empty="No category matches. Add a new one below." />
      {adding ? (
        <div className="rounded-lg border border-[#D6DBE1] bg-[#F6F7F9] p-3 grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <Field label="New category name"><TextInput value={name} onChange={setName} autoFocus /></Field>
          <Field label="Inside" optional><Select value={parent} onChange={setParent} placeholder="Top level (main category)" options={cats.map((c) => ({ value: c.id, label: c.path }))} /></Field>
          <div className="flex gap-2"><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button variant="dark" loading={busy} disabled={!name.trim()} onClick={() => void add()}>Add</Button></div>
        </div>
      ) : <Button icon={<Plus className="w-4 h-4" />} onClick={() => setAdding(true)}>Add a new category</Button>}
    </>
  );
};

const BrandStep: React.FC<{ value: string | null; noBrand: boolean; onChange: (id: string | null, noBrand: boolean) => void }> = ({ value, noBrand, onChange }) => {
  const lookups = useLookups();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      const b = await rpc<{ id: string }>('admin_save_brand', { p: { name: name.trim(), isActive: true } });
      await qc.invalidateQueries({ queryKey: ['admin', 'admin_catalogue_lookups'] });
      await qc.invalidateQueries({ queryKey: ['admin', 'admin_list_brands'] });
      onChange(b.id, false); setAdding(false); setName(''); toast.success('Brand added');
    } catch (err) { toast.error(errorText(err)); } finally { setBusy(false); }
  };
  return (
    <>
      <Question n={2} title="Which brand is it?" hint="Shoppers can filter by brand. Loose fruit and veg usually has no brand." />
      <Choice icon={Package} selected={noBrand} onClick={() => onChange(null, true)} title="No brand" text="Loose produce, or your own unbranded products." />
      <PickList items={(lookups.data?.brands ?? []).filter((b) => b.isActive || b.id === value).map((b) => ({ id: b.id, label: b.name }))} value={noBrand ? null : value} onPick={(id) => onChange(id, false)} placeholder="Search brands…" empty="No brand matches. Add a new one below." />
      {adding ? (
        <div className="rounded-lg border border-[#D6DBE1] bg-[#F6F7F9] p-3 flex flex-wrap gap-2 items-end">
          <Field label="New brand name" className="flex-1 min-w-[12rem]"><TextInput value={name} onChange={setName} autoFocus /></Field>
          <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button variant="dark" loading={busy} disabled={!name.trim()} onClick={() => void add()}>Add</Button>
        </div>
      ) : <Button icon={<Plus className="w-4 h-4" />} onClick={() => setAdding(true)}>Add a new brand</Button>}
      <p className="text-[12.5px] text-[#7A8594]">You can add the brand’s logo later in Categories &amp; brands.</p>
    </>
  );
};

const PhotoStep: React.FC<{ path: string | null; alt: string; name: string; onChange: (path: string | null, alt: string) => void }> = ({ path, alt, name, onChange }) => {
  const [open, setOpen] = useState(false);
  const url = mediaUrl(path);
  return (
    <>
      <Question n={6} title="Add a photo" hint="Square photos on a plain background look best. You can add more photos later." />
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <div className="w-40 h-40 rounded-xl border border-[#D6DBE1] bg-[#F6F7F9] flex items-center justify-center overflow-hidden shrink-0">
          {url ? <img src={url} alt="" className="w-full h-full object-contain" /> : <ImagePlus className="w-8 h-8 text-[#B9C0CA]" />}
        </div>
        <div className="flex-1 space-y-3 w-full">
          <div className="flex gap-2">
            <Button variant={url ? 'outline' : 'dark'} onClick={() => setOpen(true)}>{url ? 'Choose a different photo' : 'Choose or upload a photo'}</Button>
            {url && <Button variant="ghost" onClick={() => onChange(null, alt)}>Remove</Button>}
          </div>
          <Field label="Describe the photo" optional help="For blind shoppers and Google."><TextInput value={alt} onChange={(v) => onChange(path, v)} placeholder={name ? `e.g. ${name}` : ''} /></Field>
        </div>
      </div>
      <MediaPicker open={open} onClose={() => setOpen(false)} folder="products" title="Choose a product photo" onPick={(p) => onChange(p, alt)} />
    </>
  );
};
