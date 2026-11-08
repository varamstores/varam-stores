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
  Tag,
  Store,
  Info,
  Award,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useNavigation } from '../context/NavigationContext';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { products } from '../data/products';
import { allBrands, type BrandItem } from '../data/brands';
import { BrandsMegaMenu } from './BrandsMegaMenu';
import { ShopMegaMenu } from './ShopMegaMenu';
import { motion, AnimatePresence } from 'framer-motion';
import { dropdownVariants, badgePopVariants } from '../motion/variants';
import type { Product } from '../types';

interface HeaderProps {
  onOpenLocationModal: () => void;
  selectedPostalCode: string;
  onSelectProduct: (product: Product) => void;
  onOpenAccountModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenLocationModal,
  selectedPostalCode,
  onSelectProduct,
  onOpenAccountModal,
}) => {
  const { totalItems, total, setIsCartOpen } = useCart();
  const { wishlistCount } = useWishlist();
  const { isMuted, toggleSound } = useSoundEffects();
  const { currentView, filterOnSale, goToHome, goToShop, goToWishlist, goToAccount, goToStory } = useNavigation();

  const [searchQuery, setSearchQuery] = useState('');
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

  const filteredMobileBrands = useMemo(() => {
    return allBrands.filter((b) => {
      if (mobileBrandGroup !== 'All' && b.group !== mobileBrandGroup) return false;
      if (mobileBrandSearch.trim()) {
        return b.name.toLowerCase().includes(mobileBrandSearch.trim().toLowerCase());
      }
      return true;
    });
  }, [mobileBrandGroup, mobileBrandSearch]);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);

  const searchResults = searchQuery.trim()
    ? products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.categoryLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.description.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .slice(0, 6)
    : [];

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchQuery.trim()) {
      goToShop({ search: searchQuery.trim() });
      setIsSearchFocused(false);
      setIsMobileSearchOpen(false);
    }
  };

  // Track scroll position for subtle backdrop blur/border styling
  useEffect(() => {
    const handleScroll = (y?: number) => {
      const scrollPos = typeof y === 'number' ? y : window.scrollY;
      setIsScrolled(scrollPos > 10);
    };

    const onScroll = () => handleScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (brandsHoverTimerRef.current) clearTimeout(brandsHoverTimerRef.current);
    };
  }, []);

  // Click outside search and brands
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedDesktop = searchContainerRef.current?.contains(target);
      const clickedMobile = mobileSearchRef.current?.contains(target);
      if (!clickedDesktop && !clickedMobile) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navLinks: {
    label: string;
    action: () => void;
    icon: React.ComponentType<{ className?: string }>;
    active?: boolean;
    badge?: string;
    isDropdown?: boolean;
  }[] = [
    {
      label: 'Home',
      action: () => {
        setIsBrandsMenuOpen(false);
        setIsShopMenuOpen(false);
        goToHome();
      },
      icon: Store,
      active: currentView === 'home',
    },
    {
      label: 'Shop',
      action: () => {
        setIsBrandsMenuOpen(false);
        setIsShopMenuOpen(false);
        goToShop({ category: 'all' });
      },
      icon: Store,
      active: currentView === 'shop',
      isDropdown: true,
    },
    {
      label: 'Deals',
      action: () => {
        setIsBrandsMenuOpen(false);
        setIsShopMenuOpen(false);
        goToShop({ category: 'all', filterOnSale: true, search: '' });
      },
      icon: Tag,
      active: currentView === 'shop' && filterOnSale,
      badge: '20% OFF',
    },
    {
      label: 'Brands',
      action: () => {
        setIsShopMenuOpen(false);
        setIsBrandsMenuOpen((prev) => !prev);
      },
      icon: Award,
      badge: '90+',
      isDropdown: true,
      active: isBrandsMenuOpen,
    },
    {
      label: 'Our Story',
      action: () => {
        setIsBrandsMenuOpen(false);
        setIsShopMenuOpen(false);
        setIsMobileMenuOpen(false);
        goToStory();
      },
      icon: Info,
      active: currentView === 'story',
    },
  ];

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 w-full z-50 transition-colors duration-200 ${
          isScrolled || isMobileMenuOpen || isMobileSearchOpen
            ? 'bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-xs'
            : 'bg-white/95 backdrop-blur-md border-b border-stone-200/80 shadow-2xs'
        }`}
      >
        {/* Decorative Herbs Image (Right side, Desktop only) */}
        <div className="hidden lg:block absolute right-0 top-0 bottom-0 h-full w-full lg:w-1/3 pointer-events-none overflow-hidden select-none">
          <img
            src="/footer-herbs-clean.png"
            alt="Fresh aromatic herbs"
            className="absolute right-0 top-1/2 -translate-y-1/2 h-full w-auto max-w-none object-contain object-right opacity-60"
          />
        </div>

        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 relative z-10">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-3 lg:gap-6 w-full min-w-0">
            {/* 1. Logo & Mobile Hamburger */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 shrink-0">
              {/* Mobile Hamburger Button */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(!isMobileMenuOpen);
                  if (isMobileSearchOpen) setIsMobileSearchOpen(false);
                }}
                className="lg:hidden p-1.5 -ml-1 rounded-full flex items-center justify-center text-stone-800 hover:text-[#B45309] hover:bg-black/5 transition-all cursor-pointer relative shrink-0"
                aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              >
                <div
                  className={`transition-transform duration-300 transform ${
                    isMobileMenuOpen ? 'rotate-90 scale-105 text-[#18181B]' : 'rotate-0'
                  }`}
                >
                  {isMobileMenuOpen ? (
                    <X className="w-5 h-5 stroke-[2.2]" />
                  ) : (
                    <Menu className="w-5 h-5 stroke-[2.2]" />
                  )}
                </div>
              </button>

              {/* Brand Logo & Name */}
              <button
                type="button"
                onClick={goToHome}
                className="flex items-center group cursor-pointer focus:outline-none py-1"
                aria-label="Varam Foods Home"
              >
                <img
                  src="/varam-footer-banner.jpg"
                  alt="Varam Foods"
                  className="h-10 sm:h-12 w-auto object-contain group-hover:scale-105 transition-transform duration-200 drop-shadow-xs"
                />
              </button>
            </div>

            {/* 2. Desktop Navigation Links */}
            <nav
              aria-label="Main Navigation"
              className="hidden lg:flex items-center gap-5 xl:gap-7 text-[13.5px] xl:text-sm font-semibold text-[#18181B]"
            >
              {navLinks.map((link) => {
                const isBrands = link.label === 'Brands';
                const isShop = link.label === 'Shop';
                const isDropdownOpen = isBrands ? isBrandsMenuOpen : isShop ? isShopMenuOpen : false;

                return (
                  <div
                    key={link.label}
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
                      if (isBrands) {
                        brandsHoverTimerRef.current = setTimeout(() => {
                          setIsBrandsMenuOpen(false);
                        }, 180);
                      } else if (isShop) {
                        shopHoverTimerRef.current = setTimeout(() => {
                          setIsShopMenuOpen(false);
                        }, 180);
                      }
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        link.action();
                      }}
                      className={`py-1.5 px-0.5 inline-flex items-center gap-1.5 transition-colors cursor-pointer select-none text-[13.5px] xl:text-sm ${
                        link.active
                          ? 'text-[#B45309] font-extrabold'
                          : 'text-[#18181B] hover:text-[#B45309] font-bold'
                      }`}
                    >
                      <span className="relative pb-0.5">
                        {link.label}
                        {link.active && (
                          <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#F5D103] rounded-full" />
                        )}
                      </span>
                      {link.badge && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#F5D103] text-[#18181B] leading-none shadow-2xs">
                          {link.badge}
                        </span>
                      )}
                      {link.isDropdown && (
                        <ChevronDown
                          className={`w-4 h-4 transition-transform duration-200 ${
                            isDropdownOpen ? 'rotate-180 text-[#B45309]' : 'text-[#18181B]/70'
                          }`}
                        />
                      )}
                    </button>
                  </div>
                );
              })}
            </nav>

            {/* 3. Search Bar (Fluid Center for Desktop) */}
            <div
              ref={searchContainerRef}
              className="relative flex-1 max-w-sm lg:max-w-md xl:max-w-xl mx-2 lg:mx-4 hidden md:block"
            >
              <form onSubmit={handleSearchSubmit} className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  placeholder="Search fresh grocery, spices, flours..."
                  aria-label="Search products"
                  className="w-full text-[#18181B] text-xs sm:text-[13px] font-medium placeholder-stone-400 pl-8.5 pr-7 py-2 rounded-full border border-stone-200 bg-white hover:border-[#F5D103] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F5D103]/30 focus:border-[#F5D103] transition-all shadow-2xs"
                />
                <Search className="w-3.5 h-3.5 text-[#18181B]/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </form>

              {/* Instant Search Dropdown (Desktop) Animated */}
              <AnimatePresence>
                {isSearchFocused && searchQuery.trim().length > 0 && (
                  <motion.div
                    variants={dropdownVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-stone-200 p-3 z-50 max-h-96 overflow-y-auto overscroll-contain origin-top"
                  >
                    <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 px-3 py-1.5 flex items-center justify-between">
                      <span>Found {searchResults.length} matches</span>
                      <button
                        type="button"
                        onClick={() => handleSearchSubmit()}
                        className="text-[11px] text-[#B45309] font-bold hover:underline cursor-pointer"
                      >
                        View All in Catalogue →
                      </button>
                    </div>

                    {searchResults.length === 0 ? (
                      <div className="text-center py-6 px-4 text-xs text-stone-500">
                        No items match &quot;{searchQuery}&quot;. Try &apos;tomatoes&apos; or &apos;bananas&apos;.
                      </div>
                    ) : (
                      <div className="divide-y divide-stone-100">
                        {searchResults.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => {
                              onSelectProduct(product);
                              setIsSearchFocused(false);
                              setSearchQuery('');
                            }}
                            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-stone-50 transition-colors text-left cursor-pointer active:scale-98"
                          >
                            <img
                              src={product.image}
                              alt={product.name}
                              className="w-10 h-10 object-cover rounded-lg flex-shrink-0 bg-stone-50"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-[#18181B] truncate">
                                {product.name}
                              </p>
                              <p className="text-[11px] text-stone-500">
                                {product.categoryLabel}
                              </p>
                            </div>
                            <span className="text-xs font-bold text-[#18181B]">
                              £{product.price.toFixed(2)}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 4. Right Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              {/* Delivery Location (Desktop) */}
              <button
                type="button"
                onClick={onOpenLocationModal}
                className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#18181B] hover:text-[#B45309] rounded-full border border-stone-200 bg-white hover:border-[#F5D103] transition-colors cursor-pointer shadow-2xs"
                title="Change Delivery Location"
              >
                <MapPin className="w-3.5 h-3.5 text-[#B45309]" />
                <span className="truncate max-w-[110px]">{selectedPostalCode}</span>
              </button>

              {/* Mobile Right Icons */}
              <div className="flex md:hidden items-center gap-0.5">
                {/* Mobile Search Icon */}
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileSearchOpen(!isMobileSearchOpen);
                    if (isMobileMenuOpen) setIsMobileMenuOpen(false);
                  }}
                  className={`p-1.5 rounded-full transition-colors cursor-pointer text-[#18181B] hover:text-[#B45309] ${
                    isMobileSearchOpen ? 'bg-black/5 text-[#18181B]' : ''
                  }`}
                  aria-label="Toggle Search"
                >
                  <Search className="w-4.5 h-4.5 stroke-[2]" />
                </button>

                {/* Mobile Account Icon */}
                <button
                  type="button"
                  onClick={onOpenAccountModal || goToAccount}
                  className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                    currentView === 'account'
                      ? 'text-[#B45309] bg-[#F5D103]/15'
                      : 'text-[#18181B] hover:text-[#B45309]'
                  }`}
                  aria-label="User Account"
                >
                  <User className="w-4.5 h-4.5 stroke-[2]" />
                </button>

                {/* Mobile Shopping Cart with Round Badge */}
                <button
                  type="button"
                  id="mobile-header-cart-btn"
                  data-cart-btn="true"
                  onClick={() => setIsCartOpen(true)}
                  className="relative p-1.5 rounded-full transition-transform active:scale-95 cursor-pointer text-[#18181B] hover:text-[#B45309]"
                  aria-label={`Shopping basket with ${totalItems} items`}
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
                {/* Sound Effects Toggle */}
                <button
                  type="button"
                  onClick={toggleSound}
                  className="p-1.5 rounded-full text-stone-600 hover:text-[#B45309] hover:bg-stone-100/70 transition-colors cursor-pointer active:scale-90"
                  aria-label={isMuted ? 'Enable sound effects' : 'Mute sound effects'}
                  title={isMuted ? 'Sound effects muted (Click to enable)' : 'Sound effects active (Click to mute)'}
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-stone-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-[#B45309]" />
                  )}
                </button>

                {/* Desktop Account Icon */}
                <button
                  type="button"
                  onClick={onOpenAccountModal || goToAccount}
                  className={`p-1.5 rounded-full transition-colors cursor-pointer active:scale-90 ${
                    currentView === 'account'
                      ? 'text-[#B45309] bg-[#F5D103]/15 ring-1 ring-[#F5D103]/30'
                      : 'text-stone-600 hover:text-[#B45309] hover:bg-amber-100/50'
                  }`}
                  aria-label="User Account Profile"
                  title="My Account & Orders"
                >
                  <User className="w-4 h-4" />
                </button>

                {/* Wishlist Icon */}
                <button
                  type="button"
                  onClick={() => goToWishlist()}
                  className={`relative p-1.5 rounded-full transition-colors cursor-pointer active:scale-90 ${
                    currentView === 'wishlist'
                      ? 'text-rose-600 bg-rose-50'
                      : 'text-stone-600 hover:text-[#B45309] hover:bg-stone-100/70'
                  }`}
                  aria-label="Wishlist"
                  title="View Saved Wishlist"
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

                {/* Desktop Shopping Basket Button - Minimal Pill */}
                <button
                  type="button"
                  id="desktop-cart-btn"
                  data-cart-btn="true"
                  onClick={() => setIsCartOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F5D103] text-[#18181B] hover:bg-[#E5A800] active:scale-95 transition-all text-xs font-semibold shadow-2xs cursor-pointer group"
                  aria-label={`Shopping basket with ${totalItems} items`}
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-[#18181B]" />
                  <span className="font-bold">£{total.toFixed(2)}</span>
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

                {/* Tablet Hamburger Button (lg:hidden) */}
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(!isMobileMenuOpen);
                    if (isMobileSearchOpen) setIsMobileSearchOpen(false);
                  }}
                  className="lg:hidden w-8 h-8 rounded-full flex items-center justify-center text-stone-700 hover:text-[#B45309] hover:bg-black/5 transition-all cursor-pointer relative"
                  aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
                >
                  <div
                    className={`transition-transform duration-300 transform ${
                      isMobileMenuOpen ? 'rotate-90 scale-105 text-[#18181B]' : 'rotate-0'
                    }`}
                  >
                    {isMobileMenuOpen ? (
                      <X className="w-4.5 h-4.5 stroke-[2.2]" />
                    ) : (
                      <Menu className="w-4.5 h-4.5 stroke-[2]" />
                    )}
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Brands Mega Menu Dropdown */}
        <div
          onMouseEnter={() => {
            if (brandsHoverTimerRef.current) clearTimeout(brandsHoverTimerRef.current);
            setIsBrandsMenuOpen(true);
          }}
          onMouseLeave={() => {
            brandsHoverTimerRef.current = setTimeout(() => {
              setIsBrandsMenuOpen(false);
            }, 180);
          }}
        >
          <BrandsMegaMenu
            isOpen={isBrandsMenuOpen}
            onClose={() => setIsBrandsMenuOpen(false)}
            onSelectBrand={(brandName) => {
              goToShop({ search: brandName, category: 'all' });
              setIsBrandsMenuOpen(false);
            }}
            onViewAllBrands={() => {
              goToShop({ category: 'all' });
              setIsBrandsMenuOpen(false);
            }}
          />
        </div>

        {/* Desktop Shop Mega Menu Dropdown */}
        <div
          onMouseEnter={() => {
            if (shopHoverTimerRef.current) clearTimeout(shopHoverTimerRef.current);
            setIsShopMenuOpen(true);
          }}
          onMouseLeave={() => {
            shopHoverTimerRef.current = setTimeout(() => {
              setIsShopMenuOpen(false);
            }, 180);
          }}
        >
          <ShopMegaMenu
            isOpen={isShopMenuOpen}
            onClose={() => setIsShopMenuOpen(false)}
            onSelectCategory={(categoryId) => {
              goToShop({ category: categoryId });
              setIsShopMenuOpen(false);
            }}
            onViewAllShop={() => {
              goToShop({ category: 'all' });
              setIsShopMenuOpen(false);
            }}
          />
        </div>

        {/* Mobile Search Bar Expandable Drawer */}
        <div
          ref={mobileSearchRef}
          className={`md:hidden overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isMobileSearchOpen ? 'max-h-24 opacity-100 px-4 pb-3' : 'max-h-0 opacity-0 px-4 pb-0 pointer-events-none'
          }`}
        >
          <form onSubmit={handleSearchSubmit} className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search produce, bakery, dairy..."
              aria-label="Search products"
              className="w-full bg-white text-xs pl-9 pr-8 py-2.5 rounded-full border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/30 focus:border-[#F5D103] shadow-2xs text-[#18181B] placeholder-stone-400"
            />
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>
        </div>

        {/* Floating Mobile Navigation Drawer */}
        <div
          className={`xl:hidden overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isMobileMenuOpen
              ? 'max-h-[85vh] opacity-100 px-3 sm:px-4 pb-4 overflow-y-auto'
              : 'max-h-0 opacity-0 px-3 sm:px-4 pb-0 pointer-events-none'
          }`}
        >
          <div className="bg-white/95 backdrop-blur-xl border border-stone-200/80 rounded-3xl shadow-xl p-4 flex flex-col gap-1.5">
            {navLinks.map((link, idx) => {
              const Icon = link.icon;
              const isBrands = link.label === 'Brands';
              return (
                <div key={link.label} className="w-full">
                  <button
                    type="button"
                    onClick={() => {
                      if (isBrands) {
                        setIsMobileBrandsOpen((prev) => !prev);
                      } else {
                        setIsMobileMenuOpen(false);
                        setIsMobileBrandsOpen(false);
                        link.action();
                      }
                    }}
                    style={{
                      transitionDelay: isMobileMenuOpen ? `${idx * 25}ms` : '0ms',
                    }}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-[#18181B] hover:text-[#B45309] hover:bg-amber-100 transition-all duration-200 group w-full text-left cursor-pointer ${
                      isMobileMenuOpen
                        ? 'translate-y-0 opacity-100'
                        : 'translate-y-2 opacity-0'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center text-stone-700 group-hover:bg-[#F5D103] group-hover:text-[#18181B] transition-colors">
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="font-bold text-[15px] text-[#18181B] group-hover:text-[#B45309]">{link.label}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {link.badge && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#F5D103] text-[#18181B]">
                          {link.badge}
                        </span>
                      )}
                      {isBrands ? (
                        <ChevronDown
                          className={`w-4 h-4 text-[#18181B]/60 transition-transform duration-200 ${
                            isMobileBrandsOpen ? 'rotate-180 text-[#B45309]' : ''
                          }`}
                        />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-[#18181B]/60 group-hover:translate-x-0.5 transition-transform" />
                      )}
                    </div>
                  </button>

                  {/* Expandable Mobile Brands Sub-Drawer */}
                  {isBrands && isMobileBrandsOpen && (
                    <div className="mt-1.5 mb-2 p-3 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-2.5">
                      <div className="relative">
                        <input
                          type="text"
                          value={mobileBrandSearch}
                          onChange={(e) => setMobileBrandSearch(e.target.value)}
                          placeholder="Search 90+ Indian brands..."
                          className="w-full text-xs font-medium text-[#18181B] bg-white pl-8 pr-7 py-2 rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-[#F5D103]"
                        />
                        <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        {mobileBrandSearch && (
                          <button
                            type="button"
                            onClick={() => setMobileBrandSearch('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 p-0.5 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Letter Tabs */}
                      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                        {['All', 'A-B', 'C-E', 'F-H', 'I-K', 'L-O', 'P-R', 'S-U', 'V-Z', '0-9'].map((grp) => (
                          <button
                            key={grp}
                            type="button"
                            onClick={() => setMobileBrandGroup(grp)}
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                              mobileBrandGroup === grp
                                ? 'bg-[#F5D103] text-[#18181B]'
                                : 'bg-white border border-stone-200 text-stone-700 hover:text-[#18181B]'
                            }`}
                          >
                            {grp}
                          </button>
                        ))}
                      </div>

                      {/* Brand Chips */}
                      <div className="max-h-48 overflow-y-auto flex flex-wrap gap-1.5 pt-1">
                        {filteredMobileBrands.map((b: BrandItem) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => {
                              setIsMobileMenuOpen(false);
                              setIsMobileBrandsOpen(false);
                              goToShop({ search: b.name, category: 'all' });
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

            {/* Delivery address button inside mobile menu */}
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
                  <span>Deliver to: <strong className="text-[#18181B]">{selectedPostalCode}</strong></span>
                </div>
                <span className="text-[11px] font-bold text-[#B45309] hover:underline">Change</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Click-Away Overlay */}
      <div
        className={`fixed inset-0 top-14 sm:top-16 bg-black/15 z-30 lg:hidden transition-opacity duration-300 ${
          isMobileMenuOpen || isMobileSearchOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => {
          setIsMobileMenuOpen(false);
          setIsMobileSearchOpen(false);
        }}
      />
    </>
  );
};

