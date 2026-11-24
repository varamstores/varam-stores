import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ProductSort } from '../types/api';

// Clean URLs, all derived from window.location so back/forward, reloads and shared links agree:
//   /                       home            /shop?category=&q=&sort=&organic=1&sale=1&max=&brand=a,b
//   /product/<slug>         product page    /wishlist  /account[/<tab>]  /story  /checkout  /admin[/<tab>]
//   /pages/<key>            CMS static page (terms, privacy, faq…)
// Old links (?page=shop&category=…, ?product=prod-1) still resolve.
export type PageView = 'home' | 'shop' | 'product' | 'wishlist' | 'account' | 'story' | 'admin' | 'checkout' | 'page' | 'newsletter';

const SORTS: ProductSort[] = ['featured', 'price-asc', 'price-desc', 'rating', 'name-asc', 'name-desc'];

interface Route {
  view: PageView;
  category: string;
  productRef: string | null;
  search: string;
  sort: ProductSort;
  organic: boolean;
  onSale: boolean;
  maxPrice: number | null; // whole pounds; null = no limit
  minPrice: number | null; // whole pounds; null = no minimum
  inStock: boolean;
  brands: string[];
  pageKey: string | null;
  subPath: string | null; // /account/<tab>, /admin/<tab>
}

function parseLocation(): Route {
  const params = new URLSearchParams(window.location.search);
  const parts = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).map(decodeURIComponent);
  const legacyPage = params.get('page');
  const sortParam = params.get('sort') as ProductSort | null;
  const max = params.get('max') ?? params.get('maxPrice');
  const min = params.get('min');
  const route: Route = {
    view: 'home',
    category: params.get('category') || 'all',
    productRef: null,
    search: params.get('q') ?? params.get('search') ?? '',
    sort: sortParam && SORTS.includes(sortParam) ? sortParam : 'featured',
    organic: params.get('organic') === '1' || params.get('organic') === 'true',
    onSale: params.get('sale') === '1' || params.get('onSale') === 'true',
    maxPrice: max && Number.isFinite(Number(max)) && Number(max) > 0 ? Number(max) : null,
    minPrice: min && Number.isFinite(Number(min)) && Number(min) > 0 ? Number(min) : null,
    inStock: params.get('stock') === '1',
    brands: (params.get('brand') ?? '').split(',').map((b) => b.trim()).filter(Boolean),
    pageKey: null,
    subPath: null,
  };
  const head = parts[0] ?? legacyPage ?? '';
  const legacyProduct = params.get('product') || params.get('id');
  if (head === 'product' && parts[1]) {
    route.view = 'product';
    route.productRef = parts[1];
  } else if (legacyProduct) {
    route.view = 'product';
    route.productRef = legacyProduct;
  } else if (head === 'shop') route.view = 'shop';
  else if (head === 'wishlist') route.view = 'wishlist';
  else if (head === 'account' || head === 'user') {
    route.view = 'account';
    route.subPath = parts.slice(1).join('/') || null;
  } else if (head === 'story' || head === 'our-story') route.view = 'story';
  else if (head === 'checkout') route.view = 'checkout';
  else if (head === 'admin') {
    route.view = 'admin';
    route.subPath = parts.slice(1).join('/') || null;
  } else if (head === 'newsletter') {
    route.view = 'newsletter';
    route.subPath = parts.slice(1).join('/') || null;
  } else if (head === 'pages' && parts[1]) {
    route.view = 'page';
    route.pageKey = parts[1];
  } else if (!parts.length && (route.category !== 'all' || route.search)) route.view = 'shop';
  return route;
}

function shopPath(r: Pick<Route, 'category' | 'search' | 'sort' | 'organic' | 'onSale' | 'maxPrice' | 'minPrice' | 'inStock' | 'brands'>): string {
  const p = new URLSearchParams();
  if (r.category && r.category !== 'all') p.set('category', r.category);
  if (r.search.trim()) p.set('q', r.search.trim());
  if (r.sort !== 'featured') p.set('sort', r.sort);
  if (r.organic) p.set('organic', '1');
  if (r.onSale) p.set('sale', '1');
  if (r.minPrice != null) p.set('min', String(r.minPrice));
  if (r.maxPrice != null) p.set('max', String(r.maxPrice));
  if (r.inStock) p.set('stock', '1');
  if (r.brands.length) p.set('brand', r.brands.join(','));
  const qs = p.toString();
  return qs ? `/shop?${qs}` : '/shop';
}

export interface ShopOptions {
  category?: string;
  search?: string;
  filterOrganic?: boolean;
  filterOnSale?: boolean;
  sort?: ProductSort;
  brands?: string[];
  preserveFilters?: boolean;
}

interface NavigationContextType {
  currentView: PageView;
  selectedCategory: string;
  /** Product slug (or legacy id) from the URL. */
  selectedProductId: string | null;
  searchQuery: string;
  sortOption: ProductSort;
  filterOrganic: boolean;
  filterOnSale: boolean;
  maxPrice: number | null;
  minPrice: number | null;
  inStock: boolean;
  selectedBrands: string[];
  pageKey: string | null;
  subPath: string | null;
  /** Follow any CMS link: internal paths navigate in-app, #ids scroll, everything else opens normally. */
  navigateHref: (href: string) => void;
  isInternalHref: (href: string) => boolean;
  goToHome: () => void;
  goToShop: (options?: ShopOptions) => void;
  goToProduct: (slug: string) => void;
  goToWishlist: () => void;
  goToAccount: (tab?: string) => void;
  goToStory: () => void;
  goToAdmin: (tab?: string) => void;
  goToCheckout: () => void;
  goToPage: (key: string) => void;
  scrollToSection: (sectionId: string) => void;
  setSelectedCategory: (cat: string) => void;
  setSearchQuery: (q: string) => void;
  setSortOption: (sort: ProductSort) => void;
  setFilterOrganic: (organic: boolean) => void;
  setFilterOnSale: (onSale: boolean) => void;
  setMaxPrice: (pounds: number | null) => void;
  setMinPrice: (pounds: number | null) => void;
  setInStock: (inStock: boolean) => void;
  setSelectedBrands: (brands: string[]) => void;
  resetFilters: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

const scrollToTopImmediate = () => {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
};

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [route, setRoute] = useState<Route>(parseLocation);

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    const onPop = () => setRoute(parseLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((path: string, opts: { scrollTop?: boolean; replace?: boolean } = {}) => {
    const current = window.location.pathname + window.location.search;
    if (path !== current) {
      if (opts.replace) window.history.replaceState(null, '', path);
      else window.history.pushState(null, '', path);
    }
    setRoute(parseLocation());
    if (opts.scrollTop !== false) scrollToTopImmediate();
  }, []);

  const scrollToSection = useCallback((sectionId: string) => {
    const run = () => {
      const el = document.getElementById(sectionId);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' });
    };
    if (route.view !== 'home') {
      go('/', { scrollTop: false });
      window.setTimeout(run, 320);
    } else run();
  }, [route.view, go]);

  const isInternalHref = useCallback((href: string) => href.startsWith('/') && !href.startsWith('//'), []);

  const navigateHref = useCallback((href: string) => {
    if (!href) return;
    if (href.startsWith('#')) return scrollToSection(href.slice(1));
    if (isInternalHref(href)) {
      const [path, hash] = href.split('#');
      go(path, { scrollTop: !hash });
      if (hash) window.setTimeout(() => scrollToSection(hash), 320);
      return;
    }
    if (/^(mailto|tel):/i.test(href)) {
      window.location.href = href;
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  }, [go, isInternalHref, scrollToSection]);

  const value = useMemo<NavigationContextType>(() => {
    const shop = (patch: Partial<Route>) => go(shopPath({ ...route, ...patch }), { scrollTop: false });
    return {
      currentView: route.view,
      selectedCategory: route.category,
      selectedProductId: route.productRef,
      searchQuery: route.search,
      sortOption: route.sort,
      filterOrganic: route.organic,
      filterOnSale: route.onSale,
      maxPrice: route.maxPrice,
      minPrice: route.minPrice,
      inStock: route.inStock,
      selectedBrands: route.brands,
      pageKey: route.pageKey,
      subPath: route.subPath,
      navigateHref,
      isInternalHref,
      goToHome: () => go('/'),
      goToShop: (o) => {
        const keep = o?.preserveFilters;
        go(shopPath({
          category: o?.category ?? (keep ? route.category : 'all'),
          search: o?.search ?? (keep ? route.search : ''),
          sort: o?.sort ?? (keep ? route.sort : 'featured'),
          organic: o?.filterOrganic ?? (keep ? route.organic : false),
          onSale: o?.filterOnSale ?? (keep ? route.onSale : false),
          maxPrice: keep ? route.maxPrice : null,
          minPrice: keep ? route.minPrice : null,
          inStock: keep ? route.inStock : false,
          brands: o?.brands ?? (keep ? route.brands : []),
        }));
      },
      goToProduct: (slug) => go(`/product/${encodeURIComponent(slug)}`),
      goToWishlist: () => go('/wishlist'),
      goToAccount: (tab) => go(tab ? `/account/${tab}` : '/account'),
      goToStory: () => go('/story'),
      goToAdmin: (tab) => go(tab ? `/admin/${tab}` : '/admin'),
      goToCheckout: () => go('/checkout'),
      goToPage: (key) => go(`/pages/${encodeURIComponent(key)}`),
      scrollToSection,
      setSelectedCategory: (category) => { shop({ category }); scrollToTopImmediate(); },
      setSearchQuery: (search) => { shop({ search }); scrollToTopImmediate(); },
      setSortOption: (sort) => shop({ sort }),
      setFilterOrganic: (organic) => shop({ organic }),
      setFilterOnSale: (onSale) => shop({ onSale }),
      setMaxPrice: (maxPrice) => shop({ maxPrice }),
      setMinPrice: (minPrice) => shop({ minPrice }),
      setInStock: (inStock) => shop({ inStock }),
      setSelectedBrands: (brands) => shop({ brands }),
      resetFilters: () => { go('/shop', { scrollTop: false }); scrollToTopImmediate(); },
    };
  }, [route, go, navigateHref, isInternalHref, scrollToSection]);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('useNavigation must be used within a NavigationProvider');
  return context;
};
