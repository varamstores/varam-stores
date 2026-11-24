import { useState } from 'react';
import { Boxes, Download, Upload } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import { useAuth } from '../../context/AuthContext';
import { useAdminQuery, errorText, downloadText, londonToday, pence, date } from '../lib';
import { Badge, Button, Card, Empty, ErrorState, Loading, Modal, Screen, Table, Td, Th, Thumb, Tr, usePager, FilterBar } from '../ui';
import { AdjustStock, StockHistory, StockLevels } from '../StockForms';
import { CsvImport } from '../CsvImport';

interface Row {
  productId: string; sku: string; name: string; image: { url: string } | null; state: string; onHand: number; reserved: number; available: number; reorderPoint: number | null;
  optimalStock: number | null; onOrder: number; supplier: { id: string; name: string } | null; unitCostMinor: number | null; lastRestockedAt: string | null; status: string; packSize: string | null;
}

export default function StockScreen({ param }: ScreenProps) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('inventory');
  const [filter, setFilter] = useState(param === 'low' || param === 'out' ? param : 'all');
  const [q, setQ] = useState('');
  const [supplier, setSupplier] = useState('');
  const [pstatus, setPstatus] = useState('');
  const { data, isLoading, error, refetch } = useAdminQuery<Row[]>('admin_list_inventory', { p_filter: filter, p_q: q || undefined });
  const rows = (data ?? []).filter((r) => (!supplier || (supplier === '__none' ? !r.supplier : r.supplier?.id === supplier)) && (!pstatus || r.status === pstatus));
  const suppliers = [...new Map((data ?? []).filter((r) => r.supplier).map((r) => [r.supplier!.id, r.supplier!.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const { pageItems, pager } = usePager(rows, 25);
  const [adjust, setAdjust] = useState<Row | null>(null);
  const [levels, setLevels] = useState<Row | null>(null);
  const [history, setHistory] = useState<Row | null>(null);
  const [importing, setImporting] = useState(false);

  const exportCount = () => {
    const rows = (data ?? []).map((r) => `${r.sku},"${r.name.replace(/"/g, '""')}",${r.onHand}`);
    downloadText(`varam-stock-count-${londonToday()}.csv`, ['sku,name,on_hand', ...rows].join('\n'));
  };

  return (
    <Screen
      title="Stock"
      intro="How many of each product you have, what is held for orders, and what is free to sell."
      guide={<ul>
        <li><b>In stock</b> is what is on the shelves. <b>Held</b> is set aside for orders not yet picked. <b>Free to sell</b> is what shoppers can still buy.</li>
        <li>Stock goes down automatically when orders are picked and up when purchase orders are received. Use <b>Change</b> for anything else (breakages, returns, corrections).</li>
        <li>Did a full count? <b>Download count sheet</b>, write the real numbers in the on_hand column, then <b>Upload count</b>.</li>
        <li><b>Low</b> means at or below the reorder level you set for the product.</li>
      </ul>}
      actions={<>
        <Button icon={<Download className="w-4 h-4" />} onClick={exportCount} disabled={!data?.length}>Download count sheet</Button>
        {canEdit && <Button icon={<Upload className="w-4 h-4" />} onClick={() => setImporting(true)}>Upload count</Button>}
      </>}
    >
      <Card padded={false}>
        <FilterBar search={{ value: q, onChange: setQ, placeholder: 'Search stock by product name or SKU…' }} count={isLoading ? null : rows.length} noun={['product', 'products']}
          filters={[
            { key: 'level', label: 'Stock level', value: filter, onChange: setFilter, defaultValue: 'all', options: [{ value: 'all', label: 'All products' }, { value: 'low', label: 'Running low' }, { value: 'out', label: 'Out of stock' }] },
            { key: 'supplier', label: 'Main supplier', value: supplier, onChange: setSupplier, allLabel: 'All suppliers', options: [...suppliers.map(([id, name]) => ({ value: id, label: name })), { value: '__none', label: 'No supplier yet' }] },
            { key: 'status', label: 'Product', value: pstatus, onChange: setPstatus, allLabel: 'On sale and drafts', options: [{ value: 'active', label: 'On sale' }, { value: 'draft', label: 'Drafts' }, { value: 'archived', label: 'Archived' }] },
          ]} />
        {isLoading ? <Loading /> : error ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : !rows.length ? (
          <Empty icon={<Boxes className="w-5 h-5" />} title={filter === 'all' ? 'No products found' : 'Nothing here — well stocked!'} />
        ) : (
          <Table>
            <thead><tr><Th>Product</Th><Th className="text-right">In stock</Th><Th className="text-right">Held</Th><Th className="text-right">Free to sell</Th><Th className="text-right">Reorder at</Th><Th className="text-right">On order</Th><Th>Supplier</Th><Th /></tr></thead>
            <tbody>
              {pageItems.map((r) => (
                <Tr key={r.productId}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Thumb src={r.image?.url} size={36} />
                      <div className="min-w-0">
                        <button type="button" className="font-medium hover:underline text-left cursor-pointer" onClick={() => setHistory(r)}>{r.name}</button>
                        <div className="text-xs text-slate-500">{r.sku}{r.packSize ? ` · ${r.packSize}` : ''}{r.status !== 'active' ? ` · ${r.status}` : ''}</div>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-right tabular-nums">{r.onHand}</Td>
                  <Td className="text-right tabular-nums text-slate-500">{r.reserved}</Td>
                  <Td className="text-right tabular-nums font-semibold">{r.available} {r.state === 'out' ? <Badge tone="red">Out</Badge> : r.state === 'low' ? <Badge tone="amber">Low</Badge> : null}</Td>
                  <Td className="text-right tabular-nums text-slate-500">{r.reorderPoint ?? '—'}{r.optimalStock != null && <span className="text-slate-400"> → {r.optimalStock}</span>}</Td>
                  <Td className="text-right tabular-nums">{r.onOrder || '—'}</Td>
                  <Td className="text-slate-600 text-xs">{r.supplier?.name ?? '—'}{r.unitCostMinor != null && <div className="text-slate-400">{pence(r.unitCostMinor)} each</div>}</Td>
                  <Td className="text-right whitespace-nowrap">
                    {canEdit && <>
                      <Button size="sm" variant="ghost" onClick={() => setLevels(r)}>Levels</Button>
                      <Button size="sm" onClick={() => setAdjust(r)}>Change</Button>
                    </>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {pager}
      </Card>
      {adjust && <AdjustStock productId={adjust.productId} name={adjust.name} onHand={adjust.onHand} onClose={() => setAdjust(null)} />}
      {levels && <StockLevels productId={levels.productId} name={levels.name} reorderPoint={levels.reorderPoint} optimalStock={levels.optimalStock} unitCostMinor={levels.unitCostMinor} onClose={() => setLevels(null)} />}
      <Modal open={!!history} onClose={() => setHistory(null)} title={`Stock history: ${history?.name ?? ''}`} size="md">
        {history && <><p className="text-sm text-slate-500">Last delivery: {date(history.lastRestockedAt)}</p><StockHistory productId={history.productId} /></>}
      </Modal>
      <CsvImport open={importing} onClose={() => setImporting(false)} title="Upload a stock count" fn="admin_import_stock_csv" extra={{ p_file_name: 'stock-count.csv' }}
        explain={<>
          <p>The file needs two columns: <b>sku</b> and <b>on_hand</b> (the number you counted). Other columns are ignored. Use <b>Download count sheet</b> as the template.</p>
          <p>Each product’s stock is set to the counted number and the difference is recorded in its history.</p>
        </>}
        summary={(r, applied) => applied ? <>Done: {String(r.changes)} products changed.</> : <>{String(r.rows)} rows, {String(r.changes)} products will change.</>} />
    </Screen>
  );
}
