import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminQuery, mediaUrl, uploadImage, money } from './lib';
import { Button, Empty, Loading, Modal, SearchInput, Thumb, cx } from './ui';
import { toast } from './toast';
import type { Money } from '../types/api';

// ── products ────────────────────────────────────────────────────────────────────────────────────
export interface PickedProduct { id: string; name: string; slug: string; sku: string; status: string; price: Money | null; image: { url: string } | null; packSize: string | null; saleUnit: string; available?: number }

/** Type to find a product (name or SKU); click one to choose it. */
export const ProductPicker: React.FC<{ onPick: (p: PickedProduct) => void; placeholder?: string; activeOnly?: boolean; exclude?: string[] }> = ({
  onPick, placeholder = 'Search products by name or SKU…', activeOnly, exclude = [],
}) => {
  const [q, setQ] = useState('');
  const { data, isFetching } = useAdminQuery<{ items: PickedProduct[] }>('admin_list_products',
    { p_q: q, p_status: activeOnly ? 'active' : undefined, p_limit: 8 }, { enabled: q.trim().length >= 2 });
  const items = (data?.items ?? []).filter((p) => !exclude.includes(p.id));
  return (
    <div className="relative">
      <SearchInput value={q} onChange={setQ} placeholder={placeholder} />
      {q.trim().length >= 2 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#E2E8F0] rounded-lg shadow-xl max-h-80 overflow-y-auto">
          {isFetching && !data ? <div className="p-3 text-sm text-slate-500 flex gap-2"><Loader2 className="w-4 h-4 animate-spin" />Searching…</div>
            : items.length === 0 ? <div className="p-3 text-sm text-slate-500">No products match “{q}”.</div>
            : items.map((p) => (
              <button key={p.id} type="button" onClick={() => { onPick(p); setQ(''); }} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-amber-50 cursor-pointer">
                <Thumb src={p.image?.url} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{p.name}</span>
                  <span className="block text-xs text-slate-500">{p.sku}{p.packSize ? ` · ${p.packSize}` : ''}{p.status !== 'active' ? ` · ${p.status}` : ''}</span>
                </span>
                <span className="text-sm font-semibold">{money(p.price)}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
};

// ── pictures ────────────────────────────────────────────────────────────────────────────────────
interface MediaItem { path: string; url: string; bytes: number; contentType: string; uploadedAt: string }

/** The picture library: choose an existing picture or upload a new one. Returns the storage path. */
export const MediaPicker: React.FC<{ open: boolean; onClose: () => void; onPick: (path: string, url: string) => void; folder?: string; title?: string }> = ({
  open, onClose, onPick, folder = 'cms', title = 'Choose a picture',
}) => {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(60);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { data, isLoading } = useAdminQuery<{ items: MediaItem[]; total: number }>('admin_list_media', { p_q: q || undefined, p_limit: limit }, { enabled: open });

  const upload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const out = await uploadImage(file, folder);
      await qc.invalidateQueries({ queryKey: ['admin', 'admin_list_media'] });
      toast.success('Picture uploaded');
      onPick(out.path, out.url);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The upload failed.');
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <div className="flex flex-col sm:flex-row gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search pictures by file name…" className="flex-1" />
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void upload(e.target.files)} />
        <Button variant="primary" icon={<Upload className="w-4 h-4" />} loading={uploading} onClick={() => input.current?.click()}>Upload from this device</Button>
      </div>
      <p className="text-xs text-slate-500">Tip: use landscape pictures about 1600 px wide for banners, square pictures for products. JPG or WebP keeps the site fast.</p>
      {isLoading ? <Loading /> : !data?.items.length ? <Empty title="No pictures found" text="Upload one with the yellow button." /> : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
            {data.items.map((m) => (
              <button key={m.path} type="button" onClick={() => { onPick(m.path, m.url); onClose(); }} title={m.path}
                className="group aspect-square rounded-lg border border-[#E2E8F0] overflow-hidden bg-slate-50 hover:ring-2 hover:ring-[#F5D103] cursor-pointer relative">
                <img src={m.url} alt="" loading="lazy" className="w-full h-full object-contain" />
                <span className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100">{m.path.split('/').pop()}</span>
              </button>
            ))}
          </div>
          {data.total > data.items.length && <div className="text-center"><Button size="sm" onClick={() => setLimit((l) => l + 60)}>Show more ({data.total - data.items.length} more)</Button></div>}
        </>
      )}
    </Modal>
  );
};

/** One picture slot: shows the picture with Change / Remove. Value is a storage path (or null). */
export const ImageField: React.FC<{ value: string | null | undefined; onChange: (path: string | null) => void; folder?: string; label?: string; aspect?: 'square' | 'wide'; allowRemove?: boolean }> = ({
  value, onChange, folder, label = 'picture', aspect = 'wide', allowRemove = true,
}) => {
  const [open, setOpen] = useState(false);
  const url = mediaUrl(value);
  return (
    <div className="flex items-center gap-3">
      <div className={cx('bg-slate-100 border border-[#E2E8F0] rounded-lg overflow-hidden flex items-center justify-center shrink-0', aspect === 'square' ? 'w-20 h-20' : 'w-32 h-20')}>
        {url ? <img src={url} alt="" className="w-full h-full object-contain" /> : <ImagePlus className="w-6 h-6 text-slate-400" />}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={url ? 'outline' : 'primary'} onClick={() => setOpen(true)}>{url ? `Change ${label}` : `Add ${label}`}</Button>
        {url && allowRemove && <Button size="sm" variant="ghost" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => onChange(null)}>Remove</Button>}
      </div>
      <MediaPicker open={open} onClose={() => setOpen(false)} folder={folder} onPick={(path) => onChange(path)} />
    </div>
  );
};
