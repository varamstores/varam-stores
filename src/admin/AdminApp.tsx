import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  Award, Boxes, ClipboardList, ExternalLink, History, LayoutDashboard, LogOut, Mail, MapPin, Menu, Package, PackageCheck,
  PanelsTopLeft, Percent, Settings, ShoppingBag, Star, Tags, Truck, Undo2, UserCog, Users, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { authLinkType, supabase } from '../lib/supabase';
import { rpc } from '../lib/api';
import { Button, Field, Loading, Notice, TextInput, Toaster, cx } from './ui';
import { toast } from './toast';
import { errorText } from './lib';

// The store portal at /admin. Each screen is a separate file in ./screens and is only downloaded
// when opened. The sidebar shows only the screens the signed-in person's role allows.

export interface ScreenProps { param: string | null; go: (screen: string, param?: string) => void }
type Lazy = React.LazyExoticComponent<React.ComponentType<ScreenProps>>;

interface NavItem { key: string; label: string; icon: React.ElementType; group: string; perms: string[] | null; screen: Lazy }

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Home', icon: LayoutDashboard, group: 'Today', perms: null, screen: lazy(() => import('./screens/Dashboard')) },
  { key: 'orders', label: 'Orders', icon: ShoppingBag, group: 'Today', perms: ['order_status'], screen: lazy(() => import('./screens/Orders')) },
  { key: 'picking', label: 'Picking', icon: PackageCheck, group: 'Today', perms: ['packing_queue'], screen: lazy(() => import('./screens/Picking')) },
  { key: 'deliveries', label: 'Deliveries', icon: Truck, group: 'Today', perms: ['orders_dispatch'], screen: lazy(() => import('./screens/Deliveries')) },
  { key: 'refunds', label: 'Refunds', icon: Undo2, group: 'Today', perms: ['refund_requests', 'financials'], screen: lazy(() => import('./screens/Refunds')) },
  { key: 'products', label: 'Products', icon: Package, group: 'Shop', perms: ['inventory_read'], screen: lazy(() => import('./screens/Products')) },
  { key: 'catalogue', label: 'Categories & brands', icon: Tags, group: 'Shop', perms: ['inventory_read'], screen: lazy(() => import('./screens/Catalogue')) },
  { key: 'stock', label: 'Stock', icon: Boxes, group: 'Shop', perms: ['inventory_read'], screen: lazy(() => import('./screens/Stock')) },
  { key: 'buying', label: 'Suppliers & buying', icon: ClipboardList, group: 'Shop', perms: ['inventory_read'], screen: lazy(() => import('./screens/Buying')) },
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
];

const Logo: React.FC = () => (
  <div className="flex items-center gap-2.5">
    <div className="w-9 h-9 rounded-xl bg-[#F5D103] text-[#18181B] flex items-center justify-center font-extrabold">V</div>
    <div className="leading-tight">
      <div className="font-extrabold text-sm tracking-tight">Varam Foods</div>
      <div className="text-[10px] uppercase tracking-widest text-[#F5D103] font-bold">Store portal</div>
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
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-5">
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
  const [screenKey, ...rest] = (subPath ?? 'dashboard').split('/');
  const current = allowed.find((n) => n.key === screenKey) ?? allowed[0];
  const param = current?.key === screenKey && rest.length ? rest.join('/') : null;
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

  const sidebar = (
    <nav className="flex flex-col h-full">
      <div className="px-4 py-4 flex items-center justify-between"><Logo /><button type="button" className="lg:hidden p-1 cursor-pointer" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X className="w-5 h-5" /></button></div>
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-4">
        {groups.map((g) => (
          <div key={g}>
            <div className="px-3 pb-1 text-[10px] uppercase tracking-widest text-slate-500 font-bold">{g}</div>
            {allowed.filter((n) => n.group === g).map((n) => {
              const Icon = n.icon;
              const active = n.key === current?.key;
              return (
                <button key={n.key} type="button" onClick={() => go(n.key)}
                  className={cx('w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left cursor-pointer transition-colors',
                    active ? 'bg-[#F5D103] text-[#18181B] font-semibold' : 'text-slate-300 hover:bg-white/10 hover:text-white')}>
                  <Icon className="w-4 h-4 shrink-0" />{n.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-white/10 space-y-2">
        <div className="px-1">
          <div className="text-sm font-semibold text-white truncate">{staff.fullName}</div>
          <div className="text-xs text-slate-400">{staff.roleName}</div>
        </div>
        <select
          aria-label="My status"
          value={staff.status === 'deactivated' ? 'offline' : staff.status}
          onChange={async (e) => { try { await rpc('staff_set_my_status', { p_status: e.target.value }); await refresh(); } catch (err) { toast.error(errorText(err)); } }}
          className="w-full h-8 rounded-md bg-white/10 text-white text-xs px-2 border border-white/10 cursor-pointer"
        >
          <option value="active" className="text-black">● Working</option>
          <option value="on_break" className="text-black">● On a break</option>
          <option value="offline" className="text-black">● Off shift</option>
        </select>
        <button type="button" onClick={() => void signOut()} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-slate-300 hover:bg-white/10 cursor-pointer"><LogOut className="w-3.5 h-3.5" />Sign out</button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#18181B] font-sans antialiased">
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-64 bg-[#18181B] text-white z-30">{sidebar}</aside>
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-[70]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-[#18181B] text-white">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 h-14 bg-white/95 backdrop-blur border-b border-[#E2E8F0] flex items-center gap-3 px-4 sm:px-6">
          <button type="button" className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu className="w-5 h-5" /></button>
          <div className="font-semibold text-sm truncate">{current?.label}</div>
          <a href="/" target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#18181B]">View the shop <ExternalLink className="w-3.5 h-3.5" /></a>
        </header>
        <main>
          {ScreenComponent ? (
            <ScreenBoundary key={current.key}>
              <Suspense fallback={<Loading />}>
                <ScreenComponent param={param} go={go} />
              </Suspense>
            </ScreenBoundary>
          ) : <Loading text="Your role has no screens yet. Ask a Store Manager." />}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
