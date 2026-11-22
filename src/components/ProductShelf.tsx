import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { Product } from '../types';
import { ProductCard } from './ProductCard';
import { useCollection } from '../lib/catalogue';
import { useCms } from '../cms/CmsProvider';
import { CmsA } from '../cms/components';
import type { CmsEntries } from '../cms/content.gen';

// Every key spelled out so the compiler checks each one exists in the CMS.
const SHELVES = {
  fresh_picks: { eyebrow: 'home.fresh_picks.eyebrow', title: 'home.fresh_picks.title', viewAll: 'home.fresh_picks.view_all', collection: 'home.fresh_picks.collection', limit: 'home.fresh_picks.limit' },
  bakery_dairy: { eyebrow: 'home.bakery_dairy.eyebrow', title: 'home.bakery_dairy.title', viewAll: 'home.bakery_dairy.view_all', collection: 'home.bakery_dairy.collection', limit: 'home.bakery_dairy.limit' },
  most_selling: { eyebrow: 'home.most_selling.eyebrow', title: 'home.most_selling.title', viewAll: 'home.most_selling.view_all', collection: 'home.most_selling.collection', limit: 'home.most_selling.limit' },
  pantry: { eyebrow: 'home.pantry.eyebrow', title: 'home.pantry.title', viewAll: 'home.pantry.view_all', collection: 'home.pantry.collection', limit: 'home.pantry.limit' },
} as const satisfies Record<string, { eyebrow: keyof CmsEntries; title: keyof CmsEntries; viewAll: keyof CmsEntries; collection: keyof CmsEntries; limit: keyof CmsEntries }>;
export type ShelfKey = keyof typeof SHELVES;

/** Skeleton shown while products load, so the page does not jump. */
export const ProductCardSkeleton: React.FC = () => (
  <div className="bg-white rounded-2xl border border-stone-200/90 p-3 sm:p-3.5 animate-pulse" aria-hidden="true">
    <div className="w-full aspect-square rounded-xl bg-stone-100 mb-3" />
    <div className="h-2.5 w-1/3 bg-stone-100 rounded mb-2" />
    <div className="h-3.5 w-3/4 bg-stone-100 rounded mb-2" />
    <div className="h-4 w-1/2 bg-stone-100 rounded mb-4" />
    <div className="h-9 w-full bg-stone-100 rounded-xl" />
  </div>
);

/** A homepage row of products from a collection; heading, link and collection come from the CMS. */
export const ProductShelf: React.FC<{ shelf: ShelfKey; onQuickView: (product: Product) => void; eyebrowClass?: string }> = ({
  shelf,
  onQuickView,
  eyebrowClass = 'text-[#B78103]',
}) => {
  const cms = useCms();
  const keys = SHELVES[shelf];
  const eyebrow = cms.t(keys.eyebrow);
  const title = cms.t(keys.title);
  const viewAll = cms.link(keys.viewAll);
  const code = cms.get(keys.collection);
  const limit = Math.max(1, Math.min(20, Number(cms.get(keys.limit)) || 5));
  const { data, isLoading } = useCollection(code, limit);
  const products = data?.products ?? [];

  if (!isLoading && products.length === 0) return null;

  return (
    <section id={shelf.replace('_', '-')} className="py-8 sm:py-12 bg-white">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div className="gsap-section-header flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            {eyebrow && (
              <div className={`inline-flex items-center gap-2 mb-1.5 text-xs font-extrabold uppercase tracking-widest ${eyebrowClass}`}>
                <Sparkles className="w-3.5 h-3.5" />
                <span>{eyebrow}</span>
              </div>
            )}
            <h2 className="font-sans font-extrabold text-2xl sm:text-3xl text-[#18181B] tracking-tight">{title}</h2>
          </div>
          {viewAll.label && (
            <CmsA
              link={viewAll}
              className="group inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#18181B] hover:text-[#B45309] transition-colors cursor-pointer"
            >
              <span>{viewAll.label}</span>
              <ArrowRight className="w-4 h-4 text-stone-500 group-hover:translate-x-1 transition-transform" />
            </CmsA>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-5">
          {isLoading
            ? Array.from({ length: limit }, (_, i) => <ProductCardSkeleton key={i} />)
            : products.map((product) => <ProductCard key={product.id} product={product} onQuickView={onQuickView} />)}
        </div>
      </div>
    </section>
  );
};
