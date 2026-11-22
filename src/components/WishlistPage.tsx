import React from 'react';
import { Heart, ShoppingCart, Trash2, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProductCard, } from './ProductCard';
import { ProductCardSkeleton } from './ProductShelf';
import { useWishlist } from '../context/WishlistContext';
import { useCart } from '../context/CartContext';
import { useNavigation } from '../context/NavigationContext';
import { useAuth } from '../context/AuthContext';
import { useCms } from '../cms/CmsProvider';
import { InlineText } from '../cms/components';
import { useSeo } from '../cms/hooks';
import type { Product } from '../types';

interface WishlistPageProps {
  onQuickView: (product: Product) => void;
}

export const WishlistPage: React.FC<WishlistPageProps> = ({ onQuickView }) => {
  const cms = useCms();
  useSeo('wishlist');
  const { products, isLoading, clearWishlist, wishlistCount } = useWishlist();
  const { addToCart, showToast } = useCart();
  const { isCustomer } = useAuth();
  const { goToHome, goToShop, goToProduct, goToAccount } = useNavigation();
  const available = products.filter((p) => p.availability !== 'out_of_stock');

  const handleAddAll = async () => {
    for (const p of available) await addToCart(p, 1);
    showToast(cms.t('wishlist.main.added_all', { count: available.length }));
  };

  return (
    <div className="w-full bg-white min-h-screen pb-24 animate-fadeIn">
      <section className="bg-white border-b border-stone-200/80 py-8 sm:py-12 px-4 sm:px-6 lg:px-10">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
          <nav aria-label={cms.t('shop.header.crumb_aria')} className="flex items-center gap-2 text-xs text-[#737A72] mb-3">
            <button type="button" onClick={goToHome} className="hover:text-[#B45309] transition-colors cursor-pointer">{cms.t('wishlist.main.crumb_home')}</button>
            <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
            <span className="text-[#18181B] font-bold" aria-current="page">{cms.t('wishlist.main.crumb')}</span>
          </nav>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#B45309] block mb-1">{cms.t('wishlist.main.eyebrow')}</span>
              <h1 className="font-serif-heading text-3xl sm:text-4xl lg:text-5xl font-bold text-[#18181B]">{cms.t('wishlist.main.title')}</h1>
            </div>
            {wishlistCount > 0 && (
              <div className="flex items-center gap-3">
                <button type="button" onClick={clearWishlist} className="px-4 py-2.5 rounded-full border border-stone-300 bg-white hover:bg-stone-50 text-xs font-bold text-stone-700 transition-colors cursor-pointer flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5 text-stone-500" />
                  <span>{cms.t('wishlist.main.clear')}</span>
                </button>
                {available.length > 0 && (
                  <button type="button" onClick={() => void handleAddAll()} className="px-6 py-2.5 rounded-full bg-[#F5D103] text-[#18181B] hover:bg-[#E5A800] text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shadow-sm btn-magnetic">
                    <ShoppingCart className="w-4 h-4 text-[#18181B]" />
                    <span>{cms.t('wishlist.main.add_all', { count: available.length })}</span>
                  </button>
                )}
              </div>
            )}
          </div>
          {!isCustomer && wishlistCount > 0 && (
            <button type="button" onClick={() => goToAccount()} className="mt-4 text-xs font-semibold text-[#B45309] hover:underline cursor-pointer">{cms.t('wishlist.main.guest_note')}</button>
          )}
        </div>
      </section>

      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 pt-8 sm:pt-12">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">{Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)}</div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-3xl border border-stone-200/80 p-8 sm:p-16 text-center max-w-lg mx-auto shadow-xs">
            <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4">
              <Heart className="w-8 h-8" />
            </div>
            <h2 className="font-serif-heading font-bold text-2xl text-[#18181B] mb-2">{cms.t('wishlist.main.empty_title')}</h2>
            <p className="text-xs sm:text-sm text-[#737A72] mb-6">{cms.t('wishlist.main.empty_text')}</p>
            <button type="button" onClick={() => goToShop()} className="px-7 py-3 rounded-full bg-[#18181B] text-[#F5D103] text-xs font-bold hover:bg-[#E5A800] hover:text-[#18181B] transition-colors cursor-pointer shadow-sm btn-magnetic">
              {cms.t('wishlist.main.empty_button')}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-xs sm:text-sm font-semibold text-[#18181B] mb-6">
              <InlineText text={products.length === 1 ? cms.t('wishlist.main.count_one') : cms.t('wishlist.main.count', { count: products.length })} strongClass="text-[#18181B]" />
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              <AnimatePresence>
                {products.map((product) => (
                  <motion.div key={product.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}>
                    <ProductCard product={product} onQuickView={onQuickView} onSelectProduct={(p) => goToProduct(p.slug)} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
