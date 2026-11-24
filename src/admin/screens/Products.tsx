import React, { useState } from 'react';
import { Download, Package, Plus, Upload } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import type { Money } from '../../types/api';
import { useAuth } from '../../context/AuthContext';
import { rpc } from '../../lib/api';
import { usePagedList, money, errorText, downloadText, londonToday, type Paged } from '../lib';
import { Badge, Button, Card, Empty, ErrorState, FilterBar, Loading, Pager, SampleTag, Screen, Table, Tabs, Td, Th, Thumb, Tr } from '../ui';
import { CsvImport } from '../CsvImport';
import { ProductEditor } from '../ProductEditor';
import { useLookups } from '../lookups';
import { toast } from '../toast';
import { Shelves } from './Catalogue';

interface ProductRow {
  id: string; sku: string; name: string; slug: string; brand: string | null; image: { url: string } | null; price: Money | null; issues: string[];
  status: string; category: string | null; isSample: boolean; packSize: string | null; saleUnit: string; available: number | null;
}
interface ProductList extends Paged<ProductRow> { counts: { draft: number; active: number; archived: number; noPrice: number; lowStock: number; foodInfoMissing: number } }

export const ISSUE: Record<string, { label: string; tone: 'amber' | 'red' }> = {
  food_info: { label: 'Food info missing', tone: 'amber' }, no_price: { label: 'No price', tone: 'red' }, no_image: { label: 'No photo', tone: 'amber' },
  low_stock: { label: 'Low stock', tone: 'amber' }, out_of_stock: { label: 'Out of stock', tone: 'red' },
};

export default function ProductsScreen({ param, go }: ScreenProps) {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState('products');
  const [editing, setEditing] = useState<string | 'new' | null>(param && !(param in ISSUE) ? param : null);
  const [importing, setImporting] = useState(false);
  const canEdit = hasPermission('inventory');

  const exportCsv = async () => {
    try { downloadText(`varam-products-${londonToday()}.csv`, await rpc<string>('admin_export_products_csv')); } catch (err) { toast.error(errorText(err)); }
  };

  return (
    <Screen
      title="Products"
      intro="Step 3 of setting up the shop. Everything you sell: names, prices, photos, food information and stock."
      guide={<ol>
        <li>Make sure your <b>categories</b> (step 1) and <b>brands</b> (step 2) are added first. A missing one can also be added while adding a product.</li>
        <li>Press <b>Add product</b> and answer six short steps: <b>category → brand → how it’s sold → name → price → photos</b>. It is saved as a <b>draft</b>.</li>
        <li>Food needs <b>food information</b> by law (ingredients, allergens, nutrition). Fill it in, then press <b>Put on sale</b>.</li>
        <li>Many changes at once? <b>Download CSV</b>, edit it in Excel or Google Sheets, then <b>Upload CSV</b>. Every change is shown before anything is saved.</li>
      </ol>}
      actions={<>
        <Button onClick={() => go('brands')}>‹ Brands</Button>
        <Button icon={<Download className="w-4 h-4" />} onClick={() => void exportCsv()}>Download CSV</Button>
        {canEdit && <Button icon={<Upload className="w-4 h-4" />} onClick={() => setImporting(true)}>Upload CSV</Button>}
        {canEdit && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setEditing('new')}>Add product</Button>}
      </>}
    >
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'products', label: 'All products' }, { value: 'shelves', label: 'Homepage shelves' }]} />
      {tab === 'products' ? <ProductList initialIssue={param && param in ISSUE ? param : ''} onOpen={setEditing} /> : <Shelves />}

      {editing && <ProductEditor productId={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onCreated={(id) => setEditing(id)} />}
      <CsvImport
        open={importing}
        onClose={() => setImporting(false)}
        title="Upload products (CSV)"
        fn="admin_import_products_csv"
        explain={<>
          <p>Use the file from <b>Download CSV</b> as your template. The first row must be the column names. Rows are matched by <b>sku</b>: existing SKUs are updated, new SKUs are created as products.</p>
          <p>Only include the columns you want to change. Prices are in pounds (6.99). Categories and brands must already exist (use their names).</p>
        </>}
        summary={(r, applied) => applied
          ? <>Done: {String(r.created)} created, {String(r.updated)} updated, {String(r.priceChanges)} price changes.</>
          : <>{String(r.rows)} rows: {String(r.willCreate)} new products, {String(r.willUpdate)} updates.</>}
      />
    </Screen>
  );
}

const ProductList: React.FC<{ initialIssue: string; onOpen: (id: string) => void }> = ({ initialIssue, onOpen }) => {
  const lookups = useLookups();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active');
  const [issue, setIssue] = useState(initialIssue);
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [sort, setSort] = useState('name');
  const list = usePagedList<ProductRow, ProductList>('admin_list_products', {
    p_q: q || undefined, p_status: status === 'all' ? undefined : status, p_issue: issue || undefined, p_category: category || undefined,
    p_brand: brand || undefined, p_sort: sort === 'name' ? undefined : sort,
  });
  const c = list.first?.counts;
  const filtered = !!(q || issue || category || brand || status !== 'active');
  return (
    <Card padded={false}>
      <FilterBar search={{ value: q, onChange: setQ, placeholder: 'Search products by name or SKU…' }} count={list.isLoading ? null : list.total} noun={['product', 'products']}
        filters={[
          { key: 'status', label: 'Show', value: status, onChange: setStatus, defaultValue: 'active', options: [
            { value: 'active', label: `On sale${c ? ` (${c.active})` : ''}` }, { value: 'draft', label: `Drafts${c ? ` (${c.draft})` : ''}` },
            { value: 'archived', label: `Archived${c ? ` (${c.archived})` : ''}` }, { value: 'all', label: 'All products' }] },
          { key: 'category', label: 'Category', value: category, onChange: setCategory, allLabel: 'All categories', options: (lookups.data?.categories ?? []).map((x) => ({ value: x.slug, label: x.path })) },
          { key: 'brand', label: 'Brand', value: brand, onChange: setBrand, allLabel: 'All brands', options: (lookups.data?.brands ?? []).map((b) => ({ value: b.slug, label: b.name })) },
          { key: 'issue', label: 'Needs fixing', value: issue, onChange: setIssue, allLabel: 'No filter', options: [
            { value: 'food_info', label: `Food information missing${c ? ` (${c.foodInfoMissing})` : ''}` }, { value: 'no_price', label: `No price${c ? ` (${c.noPrice})` : ''}` },
            { value: 'no_image', label: 'No photo' }, { value: 'low_stock', label: `Running low${c ? ` (${c.lowStock})` : ''}` }, { value: 'out_of_stock', label: 'Out of stock' }] },
          { key: 'sort', label: 'Sort by', value: sort, onChange: setSort, defaultValue: 'name', options: [
            { value: 'name', label: 'Name (A to Z)' }, { value: 'price-asc', label: 'Price, lowest first' }, { value: 'price-desc', label: 'Price, highest first' },
            { value: 'stock-asc', label: 'Stock, lowest first' }, { value: 'newest', label: 'Newest first' }, { value: 'updated', label: 'Recently changed' }] },
        ]} />
      {list.isLoading ? <Loading /> : list.error ? <ErrorState error={list.error} text={errorText(list.error)} onRetry={() => void list.refetch()} /> : !list.items.length ? (
        <Empty icon={<Package className="w-5 h-5" />} title="No products match" text={filtered ? 'Try clearing the search or filters.' : 'Press Add product to add your first one.'} />
      ) : (
        <>
          <Table>
            <thead><tr><Th>Product</Th><Th>Category</Th><Th className="text-right">Price</Th><Th className="text-right">Available</Th><Th>Status</Th></tr></thead>
            <tbody>
              {list.items.map((p) => (
                <Tr key={p.id} onClick={() => onOpen(p.id)}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Thumb src={p.image?.url} />
                      <div className="min-w-0">
                        <div className="font-medium truncate max-w-[22rem]">{p.name}</div>
                        <div className="text-xs text-slate-500">{p.sku}{p.packSize ? ` · ${p.packSize}` : ''}{p.brand ? ` · ${p.brand}` : ''}</div>
                        {p.issues.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{p.issues.map((i) => <Badge key={i} tone={ISSUE[i]?.tone ?? 'amber'}>{ISSUE[i]?.label ?? i}</Badge>)}</div>}
                      </div>
                    </div>
                  </Td>
                  <Td className="text-slate-600">{p.category ?? '—'}</Td>
                  <Td className="text-right tabular-nums font-semibold">{money(p.price)}{p.saleUnit === 'weight' && <span className="text-xs font-normal text-slate-500">/kg</span>}</Td>
                  <Td className="text-right tabular-nums">{p.available ?? '—'}</Td>
                  <Td><Badge tone={p.status === 'active' ? 'green' : p.status === 'draft' ? 'grey' : 'red'}>{p.status === 'active' ? 'On sale' : p.status === 'draft' ? 'Draft' : 'Archived'}</Badge> <SampleTag show={p.isSample} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pager {...list.pager} />
        </>
      )}
    </Card>
  );
};
