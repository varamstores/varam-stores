import React, { createContext, useContext, useState, useEffect } from 'react';

export type PageView = 'home' | 'shop' | 'product' | 'wishlist' | 'account' | 'story' | 'admin' | 'checkout';

interface NavigationContextType {
  currentView: PageView;
  selectedCategory: string;
  selectedProductId: string | null;
  searchQuery: string;
  sortOption: string;
  filterOrganic: boolean;
  filterOnSale: boolean;
  maxPrice: number;
  goToHome: () => void;
  goToShop: (options?: {
    category?: string;
    search?: string;
    filterOrganic?: boolean;
    filterOnSale?: boolean;
    sort?: string;
    preserveFilters?: boolean;
  }) => void;
  goToProduct: (productId: string) => void;
  goToWishlist: () => void;
  goToAccount: () => void;
  goToStory: () => void;
  goToAdmin: () => void;
  goToCheckout: () => void;
  scrollToSection: (sectionId: string) => void;
  setSelectedCategory: (cat: string) => void;
  setSearchQuery: (q: string) => void;
  setSortOption: (sort: string) => void;
  setFilterOrganic: (organic: boolean) => void;
  setFilterOnSale: (onSale: boolean) => void;
  setMaxPrice: (price: number) => void;
  resetFilters: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Parse initial state from URL query params or path
  const parseUrlParams = () => {
    const params = new URLSearchParams(window.location.search);
    const pageParam = params.get('page');
    const path = window.location.pathname.replace(/^\/|\/$/g, '');
    const catParam = params.get('category') || 'all';
    const prodParam = params.get('product') || params.get('id') || null;
    const searchParam = params.get('search') || '';
    const sortParam = params.get('sort') || 'featured';
    const organicParam = params.get('organic') === 'true';
    const onSaleParam = params.get('onSale') === 'true';
    const maxPriceParam = params.get('maxPrice') ? Number(params.get('maxPrice')) : 25;

    let initialView: PageView = 'home';
    if (prodParam) {
      initialView = 'product';
    } else if (pageParam === 'account' || pageParam === 'user' || path === 'account' || path === 'user') {
      initialView = 'account';
    } else if (pageParam === 'shop' || catParam !== 'all' || searchParam || path === 'shop') {
      initialView = 'shop';
    } else if (pageParam === 'wishlist' || path === 'wishlist') {
      initialView = 'wishlist';
    } else if (pageParam === 'checkout' || path === 'checkout') {
      initialView = 'checkout';
    } else if (pageParam === 'story' || path === 'story' || pageParam === 'our-story' || path === 'our-story') {
      initialView = 'story';
    } else if (pageParam === 'admin' || path === 'admin') {
      initialView = 'admin';
    } else if (pageParam === 'home' || path === '' || path === 'home') {
      initialView = 'home';
    }

    return {
      view: initialView,
      category: catParam,
      productId: prodParam,
      search: searchParam,
      sort: sortParam,
      organic: organicParam,
      onSale: onSaleParam,
      maxPrice: maxPriceParam,
    };
  };

  const initial = parseUrlParams();

  const [currentView, setCurrentView] = useState<PageView>(initial.view);
  const [selectedCategory, setSelectedCategory] = useState<string>(initial.category);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(initial.productId);
  const [searchQuery, setSearchQuery] = useState<string>(initial.search);
  const [sortOption, setSortOption] = useState<string>(initial.sort);
  const [filterOrganic, setFilterOrganic] = useState<boolean>(initial.organic);
  const [filterOnSale, setFilterOnSale] = useState<boolean>(initial.onSale);
  const [maxPrice, setMaxPrice] = useState<number>(initial.maxPrice);

  // Sync state to URL without reloading page
  const updateUrl = (
    view: PageView,
    cat = selectedCategory,
    prodId = selectedProductId,
    search = searchQuery,
    sort = sortOption,
    organic = filterOrganic,
    onSale = filterOnSale,
    price = maxPrice
  ) => {
    const params = new URLSearchParams();

    if (view !== 'home') {
      params.set('page', view);
    }

    if (view === 'shop') {
      if (cat && cat !== 'all') params.set('category', cat);
      if (search.trim()) params.set('search', search.trim());
      if (sort !== 'featured') params.set('sort', sort);
      if (organic) params.set('organic', 'true');
      if (onSale) params.set('onSale', 'true');
      if (price < 25) params.set('maxPrice', String(price));
    } else if (view === 'product' && prodId) {
      params.set('product', prodId);
    }

    const queryStr = params.toString();
    const newRelativePath = queryStr ? `${window.location.pathname}?${queryStr}` : window.location.pathname;
    window.history.pushState({ view, cat, prodId, search }, '', newRelativePath);
  };

  // Listen to popstate (browser back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseUrlParams();
      setCurrentView(parsed.view);
      setSelectedCategory(parsed.category);
      setSelectedProductId(parsed.productId);
      setSearchQuery(parsed.search);
      setSortOption(parsed.sort);
      setFilterOrganic(parsed.organic);
      setFilterOnSale(parsed.onSale);
      setMaxPrice(parsed.maxPrice);
    };

    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const scrollToTopImmediate = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
  };

  const goToHome = () => {
    setCurrentView('home');
    setSelectedProductId(null);
    updateUrl('home');
    scrollToTopImmediate();
  };

  const goToShop = (options?: {
    category?: string;
    search?: string;
    filterOrganic?: boolean;
    filterOnSale?: boolean;
    sort?: string;
    preserveFilters?: boolean;
  }) => {
    const newCat = options?.category !== undefined ? options.category : (options?.preserveFilters ? selectedCategory : 'all');
    const newSearch = options?.search !== undefined ? options.search : (options?.preserveFilters ? searchQuery : '');
    const newOrganic = options?.filterOrganic !== undefined ? options.filterOrganic : (options?.preserveFilters ? filterOrganic : false);
    const newOnSale = options?.filterOnSale !== undefined ? options.filterOnSale : (options?.preserveFilters ? filterOnSale : false);
    const newSort = options?.sort !== undefined ? options.sort : (options?.preserveFilters ? sortOption : 'featured');

    setSelectedCategory(newCat);
    setSearchQuery(newSearch);
    setFilterOrganic(newOrganic);
    setFilterOnSale(newOnSale);
    setSortOption(newSort);
    setSelectedProductId(null);
    setCurrentView('shop');

    updateUrl('shop', newCat, null, newSearch, newSort, newOrganic, newOnSale, maxPrice);
    scrollToTopImmediate();
  };

  const scrollToSection = (sectionId: string) => {
    const executeScroll = () => {
      const el = document.getElementById(sectionId);
      if (el) {
        const topY = el.getBoundingClientRect().top + window.scrollY - 70;
        window.scrollTo({ top: topY, behavior: 'smooth' });
      }
    };

    if (currentView !== 'home') {
      setCurrentView('home');
      setSelectedProductId(null);
      updateUrl('home');
      setTimeout(executeScroll, 320);
    } else {
      executeScroll();
    }
  };

  const goToProduct = (productId: string) => {
    setSelectedProductId(productId);
    setCurrentView('product');
    updateUrl('product', selectedCategory, productId);
    scrollToTopImmediate();
  };

  const goToWishlist = () => {
    setCurrentView('wishlist');
    setSelectedProductId(null);
    updateUrl('wishlist');
    scrollToTopImmediate();
  };

  const goToAccount = () => {
    setCurrentView('account');
    setSelectedProductId(null);
    updateUrl('account');
    scrollToTopImmediate();
  };

  const goToStory = () => {
    setCurrentView('story');
    setSelectedProductId(null);
    updateUrl('story');
    scrollToTopImmediate();
  };

  const goToAdmin = () => {
    setCurrentView('admin');
    setSelectedProductId(null);
    updateUrl('admin');
    scrollToTopImmediate();
  };

  const goToCheckout = () => {
    setCurrentView('checkout');
    setSelectedProductId(null);
    updateUrl('checkout');
    scrollToTopImmediate();
  };

  const resetFilters = () => {
    setSelectedCategory('all');
    setSearchQuery('');
    setFilterOrganic(false);
    setFilterOnSale(false);
    setMaxPrice(25);
    setSortOption('featured');
    updateUrl('shop', 'all', null, '', 'featured', false, false, 25);
    scrollToTopImmediate();
  };

  return (
    <NavigationContext.Provider
      value={{
        currentView,
        selectedCategory,
        selectedProductId,
        searchQuery,
        sortOption,
        filterOrganic,
        filterOnSale,
        maxPrice,
        goToHome,
        goToShop,
        goToProduct,
        goToWishlist,
        goToAccount,
        goToStory,
        goToAdmin,
        goToCheckout,
        scrollToSection,
        setSelectedCategory: (cat) => {
          setSelectedCategory(cat);
          if (currentView === 'shop') updateUrl('shop', cat);
          scrollToTopImmediate();
        },
        setSearchQuery: (q) => {
          setSearchQuery(q);
          if (currentView === 'shop') updateUrl('shop', selectedCategory, null, q);
          scrollToTopImmediate();
        },
        setSortOption: (s) => {
          setSortOption(s);
          if (currentView === 'shop') updateUrl('shop', selectedCategory, null, searchQuery, s);
        },
        setFilterOrganic: (o) => {
          setFilterOrganic(o);
          if (currentView === 'shop') updateUrl('shop', selectedCategory, null, searchQuery, sortOption, o);
        },
        setFilterOnSale: (s) => {
          setFilterOnSale(s);
          if (currentView === 'shop') updateUrl('shop', selectedCategory, null, searchQuery, sortOption, filterOrganic, s);
        },
        setMaxPrice: (p) => {
          setMaxPrice(p);
          if (currentView === 'shop') updateUrl('shop', selectedCategory, null, searchQuery, sortOption, filterOrganic, filterOnSale, p);
        },
        resetFilters,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};
