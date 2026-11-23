import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Lightbulb, Loader2, Search, X } from 'lucide-react';
import { ORDER_STATUS, type Tone } from './lib';
import { dismiss, subscribe, type ToastItem } from './toast';

// The admin's building blocks. Every screen is made from these so the whole portal looks and behaves
// the same: yellow = the main action, dark = secondary, red = destructive.

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

// ── buttons ─────────────────────────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'dark' | 'outline' | 'ghost' | 'danger';
const BTN: Record<ButtonVariant, string> = {
  primary: 'bg-[#F5D103] text-[#18181B] hover:bg-[#FDE047] border border-[#E5C200]',
  dark: 'bg-[#18181B] text-white hover:bg-black border border-[#18181B]',
  outline: 'bg-white text-[#18181B] hover:bg-slate-50 border border-[#E2E8F0]',
  ghost: 'bg-transparent text-[#18181B] hover:bg-slate-100 border border-transparent',
  danger: 'bg-white text-red-700 hover:bg-red-50 border border-red-200',
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant; size?: 'sm' | 'md'; icon?: React.ReactNode; loading?: boolean;
}> = ({ variant = 'outline', size = 'md', icon, loading, children, className, disabled, type = 'button', ...rest }) => (
  <button
    type={type}
    disabled={disabled || loading}
    className={cx(
      'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D103] whitespace-nowrap',
      size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-10 px-4 text-sm',
      BTN[variant], className,
    )}
    {...rest}
  >
    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
    {children}
  </button>
);

// ── layout ──────────────────────────────────────────────────────────────────────────────────────
/** A screen: title, one-line purpose, a "How this works" guide, and the main actions. */
export const Screen: React.FC<{
  title: string; intro: string; guide?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode;
}> = ({ title, intro, guide, actions, children }) => (
  <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">{intro}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </div>
    {guide && <Guide id={title}>{guide}</Guide>}
    {children}
  </div>
);

/** Collapsible plain-English help. Remembers if it was closed. */
export const Guide: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => {
  const storageKey = `admin-guide-${id}`;
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(storageKey) !== 'closed'; } catch { return true; }
  });
  const toggle = () => {
    setOpen((o) => {
      try { localStorage.setItem(storageKey, o ? 'closed' : 'open'); } catch { /* private mode */ }
      return !o;
    });
  };
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60">
      <button type="button" onClick={toggle} className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-amber-900 cursor-pointer">
        <Lightbulb className="w-4 h-4" /> How this works
        <ChevronDown className={cx('w-4 h-4 ml-auto transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 pb-4 text-sm text-amber-950/90 space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_b]:font-semibold">{children}</div>}
    </div>
  );
};

export const Card: React.FC<{ title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; className?: string; padded?: boolean }> = ({
  title, description, actions, children, className, padded = true,
}) => (
  <section className={cx('bg-white rounded-xl border border-[#E2E8F0] shadow-[0_1px_2px_rgba(0,0,0,0.03)]', className)}>
    {(title || actions) && (
      <header className="flex flex-wrap items-start justify-between gap-2 px-4 sm:px-5 pt-4">
        <div className="min-w-0">
          {title && <h2 className="font-semibold text-[15px]">{title}</h2>}
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
    )}
    <div className={padded ? 'p-4 sm:p-5' : title || actions ? 'pt-3' : ''}>{children}</div>
  </section>
);

export const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone; onClick?: () => void }> = ({ label, value, hint, tone, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={cx('text-left bg-white rounded-xl border border-[#E2E8F0] p-4 w-full', onClick && 'hover:border-[#18181B] cursor-pointer', !onClick && 'cursor-default')}
  >
    <div className="text-xs font-medium text-slate-500">{label}</div>
    <div className={cx('text-2xl font-bold mt-1 tabular-nums', tone === 'red' && 'text-red-600', tone === 'amber' && 'text-amber-600', tone === 'green' && 'text-emerald-600')}>{value}</div>
    {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
  </button>
);

// ── badges ──────────────────────────────────────────────────────────────────────────────────────
const TONE: Record<Tone, string> = {
  grey: 'bg-slate-100 text-slate-700 border-slate-200',
  blue: 'bg-sky-50 text-sky-800 border-sky-200',
  green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  violet: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  yellow: 'bg-[#FEF9C3] text-[#713F12] border-[#FDE047]',
};
export const Badge: React.FC<{ tone?: Tone; children: React.ReactNode; title?: string }> = ({ tone = 'grey', children, title }) => (
  <span title={title} className={cx('inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap', TONE[tone])}>{children}</span>
);
export const OrderStatus: React.FC<{ status: string }> = ({ status }) => {
  const s = ORDER_STATUS[status] ?? { label: status, tone: 'grey' as Tone, help: '' };
  return <Badge tone={s.tone} title={s.help}>{s.label}</Badge>;
};
export const SampleTag: React.FC<{ show?: boolean }> = ({ show }) => (show ? <Badge tone="grey" title="Example data. Removed before launch.">Example</Badge> : null);

// ── form controls ───────────────────────────────────────────────────────────────────────────────
const INPUT = 'w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F5D103] focus:border-[#E5C200] disabled:bg-slate-50 disabled:text-slate-500';

export const Field: React.FC<{ label: React.ReactNode; help?: React.ReactNode; error?: string | null; optional?: boolean; children: React.ReactNode; className?: string }> = ({
  label, help, error, optional, children, className,
}) => (
  <label className={cx('block', className)}>
    <span className="block text-[13px] font-semibold mb-1">
      {label}{optional && <span className="font-normal text-slate-400"> (optional)</span>}
    </span>
    {children}
    {error ? <span className="block text-xs text-red-600 mt-1">{error}</span> : help ? <span className="block text-xs text-slate-500 mt-1">{help}</span> : null}
  </label>
);

export const TextInput: React.FC<Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { value: string | null | undefined; onChange: (v: string) => void }> = ({ value, onChange, className, ...rest }) => (
  <input {...rest} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={cx(INPUT, className)} />
);

export const TextArea: React.FC<Omit<React.ComponentProps<'textarea'>, 'onChange' | 'value'> & { value: string | null | undefined; onChange: (v: string) => void }> = ({ value, onChange, className, rows = 4, ...rest }) => (
  <textarea {...rest} rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={cx(INPUT, 'h-auto py-2 leading-relaxed', className)} />
);

/** Whole numbers. Empty = null. */
export const NumberInput: React.FC<{ value: number | null | undefined; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; placeholder?: string; suffix?: string; disabled?: boolean; className?: string; decimals?: boolean }> = ({
  value, onChange, min, max, step, placeholder, suffix, disabled, className, decimals,
}) => {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => { setText((t) => (Number(t) === value && t !== '' ? t : value == null ? '' : String(value))); }, [value]);
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
        className={cx(INPUT, suffix && 'pr-12')}
      />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">{suffix}</span>}
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
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">£</span>
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

export interface Option { value: string; label: string; hint?: string }
export const Select: React.FC<{ value: string | null | undefined; onChange: (v: string) => void; options: Option[]; placeholder?: string; disabled?: boolean; className?: string }> = ({
  value, onChange, options, placeholder, disabled, className,
}) => (
  <div className={cx('relative', className)}>
    <select value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={cx(INPUT, 'appearance-none pr-9 cursor-pointer')}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
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
          checked ? 'bg-emerald-500' : 'bg-slate-300')}
      >
        <span className={cx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
      </button>
      {(label || description) && (
        <label htmlFor={id} className="cursor-pointer min-w-0">
          {label && <span className="block text-sm font-semibold">{label}</span>}
          {description && <span className="block text-xs text-slate-500 mt-0.5">{description}</span>}
        </label>
      )}
    </div>
  );
};

export const Checkbox: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean }> = ({ checked, onChange, label, description, disabled }) => (
  <label className={cx('flex items-start gap-2.5', disabled ? 'opacity-60' : 'cursor-pointer')}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#18181B] cursor-pointer" />
    <span className="min-w-0">
      <span className="block text-sm">{label}</span>
      {description && <span className="block text-xs text-slate-500">{description}</span>}
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
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input autoFocus={autoFocus} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className={cx(INPUT, 'pl-9 pr-8')} />
      {text && (
        <button type="button" aria-label="Clear search" onClick={() => { setText(''); onChange(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

/** Row of filter buttons with optional counts. */
export const Chips: React.FC<{ value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string; count?: number | null }> }> = ({ value, onChange, options }) => (
  <div className="flex flex-wrap gap-1.5">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        className={cx('h-8 px-3 rounded-full border text-xs font-semibold cursor-pointer transition-colors',
          value === o.value ? 'bg-[#18181B] text-white border-[#18181B]' : 'bg-white text-slate-700 border-[#E2E8F0] hover:border-slate-400')}
      >
        {o.label}{o.count != null && <span className={cx('ml-1.5', value === o.value ? 'text-[#F5D103]' : 'text-slate-400')}>{o.count}</span>}
      </button>
    ))}
  </div>
);

export const Tabs: React.FC<{ value: string; onChange: (v: string) => void; tabs: Array<{ value: string; label: string; hidden?: boolean }> }> = ({ value, onChange, tabs }) => (
  <div className="flex gap-1 border-b border-[#E2E8F0] overflow-x-auto">
    {tabs.filter((t) => !t.hidden).map((t) => (
      <button
        key={t.value}
        type="button"
        onClick={() => onChange(t.value)}
        className={cx('px-3 sm:px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap cursor-pointer',
          value === t.value ? 'border-[#F5D103] text-[#18181B]' : 'border-transparent text-slate-500 hover:text-[#18181B]')}
      >
        {t.label}
      </button>
    ))}
  </div>
);

// ── tables & states ─────────────────────────────────────────────────────────────────────────────
export const Table: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cx('overflow-x-auto', className)}>
    <table className="w-full text-sm border-collapse">{children}</table>
  </div>
);
export const Th: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ className, ...rest }) => (
  <th {...rest} className={cx('text-left text-[11px] uppercase tracking-wide font-semibold text-slate-500 px-3 py-2.5 border-b border-[#E2E8F0] bg-slate-50/70 whitespace-nowrap', className)} />
);
export const Td: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ className, ...rest }) => (
  <td {...rest} className={cx('px-3 py-2.5 border-b border-slate-100 align-middle', className)} />
);
export const Tr: React.FC<React.HTMLAttributes<HTMLTableRowElement> & { onClick?: () => void }> = ({ className, onClick, ...rest }) => (
  <tr {...rest} onClick={onClick} className={cx(onClick && 'cursor-pointer hover:bg-amber-50/40', className)} />
);

export const Loading: React.FC<{ text?: string }> = ({ text = 'Loading…' }) => (
  <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />{text}</div>
);

export const ErrorState: React.FC<{ error: unknown; onRetry?: () => void; text: string }> = ({ onRetry, text }) => (
  <div className="flex flex-col items-center gap-3 py-10 text-center">
    <AlertTriangle className="w-6 h-6 text-red-500" />
    <p className="text-sm text-slate-600 max-w-sm">{text}</p>
    {onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>}
  </div>
);

export const Empty: React.FC<{ icon?: React.ReactNode; title: string; text?: React.ReactNode; action?: React.ReactNode }> = ({ icon, title, text, action }) => (
  <div className="flex flex-col items-center text-center gap-2 py-12 px-4">
    {icon && <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-1">{icon}</div>}
    <p className="font-semibold">{title}</p>
    {text && <p className="text-sm text-slate-500 max-w-md">{text}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

export const Notice: React.FC<{ tone?: 'info' | 'warning' | 'success' | 'danger'; children: React.ReactNode; action?: React.ReactNode }> = ({ tone = 'info', children, action }) => {
  const styles = {
    info: 'bg-sky-50 border-sky-200 text-sky-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    danger: 'bg-red-50 border-red-200 text-red-900',
  }[tone];
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;
  return (
    <div className={cx('flex flex-wrap sm:flex-nowrap items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm', styles)}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

/** Label / value pairs for detail panels. */
export const Facts: React.FC<{ items: Array<[React.ReactNode, React.ReactNode] | null | false> }> = ({ items }) => (
  <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
    {items.filter(Boolean).map((it, i) => {
      const [k, v] = it as [React.ReactNode, React.ReactNode];
      return <React.Fragment key={i}><dt className="text-slate-500">{k}</dt><dd className="min-w-0 break-words">{v ?? '—'}</dd></React.Fragment>;
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

/** Side panel for viewing / editing one thing. Full screen on phones. */
export const Drawer: React.FC<{ open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode; wide?: boolean }> = ({
  open, onClose, title, subtitle, footer, children, wide,
}) => {
  useEscape(onClose, open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={cx('relative bg-[#F8FAFC] w-full h-full flex flex-col shadow-2xl', wide ? 'sm:max-w-4xl' : 'sm:max-w-2xl')}>
        <header className="flex items-start gap-3 px-4 sm:px-6 py-4 bg-white border-b border-[#E2E8F0]">
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-lg leading-tight">{title}</h2>
            {subtitle && <div className="text-sm text-slate-500 mt-0.5">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 -m-1 rounded-lg hover:bg-slate-100 cursor-pointer"><X className="w-5 h-5" /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">{children}</div>
        {footer && <footer className="px-4 sm:px-6 py-3 bg-white border-t border-[#E2E8F0] flex flex-wrap justify-end gap-2">{footer}</footer>}
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
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={cx('relative bg-white w-full rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]',
        size === 'sm' ? 'sm:max-w-md' : size === 'md' ? 'sm:max-w-2xl' : 'sm:max-w-5xl')}>
        <header className="flex items-start gap-3 px-5 pt-5 pb-2">
          <h2 className="font-bold text-lg flex-1">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 -m-1 rounded-lg hover:bg-slate-100 cursor-pointer"><X className="w-5 h-5" /></button>
        </header>
        <div className="px-5 pb-5 overflow-y-auto space-y-4">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-[#E2E8F0] flex flex-wrap justify-end gap-2">{footer}</footer>}
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
          <Button variant={danger ? 'dark' : 'primary'} className={danger ? '!bg-red-600 !border-red-600 hover:!bg-red-700' : ''} loading={busy} disabled={!!reason && !why.trim()} onClick={go}>{confirmLabel}</Button>
        </>}
      >
        <div className="text-sm text-slate-600">{text}</div>
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
        <div key={t.id} role="status" className={cx('pointer-events-auto flex items-start gap-2.5 rounded-xl px-4 py-3 shadow-xl text-sm border',
          t.kind === 'error' ? 'bg-red-600 text-white border-red-700' : 'bg-[#18181B] text-white border-black')}>
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
  <div className={cx('shrink-0 bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center', rounded ? 'rounded-full' : 'rounded-lg')} style={{ width: size, height: size }}>
    {src ? <img src={src} alt={alt} loading="lazy" className="w-full h-full object-cover" /> : <span className="text-[10px] text-slate-400">No photo</span>}
  </div>
);
