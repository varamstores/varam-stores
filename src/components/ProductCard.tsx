import React from 'react';
import { Heart, ShoppingCart, Plus, Minus, Star, Eye, Leaf } from 'lucide-react';
import type { Product } from '../types';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useNavigation } from '../context/NavigationContext';
import { soundEffects } from '../utils/soundEffects';
import { useCms } from '../cms/CmsProvider';
import { Picture } from '../cms/components';
import { AvailabilityNote, ProductPrice, basketAmountLabel } from './product/ProductPrice';

interface ProductCardProps {
  product: Product;
  onQuickView?: (product: Product) => void;
  onSelectProduct?: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onQuickView, onSelectProduct }) => {
  const cms = useCms();
  const { quantityOf, addToCart, updateQuantity } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { goToProduct } = useNavigation();

  const quantityInCart = quantityOf(product.id);
  const isFavorited = isInWishlist(product.id);
  const soldOut = product.availability === 'out_of_stock';
  const atMax = product.maxPerOrder != null && product.saleUnit === 'each' && quantityInCart >= product.maxPerOrder;

  const open = () => (onSelectProduct ? onSelectProduct(product) : goToProduct(product.slug));

  return (
    <div
      data-product-id={product.id}
      className="gsap-product-card card-hover-elevate group bg-white rounded-2xl border border-stone-200/90 p-3 sm:p-3.5 shadow-2xs flex flex-col justify-between relative h-full"
    >
      <div className="relative w-full aspect-square overflow-hidden rounded-xl bg-stone-100 flex items-center justify-center mb-3 group/img">
        <button
          type="button"
          onClick={open}
          className="w-full h-full flex items-center justify-center cursor-pointer focus:outline-none"
          aria-label={cms.t('global.common.view_details_aria', { name: product.name })}
        >
          <Picture image={product.image} alt={product.name} className={`img-zoom-hover w-full h-full object-cover ${soldOut ? 'opacity-60' : ''}`} loading="lazy" />
        </button>

        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none z-10">
          {product.badge ? (
            <span className="text-[10px] sm:text-[11px] font-black uppercase px-2 py-0.5 rounded-md bg-[#F5D103] text-[#18181B] shadow-2xs pointer-events-auto">{product.badge}</span>
          ) : product.isOrganic ? (
            <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-100 text-[#92400E] border border-amber-200/60 shadow-2xs pointer-events-auto">
              <Leaf className="w-2.5 h-2.5 text-[#B45309]" />
              <span>{cms.t('global.common.organic')}</span>
            </span>
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleWishlist(product);
            }}
            className={`w-8 h-8 rounded-full flex items-center justify-center shadow-xs backdrop-blur-xs transition-all pointer-events-auto active:scale-125 cursor-pointer ${
              isFavorited ? 'text-rose-500 bg-white shadow-sm' : 'text-stone-500 bg-white/90 hover:text-stone-900 hover:bg-white'
            }`}
            aria-label={isFavorited ? cms.t('global.common.wishlist_remove_aria', { name: product.name }) : cms.t('global.common.wishlist_add_aria', { name: product.name })}
            aria-pressed={isFavorited}
          >
            <Heart className={`w-4 h-4 ${isFavorited ? 'fill-current text-rose-500' : ''}`} />
          </button>
        </div>

        {onQuickView && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              soundEffects.playTap();
              onQuickView(product);
            }}
            className="absolute inset-x-3 bottom-2.5 bg-white/95 backdrop-blur-xs text-[#18181B] text-xs font-bold py-2 rounded-xl shadow-md border border-stone-200/80 opacity-0 translate-y-2 group-hover/img:opacity-100 group-hover/img:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0 transition-all duration-200 flex items-center justify-center gap-1.5 hover:bg-[#F5D103] hover:text-[#18181B] cursor-pointer z-10"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{cms.t('global.common.quick_view')}</span>
          </button>
        )}
      </div>

      <div className="flex flex-col flex-1 justify-between">
        <div>
          <button type="button" onClick={open} className="text-left w-full cursor-pointer focus:outline-none">
            <p className="text-[11px] font-medium text-[#737A72] uppercase tracking-wider mb-0.5">{product.brand?.name ?? product.category.name}</p>
            <h4 className="text-sm font-bold text-[#18181B] group-hover:text-[#B45309] transition-colors line-clamp-1">{product.name}</h4>
          </button>

          <div className="mt-1">
            <ProductPrice product={product} />
          </div>

          <div className="flex items-center gap-1 text-xs text-[#737A72] mt-1 mb-3 min-h-[18px]">
            {product.rating.count > 0 && product.rating.average != null ? (
              <>
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="font-bold text-[#18181B]">{product.rating.average.toFixed(1)}</span>
                <span>{cms.t('global.common.rating_count', { count: product.rating.count })}</span>
              </>
            ) : (
              <AvailabilityNote product={product} />
            )}
          </div>
        </div>

        <div>
          {quantityInCart > 0 ? (
            <div className="flex items-center justify-between bg-amber-50/70 rounded-xl p-1 border border-amber-200/60">
              <button
                type="button"
                onClick={() => void updateQuantity(product.id, quantityInCart - 1)}
                className="w-7 h-7 rounded-lg bg-white text-[#18181B] hover:bg-stone-100 flex items-center justify-center text-xs font-bold shadow-2xs cursor-pointer"
                aria-label={cms.t('global.common.decrease_aria')}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-bold text-[#18181B]" aria-live="polite">{basketAmountLabel(cms, product, quantityInCart)}</span>
              <button
                type="button"
                disabled={atMax}
                onClick={(e) => void updateQuantity(product.id, quantityInCart + 1, e.currentTarget)}
                className="w-7 h-7 rounded-lg bg-[#F5D103] text-[#18181B] hover:bg-[#E5A800] flex items-center justify-center text-xs font-bold shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={cms.t('global.common.increase_aria')}
                title={atMax ? cms.t('global.common.max_per_order', { count: product.maxPerOrder ?? 0 }) : undefined}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={soldOut}
              onClick={(e) => void addToCart(product, 1, e.currentTarget)}
              className="btn-magnetic w-full py-2.5 px-3 rounded-xl bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all active:scale-[0.97] shadow-2xs hover:shadow-xs group/btn cursor-pointer disabled:bg-stone-200 disabled:text-stone-500 disabled:cursor-not-allowed"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>{soldOut ? cms.t('global.common.notify_out_of_stock') : cms.t('global.common.add_to_basket')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
