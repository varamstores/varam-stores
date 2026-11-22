import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Search, X, Sparkles } from 'lucide-react';
import { useBrands } from '../lib/catalogue';
import { useCms } from '../cms/CmsProvider';
import { InlineText } from '../cms/components';
import type { Brand } from '../types/api';

interface BrandsMegaMenuProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the brand slug. */
  onSelectBrand: (slug: string) => void;
  onViewAllBrands?: () => void;
}

const GROUP_ORDER = ['0-9', 'A-B', 'C-E', 'F-H', 'I-K', 'L-O', 'P-R', 'S-U', 'V-Z'];

export const BrandsMegaMenu: React.FC<BrandsMegaMenuProps> = ({ isOpen, onClose, onSelectBrand, onViewAllBrands }) => {
  const cms = useCms();
  const { data: brands = [] } = useBrands();
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setFilterText('');
      return;
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const groups = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const byGroup = new Map<string, Brand[]>();
    for (const b of brands) {
      if (q && !b.name.toLowerCase().includes(q)) continue;
      byGroup.set(b.group, [...(byGroup.get(b.group) ?? []), b]);
    }
    return [...byGroup.entries()]
      .sort((a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]))
      .map(([group, list]) => ({ group, brands: list }));
  }, [brands, filterText]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 top-14 sm:top-16 bg-black/35 backdrop-blur-[2px] z-40"
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute top-full left-0 right-0 w-full bg-white border-b border-stone-200 shadow-2xl z-50"
          >
            <div data-lenis-prevent="true" style={{ overscrollBehavior: 'contain' }} className="w-full max-h-[76vh] overflow-y-auto py-6 sm:py-8 px-6 sm:px-10 lg:px-12">
              <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
                <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 mb-6 border-b border-stone-200 gap-4">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h3 className="font-serif-heading font-extrabold text-2xl text-[#18181B] tracking-tight">
                      <InlineText text={cms.t('global.brands_menu.title')} strongClass="text-[#B45309] underline decoration-[#F5D103] decoration-wavy" />
                    </h3>
                    <span className="text-sm text-[#18181B]/80 font-semibold">{cms.t('global.brands_menu.subtitle', { count: brands.length })}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative w-64 sm:w-72">
                      <input
                        type="text"
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        placeholder={cms.t('global.brands_menu.search_placeholder')}
                        aria-label={cms.t('global.brands_menu.search_placeholder')}
                        className="w-full text-xs font-medium pl-8 pr-7 py-2 rounded-full border border-stone-200 bg-white text-[#18181B] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/30 focus:border-[#F5D103] shadow-2xs transition-all"
                      />
                      <Search className="w-3.5 h-3.5 text-[#18181B]/60 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      {filterText && (
                        <button
                          type="button"
                          onClick={() => setFilterText('')}
                          aria-label={cms.t('global.header.search_clear_aria')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-800 p-0.5 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onViewAllBrands?.();
                        onClose();
                      }}
                      className="text-xs font-bold text-[#18181B] bg-[#F5D103] hover:bg-[#E5A800] px-4 py-2 rounded-full flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs shrink-0"
                    >
                      <span>{cms.t('global.brands_menu.view_all')}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {groups.length === 0 ? (
                  <div className="py-12 text-center text-stone-600">
                    <p className="font-semibold text-sm text-[#18181B]">{cms.t('global.brands_menu.empty_title', { query: filterText })}</p>
                    <p className="text-xs text-[#18181B]/70 mt-1">{cms.t('global.brands_menu.empty_hint')}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-8 gap-y-7">
                    {groups.map((group) => (
                      <div key={group.group} className="flex flex-col">
                        <div className="flex items-center justify-between pb-2 mb-2.5 border-b-2 border-[#F5D103]">
                          <span className="font-extrabold text-sm text-[#18181B] tracking-wider uppercase">{group.group}</span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-[#B45309]">{group.brands.length}</span>
                        </div>
                        <ul className="space-y-1">
                          {group.brands.map((brand) => (
                            <li key={brand.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectBrand(brand.slug);
                                  onClose();
                                }}
                                className="w-full text-left px-2.5 py-1 -mx-2.5 rounded-lg text-sm font-semibold text-[#18181B] hover:text-[#B45309] hover:bg-amber-100 hover:font-bold hover:translate-x-1 leading-snug transition-all duration-150 truncate cursor-pointer flex items-center justify-between group/item"
                              >
                                <span className="truncate">{brand.name}</span>
                                {brand.isPopular && (
                                  <span className="text-[10px] font-bold text-[#B45309] opacity-75 group-hover/item:opacity-100 flex items-center gap-0.5 shrink-0 ml-1">
                                    <Sparkles className="w-2.5 h-2.5 text-[#D4A359]" />
                                  </span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
