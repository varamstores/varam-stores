import React from 'react';
import { LayoutDashboard, Package, MapPin, SlidersHorizontal, User, ShieldCheck, Heart, LogOut, Briefcase, Bell, Repeat } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { useCart } from '../context/CartContext';
import { useCms } from '../cms/CmsProvider';
import { useSeo } from '../cms/hooks';
import { AuthScreens, CompleteProfileScreen, NewPasswordScreen } from './account/AuthScreens';
import { AddressesTab, OrdersTab, OverviewTab, PreferencesTab, PrivacyTab, ProfileTab } from './account/AccountTabs';
import { AlertsTab, RepeatOrdersTab } from './account/AdvancedTabs';

type Tab = 'overview' | 'orders' | 'addresses' | 'preferences' | 'alerts' | 'repeat' | 'profile' | 'privacy';

/** /account[/<tab>[/<id>]]: sign-in when signed out, otherwise the customer account. */
export const UserAccountPage: React.FC<{ tab: string | null }> = ({ tab }) => {
  const cms = useCms();
  useSeo('account');
  const auth = useAuth();
  const { goToAccount, goToAdmin, goToWishlist, goToHome, navigateHref } = useNavigation();
  const { showToast } = useCart();
  const [head, ...rest] = (tab ?? '').split('/');

  if (auth.status === 'loading') {
    return <div className="min-h-[60vh] flex items-center justify-center text-sm text-stone-500">{cms.t('global.common.loading')}</div>;
  }
  if (auth.isRecovery || head === 'reset-password') {
    return auth.status === 'signed_in' ? <NewPasswordScreen /> : <AuthScreens />;
  }
  if (auth.status === 'signed_out') {
    return <AuthScreens initial={head === 'sign-up' ? 'sign-up' : 'sign-in'} />;
  }
  if (!auth.context) {
    return <div className="min-h-[60vh] flex items-center justify-center text-sm text-stone-500">{cms.t('global.common.loading')}</div>;
  }

  // Came here to sign in on the way to somewhere (e.g. checkout): go back there.
  const next = new URLSearchParams(window.location.search).get('next');
  if (head === 'sign-in' && next?.startsWith('/') && auth.isCustomer) {
    queueMicrotask(() => navigateHref(next));
  }

  if (!auth.isCustomer && auth.isStaff && head !== 'create-profile') {
    return (
      <div className="min-h-[60vh] bg-[#F8FAFC] py-12 px-4 flex items-start justify-center">
        <div className="w-full max-w-md bg-white rounded-3xl border border-stone-200 p-8 shadow-sm text-center">
          <div className="w-14 h-14 rounded-full bg-[#18181B] text-[#F5D103] mx-auto mb-4 flex items-center justify-center"><Briefcase className="w-6 h-6" /></div>
          <h1 className="font-serif-heading font-bold text-2xl text-[#18181B] mb-2">{cms.t('account.staff.title')}</h1>
          <p className="text-sm text-stone-600 mb-6">{cms.t('account.staff.text', { role: auth.context.staff?.roleName ?? '' })}</p>
          <button type="button" onClick={() => goToAdmin()} className="w-full py-3 rounded-full bg-[#18181B] text-[#F5D103] text-sm font-bold cursor-pointer mb-3">{cms.t('account.staff.portal')}</button>
          <button type="button" onClick={() => goToAccount('create-profile')} className="text-xs font-bold text-[#B45309] hover:underline cursor-pointer">{cms.t('account.staff.shop_too')}</button>
          <button type="button" onClick={() => void auth.signOut().then(() => { showToast(cms.t('global.toasts.signed_out')); goToHome(); })} className="block mx-auto mt-4 text-xs font-bold text-stone-500 hover:underline cursor-pointer">{cms.t('account.nav.sign_out')}</button>
        </div>
      </div>
    );
  }
  if (!auth.isCustomer) return <CompleteProfileScreen />;

  const active: Tab = (['orders', 'addresses', 'preferences', 'alerts', 'repeat', 'profile', 'privacy'] as const).includes(head as never) ? (head as Tab) : 'overview';
  const nav: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'overview', label: cms.t('account.nav.overview'), icon: LayoutDashboard },
    { id: 'orders', label: cms.t('account.nav.orders'), icon: Package },
    { id: 'repeat', label: cms.t('account.nav.repeat'), icon: Repeat },
    { id: 'alerts', label: cms.t('account.nav.alerts'), icon: Bell },
    { id: 'addresses', label: cms.t('account.nav.addresses'), icon: MapPin },
    { id: 'preferences', label: cms.t('account.nav.preferences'), icon: SlidersHorizontal },
    { id: 'profile', label: cms.t('account.nav.profile'), icon: User },
    { id: 'privacy', label: cms.t('account.nav.privacy'), icon: ShieldCheck },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-3">
          <nav aria-label={cms.t('account.nav.overview')} className="bg-white rounded-3xl border border-stone-200/90 p-3 shadow-2xs flex lg:flex-col gap-1 overflow-x-auto scrollbar-none">
            {nav.map((n) => (
              <button key={n.id} type="button" onClick={() => goToAccount(n.id === 'overview' ? undefined : n.id)} aria-current={active === n.id ? 'page' : undefined}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer ${active === n.id ? 'bg-[#18181B] text-[#F5D103]' : 'text-[#18181B] hover:bg-amber-50'}`}>
                <n.icon className="w-4 h-4" />{n.label}
              </button>
            ))}
            <button type="button" onClick={goToWishlist} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-sm font-semibold whitespace-nowrap text-[#18181B] hover:bg-amber-50 cursor-pointer">
              <Heart className="w-4 h-4" />{cms.t('account.nav.saved')}
            </button>
            {auth.isStaff && (
              <button type="button" onClick={() => goToAdmin()} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-sm font-semibold whitespace-nowrap text-[#18181B] hover:bg-amber-50 cursor-pointer">
                <Briefcase className="w-4 h-4" />{cms.t('account.staff.portal')}
              </button>
            )}
            <button type="button" onClick={() => void auth.signOut().then(() => { showToast(cms.t('global.toasts.signed_out')); goToHome(); })}
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-sm font-semibold whitespace-nowrap text-stone-500 hover:bg-stone-50 cursor-pointer">
              <LogOut className="w-4 h-4" />{cms.t('account.nav.sign_out')}
            </button>
          </nav>
        </aside>
        <main className="lg:col-span-9 min-w-0">
          {active === 'overview' && <OverviewTab />}
          {active === 'orders' && <OrdersTab orderNumber={rest[0] ?? null} />}
          {active === 'repeat' && <RepeatOrdersTab />}
          {active === 'alerts' && <AlertsTab />}
          {active === 'addresses' && <AddressesTab />}
          {active === 'preferences' && <PreferencesTab />}
          {active === 'profile' && <ProfileTab />}
          {active === 'privacy' && <PrivacyTab />}
        </main>
      </div>
    </div>
  );
};
