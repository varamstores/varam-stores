import React from 'react';
import type { Category } from '../types';
import { Picture } from '../cms/components';

interface CategoryCardProps {
  category: Category;
  isSelected?: boolean;
  /** Called with the category slug. */
  onSelect: (slug: string) => void;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({ category, isSelected, onSelect }) => (
  <div className="gsap-category-card w-full min-w-0 flex flex-col items-center">
    <button
      type="button"
      onClick={() => onSelect(category.slug)}
      className="group relative w-full flex flex-col items-center text-center p-1 sm:p-2 bg-transparent border-0 cursor-pointer focus:outline-none transition-all duration-300"
    >
      <div className="relative w-full aspect-[4/3] max-h-36 sm:max-h-44 flex items-center justify-center">
        <Picture
          image={category.image}
          alt={category.name}
          loading="lazy"
          className={`w-full h-full object-contain transition-transform duration-300 ease-out group-hover:scale-108 group-hover:-translate-y-1.5 ${isSelected ? 'scale-105 -translate-y-1' : ''}`}
        />
      </div>
      <div className="mt-2.5 sm:mt-3 flex flex-col items-center w-full px-1">
        <span className={`block text-center text-xs sm:text-[13px] md:text-sm font-bold tracking-tight transition-colors duration-200 ${isSelected ? 'text-[#EA580C]' : 'text-[#18181B] group-hover:text-[#EA580C]'}`}>
          {category.name}
        </span>
        <div className={`h-0.5 rounded-full mt-1.5 transition-all duration-300 ${isSelected ? 'w-6 bg-[#EA580C]' : 'w-0 group-hover:w-5 bg-[#EA580C]/80'}`} />
      </div>
    </button>
  </div>
);
