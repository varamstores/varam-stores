import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ArrowRight, Sparkles, Tag } from 'lucide-react';
import { useCategories, useProducts } from '../lib/catalogue';
import { useCms } from '../cms/CmsProvider';
import { CmsA, InlineText, Picture } from '../cms/components';
import { CmsIcon } from '../cms/icons';

interface ShopMegaMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCategory: (slug: string) => void;
  onViewAllShop: () => void;
}

export const ShopMegaMenu: React.FC<ShopMegaMenuProps> = ({ isOpen, onClose, onSelectCategory, onViewAllShop }) => {
  const cms = useCms();
  const { data: categories = [] } = useCategories();
  const { data: listing } = useProducts({ limit: 1 }, isOpen);
  const productCount = listing?.total ?? 0;
  const promo = cms.t('global.shop_menu.promo');

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const pick = (slug: string) => {
    onSelectCategory(slug);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 top-14 sm:top-16 bg-black/25 backdrop-blur-[1px] z-40"
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute top-full left-0 right-0 w-full bg-white border-b border-stone-200 shadow-2xl z-50"
          >
            <div data-lenis-prevent="true" style={{ overscrollBehavior: 'contain' }} className="w-full max-h-[82vh] overflow-y-auto py-6 sm:py-7 px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
              <div className="w-full">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-6 border-b border-stone-200 gap-3">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-[#B45309] text-[11px] font-bold uppercase tracking-wider border border-amber-200/60">
                      <Sparkles className="w-3 h-3 text-[#B45309]" />
                      <span>{cms.t('global.shop_menu.eyebrow')}</span>
                    </div>
                    <h3 className="font-sans font-extrabold text-lg sm:text-xl text-[#18181B] tracking-tight">{cms.t('global.shop_menu.title')}</h3>
                  </div>

                  <div className="flex items-center gap-3">
                    {promo && (
                      <div className="hidden md:flex items-center gap-1.5 text-xs text-stone-500 font-medium">
                        <Tag className="w-3.5 h-3.5 text-[#B45309]" />
                        <span><InlineText text={promo} strongClass="text-[#B45309]" /></span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onViewAllShop();
                        onClose();
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#18181B] hover:bg-[#E5A800] bg-[#F5D103] px-4 py-2 rounded-full shadow-2xs transition-colors cursor-pointer shrink-0"
                    >
                      <span>{cms.t('global.shop_menu.view_all', { count: productCount })}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-4">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => pick(cat.slug)}
                      className="group text-left p-3.5 sm:p-4 rounded-2xl border border-stone-200 bg-white hover:border-[#F5D103] hover:shadow-md transition-all duration-200 flex items-center gap-3.5 cursor-pointer shadow-2xs"
                    >
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-white flex items-center justify-center p-1.5 overflow-hidden shrink-0 border border-stone-200 group-hover:scale-105 transition-transform duration-200">
                        <Picture image={cat.image} loading="lazy" className="w-full h-full object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-sm sm:text-[15px] font-extrabold text-[#18181B] group-hover:text-[#B45309] transition-colors truncate">{cat.name}</h4>
                          <ChevronRight className="w-4 h-4 text-[#18181B]/60 group-hover:text-[#B45309] group-hover:translate-x-0.5 transition-all shrink-0" />
                        </div>
                        <p className="text-xs font-bold text-[#B45309] mt-0.5">{cms.t('global.shop_menu.item_count', { count: cat.productCount })}</p>
                        {cat.children.length > 0 && (
                          <p className="text-xs font-medium text-[#18181B]/75 group-hover:text-[#18181B] truncate mt-1">
                            {cat.children.slice(0, 2).map((c) => c.name).join(' • ')}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                {cms.get('global.shop_menu.popular').length > 0 && (
                  <div className="mt-6 pt-4 border-t border-stone-200 flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-extrabold text-[#18181B] uppercase tracking-wider mr-1">{cms.t('global.shop_menu.popular_label')}</span>
                    {cms.get('global.shop_menu.popular').map((p, i) => (
                      <CmsA
                        key={i}
                        link={p.href}
                        onClick={onClose}
                        className="px-3.5 py-1.5 rounded-full bg-white border border-stone-200 hover:bg-[#F5D103] hover:text-[#18181B] hover:border-[#F5D103] text-xs font-bold text-[#18181B] shadow-2xs transition-all cursor-pointer"
                      >
                        {p.label}
                      </CmsA>
                    ))}
                  </div>
                )}

                <div className="mt-5 pt-4 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#18181B]">
                  <div className="flex items-center gap-4 flex-wrap">
                    {cms.get('global.shop_menu.assurances').map((a, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <span className="text-stone-300 hidden sm:inline">|</span>}
                        <span className="flex items-center gap-1.5 font-semibold text-[#18181B]">
                          <CmsIcon name={a.icon} className="w-4 h-4 text-[#B45309]" />
                          {a.text}
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onViewAllShop();
                      onClose();
                    }}
                    className="text-xs font-extrabold text-[#B45309] hover:text-[#D97706] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>{cms.t('global.shop_menu.browse_all', { count: productCount })}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
