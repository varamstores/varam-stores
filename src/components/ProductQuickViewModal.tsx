import React, { useEffect, useState } from 'react';
import { X, Heart, Plus, Minus, Star, MapPin, Leaf } from 'lucide-react';
import type { Product } from '../types';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useNavigation } from '../context/NavigationContext';
import { AnimatedModal } from './transitions/AnimatedModal';
import { soundEffects } from '../utils/soundEffects';
import { useProduct } from '../lib/catalogue';
import { formatMoney } from '../lib/money';
import { useCms } from '../cms/CmsProvider';
import { InlineText, Picture } from '../cms/components';
import { AvailabilityNote, ProductPrice } from './product/ProductPrice';

interface ProductQuickViewModalProps {
  product: Product | null;
  onClose: () => void;
}

export const ProductQuickViewModal: React.FC<ProductQuickViewModalProps> = ({ product, onClose }) => {
  const cms = useCms();
  const [qty, setQty] = useState(1);
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { goToProduct } = useNavigation();
  const { data: detail } = useProduct(product?.slug ?? null);
  const isFavorited = product ? isInWishlist(product.id) : false;
  const soldOut = product?.availability === 'out_of_stock';
  const max = product?.maxPerOrder ?? 50;

  useEffect(() => setQty(1), [product?.id]);

  const unitTotal = product
    ? product.saleUnit === 'weight'
      ? Math.round((product.price.amount * ((product.minWeightGrams ?? 1000) + (qty - 1) * (product.weightStepGrams ?? 1000))) / 1000)
      : product.price.amount * qty
    : 0;

  return (
    <AnimatedModal isOpen={Boolean(product)} onClose={onClose} maxWidth="max-w-2xl" ariaLabel={product?.name ?? ''}>
      {product && (
        <div className="relative flex flex-col md:flex-row">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-stone-700 flex items-center justify-center shadow-md transition-colors cursor-pointer"
            aria-label={cms.t('basket.quick_view.close_aria')}
          >
            <X className="w-4 h-4" />
          </button>

          <div className="md:w-1/2 relative bg-[#F8F9FA] overflow-hidden min-h-[260px] md:min-h-[420px] flex items-center justify-center border-b md:border-b-0 md:border-r border-stone-200">
            <Picture image={product.image} alt={product.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
            {product.badge && (
              <span className="absolute top-4 left-4 text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-md bg-[#18181B] text-[#F5D103] shadow-md z-10">{product.badge}</span>
            )}
          </div>

          <div className="md:w-1/2 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold text-[#B45309] uppercase tracking-wider">{product.category.name}</span>
                {product.isOrganic && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-[#18181B] font-bold px-2 py-0.5 rounded-md border border-amber-200/60">
                    <Leaf className="w-2.5 h-2.5 text-[#B45309]" />
                    {cms.t('global.common.organic')}
                  </span>
                )}
              </div>
              <h2 className="font-serif-heading text-2xl font-bold text-[#18181B] mb-2 leading-tight">{product.name}</h2>
              {product.rating.count > 0 && product.rating.average != null && (
                <div className="flex items-center gap-1.5 text-xs text-[#737A72] mb-3">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="font-bold text-[#18181B]">{product.rating.average.toFixed(1)}</span>
                  <span>{cms.t('basket.quick_view.reviews', { count: product.rating.count })}</span>
                </div>
              )}
              <div className="mb-3">
                <ProductPrice product={product} size="lg" />
              </div>
              <AvailabilityNote product={product} className="block mb-2" />
              {detail?.description && <p className="text-xs text-[#737A72] leading-relaxed mb-4 line-clamp-5">{detail.description}</p>}
              {detail?.origin && (
                <div className="flex items-center gap-1.5 text-xs text-[#92400E] bg-amber-50 p-2.5 rounded-xl border border-amber-200/60 mb-5">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-[#B45309]" />
                  <span><InlineText text={cms.t('basket.quick_view.origin', { origin: detail.origin })} /></span>
                </div>
              )}
              <button type="button" onClick={() => { onClose(); goToProduct(product.slug); }} className="text-xs font-bold text-[#B45309] hover:underline mb-4 cursor-pointer">
                {cms.t('basket.quick_view.details')}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center bg-stone-50 rounded-xl border border-stone-200 p-1">
                <button
                  type="button"
                  onClick={() => {
                    if (qty > 1) {
                      setQty(qty - 1);
                      soundEffects.playQuantityChange(false);
                    }
                  }}
                  className="w-8 h-8 rounded-lg bg-white text-[#18181B] flex items-center justify-center hover:bg-stone-100 transition-colors shadow-2xs cursor-pointer active:scale-90"
                  aria-label={cms.t('global.common.decrease_aria')}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-bold px-3 text-[#18181B]">{qty}</span>
                <button
                  type="button"
                  disabled={qty >= max}
                  onClick={() => {
                    setQty(qty + 1);
                    soundEffects.playQuantityChange(true);
                  }}
                  className="w-8 h-8 rounded-lg bg-[#18181B] text-[#F5D103] flex items-center justify-center hover:bg-stone-800 transition-colors shadow-2xs cursor-pointer active:scale-90 disabled:opacity-40"
                  aria-label={cms.t('global.common.increase_aria')}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                type="button"
                disabled={soldOut}
                onClick={(e) => {
                  void addToCart(product, qty, e.currentTarget);
                  onClose();
                }}
                className="flex-1 py-3 px-4 rounded-xl bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:bg-stone-200 disabled:text-stone-500 disabled:cursor-not-allowed"
              >
                <span>{soldOut ? cms.t('global.common.out_of_stock') : cms.t('basket.quick_view.add')}</span>
                {!soldOut && <><span>•</span><span>{formatMoney({ amount: unitTotal, currency: product.price.currency })}</span></>}
              </button>
              <button
                type="button"
                onClick={() => toggleWishlist(product)}
                className={`p-3 rounded-xl border transition-all cursor-pointer active:scale-90 ${isFavorited ? 'bg-rose-50 border-rose-200 text-rose-600' : 'border-stone-200 hover:bg-stone-50 text-stone-600'}`}
                aria-label={isFavorited ? cms.t('global.common.wishlist_remove_aria', { name: product.name }) : cms.t('global.common.wishlist_add_aria', { name: product.name })}
                aria-pressed={isFavorited}
              >
                <Heart className={`w-4 h-4 ${isFavorited ? 'fill-current text-rose-500' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      )}
    </AnimatedModal>
  );
};
