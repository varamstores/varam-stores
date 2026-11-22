import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Search,
  Heart,
  ShoppingBag,
  MapPin,
  Menu,
  X,
  User,
  ChevronRight,
  ChevronDown,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useNavigation } from '../context/NavigationContext';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { useBrands, useSearchSuggestions } from '../lib/catalogue';
import { formatMoney } from '../lib/money';
import { useCms } from '../cms/CmsProvider';
import { CmsImg, Picture } from '../cms/components';
import { CmsIcon } from '../cms/icons';
import type { CmsEntries } from '../cms/content.gen';
import { BrandsMegaMenu } from './BrandsMegaMenu';
import { ShopMegaMenu } from './ShopMegaMenu';
import { motion, AnimatePresence } from 'framer-motion';
import { dropdownVariants, badgePopVariants } from '../motion/variants';
import type { Product } from '../types';

interface HeaderProps {
  onOpenLocationModal: () => void;
  onSelectProduct: (product: Product) => void;
  onOpenAccountModal?: () => void;
}

type NavItem = CmsEntries['global.header.nav'][number];
const BRAND_GROUPS = ['A-B', 'C-E', 'F-H', 'I-K', 'L-O', 'P-R', 'S-U', 'V-Z', '0-9'];

/** Debounced copy of a value, so search hits the database after the shopper pauses typing. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

export const Header: React.FC<HeaderProps> = ({ onOpenLocationModal, onSelectProduct, onOpenAccountModal }) => {
  const cms = useCms();
  const { totalItems, total, setIsCartOpen, cart } = useCart();
  const { wishlistCount } = useWishlist();
  const { isMuted, toggleSound } = useSoundEffects();
  const nav = useNavigation();
  const { currentView, filterOnSale, goToHome, goToShop, goToWishlist, goToAccount, navigateHref } = nav;
  const { data: brands = [] } = useBrands();

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounced(searchQuery, 220);
  const { data: suggestions, isFetching: isSearching } = useSearchSuggestions(debouncedQuery);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isBrandsMenuOpen, setIsBrandsMenuOpen] = useState(false);
  const [isShopMenuOpen, setIsShopMenuOpen] = useState(false);
  const [isMobileBrandsOpen, setIsMobileBrandsOpen] = useState(false);
  const [mobileBrandGroup, setMobileBrandGroup] = useState<string>('All');
  const [mobileBrandSearch, setMobileBrandSearch] = useState<string>('');
  const brandsHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shopHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);

  const brandCount = brands.length;
  const navItems = cms.get('global.header.nav');
  const postcodeLabel = cart?.zone?.label ?? cart?.postcode ?? cms.t('global.header.location_none');

  const filteredMobileBrands = useMemo(() => {
    const q = mobileBrandSearch.trim().toLowerCase();
    return brands.filter((b) => (mobileBrandGroup === 'All' || b.group === mobileBrandGroup) && (!q || b.name.toLowerCase().includes(q)));
  }, [brands, mobileBrandGroup, mobileBrandSearch]);

  const productResults = suggestions?.products ?? [];
  const showDropdown = isSearchFocused && searchQuery.trim().length >= 2;

  const handleSearchSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (searchQuery.trim()) {
      goToShop({ search: searchQuery.trim() });
      setIsSearchFocused(false);
      setIsMobileSearchOpen(false);
    }
  };

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (brandsHoverTimerRef.current) clearTimeout(brandsHoverTimerRef.current);
      if (shopHoverTimerRef.current) clearTimeout(shopHoverTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!searchContainerRef.current?.contains(target) && !mobileSearchRef.current?.contains(target)) setIsSearchFocused(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const closeMenus = () => {
    setIsBrandsMenuOpen(false);
    setIsShopMenuOpen(false);
  };

  /** Highlights the menu item for the page the shopper is on. */
  const isActive = (item: NavItem): boolean => {
    if (item.menu === 'brands') return isBrandsMenuOpen;
    const [path, query = ''] = item.href.split('?');
    const sale = new URLSearchParams(query).get('sale') === '1';
    if (path === '/') return currentView === 'home';
    if (path === '/shop') return currentView === 'shop' && sale === filterOnSale;
    if (path === '/story') return currentView === 'story';
    if (path.startsWith('/pages/')) return currentView === 'page' && path === `/pages/${nav.pageKey}`;
    return false;
  };

  const follow = (item: NavItem) => {
    if (item.menu === 'brands') {
      setIsShopMenuOpen(false);
      setIsBrandsMenuOpen((prev) => !prev);
      return;
    }
    closeMenus();
    setIsMobileMenuOpen(false);
    navigateHref(item.href);
  };

  const badgeText = (item: NavItem) => (item.badge ? item.badge.replace('{brandCount}', String(brandCount)) : '');

  const searchDropdown = (
    <AnimatePresence>
      {showDropdown && (
        <motion.div
          variants={dropdownVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-stone-200 p-3 z-50 max-h-96 overflow-y-auto overscroll-contain origin-top"
          data-lenis-prevent="true"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 px-3 py-1.5 flex items-center justify-between">
            <span>{isSearching && !suggestions ? cms.t('global.common.loading') : cms.t('global.header.search_found', { count: productResults.length })}</span>
            <button type="button" onClick={() => handleSearchSubmit()} className="text-[11px] text-[#B45309] font-bold hover:underline cursor-pointer">
              {cms.t('global.header.search_view_all')}
            </button>
          </div>

          {(suggestions?.categories.length || suggestions?.brands.length) ? (
            <div className="px-2 pb-2 flex flex-wrap gap-1.5">
              {suggestions.categories.slice(0, 4).map((c) => (
                <button
                  key={`c-${c.slug}`}
                  type="button"
                  onClick={() => { goToShop({ category: c.slug }); setIsSearchFocused(false); setIsMobileSearchOpen(false); setSearchQuery(''); }}
                  className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 border border-amber-200/70 text-[#B45309] hover:bg-amber-100 cursor-pointer"
                  title={cms.t('global.header.search_categories')}
                >
                  {c.name}
                </button>
              ))}
              {suggestions.brands.slice(0, 4).map((b) => (
                <button
                  key={`b-${b.slug}`}
                  type="button"
                  onClick={() => { goToShop({ brands: [b.slug] }); setIsSearchFocused(false); setIsMobileSearchOpen(false); setSearchQuery(''); }}
                  className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-stone-50 border border-stone-200 text-[#18181B] hover:border-[#F5D103] cursor-pointer"
                  title={cms.t('global.header.search_brands')}
                >
                  {b.name}
                </button>
              ))}
            </div>
          ) : null}

          {productResults.length === 0 && !isSearching ? (
            <div className="text-center py-6 px-4 text-xs text-stone-500">{cms.t('global.header.search_none', { query: searchQuery.trim() })}</div>
          ) : (
            <div className="divide-y divide-stone-100">
              {productResults.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => {
                    onSelectProduct(product);
                    setIsSearchFocused(false);
                    setIsMobileSearchOpen(false);
                    setSearchQuery('');
                  }}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-stone-50 transition-colors text-left cursor-pointer active:scale-98"
                >
                  <Picture image={product.image} className="w-10 h-10 object-cover rounded-lg flex-shrink-0 bg-stone-50" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[#18181B] truncate">{product.name}</p>
                    <p className="text-[11px] text-stone-500">{product.category.name}</p>
                  </div>
                  <span className="text-xs font-bold text-[#18181B]">{formatMoney(product.price)}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 w-full z-50 transition-colors duration-200 ${
          isScrolled || isMobileMenuOpen || isMobileSearchOpen
            ? 'bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-xs'
            : 'bg-white/95 backdrop-blur-md border-b border-stone-200/80 shadow-2xs'
        }`}
      >
        <div className="hidden lg:block absolute right-0 top-0 bottom-0 h-full w-full lg:w-1/3 pointer-events-none overflow-hidden select-none">
          <CmsImg k="global.header.decor" className="absolute right-0 top-1/2 -translate-y-1/2 h-full w-auto max-w-none object-contain object-right opacity-60" />
        </div>

        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 relative z-10">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-3 lg:gap-6 w-full min-w-0">
            {/* 1. Logo & Mobile Hamburger */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(!isMobileMenuOpen);
                  if (isMobileSearchOpen) setIsMobileSearchOpen(false);
                }}
                className="lg:hidden p-1.5 -ml-1 rounded-full flex items-center justify-center text-stone-800 hover:text-[#B45309] hover:bg-black/5 transition-all cursor-pointer relative shrink-0"
                aria-label={isMobileMenuOpen ? cms.t('global.header.menu_close_aria') : cms.t('global.header.menu_open_aria')}
              >
                <div className={`transition-transform duration-300 transform ${isMobileMenuOpen ? 'rotate-90 scale-105 text-[#18181B]' : 'rotate-0'}`}>
                  {isMobileMenuOpen ? <X className="w-5 h-5 stroke-[2.2]" /> : <Menu className="w-5 h-5 stroke-[2.2]" />}
                </div>
              </button>

              <button
                type="button"
                onClick={goToHome}
                className="flex items-center group cursor-pointer focus:outline-none py-1"
                aria-label={cms.t('global.brand.home_aria')}
              >
                <CmsImg k="global.brand.logo" className="h-10 sm:h-12 w-auto object-contain group-hover:scale-105 transition-transform duration-200 drop-shadow-xs" />
              </button>
            </div>

            {/* 2. Desktop Navigation Links */}
            <nav aria-label={cms.t('global.header.nav_aria')} className="hidden lg:flex items-center gap-5 xl:gap-7 text-[13.5px] xl:text-sm font-semibold text-[#18181B]">
              {navItems.map((item, idx) => {
                const isBrands = item.menu === 'brands';
                const isShop = item.menu === 'shop';
                const isDropdownOpen = isBrands ? isBrandsMenuOpen : isShop ? isShopMenuOpen : false;
                const active = isActive(item);
                const badge = badgeText(item);
                return (
                  <div
                    key={`${item.label}-${idx}`}
                    className="relative"
                    onMouseEnter={() => {
                      if (isBrands) {
                        if (brandsHoverTimerRef.current) clearTimeout(brandsHoverTimerRef.current);
                        setIsBrandsMenuOpen(true);
                        setIsShopMenuOpen(false);
                      } else if (isShop) {
                        if (shopHoverTimerRef.current) clearTimeout(shopHoverTimerRef.current);
                        setIsShopMenuOpen(true);
                        setIsBrandsMenuOpen(false);
                      }
                    }}
                    onMouseLeave={() => {
                      if (isBrands) brandsHoverTimerRef.current = setTimeout(() => setIsBrandsMenuOpen(false), 180);
                      else if (isShop) shopHoverTimerRef.current = setTimeout(() => setIsShopMenuOpen(false), 180);
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        follow(item);
                      }}
                      aria-expanded={isBrands || isShop ? isDropdownOpen : undefined}
                      className={`py-1.5 px-0.5 inline-flex items-center gap-1.5 transition-colors cursor-pointer select-none text-[13.5px] xl:text-sm ${
                        active ? 'text-[#B45309] font-extrabold' : 'text-[#18181B] hover:text-[#B45309] font-bold'
                      }`}
                    >
                      <span className="relative pb-0.5">
                        {item.label}
                        {active && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#F5D103] rounded-full" />}
                      </span>
                      {badge && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#F5D103] text-[#18181B] leading-none shadow-2xs">{badge}</span>
                      )}
                      {(isBrands || isShop) && (
                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180 text-[#B45309]' : 'text-[#18181B]/70'}`} />
                      )}
                    </button>
                  </div>
                );
              })}
            </nav>

            {/* 3. Search Bar (desktop) */}
            <div ref={searchContainerRef} className="relative flex-1 max-w-sm lg:max-w-md xl:max-w-xl mx-2 lg:mx-4 hidden md:block">
              <form onSubmit={handleSearchSubmit} className="relative" role="search">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  placeholder={cms.t('global.header.search_placeholder')}
                  aria-label={cms.t('global.header.search_aria')}
                  className="w-full text-[#18181B] text-xs sm:text-[13px] font-medium placeholder-stone-400 pl-8.5 pr-7 py-2 rounded-full border border-stone-200 bg-white hover:border-[#F5D103] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F5D103]/30 focus:border-[#F5D103] transition-all shadow-2xs [&::-webkit-search-cancel-button]:hidden"
                />
                <Search className="w-3.5 h-3.5 text-[#18181B]/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label={cms.t('global.header.search_clear_aria')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </form>
              {searchDropdown}
            </div>

            {/* 4. Right Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={onOpenLocationModal}
                className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#18181B] hover:text-[#B45309] rounded-full border border-stone-200 bg-white hover:border-[#F5D103] transition-colors cursor-pointer shadow-2xs"
                title={cms.t('global.header.location_title')}
              >
                <MapPin className="w-3.5 h-3.5 text-[#B45309]" />
                <span className="truncate max-w-[110px]">{postcodeLabel}</span>
              </button>

              {/* Mobile Right Icons */}
              <div className="flex md:hidden items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileSearchOpen(!isMobileSearchOpen);
                    if (isMobileMenuOpen) setIsMobileMenuOpen(false);
                  }}
                  className={`p-1.5 rounded-full transition-colors cursor-pointer text-[#18181B] hover:text-[#B45309] ${isMobileSearchOpen ? 'bg-black/5 text-[#18181B]' : ''}`}
                  aria-label={cms.t('global.header.search_toggle_aria')}
                  aria-expanded={isMobileSearchOpen}
                >
                  <Search className="w-4.5 h-4.5 stroke-[2]" />
                </button>

                <button
                  type="button"
                  onClick={() => (onOpenAccountModal ? onOpenAccountModal() : goToAccount())}
                  className={`p-1.5 rounded-full transition-colors cursor-pointer ${currentView === 'account' ? 'text-[#B45309] bg-[#F5D103]/15' : 'text-[#18181B] hover:text-[#B45309]'}`}
                  aria-label={cms.t('global.header.account_aria')}
                >
                  <User className="w-4.5 h-4.5 stroke-[2]" />
                </button>

                <button
                  type="button"
                  id="mobile-header-cart-btn"
                  data-cart-btn="true"
                  onClick={() => setIsCartOpen(true)}
                  className="relative p-1.5 rounded-full transition-transform active:scale-95 cursor-pointer text-[#18181B] hover:text-[#B45309]"
                  aria-label={cms.t('global.header.cart_aria', { count: totalItems })}
                >
                  <ShoppingBag className="w-4.5 h-4.5 stroke-[2]" />
                  <AnimatePresence mode="popLayout">
                    {totalItems > 0 && (
                      <motion.span
                        key={`mobile-cart-${totalItems}`}
                        variants={badgePopVariants}
                        initial="initial"
                        animate="animate"
                        className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-[#F5D103] text-[#18181B] text-[8.5px] font-bold flex items-center justify-center border border-white shadow-2xs"
                      >
                        {totalItems}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </div>

              {/* Desktop Right Controls (Tablet & Up) */}
              <div className="hidden md:flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleSound}
                  className="p-1.5 rounded-full text-stone-600 hover:text-[#B45309] hover:bg-stone-100/70 transition-colors cursor-pointer active:scale-90"
                  aria-label={isMuted ? cms.t('global.header.sound_on_aria') : cms.t('global.header.sound_off_aria')}
                  title={isMuted ? cms.t('global.header.sound_muted_title') : cms.t('global.header.sound_active_title')}
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-stone-400" /> : <Volume2 className="w-4 h-4 text-[#B45309]" />}
                </button>

                <button
                  type="button"
                  onClick={() => (onOpenAccountModal ? onOpenAccountModal() : goToAccount())}
                  className={`p-1.5 rounded-full transition-colors cursor-pointer active:scale-90 ${
                    currentView === 'account' ? 'text-[#B45309] bg-[#F5D103]/15 ring-1 ring-[#F5D103]/30' : 'text-stone-600 hover:text-[#B45309] hover:bg-amber-100/50'
                  }`}
                  aria-label={cms.t('global.header.account_aria')}
                  title={cms.t('global.header.account_title')}
                >
                  <User className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => goToWishlist()}
                  className={`relative p-1.5 rounded-full transition-colors cursor-pointer active:scale-90 ${
                    currentView === 'wishlist' ? 'text-rose-600 bg-rose-50' : 'text-stone-600 hover:text-[#B45309] hover:bg-stone-100/70'
                  }`}
                  aria-label={cms.t('global.header.wishlist_aria')}
                  title={cms.t('global.header.wishlist_title')}
                >
                  <Heart className={`w-4 h-4 ${currentView === 'wishlist' ? 'fill-current' : ''}`} />
                  <AnimatePresence mode="popLayout">
                    {wishlistCount > 0 && (
                      <motion.span
                        key={`wishlist-badge-${wishlistCount}`}
                        variants={badgePopVariants}
                        initial="initial"
                        animate="animate"
                        className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#F5D103] text-[#18181B] text-[9px] font-bold flex items-center justify-center border border-white"
                      >
                        {wishlistCount}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>

                <button
                  type="button"
                  id="desktop-cart-btn"
                  data-cart-btn="true"
                  onClick={() => setIsCartOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F5D103] text-[#18181B] hover:bg-[#E5A800] active:scale-95 transition-all text-xs font-semibold shadow-2xs cursor-pointer group"
                  aria-label={cms.t('global.header.cart_aria', { count: totalItems })}
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-[#18181B]" />
                  <span className="font-bold">{formatMoney(total)}</span>
                  <AnimatePresence mode="popLayout">
                    {totalItems > 0 && (
                      <motion.span
                        key={`cart-pill-${totalItems}`}
                        variants={badgePopVariants}
                        initial="initial"
                        animate="animate"
                        className="w-4 h-4 rounded-full bg-[#18181B] text-[#F5D103] text-[9.5px] font-extrabold flex items-center justify-center -ml-0.5"
                      >
                        {totalItems}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(!isMobileMenuOpen);
                    if (isMobileSearchOpen) setIsMobileSearchOpen(false);
                  }}
                  className="lg:hidden w-8 h-8 rounded-full flex items-center justify-center text-stone-700 hover:text-[#B45309] hover:bg-black/5 transition-all cursor-pointer relative"
                  aria-label={isMobileMenuOpen ? cms.t('global.header.menu_close_aria') : cms.t('global.header.menu_open_aria')}
                >
                  <div className={`transition-transform duration-300 transform ${isMobileMenuOpen ? 'rotate-90 scale-105 text-[#18181B]' : 'rotate-0'}`}>
                    {isMobileMenuOpen ? <X className="w-4.5 h-4.5 stroke-[2.2]" /> : <Menu className="w-4.5 h-4.5 stroke-[2]" />}
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Brands Mega Menu */}
        <div
          onMouseEnter={() => {
            if (brandsHoverTimerRef.current) clearTimeout(brandsHoverTimerRef.current);
            setIsBrandsMenuOpen(true);
          }}
          onMouseLeave={() => {
            brandsHoverTimerRef.current = setTimeout(() => setIsBrandsMenuOpen(false), 180);
          }}
        >
          <BrandsMegaMenu
            isOpen={isBrandsMenuOpen}
            onClose={() => setIsBrandsMenuOpen(false)}
            onSelectBrand={(slug) => {
              goToShop({ brands: [slug] });
              setIsBrandsMenuOpen(false);
            }}
            onViewAllBrands={() => {
              goToShop();
              setIsBrandsMenuOpen(false);
            }}
          />
        </div>

        {/* Desktop Shop Mega Menu */}
        <div
          onMouseEnter={() => {
            if (shopHoverTimerRef.current) clearTimeout(shopHoverTimerRef.current);
            setIsShopMenuOpen(true);
          }}
          onMouseLeave={() => {
            shopHoverTimerRef.current = setTimeout(() => setIsShopMenuOpen(false), 180);
          }}
        >
          <ShopMegaMenu
            isOpen={isShopMenuOpen}
            onClose={() => setIsShopMenuOpen(false)}
            onSelectCategory={(slug) => {
              goToShop({ category: slug });
              setIsShopMenuOpen(false);
            }}
            onViewAllShop={() => {
              goToShop();
              setIsShopMenuOpen(false);
            }}
          />
        </div>

        {/* Mobile Search */}
        <div
          ref={mobileSearchRef}
          className={`md:hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] relative ${
            isMobileSearchOpen ? 'max-h-[70vh] opacity-100 px-4 pb-3' : 'max-h-0 opacity-0 px-4 pb-0 pointer-events-none overflow-hidden'
          }`}
        >
          <form onSubmit={handleSearchSubmit} className="relative" role="search">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              placeholder={cms.t('global.header.search_placeholder_mobile')}
              aria-label={cms.t('global.header.search_aria')}
              className="w-full bg-white text-xs pl-9 pr-8 py-2.5 rounded-full border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/30 focus:border-[#F5D103] shadow-2xs text-[#18181B] placeholder-stone-400 [&::-webkit-search-cancel-button]:hidden"
            />
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label={cms.t('global.header.search_clear_aria')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>
          {isMobileSearchOpen && <div className="relative">{searchDropdown}</div>}
        </div>

        {/* Mobile Navigation Drawer */}
        <div
          className={`xl:hidden overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isMobileMenuOpen ? 'max-h-[85vh] opacity-100 px-3 sm:px-4 pb-4 overflow-y-auto' : 'max-h-0 opacity-0 px-3 sm:px-4 pb-0 pointer-events-none'
          }`}
          data-lenis-prevent="true"
        >
          <div className="bg-white/95 backdrop-blur-xl border border-stone-200/80 rounded-3xl shadow-xl p-4 flex flex-col gap-1.5">
            {navItems.map((item, idx) => {
              const isBrands = item.menu === 'brands';
              const badge = badgeText(item);
              return (
                <div key={`${item.label}-${idx}`} className="w-full">
                  <button
                    type="button"
                    onClick={() => {
                      if (isBrands) setIsMobileBrandsOpen((prev) => !prev);
                      else {
                        setIsMobileBrandsOpen(false);
                        follow(item);
                      }
                    }}
                    style={{ transitionDelay: isMobileMenuOpen ? `${idx * 25}ms` : '0ms' }}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-[#18181B] hover:text-[#B45309] hover:bg-amber-100 transition-all duration-200 group w-full text-left cursor-pointer ${
                      isMobileMenuOpen ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center text-stone-700 group-hover:bg-[#F5D103] group-hover:text-[#18181B] transition-colors">
                        <CmsIcon name={item.icon} className="w-4 h-4" />
                      </span>
                      <span className="font-bold text-[15px] text-[#18181B] group-hover:text-[#B45309]">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {badge && <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#F5D103] text-[#18181B]">{badge}</span>}
                      {isBrands ? (
                        <ChevronDown className={`w-4 h-4 text-[#18181B]/60 transition-transform duration-200 ${isMobileBrandsOpen ? 'rotate-180 text-[#B45309]' : ''}`} />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-[#18181B]/60 group-hover:translate-x-0.5 transition-transform" />
                      )}
                    </div>
                  </button>

                  {isBrands && isMobileBrandsOpen && (
                    <div className="mt-1.5 mb-2 p-3 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-2.5">
                      <div className="relative">
                        <input
                          type="text"
                          value={mobileBrandSearch}
                          onChange={(e) => setMobileBrandSearch(e.target.value)}
                          placeholder={cms.t('global.header.brand_search_mobile', { count: brandCount })}
                          className="w-full text-xs font-medium text-[#18181B] bg-white pl-8 pr-7 py-2 rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-[#F5D103]"
                        />
                        <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        {mobileBrandSearch && (
                          <button
                            type="button"
                            onClick={() => setMobileBrandSearch('')}
                            aria-label={cms.t('global.header.search_clear_aria')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 p-0.5 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                        {['All', ...BRAND_GROUPS].map((grp) => (
                          <button
                            key={grp}
                            type="button"
                            onClick={() => setMobileBrandGroup(grp)}
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                              mobileBrandGroup === grp ? 'bg-[#F5D103] text-[#18181B]' : 'bg-white border border-stone-200 text-stone-700 hover:text-[#18181B]'
                            }`}
                          >
                            {grp === 'All' ? cms.t('global.header.brand_group_all') : grp}
                          </button>
                        ))}
                      </div>

                      <div className="max-h-48 overflow-y-auto flex flex-wrap gap-1.5 pt-1">
                        {filteredMobileBrands.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => {
                              setIsMobileMenuOpen(false);
                              setIsMobileBrandsOpen(false);
                              goToShop({ brands: [b.slug] });
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-stone-200 text-[#18181B] hover:text-[#B45309] hover:border-[#F5D103] active:bg-amber-100 cursor-pointer shadow-2xs"
                          >
                            {b.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="pt-2 mt-1 border-t border-stone-100">
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenLocationModal();
                }}
                className="w-full flex items-center justify-between px-3.5 py-2 rounded-2xl bg-stone-50 hover:bg-amber-100 text-xs font-semibold text-[#18181B] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 text-[#B45309]" />
                  <span>
                    {cms.t('global.header.deliver_to')} <strong className="text-[#18181B]">{postcodeLabel}</strong>
                  </span>
                </div>
                <span className="text-[11px] font-bold text-[#B45309] hover:underline">{cms.t('global.header.change')}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div
        className={`fixed inset-0 top-14 sm:top-16 bg-black/15 z-30 lg:hidden transition-opacity duration-300 ${
          isMobileMenuOpen || isMobileSearchOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => {
          setIsMobileMenuOpen(false);
          setIsMobileSearchOpen(false);
        }}
      />
    </>
  );
};
