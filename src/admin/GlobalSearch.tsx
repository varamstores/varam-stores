import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Loader2, Search, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { rpc } from '../lib/api';
import { money } from './lib';
import { GUIDE } from './guideContent';
import { cx } from './ui';
import type { Money } from '../types/api';

// One search box for the whole store portal (top bar, or Ctrl+K anywhere). Finds orders, products,
// customers, categories, brands, suppliers, offers and staff — only what the person's role may see —
// plus the portal's own screens and guide topics. Enter or a click goes straight there.

interface Results {
  orders?: Array<{ id: string; orderNumber: string; customer: string; status: string; total: Money }>;
  products?: Array<{ id: string; name: string; sku: string; status: string }>;
  customers?: Array<{ id: string; name: string; email: string }>;
  categories?: Array<{ id: string; name: string }>;
  brands?: Array<{ id: string; name: string }>;
  suppliers?: Array<{ id: string; name: string; email: string | null }>;
  offers?: Array<{ id: string; label: string; status: string }>;
  staff?: Array<{ id: string; name: string; email: string }>;
}
interface Hit { group: string; title: string; sub?: string; go: [string, string?] }

export const GlobalSearch: React.FC<{ screens: Array<{ key: string; label: string }>; go: (screen: string, param?: string) => void }> = ({ screens, go }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (open) { setQ(''); setDebounced(''); setActive(0); window.setTimeout(() => input.current?.focus(), 0); } }, [open]);
  useEffect(() => { const t = window.setTimeout(() => setDebounced(q.trim()), 250); return () => window.clearTimeout(t); }, [q]);

  const { data, isFetching } = useQuery({
    queryKey: ['admin', 'admin_global_search', debounced],
    queryFn: () => rpc<Results>('admin_global_search', { p_q: debounced }),
    enabled: open && debounced.length >= 2,
    staleTime: 10_000,
  });

  const hits: Hit[] = useMemo(() => {
    const s = debounced.toLowerCase();
    if (s.length < 2) return [];
    const out: Hit[] = [];
    screens.filter((x) => x.label.toLowerCase().includes(s)).slice(0, 4).forEach((x) => out.push({ group: 'Screens', title: x.label, sub: 'Open this screen', go: [x.key] }));
    (data?.orders ?? []).forEach((o) => out.push({ group: 'Orders', title: o.orderNumber, sub: `${o.customer} · ${money(o.total)}`, go: ['orders', o.id] }));
    (data?.products ?? []).forEach((p) => out.push({ group: 'Products', title: p.name, sub: `${p.sku}${p.status !== 'active' ? ` · ${p.status}` : ''}`, go: ['products', p.id] }));
    (data?.customers ?? []).forEach((c) => out.push({ group: 'Customers', title: c.name, sub: c.email, go: ['customers', c.id] }));
    (data?.categories ?? []).forEach((c) => out.push({ group: 'Categories', title: c.name, go: ['categories', c.name] }));
    (data?.brands ?? []).forEach((b) => out.push({ group: 'Brands', title: b.name, go: ['brands', b.name] }));
    (data?.suppliers ?? []).forEach((x) => out.push({ group: 'Suppliers', title: x.name, sub: x.email ?? undefined, go: ['buying', `suppliers:${x.name}`] }));
    (data?.offers ?? []).forEach((o) => out.push({ group: 'Offers', title: o.label, sub: o.status, go: ['offers', o.id] }));
    (data?.staff ?? []).forEach((x) => out.push({ group: 'Staff', title: x.name, sub: x.email, go: ['staff', x.name] }));
    GUIDE.filter((t) => `${t.title} ${t.summary}`.toLowerCase().includes(s)).slice(0, 4).forEach((t) => out.push({ group: 'Guide', title: t.title, sub: t.summary, go: ['guide', t.key] }));
    return out;
  }, [data, debounced, screens]);

  const choose = (h: Hit) => { setOpen(false); go(...h.go); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); choose(hits[active]); }
  };
  useEffect(() => { setActive(0); }, [debounced]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Search everything"
        className="flex items-center gap-2 h-9 w-full max-w-md px-3 rounded-md border border-[#C4CAD3] bg-white text-[13.5px] text-[#7A8594] hover:border-[#18181B] cursor-pointer">
        <Search className="w-4 h-4 shrink-0" /><span className="truncate flex-1 text-left">Search orders, products, customers…</span>
        <kbd className="hidden sm:inline text-[11px] font-semibold text-[#5F6B7A] border border-[#D6DBE1] rounded px-1.5 py-0.5">Ctrl K</kbd>
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[110] flex items-start justify-center p-3 sm:pt-[12vh]" onKeyDown={onKey}>
          <div className="absolute inset-0 bg-[#0F1115]/50" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="Search everything" className="relative w-full max-w-2xl bg-white rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[76vh]">
            <div className="flex items-center gap-3 px-4 border-b border-[#E2E6EB]">
              <Search className="w-5 h-5 text-[#5F6B7A]" />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search orders, products, customers, brands, offers, screens…"
                className="flex-1 h-14 text-[16px] outline-none bg-transparent" />
              {isFetching && <Loader2 className="w-4 h-4 animate-spin text-[#7A8594]" />}
              <button type="button" aria-label="Close search" onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-[#F1F3F5] cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto py-2">
              {debounced.length < 2 ? (
                <p className="px-4 py-6 text-[14px] text-[#5F6B7A]">Type at least two letters — an order number (VF-10948), a product or SKU, a customer’s name, email or postcode, a brand, a promo code, or a screen name.</p>
              ) : !hits.length && !isFetching ? (
                <p className="px-4 py-6 text-[14px] text-[#5F6B7A]">Nothing found for “{debounced}”.</p>
              ) : hits.map((h, i) => (
                <React.Fragment key={`${h.group}-${h.title}-${i}`}>
                  {h.group !== hits[i - 1]?.group && <div className="px-4 pt-3 pb-1 text-[12px] font-semibold text-[#5F6B7A]">{h.group}</div>}
                  <button type="button" onMouseEnter={() => setActive(i)} onClick={() => choose(h)}
                    className={cx('w-full flex items-center gap-3 px-4 py-2.5 text-left cursor-pointer', i === active && 'bg-[#FFF8D6]')}>
                    {h.group === 'Guide' ? <BookOpen className="w-4 h-4 text-[#7A8594] shrink-0" /> : <span className="w-4 h-4 shrink-0" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-medium truncate">{h.title}</span>
                      {h.sub && <span className="block text-[12.5px] text-[#5F6B7A] truncate">{h.sub}</span>}
                    </span>
                    {i === active && <span className="text-[12px] text-[#5F6B7A]">Enter ↵</span>}
                  </button>
                </React.Fragment>
              ))}
            </div>
            <div className="px-4 py-2 border-t border-[#E2E6EB] text-[12px] text-[#7A8594]">↑ ↓ to move · Enter to open · Esc to close</div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
