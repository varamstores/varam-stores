import { useState } from 'react';
import { Download, Package, Plus, Upload } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import type { Money } from '../../types/api';
import { useAuth } from '../../context/AuthContext';
import { rpc } from '../../lib/api';
import { usePaged, money, errorText, downloadText, londonToday, type Paged } from '../lib';
import { Badge, Button, Card, Chips, Empty, ErrorState, Loading, SampleTag, Screen, SearchInput, Select, Table, Td, Th, Thumb, Tr } from '../ui';
import { CsvImport } from '../CsvImport';
import { ProductEditor } from '../ProductEditor';
import { useLookups } from '../lookups';
import { toast } from '../toast';

interface ProductRow {
  id: string; sku: string; name: string; slug: string; brand: string | null; image: { url: string } | null; price: Money | null; issues: string[];
  status: string; category: string | null; isSample: boolean; packSize: string | null; saleUnit: string; available: number | null;
}
interface ProductList extends Paged<ProductRow> { counts: { draft: number; active: number; archived: number; noPrice: number; lowStock: number; foodInfoMissing: number } }

export const ISSUE: Record<string, { label: string; tone: 'amber' | 'red' }> = {
  food_info: { label: 'Food info missing', tone: 'amber' }, no_price: { label: 'No price', tone: 'red' }, no_image: { label: 'No photo', tone: 'amber' },
  low_stock: { label: 'Low stock', tone: 'amber' }, out_of_stock: { label: 'Out of stock', tone: 'red' },
};

export default function ProductsScreen({ param }: ScreenProps) {
  const { hasPermission } = useAuth();
  const lookups = useLookups();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [issue, setIssue] = useState(param && param in ISSUE ? param : '');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<string | 'new' | null>(param && !(param in ISSUE) ? param : null);
  const [importing, setImporting] = useState(false);
  const canEdit = hasPermission('inventory');
  const { first, items, isLoading, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = usePaged<ProductRow, ProductList>('admin_list_products', {
    p_q: q || undefined, p_status: status || undefined, p_issue: issue || undefined, p_category: category || undefined,
  });
  const c = first?.counts;

  const exportCsv = async () => {
    try { downloadText(`varam-products-${londonToday()}.csv`, await rpc<string>('admin_export_products_csv')); } catch (err) { toast.error(errorText(err)); }
  };

  return (
    <Screen
      title="Products"
      intro="Everything you sell: names, prices, photos, food information and stock."
      guide={<ul>
        <li><b>Add product</b> creates a draft. Give it a price and press <b>Put on sale</b> to show it in the shop.</li>
        <li>Food products need <b>food information</b> by law (ingredients, allergens, nutrition). Products missing it are flagged.</li>
        <li>Many changes at once? <b>Download CSV</b>, edit it in Excel or Google Sheets, then <b>Upload CSV</b>. You see every change and problem before anything is saved.</li>
        <li><b>Archive</b> hides a product for good without losing its order history.</li>
      </ul>}
      actions={<>
        <Button icon={<Download className="w-4 h-4" />} onClick={() => void exportCsv()}>Download CSV</Button>
        {canEdit && <Button icon={<Upload className="w-4 h-4" />} onClick={() => setImporting(true)}>Upload CSV</Button>}
        {canEdit && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setEditing('new')}>Add product</Button>}
      </>}
    >
      <Card padded={false}>
        <div className="p-4 space-y-3 border-b border-slate-100">
          <div className="flex flex-col md:flex-row gap-2">
            <SearchInput value={q} onChange={setQ} placeholder="Search by name or SKU…" className="flex-1" />
            <Select value={category} onChange={setCategory} placeholder="All categories" className="md:w-72"
              options={(lookups.data?.categories ?? []).map((x) => ({ value: x.slug, label: x.path }))} />
          </div>
          <div className="flex flex-col lg:flex-row gap-2 lg:items-center justify-between">
            <div className="flex items-center gap-2.5 flex-wrap"><span className="text-[13px] text-[#5F6B7A]">Show</span><Chips value={status} onChange={setStatus} options={[
              { value: '', label: 'All' }, { value: 'active', label: 'On sale', count: c?.active }, { value: 'draft', label: 'Drafts', count: c?.draft }, { value: 'archived', label: 'Archived', count: c?.archived },
            ]} /></div>
            <div className="flex items-center gap-2.5 flex-wrap"><span className="text-[13px] text-[#5F6B7A]">Needs fixing</span><Chips value={issue} onChange={setIssue} options={[
              { value: '', label: 'Any' }, { value: 'food_info', label: 'Food info missing', count: c?.foodInfoMissing }, { value: 'no_price', label: 'No price', count: c?.noPrice },
              { value: 'no_image', label: 'No photo' }, { value: 'low_stock', label: 'Low stock', count: c?.lowStock }, { value: 'out_of_stock', label: 'Out of stock' },
            ]} /></div>
          </div>
        </div>
        {isLoading ? <Loading /> : error ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : !items.length ? (
          <Empty icon={<Package className="w-5 h-5" />} title="No products found" text="Try clearing the search or filters." />
        ) : (
          <>
            <Table>
              <thead><tr><Th>Product</Th><Th>Category</Th><Th className="text-right">Price</Th><Th className="text-right">Available</Th><Th>Status</Th></tr></thead>
              <tbody>
                {items.map((p) => (
                  <Tr key={p.id} onClick={() => setEditing(p.id)}>
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
            <div className="flex items-center justify-between p-3 text-xs text-slate-500">
              <span>Showing {items.length} of {first?.total ?? items.length}</span>
              {hasNextPage && <Button size="sm" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>Show more</Button>}
            </div>
          </>
        )}
      </Card>

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
