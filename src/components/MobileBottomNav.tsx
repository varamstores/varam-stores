import React from 'react';
import { Home, Store, Heart, ShoppingBag, User } from 'lucide-react';
import { useNavigation } from '../context/NavigationContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useCms } from '../cms/CmsProvider';

export const MobileBottomNav: React.FC = () => {
  const cms = useCms();
  const { currentView, goToHome, goToShop, goToWishlist, goToAccount } = useNavigation();
  const { totalItems, setIsCartOpen } = useCart();
  const { wishlistCount } = useWishlist();

  const tab = (active: boolean) =>
    `flex flex-col items-center justify-center py-1 rounded-xl transition-all cursor-pointer ${active ? 'text-[#18181B] font-bold' : 'text-[#737A72] hover:text-[#18181B]'}`;

  return (
    <nav
      aria-label={cms.t('global.mobile_nav.aria')}
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-lg border-t border-stone-200/90 shadow-lg px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
    >
      <div className="grid grid-cols-5 items-center justify-around max-w-md mx-auto">
        <button type="button" onClick={goToHome} className={tab(currentView === 'home')} aria-current={currentView === 'home' ? 'page' : undefined}>
          <div className="relative">
            <Home className={`w-5 h-5 ${currentView === 'home' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
            {currentView === 'home' && <span className="w-1.5 h-1.5 rounded-full bg-[#18181B] absolute -bottom-1 left-1/2 -translate-x-1/2" />}
          </div>
          <span className="text-[10px] mt-1 font-medium tracking-tight">{cms.t('global.mobile_nav.home')}</span>
        </button>

        <button type="button" onClick={() => goToShop()} className={tab(currentView === 'shop')} aria-current={currentView === 'shop' ? 'page' : undefined}>
          <div className="relative">
            <Store className={`w-5 h-5 ${currentView === 'shop' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
            {currentView === 'shop' && <span className="w-1.5 h-1.5 rounded-full bg-[#18181B] absolute -bottom-1 left-1/2 -translate-x-1/2" />}
          </div>
          <span className="text-[10px] mt-1 font-medium tracking-tight">{cms.t('global.mobile_nav.shop')}</span>
        </button>

        <button type="button" onClick={goToWishlist} className={tab(currentView === 'wishlist')} aria-current={currentView === 'wishlist' ? 'page' : undefined}>
          <div className="relative">
            <Heart className={`w-5 h-5 ${currentView === 'wishlist' ? 'fill-current text-rose-500 stroke-[2.5]' : 'stroke-[1.8]'}`} />
            {wishlistCount > 0 && (
              <span className="absolute -top-1 -right-2.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center shadow-xs">{wishlistCount}</span>
            )}
            {currentView === 'wishlist' && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 absolute -bottom-1 left-1/2 -translate-x-1/2" />}
          </div>
          <span className="text-[10px] mt-1 font-medium tracking-tight">{cms.t('global.mobile_nav.saved')}</span>
        </button>

        <button type="button" onClick={() => goToAccount()} className={tab(currentView === 'account')} aria-current={currentView === 'account' ? 'page' : undefined}>
          <div className="relative">
            <User className={`w-5 h-5 ${currentView === 'account' ? 'stroke-[2.5] text-[#245E4A]' : 'stroke-[1.8]'}`} />
            {currentView === 'account' && <span className="w-1.5 h-1.5 rounded-full bg-[#245E4A] absolute -bottom-1 left-1/2 -translate-x-1/2" />}
          </div>
          <span className="text-[10px] mt-1 font-medium tracking-tight">{cms.t('global.mobile_nav.account')}</span>
        </button>

        <button
          type="button"
          id="mobile-bottom-cart-btn"
          data-cart-btn="true"
          onClick={() => setIsCartOpen(true)}
          className="flex flex-col items-center justify-center py-1 rounded-xl text-[#737A72] hover:text-[#B45309] transition-all cursor-pointer"
          aria-label={cms.t('global.mobile_nav.basket_aria', { count: totalItems })}
        >
          <div className="relative">
            <ShoppingBag className="w-5 h-5 stroke-[1.8]" />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-2.5 w-4 h-4 rounded-full bg-[#18181B] text-[#F5D103] text-[9px] font-bold flex items-center justify-center shadow-xs">{totalItems}</span>
            )}
          </div>
          <span className="text-[10px] mt-1 font-medium tracking-tight">{cms.t('global.mobile_nav.basket')}</span>
        </button>
      </div>
    </nav>
  );
};
