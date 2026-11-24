import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ImageOff, Info, Lightbulb, Loader2, Search, X } from 'lucide-react';
import { ORDER_STATUS, type Tone } from './lib';
import { dismiss, subscribe, type ToastItem } from './toast';

// The store portal's design system. Every screen is built from these pieces, so the whole portal
// looks and behaves the same:
//   · yellow = the one main action on a screen; ink = secondary; red outline = destructive
//   · each area of the portal has its own colour (Today, Shop, Customers, Marketing, Set-up), used
//     on the sidebar, the screen header and side panels, so people always know where they are
//   · plain sentence-case words everywhere; no all-caps labels

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

// ── areas ───────────────────────────────────────────────────────────────────────────────────────
export type AreaName = 'Today' | 'Shop' | 'Customers' | 'Marketing' | 'Set-up' | 'Help';
// Deep, muted colours (no neon): ochre, forest, navy, plum, graphite.
export const AREA: Record<AreaName, { tile: string; text: string; dot: string; bar: string; icon: string; blurb: string }> = {
  Today: { tile: 'bg-[#9A5B13] text-white', text: 'text-[#9A5B13]', dot: 'bg-[#C98A3A]', bar: 'bg-[#9A5B13]', icon: 'text-[#D9A35E]', blurb: 'Orders coming in and going out' },
  Shop: { tile: 'bg-[#2F6B4F] text-white', text: 'text-[#2F6B4F]', dot: 'bg-[#5E9C7E]', bar: 'bg-[#2F6B4F]', icon: 'text-[#7FB69A]', blurb: 'What you sell and what is in stock' },
  Customers: { tile: 'bg-[#2B4C7E] text-white', text: 'text-[#2B4C7E]', dot: 'bg-[#6A8BBF]', bar: 'bg-[#2B4C7E]', icon: 'text-[#8EA9D4]', blurb: 'People who shop with you' },
  Marketing: { tile: 'bg-[#743C63] text-white', text: 'text-[#743C63]', dot: 'bg-[#A8739A]', bar: 'bg-[#743C63]', icon: 'text-[#C495B6]', blurb: 'Offers, points and the website' },
  'Set-up': { tile: 'bg-[#4B5563] text-white', text: 'text-[#4B5563]', dot: 'bg-[#8B95A3]', bar: 'bg-[#4B5563]', icon: 'text-[#A3ACB8]', blurb: 'How the shop runs' },
  Help: { tile: 'bg-[#18181B] text-[#F5D103]', text: 'text-[#18181B]', dot: 'bg-[#F5D103]', bar: 'bg-[#18181B]', icon: 'text-[#F5D103]', blurb: 'How everything works' },
};
interface AreaInfo { area: AreaName; icon: React.ElementType; label: string }
export const AreaContext = createContext<AreaInfo | null>(null);
export const useArea = () => useContext(AreaContext);

// ── buttons ─────────────────────────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'dark' | 'outline' | 'ghost' | 'danger';
const BTN: Record<ButtonVariant, string> = {
  primary: 'bg-[#F5D103] text-[#18181B] hover:bg-[#FFDE21] border border-[#D9B800] shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]',
  dark: 'bg-[#18181B] text-white hover:bg-[#2A2A2E] border border-[#18181B]',
  outline: 'bg-white text-[#18181B] hover:bg-[#F3F4F6] border border-[#C4CAD3] shadow-[0_1px_0_rgba(16,24,40,0.05)]',
  ghost: 'bg-transparent text-[#3F4652] hover:bg-[#EEF0F3] border border-transparent',
  danger: 'bg-white text-[#9B2C2C] hover:bg-[#F8ECEA] border border-[#E2BDB8]',
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant; size?: 'sm' | 'md'; icon?: React.ReactNode; loading?: boolean;
}> = ({ variant = 'outline', size = 'md', icon, loading, children, className, disabled, type = 'button', title, ...rest }) => (
  <button
    type={type}
    disabled={disabled || loading}
    title={title ?? (typeof rest['aria-label'] === 'string' ? rest['aria-label'] : undefined)}
    className={cx(
      'inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#F5D103] whitespace-nowrap',
      size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-10 px-4 text-sm',
      BTN[variant], className,
    )}
    {...rest}
  >
    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
    {children}
  </button>
);

// ── layout ──────────────────────────────────────────────────────────────────────────────────────
function useGuideState(id: string) {
  const key = `admin-guide-${id}`;
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(key) !== 'closed'; } catch { return true; }
  });
  const set = (v: boolean) => {
    setOpen(v);
    try { localStorage.setItem(key, v ? 'open' : 'closed'); } catch { /* private mode */ }
  };
  return [open, set] as const;
}

/**
 * A screen: coloured area icon, title, one-sentence purpose, the main actions, and an optional
 * "How this works" guide shown as short step cards that can be hidden and brought back.
 */
export const Screen: React.FC<{
  title: string; intro: string; guide?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode;
}> = ({ title, intro, guide, actions, children }) => {
  const info = useArea();
  const Icon = info?.icon;
  const [guideOpen, setGuideOpen] = useGuideState(title);
  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          {Icon && info && (
            <div className={cx('w-12 h-12 rounded-lg flex items-center justify-center shrink-0', AREA[info.area].tile)}>
              <Icon className="w-6 h-6" strokeWidth={1.75} />
            </div>
          )}
          <div className="min-w-0">
            {info && <div className={cx('text-[13px] font-medium', AREA[info.area].text)}>{info.area}</div>}
            <h1 className="text-[26px] sm:text-[28px] leading-tight font-semibold tracking-[-0.01em] text-[#18181B]">{title}</h1>
            <p className="text-[15px] text-[#5F6B7A] mt-1 max-w-2xl">{intro}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {guide && !guideOpen && <Button variant="ghost" icon={<Lightbulb className="w-4 h-4" />} onClick={() => setGuideOpen(true)}>How this works</Button>}
          {actions}
        </div>
      </header>
      {guide && guideOpen && <GuidePanel onClose={() => setGuideOpen(false)}>{guide}</GuidePanel>}
      {children}
    </div>
  );
};

/** "How this works": each list item becomes a small card; numbered when it is a sequence (<ol>). */
const GuidePanel: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => (
  <section aria-label="How this works" className="rounded-lg bg-[#1F2024] px-4 sm:px-5 py-4">
    <div className="flex items-center gap-2 mb-3">
      <Lightbulb className="w-4 h-4 text-[#F5D103]" />
      <h2 className="text-sm font-semibold text-white">How this works</h2>
      <button type="button" onClick={onClose} className="ml-auto text-[13px] font-medium text-[#B5BCC6] hover:text-white hover:underline cursor-pointer">Hide</button>
    </div>
    <div className={cx(
      'text-[13.5px] leading-snug text-[#C9CED6] [&_b]:font-semibold [&_b]:text-white',
      '[&_ol]:grid [&_ol]:gap-2.5 [&_ol]:sm:grid-cols-2 [&_ol]:xl:grid-cols-4 [&_ol]:[counter-reset:step]',
      '[&_ul]:grid [&_ul]:gap-2.5 [&_ul]:sm:grid-cols-2 [&_ul]:xl:grid-cols-4',
      '[&_li]:bg-white/[0.05] [&_li]:rounded-md [&_li]:border [&_li]:border-white/10 [&_li]:px-3 [&_li]:py-2.5',
      '[&_ol>li]:[counter-increment:step] [&_ol>li]:before:content-[counter(step)] [&_ol>li]:before:inline-flex [&_ol>li]:before:items-center [&_ol>li]:before:justify-center',
      '[&_ol>li]:before:w-5 [&_ol>li]:before:h-5 [&_ol>li]:before:rounded-full [&_ol>li]:before:bg-[#F5D103] [&_ol>li]:before:text-[#18181B] [&_ol>li]:before:text-[11px] [&_ol>li]:before:font-bold [&_ol>li]:before:mr-2 [&_ol>li]:before:align-[1px]',
      '[&_p]:max-w-3xl',
    )}>{children}</div>
  </section>
);

/** Kept for screens that place a guide inside their own layout. */
export const Guide: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => {
  const [open, setOpen] = useGuideState(id);
  return open ? <GuidePanel onClose={() => setOpen(false)}>{children}</GuidePanel>
    : <Button variant="ghost" size="sm" icon={<Lightbulb className="w-4 h-4" />} onClick={() => setOpen(true)}>How this works</Button>;
};

export const Card: React.FC<{ title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; className?: string; padded?: boolean }> = ({
  title, description, actions, children, className, padded = true,
}) => (
  <section className={cx('bg-white rounded-lg border border-[#D6DBE1] shadow-[0_1px_2px_rgba(16,24,40,0.04)]', className)}>
    {(title || actions) && (
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 sm:px-5 py-3.5 bg-[#F6F7F9] border-b border-[#E2E6EB] rounded-t-lg">
        <div className="min-w-0">
          {title && <h2 className="font-semibold text-[15px] text-[#18181B]">{title}</h2>}
          {description && <p className="text-[13px] text-[#5F6B7A] mt-0.5">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
    )}
    {children !== undefined && children !== null && <div className={padded ? 'p-4 sm:p-5' : ''}>{children}</div>}
  </section>
);

/** A big number with a label. Clickable when it leads somewhere. */
export const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone; onClick?: () => void }> = ({ label, value, hint, tone, onClick }) => {
  const body = (
    <>
      <div className="text-[13px] text-[#5F6B7A]">{label}</div>
      <div className={cx('text-[28px] leading-none font-semibold mt-2 tabular-nums tracking-tight', tone === 'red' && 'text-[#A63A3A]', tone === 'amber' && 'text-[#9A5B13]', tone === 'green' && 'text-[#2F6B4F]')}>{value}</div>
      {hint && <div className="text-[12.5px] text-[#5F6B7A] mt-2">{hint}</div>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="group text-left bg-white rounded-lg border border-[#D6DBE1] p-4 w-full hover:border-[#18181B] cursor-pointer relative">
      {body}<ChevronRight className="w-4 h-4 absolute top-4 right-3 text-[#C3C9D2] group-hover:text-[#18181B]" />
    </button>
  ) : <div className="bg-white rounded-lg border border-[#D6DBE1] p-4">{body}</div>;
};

// ── badges ──────────────────────────────────────────────────────────────────────────────────────
const TONE: Record<Tone, { box: string; dot: string }> = {
  grey: { box: 'bg-[#ECEEF1] text-[#3F4652] ring-1 ring-inset ring-[#D3D8DF]', dot: 'bg-[#8B95A3]' },
  blue: { box: 'bg-[#E6ECF5] text-[#223E68] ring-1 ring-inset ring-[#C3D0E4]', dot: 'bg-[#2B4C7E]' },
  green: { box: 'bg-[#E5F0EA] text-[#245740] ring-1 ring-inset ring-[#BFD8CA]', dot: 'bg-[#2F6B4F]' },
  amber: { box: 'bg-[#F6ECDD] text-[#7A4A0F] ring-1 ring-inset ring-[#E3CBA6]', dot: 'bg-[#B0701E]' },
  red: { box: 'bg-[#F6E6E4] text-[#8A2B2B] ring-1 ring-inset ring-[#E5C2BD]', dot: 'bg-[#A63A3A]' },
  violet: { box: 'bg-[#F0E6EE] text-[#5E3050] ring-1 ring-inset ring-[#DCC4D5]', dot: 'bg-[#743C63]' },
  yellow: { box: 'bg-[#FBF1C7] text-[#5C4300] ring-1 ring-inset ring-[#E8D68A]', dot: 'bg-[#B8960A]' },
};
/** A short status word with a coloured dot. */
export const Badge: React.FC<{ tone?: Tone; children: React.ReactNode; title?: string }> = ({ tone = 'grey', children, title }) => (
  <span title={title} className={cx('inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 rounded-full text-[12px] font-medium whitespace-nowrap align-middle', TONE[tone].box)}>
    <span className={cx('w-1.5 h-1.5 rounded-full', TONE[tone].dot)} />{children}
  </span>
);
export const OrderStatus: React.FC<{ status: string }> = ({ status }) => {
  const s = ORDER_STATUS[status] ?? { label: status, tone: 'grey' as Tone, help: '' };
  return <Badge tone={s.tone} title={s.help}>{s.label}</Badge>;
};
export const SampleTag: React.FC<{ show?: boolean }> = ({ show }) => (show
  ? <span title="Example data, removed before launch" className="inline-flex items-center px-1.5 py-px rounded border border-dashed border-[#C3C9D2] text-[11px] text-[#7A8594] align-middle">example</span>
  : null);

// ── form controls ───────────────────────────────────────────────────────────────────────────────
const INPUT = 'w-full h-10 px-3 rounded-md border border-[#D9DDE3] bg-white text-[14px] text-[#18181B] placeholder:text-[#9AA3AF] focus:outline-none focus:ring-2 focus:ring-[#F5D103]/70 focus:border-[#C9A800] disabled:bg-[#F6F7F9] disabled:text-[#7A8594]';

export const Field: React.FC<{ label: React.ReactNode; help?: React.ReactNode; error?: string | null; optional?: boolean; children: React.ReactNode; className?: string }> = ({
  label, help, error, optional, children, className,
}) => (
  <label className={cx('block', className)}>
    <span className="block text-[13.5px] font-medium text-[#18181B] mb-1.5">
      {label}{optional && <span className="font-normal text-[#7A8594]"> · optional</span>}
    </span>
    {children}
    {error ? <span className="block text-[12.5px] text-[#A63A3A] mt-1.5">{error}</span> : help ? <span className="block text-[12.5px] text-[#5F6B7A] mt-1.5">{help}</span> : null}
  </label>
);

export const TextInput: React.FC<Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { value: string | null | undefined; onChange: (v: string) => void }> = ({ value, onChange, className, ...rest }) => (
  <input {...rest} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={cx(INPUT, className)} />
);

export const TextArea: React.FC<Omit<React.ComponentProps<'textarea'>, 'onChange' | 'value'> & { value: string | null | undefined; onChange: (v: string) => void }> = ({ value, onChange, className, rows = 4, ...rest }) => (
  <textarea {...rest} rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={cx(INPUT, 'h-auto py-2.5 leading-relaxed', className)} />
);

/** Whole numbers (or decimals with `decimals`). Empty = null. */
export const NumberInput: React.FC<{ value: number | null | undefined; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; placeholder?: string; suffix?: string; disabled?: boolean; className?: string; decimals?: boolean }> = ({
  value, onChange, min, max, step, placeholder, suffix, disabled, className, decimals,
}) => {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => { setText((t) => (t !== '' && t !== '-' && Number(t) === value ? t : value == null ? (t === '-' ? t : '') : String(value))); }, [value]);
  return (
    <div className={cx('relative', className)}>
      <input
        inputMode={decimals ? 'decimal' : 'numeric'}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        min={min} max={max} step={step}
        onChange={(e) => {
          const t = e.target.value.replace(decimals ? /[^0-9.\-]/g : /[^0-9\-]/g, '');
          setText(t);
          if (t === '' || t === '-') onChange(null);
          else if (Number.isFinite(Number(t))) onChange(Number(t));
        }}
        className={cx(INPUT, suffix && 'pr-14')}
      />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#7A8594] pointer-events-none">{suffix}</span>}
    </div>
  );
};

/** Money typed in pounds, stored in pence. Empty = null. */
export const MoneyInput: React.FC<{ value: number | null | undefined; onChange: (pence: number | null) => void; placeholder?: string; disabled?: boolean; className?: string }> = ({ value, onChange, placeholder, disabled, className }) => {
  const [text, setText] = useState(value == null ? '' : (value / 100).toFixed(2));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText((t) => {
      const cur = t.replace(/[£,\s]/g, '');
      return cur !== '' && Math.round(Number(cur) * 100) === value ? t : value == null ? '' : (value / 100).toFixed(2);
    });
  }, [value]);
  return (
    <div className={cx('relative', className)}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[#7A8594] pointer-events-none">£</span>
      <input
        inputMode="decimal"
        value={text}
        disabled={disabled}
        placeholder={placeholder ?? '0.00'}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const clean = t.replace(/[£,\s]/g, '');
          if (clean === '') { setBad(false); onChange(null); return; }
          const ok = /^\d+(\.\d{0,2})?$/.test(clean);
          setBad(!ok);
          if (ok) onChange(Math.round(Number(clean) * 100));
        }}
        className={cx(INPUT, 'pl-7', bad && 'border-red-400 focus:ring-red-300')}
      />
    </div>
  );
};

export interface Option { value: string; label: string; hint?: string; group?: string; icon?: React.ReactNode }

/**
 * A drop-down that looks the same on every computer and phone (no browser-native list): a button
 * showing the choice, and a list that opens below it. Long lists get a search box. Keyboard:
 * arrows move, Enter picks, Escape closes.
 */
export const Select: React.FC<{
  value: string | null | undefined; onChange: (v: string) => void; options: Option[]; placeholder?: string; disabled?: boolean; className?: string;
  'aria-label'?: string; searchable?: boolean; size?: 'sm' | 'md';
}> = ({ value, onChange, options, placeholder, disabled, className, searchable, size = 'md', ...rest }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean; maxH: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const all: Option[] = placeholder !== undefined ? [{ value: '', label: placeholder }, ...options] : options;
  const current = all.find((o) => o.value === (value ?? ''));
  const withSearch = searchable ?? options.length > 8;
  const shown = q.trim() ? all.filter((o) => `${o.label} ${o.hint ?? ''} ${o.group ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())) : all;

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 8;
    const up = below < 240 && r.top > below;
    setPos({ left: r.left, top: up ? r.top - 4 : r.bottom + 4, width: Math.max(r.width, 220), up, maxH: Math.max(160, Math.min(360, (up ? r.top : below) - 12)) });
  };
  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const onMove = () => place();
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true); };
  }, [open]);
  useEffect(() => { if (open) { setQ(''); setActive(Math.max(0, all.findIndex((o) => o.value === (value ?? '')))); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (o: Option) => { onChange(o.value); setOpen(false); btn.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (!open && ['ArrowDown', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && shown[active]) { e.preventDefault(); choose(shown[active]); }
  };
  useEffect(() => { pop.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  return (
    <div className={cx('relative', className)}>
      <button ref={btn} type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} onKeyDown={onKey}
        aria-haspopup="listbox" aria-expanded={open} aria-label={rest['aria-label']}
        className={cx(INPUT, 'flex items-center gap-2 text-left pr-9 cursor-pointer disabled:cursor-not-allowed', size === 'sm' && 'h-8 text-[13px]', open && 'ring-2 ring-[#F5D103]/70 border-[#C9A800]')}>
        {current?.icon}
        <span className={cx('truncate flex-1', (!current || current.value === '') && placeholder !== undefined && 'text-[#7A8594]')}>{current?.label ?? placeholder ?? 'Choose…'}</span>
        <ChevronDown className={cx('w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#5F6B7A] transition-transform', open && 'rotate-180')} />
      </button>
      {open && pos && createPortal(
        <div ref={pop} role="listbox" onKeyDown={onKey}
          className="fixed z-[120] bg-white rounded-md border border-[#C4CAD3] shadow-[0_12px_32px_rgba(16,24,40,0.18)] flex flex-col overflow-hidden"
          style={{ left: Math.min(pos.left, window.innerWidth - pos.width - 8), width: pos.width, maxWidth: 'calc(100vw - 16px)', ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }), maxHeight: pos.maxH }}>
          {withSearch && (
            <div className="p-2 border-b border-[#E8EBEF]">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7A8594]" />
                <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} placeholder="Type to search…"
                  className="w-full h-9 pl-8 pr-2 rounded-md border border-[#C4CAD3] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#F5D103]/70" />
              </div>
            </div>
          )}
          <div className="overflow-y-auto py-1">
            {shown.length === 0 && <div className="px-3 py-2.5 text-[13.5px] text-[#5F6B7A]">Nothing matches “{q}”.</div>}
            {shown.map((o, i) => (
              <React.Fragment key={`${o.value}-${i}`}>
                {o.group && o.group !== shown[i - 1]?.group && <div className="px-3 pt-2.5 pb-1 text-[12px] font-semibold text-[#5F6B7A]">{o.group}</div>}
                <button type="button" role="option" aria-selected={o.value === (value ?? '')} data-index={i} onMouseEnter={() => setActive(i)} onClick={() => choose(o)}
                  className={cx('w-full flex items-center gap-2 px-3 py-2 text-left text-[14px] cursor-pointer', i === active ? 'bg-[#F3F4F6]' : '', o.value === (value ?? '') && 'font-semibold')}>
                  {o.icon}
                  <span className="flex-1 min-w-0"><span className="block truncate">{o.label}</span>{o.hint && <span className="block text-[12px] text-[#7A8594] truncate font-normal">{o.hint}</span>}</span>
                  {o.value === (value ?? '') && <CheckCircle2 className="w-4 h-4 text-[#2F6B4F] shrink-0" />}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export interface FilterDef { key: string; label: string; options: Option[]; value: string; onChange: (v: string) => void; allLabel?: string; defaultValue?: string; hidden?: boolean }

/**
 * The same filter bar on every list: a search box, labelled drop-down filters, the filters in use
 * shown as chips you can remove one by one, "Clear all", and how many results match.
 */
export const FilterBar: React.FC<{
  search?: { value: string; onChange: (v: string) => void; placeholder: string };
  filters?: FilterDef[]; count?: number | null; noun?: [string, string]; extra?: React.ReactNode;
}> = ({ search, filters = [], count, noun = ['result', 'results'], extra }) => {
  const visible = filters.filter((f) => !f.hidden);
  const active = visible.filter((f) => f.value !== (f.defaultValue ?? ''));
  const any = active.length > 0 || !!search?.value;
  const clear = () => { search?.onChange(''); visible.forEach((f) => f.onChange(f.defaultValue ?? '')); };
  return (
    <div className="p-4 space-y-3 border-b border-[#E2E6EB]">
      {search && <SearchInput value={search.value} onChange={search.onChange} placeholder={search.placeholder} />}
      {(visible.length > 0 || extra) && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
          {visible.map((f) => (
            <label key={f.key} className="block min-w-0">
              <span className="block text-[12.5px] font-medium text-[#3F4652] mb-1">{f.label}</span>
              <Select value={f.value} onChange={f.onChange} options={f.options} placeholder={f.defaultValue === undefined || f.defaultValue === '' ? f.allLabel ?? 'All' : undefined} aria-label={f.label} />
            </label>
          ))}
          {extra}
        </div>
      )}
      {(any || count != null) && (
        <div className="flex flex-wrap items-center gap-2">
          {search?.value && (
            <button type="button" onClick={() => search.onChange('')} className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-md bg-[#18181B] text-white text-[12.5px] cursor-pointer">
              Search: “{search.value}” <X className="w-3.5 h-3.5" />
            </button>
          )}
          {active.map((f) => (
            <button key={f.key} type="button" onClick={() => f.onChange(f.defaultValue ?? '')} className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-md bg-[#18181B] text-white text-[12.5px] cursor-pointer" title="Remove this filter">
              {f.label}: {f.options.find((o) => o.value === f.value)?.label ?? f.value} <X className="w-3.5 h-3.5" />
            </button>
          ))}
          {any && <button type="button" onClick={clear} className="text-[12.5px] font-medium underline underline-offset-2 text-[#3F4652] cursor-pointer">Clear all</button>}
          {count != null && <span className="ml-auto text-[12.5px] text-[#5F6B7A]">{count} {count === 1 ? noun[0] : noun[1]}</span>}
        </div>
      )}
    </div>
  );
};

/** Grams or kilos, the shopper's choice; the value is always stored in grams. */
export const WeightInput: React.FC<{ value: number | null | undefined; onChange: (grams: number | null) => void; disabled?: boolean; className?: string }> = ({ value, onChange, disabled, className }) => {
  const [unit, setUnit] = useState<'g' | 'kg'>(value != null && value >= 1000 ? 'kg' : 'g');
  const shown = value == null ? null : unit === 'kg' ? Number((value / 1000).toFixed(3)) : value;
  return (
    <div className={cx('flex', className)}>
      <NumberInput decimals={unit === 'kg'} value={shown} disabled={disabled} className="flex-1 [&_input]:rounded-r-none"
        onChange={(v) => onChange(v == null ? null : unit === 'kg' ? Math.round(v * 1000) : Math.round(v))} />
      <div role="radiogroup" aria-label="Unit" className="flex shrink-0">
        {(['g', 'kg'] as const).map((u, i) => (
          <button key={u} type="button" role="radio" aria-checked={unit === u} disabled={disabled} onClick={() => setUnit(u)}
            className={cx('h-10 px-3 text-[13px] font-semibold border border-[#C4CAD3] cursor-pointer -ml-px', i === 1 && 'rounded-r-md',
              unit === u ? 'bg-[#18181B] text-white border-[#18181B]' : 'bg-white text-[#3F4652] hover:bg-[#F3F4F6]')}>
            {u === 'g' ? 'grams' : 'kilos'}
          </button>
        ))}
      </div>
    </div>
  );
};

/** Page numbers under a list: "Showing 26–50 of 94", previous / next, and page buttons. */
export const Pager: React.FC<{ page: number; pageCount: number; onPage: (p: number) => void; total: number; size: number; loading?: boolean }> = ({ page, pageCount, onPage, total, size, loading }) => {
  if (total <= size && page === 0) return total ? <div className="px-4 py-3 text-[13px] text-[#5F6B7A] border-t border-[#E8EBEF]">{total} in total</div> : null;
  const nums: Array<number | '…'> = [];
  for (let i = 0; i < pageCount; i++) {
    if (i === 0 || i === pageCount - 1 || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  return (
    <nav aria-label="Pages" className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-[#E8EBEF]">
      <span className="text-[13px] text-[#5F6B7A]">Showing {Math.min(total, page * size + 1)}–{Math.min(total, (page + 1) * size)} of {total}</span>
      <div className="flex items-center gap-1">
        <Button size="sm" disabled={page === 0 || loading} onClick={() => onPage(page - 1)}>‹ Previous</Button>
        {nums.map((n, i) => n === '…' ? <span key={`e${i}`} className="px-1.5 text-[#7A8594]">…</span> : (
          <button key={n} type="button" aria-current={n === page ? 'page' : undefined} disabled={loading} onClick={() => onPage(n)}
            className={cx('min-w-8 h-8 px-2 rounded-md text-[13px] font-semibold cursor-pointer', n === page ? 'bg-[#18181B] text-white' : 'text-[#3F4652] hover:bg-[#F3F4F6]')}>{n + 1}</button>
        ))}
        <Button size="sm" disabled={page >= pageCount - 1 || loading} onClick={() => onPage(page + 1)}>Next ›</Button>
      </div>
    </nav>
  );
};

/** Splits a list already in memory into pages of `size`. Goes back to page 1 when the list changes. */
export function usePager<T>(items: T[] | undefined, size = 25) {
  const list = items ?? [];
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(list.length / size));
  useEffect(() => { if (page > pageCount - 1) setPage(0); }, [page, pageCount]);
  const p = Math.min(page, pageCount - 1);
  return {
    pageItems: list.slice(p * size, (p + 1) * size),
    pager: <Pager page={p} pageCount={pageCount} onPage={setPage} total={list.length} size={size} />,
  };
}

/** A row of mutually exclusive choices (e.g. "Everyone · Computers only · Phones only · Nobody"). */
export const Segmented: React.FC<{ value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string; icon?: React.ReactNode }>; disabled?: boolean; size?: 'sm' | 'md' }> = ({
  value, onChange, options, disabled, size = 'md',
}) => (
  <div role="radiogroup" className="inline-flex flex-wrap gap-1 p-1 rounded-lg bg-[#EEF0F3]">
    {options.map((o) => (
      <button key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={disabled} onClick={() => onChange(o.value)}
        className={cx('inline-flex items-center gap-1.5 rounded-md font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
          size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-9 px-3 text-[13.5px]',
          value === o.value ? 'bg-white text-[#18181B] shadow-[0_1px_2px_rgba(16,24,40,0.12)]' : 'text-[#4A5361] hover:text-[#18181B]')}>
        {o.icon}{o.label}
      </button>
    ))}
  </div>
);

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; description?: React.ReactNode; disabled?: boolean }> = ({
  checked, onChange, label, description, disabled,
}) => {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 w-10 h-6 rounded-full shrink-0 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D103]',
          checked ? 'bg-[#2F6B4F]' : 'bg-[#C3C9D2]')}
      >
        <span className={cx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
      </button>
      {(label || description) && (
        <label htmlFor={id} className="cursor-pointer min-w-0">
          {label && <span className="block text-[14px] font-medium">{label}</span>}
          {description && <span className="block text-[12.5px] text-[#5F6B7A] mt-0.5">{description}</span>}
        </label>
      )}
    </div>
  );
};

export const Checkbox: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean }> = ({ checked, onChange, label, description, disabled }) => (
  <label className={cx('flex items-start gap-2.5', disabled ? 'opacity-60' : 'cursor-pointer')}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#18181B] cursor-pointer" />
    <span className="min-w-0">
      <span className="block text-[14px]">{label}</span>
      {description && <span className="block text-[12.5px] text-[#5F6B7A]">{description}</span>}
    </span>
  </label>
);

/** Waits 300 ms after typing stops. */
export const SearchInput: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string; className?: string; autoFocus?: boolean }> = ({ value, onChange, placeholder, className, autoFocus }) => {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  useEffect(() => {
    if (text === value) return;
    const t = window.setTimeout(() => onChange(text), 300);
    return () => window.clearTimeout(t);
  }, [text, value, onChange]);
  return (
    <div className={cx('relative', className)}>
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8594]" />
      <input autoFocus={autoFocus} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={cx(INPUT, 'pl-9 pr-8')} />
      {text && (
        <button type="button" aria-label="Clear search" onClick={() => { setText(''); onChange(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#7A8594] hover:text-[#18181B] cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

/** Filter choices with optional counts. */
export const Chips: React.FC<{ value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string; count?: number | null }> }> = ({ value, onChange, options }) => (
  <div className="flex flex-wrap gap-1.5" role="radiogroup">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        role="radio"
        aria-checked={value === o.value}
        onClick={() => onChange(o.value)}
        className={cx('h-8 px-3 rounded-md border text-[13px] font-medium cursor-pointer transition-colors inline-flex items-center gap-1.5',
          value === o.value ? 'bg-[#18181B] text-white border-[#18181B]' : 'bg-white text-[#3F4652] border-[#C4CAD3] hover:border-[#18181B]')}
      >
        {o.label}{o.count != null && <span className={cx('tabular-nums text-[12px]', value === o.value ? 'text-[#F5D103]' : 'text-[#7A8594]')}>{o.count}</span>}
      </button>
    ))}
  </div>
);

export const Tabs: React.FC<{ value: string; onChange: (v: string) => void; tabs: Array<{ value: string; label: string; hidden?: boolean }> }> = ({ value, onChange, tabs }) => (
  <div className="flex gap-6 border-b border-[#E4E7EC] overflow-x-auto" role="tablist">
    {tabs.filter((t) => !t.hidden).map((t) => (
      <button
        key={t.value}
        type="button"
        role="tab"
        aria-selected={value === t.value}
        onClick={() => onChange(t.value)}
        className={cx('pb-2.5 pt-1 text-[14px] font-medium border-b-2 -mb-px whitespace-nowrap cursor-pointer',
          value === t.value ? 'border-[#18181B] text-[#18181B]' : 'border-transparent text-[#5F6B7A] hover:text-[#18181B]')}
      >
        {t.label}
      </button>
    ))}
  </div>
);

// ── tables & states ─────────────────────────────────────────────────────────────────────────────
export const Table: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cx('overflow-x-auto', className)}>
    <table className="w-full text-[14px] border-collapse [&>tbody>tr:nth-child(even)]:bg-[#FAFBFC]">{children}</table>
  </div>
);
export const Th: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ className, ...rest }) => (
  <th {...rest} className={cx('text-left text-[12.5px] font-semibold text-[#3F4652] px-4 py-2.5 border-b border-[#D6DBE1] bg-[#F1F3F5] whitespace-nowrap', className)} />
);
export const Td: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ className, ...rest }) => (
  <td {...rest} className={cx('px-4 py-3 border-b border-[#E8EBEF] align-middle', className)} />
);
/** A table row. Clickable rows highlight and show an arrow, so it is clear they open something. */
export const Tr: React.FC<React.HTMLAttributes<HTMLTableRowElement> & { onClick?: () => void }> = ({ className, onClick, children, ...rest }) => (
  <tr {...rest} onClick={onClick} className={cx(onClick && [
    'cursor-pointer hover:bg-[#FFFCEB]',
    '[&>td:last-child]:relative [&>td:last-child]:pr-9',
    "[&>td:last-child]:after:content-['›'] [&>td:last-child]:after:absolute [&>td:last-child]:after:right-3.5 [&>td:last-child]:after:top-1/2 [&>td:last-child]:after:-translate-y-1/2",
    '[&>td:last-child]:after:text-[20px] [&>td:last-child]:after:leading-none [&>td:last-child]:after:text-[#C3C9D2] hover:[&>td:last-child]:after:text-[#18181B]',
  ].join(' '), className)}>
    {children}
  </tr>
);

export const Loading: React.FC<{ text?: string }> = ({ text = 'Loading…' }) => (
  <div className="flex items-center justify-center gap-2 py-14 text-[14px] text-[#5F6B7A]"><Loader2 className="w-4 h-4 animate-spin" />{text}</div>
);

export const ErrorState: React.FC<{ error: unknown; onRetry?: () => void; text: string }> = ({ onRetry, text }) => (
  <div className="flex flex-col items-center gap-3 py-12 text-center">
    <AlertTriangle className="w-6 h-6 text-red-500" />
    <p className="text-[14px] text-[#3F4652] max-w-sm">{text}</p>
    {onRetry && <Button size="sm" onClick={onRetry}>Load again</Button>}
  </div>
);

export const Empty: React.FC<{ icon?: React.ReactNode; title: string; text?: React.ReactNode; action?: React.ReactNode }> = ({ icon, title, text, action }) => (
  <div className="flex flex-col items-center text-center gap-2 py-14 px-4">
    {icon && <div className="w-12 h-12 rounded-lg bg-[#F1F3F5] flex items-center justify-center text-[#5F6B7A] mb-1">{icon}</div>}
    <p className="font-semibold text-[15px]">{title}</p>
    {text && <p className="text-[14px] text-[#5F6B7A] max-w-md">{text}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

export const Notice: React.FC<{ tone?: 'info' | 'warning' | 'success' | 'danger'; children: React.ReactNode; action?: React.ReactNode }> = ({ tone = 'info', children, action }) => {
  const styles = {
    info: 'bg-[#EEF2F8] border-[#C9D4E6] border-l-[#2B4C7E] text-[#1C2F4D]',
    warning: 'bg-[#F8F0E3] border-[#E6D2B0] border-l-[#9A5B13] text-[#4A3009]',
    success: 'bg-[#EAF3EE] border-[#C5DCCF] border-l-[#2F6B4F] text-[#1E4231]',
    danger: 'bg-[#F8EBEA] border-[#E7C6C2] border-l-[#A63A3A] text-[#5C1F1F]',
  }[tone];
  const iconTone = { info: 'text-[#2B4C7E]', warning: 'text-[#9A5B13]', success: 'text-[#2F6B4F]', danger: 'text-[#A63A3A]' }[tone];
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;
  return (
    <div className={cx('flex flex-wrap sm:flex-nowrap items-start gap-2.5 rounded-lg border border-l-4 px-4 py-3 text-[14px]', styles)}>
      <Icon className={cx('w-4 h-4 mt-0.5 shrink-0', iconTone)} />
      <div className="flex-1 min-w-0">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

/** Label / value pairs for detail panels. */
export const Facts: React.FC<{ items: Array<[React.ReactNode, React.ReactNode] | null | false> }> = ({ items }) => (
  <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-5 gap-y-2 text-[14px]">
    {items.filter(Boolean).map((it, i) => {
      const [k, v] = it as [React.ReactNode, React.ReactNode];
      return <React.Fragment key={i}><dt className="text-[#5F6B7A]">{k}</dt><dd className="min-w-0 break-words">{v ?? '—'}</dd></React.Fragment>;
    })}
  </dl>
);

// ── overlays ────────────────────────────────────────────────────────────────────────────────────
function useEscape(onClose: () => void, active = true) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') ref.current(); };
    window.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = prev; };
  }, [active]);
}

/** Side panel for viewing / editing one thing. Full screen on phones. Carries the area colour. */
export const Drawer: React.FC<{ open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode; wide?: boolean; full?: boolean }> = ({
  open, onClose, title, subtitle, footer, children, wide, full,
}) => {
  const info = useArea();
  useEscape(onClose, open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div className="absolute inset-0 bg-[#0F1115]/45" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={cx('relative bg-[#EDEFF2] w-full h-full flex flex-col shadow-2xl', full ? 'sm:max-w-[min(1500px,96vw)]' : wide ? 'sm:max-w-4xl' : 'sm:max-w-2xl')}>
        {info && <div className={cx('h-1.5 shrink-0', AREA[info.area].bar)} />}
        <header className="flex items-start gap-3 px-4 sm:px-6 py-4 bg-white border-b border-[#E4E7EC]">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-[19px] leading-tight">{title}</h2>
            {subtitle && <div className="text-[13.5px] text-[#5F6B7A] mt-1">{subtitle}</div>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" icon={<X className="w-4 h-4" />}>Close</Button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">{children}</div>
        {footer && <footer className="px-4 sm:px-6 py-3 bg-white border-t border-[#E4E7EC] flex flex-wrap justify-end items-center gap-2">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
};

export const Modal: React.FC<{ open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' }> = ({
  open, onClose, title, children, footer, size = 'sm',
}) => {
  useEscape(onClose, open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-[#0F1115]/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={cx('relative bg-white w-full rounded-t-xl sm:rounded-xl shadow-2xl flex flex-col max-h-[92vh]',
        size === 'sm' ? 'sm:max-w-md' : size === 'md' ? 'sm:max-w-2xl' : 'sm:max-w-5xl')}>
        <header className="flex items-start gap-3 px-5 pt-5 pb-3">
          <h2 className="font-semibold text-[18px] flex-1">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 -m-1 rounded-md hover:bg-[#EEF0F3] cursor-pointer"><X className="w-5 h-5" /></button>
        </header>
        <div className="px-5 pb-5 overflow-y-auto space-y-4">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-[#E4E7EC] flex flex-wrap justify-end gap-2">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
};

/** A button that asks "are you sure?" first. With `reason`, the person must type a reason. */
export const ConfirmButton: React.FC<{
  title: string; text: React.ReactNode; confirmLabel: string; onConfirm: (reason: string) => Promise<unknown> | void;
  children: React.ReactNode; variant?: ButtonVariant; size?: 'sm' | 'md'; icon?: React.ReactNode; danger?: boolean; reason?: string; disabled?: boolean;
}> = ({ title, text, confirmLabel, onConfirm, children, variant = 'outline', size = 'md', icon, danger, reason, disabled }) => {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await onConfirm(why.trim()); } finally { setBusy(false); setOpen(false); setWhy(''); }
  };
  return (
    <>
      <Button variant={variant} size={size} icon={icon} disabled={disabled} onClick={() => setOpen(true)}>{children}</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        footer={<>
          <Button variant="ghost" onClick={() => setOpen(false)}>Go back</Button>
          <Button variant={danger ? 'dark' : 'primary'} className={danger ? '!bg-[#A63A3A] !border-[#A63A3A] hover:!bg-[#8A2B2B]' : ''} loading={busy} disabled={!!reason && !why.trim()} onClick={go}>{confirmLabel}</Button>
        </>}
      >
        <div className="text-[14px] text-[#3F4652]">{text}</div>
        {reason && <Field label={reason}><TextArea rows={3} value={why} onChange={setWhy} autoFocus /></Field>}
      </Modal>
    </>
  );
};

// ── toasts ──────────────────────────────────────────────────────────────────────────────────────
export const Toaster: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => subscribe(setItems), []);
  return createPortal(
    <div aria-live="polite" className="fixed z-[100] bottom-4 right-4 left-4 sm:left-auto flex flex-col gap-2 sm:w-96 pointer-events-none">
      {items.map((t) => (
        <div key={t.id} role="status" className={cx('pointer-events-auto flex items-start gap-2.5 rounded-lg px-4 py-3 shadow-xl text-[14px] border',
          t.kind === 'error' ? 'bg-[#A63A3A] text-white border-[#8A2B2B]' : 'bg-[#18181B] text-white border-black')}>
          {t.kind === 'error' ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> : <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#F5D103]" />}
          <span className="flex-1">{t.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="opacity-70 hover:opacity-100 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      ))}
    </div>,
    document.body,
  );
};

/** Small square product/brand picture with a fallback. */
export const Thumb: React.FC<{ src?: string | null; alt?: string; size?: number; rounded?: boolean }> = ({ src, alt = '', size = 40, rounded }) => (
  <div className={cx('shrink-0 bg-[#F1F3F5] border border-[#E4E7EC] overflow-hidden flex items-center justify-center', rounded ? 'rounded-full' : 'rounded-md')} style={{ width: size, height: size }}>
    {src ? <img src={src} alt={alt} loading="lazy" className="w-full h-full object-cover" /> : <ImageOff aria-label="No photo" className="w-1/2 h-1/2 max-w-5 max-h-5 text-[#C3C9D2]" />}
  </div>
);
