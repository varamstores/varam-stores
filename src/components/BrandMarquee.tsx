import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useBrands, useMarqueeBrands } from '../lib/catalogue';
import { useNavigation } from '../context/NavigationContext';
import { useCms } from '../cms/CmsProvider';
import { Picture } from '../cms/components';

export const BrandMarquee: React.FC = () => {
  const cms = useCms();
  const { goToShop } = useNavigation();
  const { data: marquee = [] } = useMarqueeBrands();
  const { data: allBrands = [] } = useBrands();
  if (!marquee.length) return null;
  // Twice in a row for a seamless 0 → -50% loop.
  const doubled = [...marquee, ...marquee];

  return (
    <section id="trusted-brands" aria-label={cms.t('home.brands.aria')} className="relative w-full bg-white py-8 sm:py-10 overflow-hidden border-b border-stone-200">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 mb-5 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 mb-1 text-xs font-bold uppercase tracking-widest text-[#B45309]">
              <Sparkles className="w-3.5 h-3.5 text-[#B45309]" />
              <span>{cms.t('home.brands.eyebrow')}</span>
            </div>
            <h2 className="font-sans font-extrabold text-2xl sm:text-3xl text-[#18181B] tracking-tight">{cms.t('home.brands.title')}</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline-block text-xs font-medium text-stone-500">{cms.t('home.brands.subtitle', { count: allBrands.length })}</span>
            <button
              type="button"
              onClick={() => goToShop()}
              className="group inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#B45309] hover:text-[#D97706] transition-colors cursor-pointer"
            >
              <span>{cms.t('home.brands.view_all')}</span>
              <ArrowRight className="w-4 h-4 text-[#B45309] group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative w-full overflow-hidden group-marquee">
        <div className="absolute left-0 top-0 bottom-0 w-16 sm:w-28 z-10 pointer-events-none bg-gradient-to-r from-white via-white/90 to-transparent" aria-hidden="true" />
        <div className="absolute right-0 top-0 bottom-0 w-16 sm:w-28 z-10 pointer-events-none bg-gradient-to-l from-white via-white/90 to-transparent" aria-hidden="true" />
        <div className="animate-marquee-infinite flex items-center gap-8 sm:gap-12 md:gap-14 py-2 px-4">
          {doubled.map((brand, idx) => (
            <button
              key={`${brand.id}-${idx}`}
              type="button"
              onClick={() => goToShop({ brands: [brand.slug] })}
              title={cms.t('home.brands.brand_title', { name: brand.name })}
              aria-hidden={idx >= marquee.length ? true : undefined}
              tabIndex={idx >= marquee.length ? -1 : undefined}
              className="shrink-0 inline-flex items-center justify-center p-2 cursor-pointer transition-all duration-300 hover:scale-110 focus:outline-none"
            >
              <Picture image={brand.logo} alt={brand.name} loading="lazy" className="h-10 sm:h-12 md:h-14 w-auto max-w-[130px] sm:max-w-[160px] object-contain select-none drop-shadow-xs" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
