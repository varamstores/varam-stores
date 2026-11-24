import React, { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import { rpc } from '../../lib/api';
import { dateTime, errorText } from '../lib';
import { Badge, Button, Card, Empty, ErrorState, Loading, Screen, SearchInput, Select, Table, Td, Th } from '../ui';

interface Entry { id: number; at: string; action: string; entityType: string; entityId: string | null; actorType: string; actor: string | null; changes: Record<string, unknown> }

// "product.saved" → "Product saved"; a few get friendlier words.
const WORDS: Record<string, string> = {
  'setting.updated': 'Changed a setting', 'cms.entry_updated': 'Edited website content', 'cms.sync': 'Website content structure updated', 'staff.invited': 'Invited a staff member',
  'staff.updated': 'Changed a staff member', 'order.cancelled': 'Cancelled an order', 'refund.requested': 'Asked for a refund', 'refund.approved': 'Approved a refund',
  'refund.rejected': 'Rejected a refund', 'price.set': 'Changed a price', 'product.saved': 'Saved a product', 'promotion.saved': 'Saved an offer', 'media.register': 'Uploaded a picture',
};
const human = (a: string) => WORDS[a] ?? (a.charAt(0).toUpperCase() + a.slice(1)).replace(/[._]/g, ' ');
const TYPES = ['order', 'product', 'promotion', 'setting', 'staff', 'zone', 'customer', 'cms', 'purchase_order', 'refund_request', 'category', 'brand', 'supplier'];

export default function ActivityScreen(_: ScreenProps) {
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const query = useInfiniteQuery({
    queryKey: ['admin', 'admin_list_audit_log', type, q],
    // (a new search starts again from the newest page)
    queryFn: ({ pageParam }) => rpc<Entry[]>('admin_list_audit_log', { p_entity_type: type || undefined, p_q: q || undefined, p_limit: 100, p_before: pageParam ?? undefined }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => (last.length === 100 ? last[last.length - 1].id : undefined),
  });
  const pages = query.data?.pages ?? [];
  const shown = Math.min(page, Math.max(0, pages.length - 1));
  const rows = pages[shown] ?? [];
  const older = async () => { if (shown + 1 >= pages.length) { const r = await query.fetchNextPage(); if ((r.data?.pages.length ?? 0) <= shown + 1) return; } setPage(shown + 1); };
  return (
    <Screen title="Activity log" intro="Every change made in the store portal and by the system: who, what and when. Nothing here can be edited or deleted."
      guide={<p>Use it to answer “who changed this price?” or “when was this order cancelled?”. Click a line to see exactly what changed.</p>}>
      <Card padded={false}>
        <div className="p-4 flex flex-col md:flex-row gap-2 border-b border-slate-100">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Search actions or item numbers…" className="flex-1" />
          <Select value={type} onChange={(v) => { setType(v); setPage(0); }} placeholder="Everything" className="md:w-60" options={TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) }))} />
        </div>
        {query.isLoading ? <Loading /> : query.error ? <ErrorState error={query.error} text={errorText(query.error)} onRetry={() => void query.refetch()} /> : !rows.length ? (
          <Empty icon={<History className="w-5 h-5" />} title="Nothing found" />
        ) : (
          <>
            <Table>
              <thead><tr><Th>When</Th><Th>Who</Th><Th>What</Th><Th>Item</Th></tr></thead>
              <tbody>
                {rows.map((e) => (
                  <React.Fragment key={e.id}>
                    <tr className="cursor-pointer hover:bg-[#F8F0E3]/40" onClick={() => setOpen(open === e.id ? null : e.id)}>
                      <Td className="whitespace-nowrap text-slate-500">{dateTime(e.at)}</Td>
                      <Td>{e.actorType === 'staff' ? e.actor ?? 'Staff' : <Badge>{e.actorType === 'system' ? 'Automatic' : e.actorType === 'customer' ? 'Customer' : e.actorType}</Badge>}</Td>
                      <Td>{human(e.action)}</Td>
                      <Td className="text-xs text-slate-500 font-mono truncate max-w-[16rem]">{e.entityType}{e.entityId ? ` · ${e.entityId}` : ''}</Td>
                    </tr>
                    {open === e.id && <tr><Td colSpan={4} className="bg-slate-50"><pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(e.changes, null, 2)}</pre></Td></tr>}
                  </React.Fragment>
                ))}
              </tbody>
            </Table>
            <nav aria-label="Pages" className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[#E8EBEF]">
              <span className="text-[13px] text-[#5F6B7A]">Page {shown + 1} · newest first</span>
              <div className="flex gap-1">
                <Button size="sm" disabled={shown === 0} onClick={() => setPage(shown - 1)}>‹ Newer</Button>
                <Button size="sm" loading={query.isFetchingNextPage} disabled={shown + 1 >= pages.length && !query.hasNextPage} onClick={() => void older()}>Older ›</Button>
              </div>
            </nav>
          </>
        )}
      </Card>
    </Screen>
  );
}
