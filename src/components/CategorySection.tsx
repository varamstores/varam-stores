import React from 'react';
import { useCategories } from '../lib/catalogue';
import { CategoryCard } from './CategoryCard';
import { useCms } from '../cms/CmsProvider';
import { InlineText } from '../cms/components';

interface CategorySectionProps {
  selectedCategory: string;
  onSelectCategory: (slug: string) => void;
}

export const CategorySection: React.FC<CategorySectionProps> = ({ selectedCategory, onSelectCategory }) => {
  const cms = useCms();
  const { data: categories = [], isLoading } = useCategories();
  const shown = categories.filter((c) => c.showOnHomepage);
  if (!isLoading && !shown.length) return null;

  return (
    <section id="categories" className="py-12 sm:py-16 md:py-20 bg-white border-y border-stone-100 relative overflow-hidden">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 relative z-10">
        <div className="text-center mb-8 sm:mb-12 md:mb-14">
          <h2 className="font-serif-heading font-bold text-2xl sm:text-3xl md:text-4xl text-[#18181B] tracking-tight">
            <InlineText text={cms.t('home.categories.title')} strongClass="text-[#EA580C] font-bold" />
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-4 sm:gap-x-6 md:gap-x-8 gap-y-7 sm:gap-y-9 md:gap-y-10 items-start">
          {isLoading
            ? Array.from({ length: 12 }, (_, i) => (
                <div key={i} className="w-full aspect-[4/3] max-h-36 sm:max-h-44 rounded-2xl bg-stone-100 animate-pulse" aria-hidden="true" />
              ))
            : shown.map((cat) => <CategoryCard key={cat.id} category={cat} isSelected={selectedCategory === cat.slug} onSelect={onSelectCategory} />)}
        </div>
      </div>
    </section>
  );
};
