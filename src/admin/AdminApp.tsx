import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  Award, BadgeCheck, BookOpen, Boxes, ClipboardList, ExternalLink, History, LayoutDashboard, LogOut, Mail, MapPin, Menu, Package,
  PanelsTopLeft, Percent, Settings, ShoppingBag, Star, Tags, Undo2, UserCog, Users, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { authLinkType, supabase } from '../lib/supabase';
import { rpc } from '../lib/api';
import { AREA, AreaContext, Button, Field, Loading, Notice, Select, TextInput, Toaster, cx, type AreaName } from './ui';
import { toast } from './toast';
import { GlobalSearch } from './GlobalSearch';
import { errorText } from './lib';

// The store portal at /admin. Each screen is a separate file in ./screens and is only downloaded
// when opened. The sidebar shows only the screens the signed-in person's role allows.

export interface ScreenProps { param: string | null; go: (screen: string, param?: string) => void }
type Lazy = React.LazyExoticComponent<React.ComponentType<ScreenProps>>;

interface NavItem { key: string; label: string; icon: React.ElementType; group: string; perms: string[] | null; screen: Lazy; step?: number }

// Shop screens are numbered in the order a new shop is set up: categories first, then brands, then products…
const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Home', icon: LayoutDashboard, group: 'Today', perms: null, screen: lazy(() => import('./screens/Dashboard')) },
  { key: 'orders', label: 'Orders', icon: ShoppingBag, group: 'Today', perms: ['order_status', 'packing_queue', 'orders_dispatch'], screen: lazy(() => import('./screens/Orders')) },
  { key: 'refunds', label: 'Refunds', icon: Undo2, group: 'Today', perms: ['refund_requests', 'financials'], screen: lazy(() => import('./screens/Refunds')) },
  { key: 'categories', label: 'Categories', icon: Tags, group: 'Shop', perms: ['inventory_read'], screen: lazy(() => import('./screens/Categories')), step: 1 },
  { key: 'brands', label: 'Brands', icon: BadgeCheck, group: 'Shop', perms: ['inventory_read'], screen: lazy(() => import('./screens/Brands')), step: 2 },
  { key: 'products', label: 'Products', icon: Package, group: 'Shop', perms: ['inventory_read'], screen: lazy(() => import('./screens/Products')), step: 3 },
  { key: 'stock', label: 'Stock', icon: Boxes, group: 'Shop', perms: ['inventory_read'], screen: lazy(() => import('./screens/Stock')), step: 4 },
  { key: 'buying', label: 'Suppliers & buying', icon: ClipboardList, group: 'Shop', perms: ['inventory_read'], screen: lazy(() => import('./screens/Buying')), step: 5 },
  { key: 'customers', label: 'Customers', icon: Users, group: 'Customers', perms: ['customer_messaging'], screen: lazy(() => import('./screens/Customers')) },
  { key: 'reviews', label: 'Reviews', icon: Star, group: 'Customers', perms: ['customer_messaging'], screen: lazy(() => import('./screens/Reviews')) },
  { key: 'emails', label: 'Emails', icon: Mail, group: 'Customers', perms: ['customer_messaging'], screen: lazy(() => import('./screens/Emails')) },
  { key: 'offers', label: 'Offers & codes', icon: Percent, group: 'Marketing', perms: ['pricing'], screen: lazy(() => import('./screens/Offers')) },
  { key: 'loyalty', label: 'Loyalty', icon: Award, group: 'Marketing', perms: ['pricing'], screen: lazy(() => import('./screens/Loyalty')) },
  { key: 'content', label: 'Website content', icon: PanelsTopLeft, group: 'Marketing', perms: ['content'], screen: lazy(() => import('./screens/Content')) },
  { key: 'delivery', label: 'Delivery areas & slots', icon: MapPin, group: 'Set-up', perms: ['fleet_management'], screen: lazy(() => import('./screens/Delivery')) },
  { key: 'staff', label: 'Staff & roles', icon: UserCog, group: 'Set-up', perms: ['user_management'], screen: lazy(() => import('./screens/Staff')) },
  { key: 'settings', label: 'Settings', icon: Settings, group: 'Set-up', perms: ['full_access', 'financials'], screen: lazy(() => import('./screens/Settings')) },
  { key: 'activity', label: 'Activity log', icon: History, group: 'Set-up', perms: ['full_access'], screen: lazy(() => import('./screens/Activity')) },
  { key: 'guide', label: 'Guide', icon: BookOpen, group: 'Help', perms: null, screen: lazy(() => import('./screens/Guide')) },
];
/** Old addresses that moved into other screens. */
const ALIASES: Record<string, string> = { picking: 'orders', deliveries: 'orders', catalogue: 'categories' };

const Logo: React.FC = () => (
  <div className="flex items-center gap-2.5">
    <div className="w-9 h-9 rounded-lg bg-[#F5D103] text-[#18181B] flex items-center justify-center font-extrabold">V</div>
    <div className="leading-tight">
      <div className="font-extrabold text-sm tracking-tight">Varam Foods</div>
      <div className="text-[12px] text-[#F5D103] font-medium">Store portal</div>
    </div>
  </div>
);

/** Keeps one broken screen from blanking the whole portal; offers a reload instead. */
class ScreenBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error('Admin screen failed', err); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="max-w-xl mx-auto p-8 text-center space-y-3">
        <p className="font-semibold">This screen hit a problem.</p>
        <p className="text-sm text-slate-500">Your work elsewhere is safe. Reload the page; if it happens again, tell your developer which screen and what you pressed.</p>
        <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  }
}

// ── sign-in screens ─────────────────────────────────────────────────────────────────────────────
const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-[#18181B] flex items-center justify-center p-4">
    <div className="w-full max-w-sm bg-white rounded-xl shadow-2xl p-6 space-y-5">
      <div className="text-[#18181B] [&_.text-\[\#F5D103\]]:text-[#B45309]"><Logo /></div>
      {children}
    </div>
  </div>
);

const SignIn: React.FC = () => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await signIn(email, password); } catch (err) {
      const code = (err as { code?: string }).code;
      setError(code === 'INVALID_CREDENTIALS' ? 'That email and password do not match.' : code === 'NETWORK' ? 'No connection. Check the internet.' : 'Sign-in failed. Please try again.');
    } finally { setBusy(false); }
  };
  const forgot = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('Type your email above first.'); return; }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/admin` });
    if (err) setError('Could not send the email. Try again in a minute.');
    else { setResetSent(true); setError(null); }
  };
  return (
    <Centered>
      <div>
        <h1 className="font-bold text-lg">Sign in to the store portal</h1>
        <p className="text-sm text-slate-500">For Varam Foods staff.</p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email"><TextInput type="email" autoComplete="username" value={email} onChange={setEmail} required /></Field>
        <Field label="Password"><TextInput type="password" autoComplete="current-password" value={password} onChange={setPassword} required /></Field>
        {error && <Notice tone="danger">{error}</Notice>}
        {resetSent && <Notice tone="success">Check your inbox for a link to choose a new password.</Notice>}
        <Button type="submit" variant="primary" className="w-full" loading={busy}>Sign in</Button>
      </form>
      <button type="button" onClick={() => void forgot()} className="text-sm text-slate-600 underline underline-offset-2 cursor-pointer">Forgotten your password?</button>
    </Centered>
  );
};

const ChoosePassword: React.FC<{ welcome: boolean; onDone: () => void }> = ({ welcome, onDone }) => {
  const { updatePassword } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 10) { setError('Use at least 10 characters.'); return; }
    if (pw !== pw2) { setError('The two passwords are different.'); return; }
    setBusy(true);
    try { await updatePassword(pw); toast.success('Password saved'); onDone(); } catch (err) {
      setError((err as { code?: string }).code === 'WEAK_PASSWORD' ? 'That password is too easy to guess. Try a longer one.' : 'Could not save the password. Please try again.');
    } finally { setBusy(false); }
  };
  return (
    <Centered>
      <div>
        <h1 className="font-bold text-lg">{welcome ? 'Welcome! Choose your password' : 'Choose a new password'}</h1>
        <p className="text-sm text-slate-500">You will use it with your email to sign in to the store portal.</p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <Field label="New password" help="At least 10 characters."><TextInput type="password" autoComplete="new-password" value={pw} onChange={setPw} required /></Field>
        <Field label="Type it again"><TextInput type="password" autoComplete="new-password" value={pw2} onChange={setPw2} required /></Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" variant="primary" className="w-full" loading={busy}>Save password</Button>
      </form>
    </Centered>
  );
};

// ── the portal ──────────────────────────────────────────────────────────────────────────────────
export default function AdminApp() {
  const { status, context, isStaff, isRecovery, hasPermission, signOut, refresh } = useAuth();
  const { subPath, goToAdmin, goToHome } = useNavigation();
  const [needsPassword, setNeedsPassword] = useState(authLinkType === 'invite' || authLinkType === 'recovery');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { document.title = 'Store portal · Varam Foods'; }, []);

  const allowed = useMemo(() => NAV.filter((n) => !n.perms || n.perms.some((p) => hasPermission(p))), [hasPermission]);
  const [rawKey, ...rest] = (subPath ?? 'dashboard').split('/');
  // /admin/picking/<id> now opens that order's picking inside the order board
  const screenKey = ALIASES[rawKey] ?? rawKey;
  const aliasParam = rawKey === 'picking' && rest.length ? `pick/${rest.join('/')}` : null;
  const current = allowed.find((n) => n.key === screenKey) ?? allowed[0];
  const param = current?.key === screenKey ? aliasParam ?? (rest.length && !ALIASES[rawKey] ? rest.join('/') : null) : null;
  const go = (screen: string, p?: string) => { setMenuOpen(false); goToAdmin(p ? `${screen}/${encodeURIComponent(p)}` : screen); };

  if (status === 'loading' || (status === 'signed_in' && !context)) return <div className="min-h-screen bg-[#18181B] flex items-center justify-center text-white"><Loading text="Opening the store portal…" /></div>;
  if (status === 'signed_out') return <><SignIn /><Toaster /></>;
  if (needsPassword || isRecovery) return <><ChoosePassword welcome={authLinkType === 'invite'} onDone={() => { setNeedsPassword(false); void refresh(); }} /><Toaster /></>;
  if (!isStaff || !context?.staff) {
    return (
      <Centered>
        <Notice tone="warning">The account <b>{context?.email}</b> is not set up for the store portal. Ask a Store Manager to invite you (Staff &amp; roles).</Notice>
        <div className="flex gap-2">
          <Button variant="dark" onClick={() => void signOut()}>Sign out</Button>
          <Button onClick={goToHome}>Go to the shop</Button>
        </div>
      </Centered>
    );
  }

  const staff = context.staff;
  const groups = [...new Set(allowed.map((n) => n.group))];
  const ScreenComponent = current?.screen;

  const initials = staff.fullName.split(/s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const statusDot = staff.status === 'active' ? 'bg-[#5E9C7E]' : staff.status === 'on_break' ? 'bg-[#C98A3A]' : 'bg-slate-500';
  const sidebar = (
    <nav className="flex flex-col h-full" aria-label="Store portal">
      <div className="px-5 pt-5 pb-4 flex items-center justify-between"><Logo /><button type="button" className="lg:hidden p-1 cursor-pointer" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X className="w-5 h-5" /></button></div>
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
        {groups.map((g) => (
          <div key={g}>
            <div className="flex items-center gap-2 px-2.5 pb-1.5 text-[12.5px] font-semibold text-[#E5E7EB]">
              <span className={cx('w-1 h-3.5 rounded-full', AREA[g as AreaName].dot)} />{g}
            </div>
            <div className="space-y-0.5">
              {allowed.filter((n) => n.group === g).map((n) => {
                const Icon = n.icon;
                const active = n.key === current?.key;
                return (
                  <button key={n.key} type="button" onClick={() => go(n.key)} aria-current={active ? 'page' : undefined}
                    className={cx('w-full flex items-center gap-3 px-2.5 h-9 rounded-md text-[14px] text-left cursor-pointer transition-colors',
                      active ? 'bg-[#F5D103] text-[#18181B] font-semibold' : 'text-[#D4D8DE] hover:bg-white/[0.07] hover:text-white')}>
                    <Icon className={cx('w-[18px] h-[18px] shrink-0', !active && AREA[n.group as AreaName].icon)} strokeWidth={1.9} />
                    <span className="flex-1 truncate">{n.label}</span>
                    {n.step && <span title={`Step ${n.step} of setting up the shop`} className={cx('w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0', active ? 'bg-[#18181B] text-[#F5D103]' : 'bg-white/10 text-[#C9CED6]')}>{n.step}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3 px-1.5 py-1.5">
          <div className="relative w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center text-[13px] font-semibold shrink-0">
            {initials}<span className={cx('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#18181B]', statusDot)} />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-white truncate">{staff.fullName}</div>
            <div className="text-[12px] text-[#9AA3AF] truncate">{staff.roleName}</div>
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <Select size="sm" className="flex-1" aria-label="My status" value={staff.status === 'deactivated' ? 'offline' : staff.status}
            onChange={async (v) => { try { await rpc('staff_set_my_status', { p_status: v }); await refresh(); } catch (err) { toast.error(errorText(err)); } }}
            options={[{ value: 'active', label: 'Working' }, { value: 'on_break', label: 'On a break' }, { value: 'offline', label: 'Off shift' }]} />
          <button type="button" onClick={() => void signOut()} className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-[12.5px] text-[#D4D8DE] hover:bg-white/[0.07] cursor-pointer"><LogOut className="w-3.5 h-3.5" />Sign out</button>
        </div>
      </div>
    </nav>
  );
  const area = current ? (current.group as AreaName) : null;

  return (
    <div className="min-h-screen bg-[#EDEFF2] text-[#18181B] font-sans antialiased">
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-[260px] bg-[#18181B] text-white z-30">{sidebar}</aside>
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-[70]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-[#18181B] text-white">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-20 h-14 bg-white/95 backdrop-blur border-b border-[#E4E7EC] flex items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button type="button" className="lg:hidden p-2 -ml-2 rounded-md hover:bg-[#EEF0F3] cursor-pointer" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu className="w-5 h-5" /></button>
          {area && current && (
            <div className="flex items-center gap-2 text-[14px] min-w-0">
              <span className={cx('w-2 h-2 rounded-full shrink-0', AREA[area].dot)} />
              <span className="text-[#5F6B7A] hidden sm:inline">{area}</span>
              <span className="text-[#C3C9D2] hidden sm:inline">/</span>
              <span className="font-medium truncate">{current.label}</span>
            </div>
          )}
          <div className="flex-1 flex justify-center px-2 min-w-0"><GlobalSearch screens={allowed.map((n) => ({ key: n.key, label: n.label }))} go={go} /></div>
          <a href="/" target="_blank" rel="noreferrer" className="hidden md:inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-[#D9DDE3] text-[13px] font-medium text-[#3F4652] hover:bg-[#F6F7F9] shrink-0">Open the shop <ExternalLink className="w-3.5 h-3.5" /></a>
        </header>
        <main className="min-w-0 overflow-x-clip">
          {current ? (
            <AreaContext.Provider value={{ area: current.group as AreaName, icon: current.icon, label: current.label }}>
              <ScreenBoundary key={current.key}>
                <Suspense fallback={<Loading />}>
                  <ScreenComponent param={param} go={go} />
                </Suspense>
              </ScreenBoundary>
            </AreaContext.Provider>
          ) : <Loading text="Your role has no screens yet. Ask a Store Manager." />}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
