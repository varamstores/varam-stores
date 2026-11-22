import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { X, Search, SlidersHorizontal, ChevronRight, Leaf, Tag, RotateCcw, ArrowUpDown } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { ProductCardSkeleton } from './ProductShelf';
import { useNavigation } from '../context/NavigationContext';
import { backdropVariants, MOTION_DURATIONS, MOTION_EASINGS } from '../motion';
import { findCategory, useBrands, useCategories, useInfiniteProducts } from '../lib/catalogue';
import { formatPence, poundsToPence } from '../lib/money';
import { useCms } from '../cms/CmsProvider';
import { InlineText } from '../cms/components';
import { useSeo } from '../cms/hooks';
import type { Product } from '../types';
import type { ProductSort } from '../types/api';

interface ShopCataloguePageProps {
  onQuickView: (product: Product) => void;
  onSelectProduct?: (product: Product) => void;
}

const pageOpeningContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
  exit: { opacity: 0, transition: { duration: 0.15, ease: 'easeIn' } },
};
const pageOpeningCardVariants: Variants = {
  hidden: { opacity: 0, rotateY: -22, x: -16, scale: 0.94, transformOrigin: 'left center' },
  visible: { opacity: 1, rotateY: 0, x: 0, scale: 1, transformOrigin: 'left center', transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] } },
};

const SORT_KEYS: Record<ProductSort, 'shop.toolbar.sort_featured' | 'shop.toolbar.sort_price_asc' | 'shop.toolbar.sort_price_desc' | 'shop.toolbar.sort_rating' | 'shop.toolbar.sort_name_asc' | 'shop.toolbar.sort_name_desc'> = {
  featured: 'shop.toolbar.sort_featured',
  'price-asc': 'shop.toolbar.sort_price_asc',
  'price-desc': 'shop.toolbar.sort_price_desc',
  rating: 'shop.toolbar.sort_rating',
  'name-asc': 'shop.toolbar.sort_name_asc',
  'name-desc': 'shop.toolbar.sort_name_desc',
};
const PAGE_SIZE = 12;

export const ShopCataloguePage: React.FC<ShopCataloguePageProps> = ({ onQuickView, onSelectProduct }) => {
  const cms = useCms();
  const nav = useNavigation();
  const {
    selectedCategory, setSelectedCategory, searchQuery, setSearchQuery, sortOption, setSortOption,
    filterOrganic, setFilterOrganic, filterOnSale, setFilterOnSale, maxPrice, setMaxPrice,
    selectedBrands, setSelectedBrands, resetFilters, goToHome,
  } = nav;
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [minRating, setMinRating] = useState<number>(0);
  const [searchDraft, setSearchDraft] = useState(searchQuery);
  const { data: categories = [] } = useCategories();
  const { data: popularBrands = [] } = useBrands(true);
  const { data: allBrands = [] } = useBrands();

  // Search is applied after the shopper pauses typing.
  useEffect(() => setSearchDraft(searchQuery), [searchQuery]);
  useEffect(() => {
    if (searchDraft === searchQuery) return;
    const id = window.setTimeout(() => setSearchQuery(searchDraft), 350);
    return () => window.clearTimeout(id);
  }, [searchDraft, searchQuery, setSearchQuery]);

  const filters = {
    category: selectedCategory,
    brands: selectedBrands,
    q: searchQuery,
    organic: filterOrganic,
    onSale: filterOnSale,
    maxPrice: maxPrice != null ? poundsToPence(maxPrice) : undefined,
    minRating: minRating > 0 ? minRating : undefined,
    sort: sortOption,
    postcode: undefined,
    limit: PAGE_SIZE,
  };
  const query = useInfiniteProducts(filters);
  const products = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const first = query.data?.pages[0];
  const total = first?.total ?? 0;
  const facets = first?.facets;
  const priceCeiling = Math.max(1, Math.ceil((facets?.priceRange.max?.amount ?? 2500) / 100));
  const allCount = categories.reduce((n, c) => n + c.productCount, 0);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [selectedCategory, searchQuery, filterOrganic, filterOnSale, maxPrice, minRating, selectedBrands]);

  useEffect(() => {
    if (!isMobileFilterOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsMobileFilterOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener('keydown', onKey);
    };
  }, [isMobileFilterOpen]);

  const activeCategory = selectedCategory !== 'all' ? findCategory(categories, selectedCategory) : undefined;
  const brandName = (slug: string) => allBrands.find((b) => b.slug === slug)?.name ?? slug;
  const heading = activeCategory?.name
    ?? (selectedBrands.length === 1 ? cms.t('shop.header.brand_title', { name: brandName(selectedBrands[0]) })
      : searchQuery.trim() ? cms.t('shop.header.search_title', { query: searchQuery.trim() }) : cms.t('shop.header.all_title'));
  useSeo('shop', { title: activeCategory?.name ?? null });

  const activeFiltersCount = (selectedCategory !== 'all' ? 1 : 0) + (filterOrganic ? 1 : 0) + (filterOnSale ? 1 : 0)
    + (maxPrice != null ? 1 : 0) + (minRating > 0 ? 1 : 0) + (searchQuery.trim() ? 1 : 0) + selectedBrands.length;
  const reset = () => {
    setMinRating(0);
    resetFilters();
  };
  const toggleBrand = (slug: string) =>
    setSelectedBrands(selectedBrands.includes(slug) ? selectedBrands.filter((b) => b !== slug) : [...selectedBrands, slug]);
  const remaining = Math.max(0, total - products.length);
  const ratingOptions = cms.get('shop.filters.rating_options');

  const chip = (label: React.ReactNode, onRemove: () => void, tone: 'amber' | 'stone' = 'amber') => (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold ${tone === 'amber' ? 'bg-amber-100 text-[#B45309] border border-amber-200/60' : 'bg-stone-100 text-stone-800'}`}>
      {label}
      <button type="button" onClick={onRemove} className="hover:text-rose-600 cursor-pointer" aria-label={cms.t('shop.chips.remove_aria')}>
        <X className="w-3 h-3" />
      </button>
    </span>
  );

  const brandPills = (variant: 'desktop' | 'mobile') => (
    <div className="flex flex-wrap gap-1.5">
      {popularBrands.slice(0, 16).map((brand) => {
        const isSelected = selectedBrands.includes(brand.slug);
        return (
          <button
            key={brand.id}
            type="button"
            onClick={() => toggleBrand(brand.slug)}
            aria-pressed={isSelected}
            className={`px-2.5 py-1 rounded-lg ${variant === 'desktop' ? 'text-[11px]' : 'text-xs'} font-semibold transition-all cursor-pointer ${
              isSelected ? 'bg-[#18181B] text-[#F5D103] shadow-xs' : variant === 'desktop'
                ? 'bg-stone-50 border border-stone-200/80 text-stone-700 hover:text-[#B45309] hover:bg-amber-100 hover:border-[#F5D103]'
                : 'bg-stone-100 text-stone-800'
            }`}
          >
            {brand.name}
          </button>
        );
      })}
    </div>
  );

  const priceSlider = (
    <input
      type="range"
      min={1}
      max={priceCeiling}
      step={0.5}
      value={maxPrice ?? priceCeiling}
      onChange={(e) => {
        const v = Number(e.target.value);
        setMaxPrice(v >= priceCeiling ? null : v);
      }}
      className="w-full accent-[#F5D103] cursor-pointer"
      aria-label={cms.t('shop.filters.price_aria')}
    />
  );
  const priceLabel = maxPrice != null ? cms.t('shop.filters.price_up_to', { price: formatPence(poundsToPence(maxPrice)) }) : cms.t('shop.filters.price_any');

  return (
    <div className="w-full bg-white min-h-screen">
      {/* Desktop sidebar */}
      <aside data-lenis-prevent className="hidden lg:block fixed left-0 top-14 sm:top-16 bottom-0 w-72 xl:w-80 z-30 bg-white border-r border-stone-200/80 p-5 xl:p-6 overflow-y-auto scrollbar-none shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-5">
          <h3 className="font-serif-heading font-bold text-lg text-[#18181B] flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[#B45309]" />
            <span>{cms.t('shop.filters.title')}</span>
          </h3>
          {activeFiltersCount > 0 && (
            <button type="button" onClick={reset} className="text-xs text-[#B45309] hover:underline font-semibold cursor-pointer">{cms.t('shop.filters.reset_all')}</button>
          )}
        </div>

        <div className="mb-6">
          <h4 className="text-xs font-extrabold text-[#18181B] uppercase tracking-wider mb-3">{cms.t('shop.filters.categories_title')}</h4>
          <div className="space-y-1">
            {[{ slug: 'all', name: cms.t('shop.filters.all_categories'), productCount: allCount }, ...categories].map((cat) => {
              const isSelected = selectedCategory === cat.slug;
              return (
                <button
                  key={cat.slug}
                  type="button"
                  onClick={() => setSelectedCategory(cat.slug)}
                  aria-pressed={isSelected}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${isSelected ? 'bg-[#18181B] text-[#F5D103]' : 'text-[#18181B] hover:bg-amber-100'}`}
                >
                  <span>{cat.name}</span>
                  <span className={`text-[11px] ${isSelected ? 'text-[#F5D103]' : 'text-stone-400'}`}>{cat.productCount}</span>
                </button>
              );
            })}
          </div>
        </div>

        {popularBrands.length > 0 && (
          <div className="mb-6 pt-5 border-t border-stone-100">
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="text-xs font-extrabold text-[#18181B] uppercase tracking-wider">{cms.t('shop.filters.brands_title')}</h4>
              {selectedBrands.length > 0 && (
                <button type="button" onClick={() => setSelectedBrands([])} className="text-[10px] text-[#B45309] font-bold hover:underline cursor-pointer">{cms.t('shop.filters.brands_clear')}</button>
              )}
            </div>
            {brandPills('desktop')}
          </div>
        )}

        <div className="mb-6 pt-5 border-t border-stone-100">
          <h4 className="text-xs font-extrabold text-[#18181B] uppercase tracking-wider mb-3">{cms.t('shop.filters.dietary_title')}</h4>
          <div className="space-y-2.5">
            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-[#18181B]">
              <input type="checkbox" checked={filterOrganic} onChange={(e) => setFilterOrganic(e.target.checked)} className="w-4 h-4 rounded border-stone-300 cursor-pointer accent-[#F5D103]" />
              <span>{cms.t('shop.filters.organic')}{facets ? ` (${facets.organicCount})` : ''}</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-[#18181B]">
              <input type="checkbox" checked={filterOnSale} onChange={(e) => setFilterOnSale(e.target.checked)} className="w-4 h-4 rounded border-stone-300 cursor-pointer accent-[#F5D103]" />
              <span>{cms.t('shop.filters.on_sale')}{facets ? ` (${facets.onSaleCount})` : ''}</span>
            </label>
          </div>
        </div>

        <div className="mb-6 pt-5 border-t border-stone-100">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-extrabold text-[#18181B] uppercase tracking-wider">{cms.t('shop.filters.price_title')}</h4>
            <span className="text-xs font-bold text-[#18181B]">{priceLabel}</span>
          </div>
          {priceSlider}
          <div className="flex justify-between text-[10px] text-stone-400 mt-1">
            <span>{formatPence(100)}</span>
            <span>{formatPence(priceCeiling * 100)}</span>
          </div>
        </div>

        {ratingOptions.length > 0 && (
          <div className="pt-5 border-t border-stone-100">
            <h4 className="text-xs font-extrabold text-[#18181B] uppercase tracking-wider mb-2.5">{cms.t('shop.filters.rating_title')}</h4>
            <div className="space-y-1.5">
              {ratingOptions.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setMinRating(r.value)}
                  aria-pressed={minRating === r.value}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${minRating === r.value ? 'bg-amber-100 text-[#B45309] font-bold border border-amber-200/60' : 'text-stone-500 hover:bg-stone-50'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Products */}
      <div className="w-full lg:pl-72 xl:pl-80">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 pt-4 sm:pt-6 pb-20">
          <main className="w-full min-w-0">
            <div className="bg-gradient-to-b from-white to-[#F8FAFC] rounded-3xl border border-stone-200/90 p-5 sm:p-7 mb-5 shadow-2xs">
              <nav aria-label={cms.t('shop.header.crumb_aria')} className="flex items-center gap-2 text-xs text-stone-500 mb-3">
                <button type="button" onClick={goToHome} className="hover:text-[#B45309] transition-colors cursor-pointer">{cms.t('shop.header.crumb_home')}</button>
                <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                <button type="button" onClick={() => setSelectedCategory('all')} className={`hover:text-[#B45309] transition-colors cursor-pointer ${selectedCategory === 'all' ? 'text-[#18181B] font-bold' : ''}`}>
                  {cms.t('shop.header.crumb_catalogue')}
                </button>
                {activeCategory && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                    <span className="text-[#18181B] font-bold truncate">{activeCategory.name}</span>
                  </>
                )}
              </nav>
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <AnimatePresence mode="wait">
                  <motion.div key={heading} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#B45309] block mb-1">{cms.t('shop.header.eyebrow')}</span>
                    <h1 className="font-serif-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-[#18181B] leading-tight">{heading}</h1>
                  </motion.div>
                </AnimatePresence>
                <p className="text-xs sm:text-sm text-stone-500 max-w-sm">{activeCategory?.tagline || cms.t('shop.header.description')}</p>
              </div>
              <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {[{ slug: 'all', name: '', productCount: allCount }, ...categories].map((cat) => {
                  const isSelected = selectedCategory === cat.slug;
                  return (
                    <button
                      key={cat.slug}
                      type="button"
                      onClick={() => setSelectedCategory(cat.slug)}
                      aria-pressed={isSelected}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${isSelected ? 'bg-[#18181B] text-[#F5D103] shadow-xs' : 'bg-white text-[#18181B] border border-stone-200 hover:bg-stone-50'}`}
                    >
                      {cat.slug === 'all' ? cms.t('shop.header.all_tab', { count: cat.productCount }) : cms.t('shop.header.category_tab', { name: cat.name, count: cat.productCount })}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 p-3.5 sm:p-4 mb-5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <input
                  type="search"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder={cms.t('shop.toolbar.search_placeholder')}
                  aria-label={cms.t('shop.toolbar.search_placeholder')}
                  className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl bg-stone-50 border border-stone-200 text-[#18181B] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/20 focus:border-[#F5D103] [&::-webkit-search-cancel-button]:hidden"
                />
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                {searchDraft && (
                  <button type="button" onClick={() => { setSearchDraft(''); setSearchQuery(''); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer" aria-label={cms.t('shop.toolbar.clear_search_aria')}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  onClick={() => setIsMobileFilterOpen(true)}
                  className="lg:hidden flex items-center gap-2 px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-50 text-xs font-bold text-[#18181B] hover:bg-stone-100 transition-colors cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#18181B]" />
                  <span>{cms.t('shop.filters.mobile_button')}</span>
                  {activeFiltersCount > 0 && <span className="w-4 h-4 rounded-full bg-[#18181B] text-[#F5D103] text-[10px] font-bold flex items-center justify-center">{activeFiltersCount}</span>}
                </button>
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline text-xs text-stone-500 font-medium">{cms.t('shop.toolbar.sort_label')}</span>
                  <div className="relative">
                    <select
                      value={sortOption}
                      onChange={(e) => setSortOption(e.target.value as ProductSort)}
                      className="appearance-none bg-stone-50 text-[#18181B] text-xs font-bold pl-3 pr-8 py-2 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/20 cursor-pointer"
                      aria-label={cms.t('shop.toolbar.sort_aria')}
                    >
                      {(Object.keys(SORT_KEYS) as ProductSort[]).map((s) => <option key={s} value={s}>{cms.t(SORT_KEYS[s])}</option>)}
                    </select>
                    <ArrowUpDown className="w-3.5 h-3.5 text-stone-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            {activeFiltersCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <span className="text-xs text-stone-500 font-semibold">{cms.t('shop.chips.label')}</span>
                {activeCategory && chip(cms.t('shop.chips.category', { name: activeCategory.name }), () => setSelectedCategory('all'))}
                {selectedBrands.map((b) => <React.Fragment key={b}>{chip(cms.t('shop.chips.brand', { name: brandName(b) }), () => toggleBrand(b))}</React.Fragment>)}
                {filterOrganic && chip(<><Leaf className="w-3 h-3 text-[#B45309]" />{cms.t('shop.chips.organic')}</>, () => setFilterOrganic(false))}
                {filterOnSale && chip(<><Tag className="w-3 h-3" />{cms.t('shop.chips.on_sale')}</>, () => setFilterOnSale(false))}
                {maxPrice != null && chip(cms.t('shop.chips.price', { price: formatPence(poundsToPence(maxPrice)) }), () => setMaxPrice(null), 'stone')}
                {minRating > 0 && chip(cms.t('shop.chips.rating', { rating: minRating }), () => setMinRating(0), 'stone')}
                {searchQuery.trim() && chip(<>&ldquo;{searchQuery}&rdquo;</>, () => setSearchQuery(''), 'stone')}
                <button type="button" onClick={reset} className="text-xs font-bold text-[#B45309] hover:underline ml-1 cursor-pointer flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" />
                  <span>{cms.t('shop.chips.clear_all')}</span>
                </button>
              </div>
            )}

            <div className="flex items-center justify-between mb-5">
              <p className="text-xs sm:text-sm font-semibold text-[#18181B]" aria-live="polite">
                {!query.isLoading && <InlineText text={total === 1 ? cms.t('shop.results.showing_one') : cms.t('shop.results.showing', { count: total })} strongClass="text-[#18181B]" />}
              </p>
              {total > 0 && cms.t('shop.results.note') && <span className="text-xs text-[#B45309] font-medium hidden sm:inline">{cms.t('shop.results.note')}</span>}
            </div>

            {query.isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5 sm:gap-5">
                {Array.from({ length: 6 }, (_, i) => <ProductCardSkeleton key={i} />)}
              </div>
            ) : query.isError ? (
              <div className="bg-white rounded-3xl border border-stone-200/80 p-8 sm:p-14 text-center max-w-lg mx-auto shadow-xs">
                <h3 className="font-serif-heading font-bold text-2xl text-[#18181B] mb-2">{cms.t('global.common.load_failed_title')}</h3>
                <p className="text-xs sm:text-sm text-stone-500 mb-6">{cms.t('global.common.load_failed_body')}</p>
                <button type="button" onClick={() => void query.refetch()} className="px-6 py-2.5 rounded-full bg-[#18181B] text-[#F5D103] text-xs font-bold cursor-pointer">{cms.t('global.common.try_again')}</button>
              </div>
            ) : products.length === 0 ? (
              <div className="bg-white rounded-3xl border border-stone-200/80 p-8 sm:p-14 text-center max-w-lg mx-auto shadow-xs">
                <div className="w-16 h-16 rounded-full bg-amber-100 text-[#B45309] flex items-center justify-center mx-auto mb-4">
                  <Search className="w-7 h-7" />
                </div>
                <h3 className="font-serif-heading font-bold text-2xl text-[#18181B] mb-2">{cms.t('shop.results.empty_title')}</h3>
                <p className="text-xs sm:text-sm text-stone-500 mb-6">{cms.t('shop.results.empty_text')}</p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button type="button" onClick={reset} className="px-6 py-2.5 rounded-full bg-[#18181B] text-[#F5D103] text-xs font-bold hover:bg-[#E5A800] hover:text-[#18181B] transition-colors cursor-pointer">{cms.t('shop.results.empty_reset')}</button>
                  <button type="button" onClick={() => setSelectedCategory('all')} className="px-6 py-2.5 rounded-full bg-stone-100 text-[#18181B] text-xs font-bold hover:bg-stone-200 transition-colors cursor-pointer">{cms.t('shop.results.empty_browse')}</button>
                </div>
              </div>
            ) : (
              <div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={JSON.stringify([selectedCategory, sortOption, filterOrganic, filterOnSale, minRating, searchQuery, selectedBrands, maxPrice])}
                    variants={pageOpeningContainerVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    style={{ perspective: 1200 }}
                    className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-3.5 sm:gap-5"
                  >
                    {products.map((product) => (
                      <motion.div key={product.id} variants={pageOpeningCardVariants} className="h-full will-change-transform">
                        <ProductCard product={product} onQuickView={onQuickView} onSelectProduct={onSelectProduct} />
                      </motion.div>
                    ))}
                  </motion.div>
                </AnimatePresence>
                {query.hasNextPage && (
                  <div className="text-center mt-10">
                    <button
                      type="button"
                      disabled={query.isFetchingNextPage}
                      onClick={() => void query.fetchNextPage()}
                      className="px-8 py-3 rounded-full bg-white hover:bg-stone-50 text-[#18181B] border border-stone-300 text-xs sm:text-sm font-bold shadow-2xs hover:shadow-sm transition-all cursor-pointer btn-magnetic disabled:opacity-60"
                    >
                      {query.isFetchingNextPage ? cms.t('global.common.loading') : cms.t('shop.results.load_more', { count: remaining })}
                    </button>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Mobile filter sheet */}
      <AnimatePresence>
        {isMobileFilterOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
            <motion.div variants={backdropVariants} initial="hidden" animate="visible" exit="exit" onClick={() => setIsMobileFilterOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-xs cursor-pointer" aria-hidden="true" />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: MOTION_DURATIONS.STANDARD, ease: MOTION_EASINGS.EASE_OUT }}
              className="relative z-10 bg-white rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl border-t border-stone-200"
              role="dialog"
              aria-modal="true"
              aria-label={cms.t('shop.filters.mobile_title')}
            >
              <div className="flex items-center justify-between p-4 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-[#18181B]" />
                  <h3 className="font-serif-heading font-bold text-lg text-[#18181B]">{cms.t('shop.filters.mobile_title')}</h3>
                </div>
                <button type="button" onClick={() => setIsMobileFilterOpen(false)} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 hover:bg-stone-200 cursor-pointer" aria-label={cms.t('shop.filters.close_aria')}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 overflow-y-auto space-y-6" data-lenis-prevent="true">
                <div>
                  <h4 className="text-xs font-extrabold text-[#18181B] uppercase tracking-wider mb-2.5">{cms.t('shop.filters.categories_title')}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {[{ slug: 'all', name: cms.t('shop.filters.all_categories') }, ...categories].map((cat) => (
                      <button
                        key={cat.slug}
                        type="button"
                        onClick={() => setSelectedCategory(cat.slug)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${selectedCategory === cat.slug ? 'bg-[#18181B] text-[#F5D103]' : 'bg-stone-100 text-[#18181B]'}`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
                {popularBrands.length > 0 && (
                  <div className="pt-4 border-t border-stone-100">
                    <div className="flex items-center justify-between mb-2.5">
                      <h4 className="text-xs font-extrabold text-[#18181B] uppercase tracking-wider">{cms.t('shop.filters.brands_title')}</h4>
                      {selectedBrands.length > 0 && <button type="button" onClick={() => setSelectedBrands([])} className="text-[11px] text-[#B45309] font-bold hover:underline">{cms.t('shop.filters.brands_clear')}</button>}
                    </div>
                    {brandPills('mobile')}
                  </div>
                )}
                <div className="pt-4 border-t border-stone-100 space-y-3">
                  <h4 className="text-xs font-extrabold text-[#18181B] uppercase tracking-wider mb-2">{cms.t('shop.filters.dietary_title')}</h4>
                  <label className="flex items-center gap-3 text-xs font-medium text-[#18181B]">
                    <input type="checkbox" checked={filterOrganic} onChange={(e) => setFilterOrganic(e.target.checked)} className="w-4 h-4 rounded accent-[#F5D103]" />
                    <span>{cms.t('shop.filters.organic')}</span>
                  </label>
                  <label className="flex items-center gap-3 text-xs font-medium text-[#18181B]">
                    <input type="checkbox" checked={filterOnSale} onChange={(e) => setFilterOnSale(e.target.checked)} className="w-4 h-4 rounded accent-[#F5D103]" />
                    <span>{cms.t('shop.filters.on_sale')}</span>
                  </label>
                </div>
                <div className="pt-4 border-t border-stone-100">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-extrabold text-[#18181B] uppercase tracking-wider">{cms.t('shop.filters.price_title')}</h4>
                    <span className="text-xs font-bold text-[#18181B]">{priceLabel}</span>
                  </div>
                  {priceSlider}
                </div>
              </div>
              <div className="p-4 border-t border-stone-100 bg-stone-50 flex items-center gap-3">
                <button type="button" onClick={reset} className="flex-1 py-3 rounded-xl border border-stone-300 text-xs font-bold text-[#18181B] hover:bg-stone-100 cursor-pointer text-center">{cms.t('shop.filters.mobile_reset')}</button>
                <button type="button" onClick={() => setIsMobileFilterOpen(false)} className="flex-[2] py-3 rounded-xl bg-[#18181B] text-[#F5D103] text-xs font-bold shadow-md hover:bg-[#E5A800] hover:text-[#18181B] cursor-pointer text-center">
                  {cms.t('shop.filters.mobile_show', { count: total })}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
