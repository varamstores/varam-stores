import React, { useState } from 'react';
import { X, Heart, Plus, Minus, Star, MapPin } from 'lucide-react';
import type { Product } from '../types';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { AnimatedModal } from './transitions/AnimatedModal';
import { soundEffects } from '../utils/soundEffects';

interface ProductQuickViewModalProps {
  product: Product | null;
  onClose: () => void;
}

export const ProductQuickViewModal: React.FC<ProductQuickViewModalProps> = ({
  product,
  onClose,
}) => {
  const [qty, setQty] = useState(1);
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();

  const isFavorited = product ? isInWishlist(product.id) : false;

  const handleAddToCart = (e?: React.MouseEvent) => {
    if (!product) return;
    addToCart(product, qty, (e?.currentTarget as HTMLElement) || null);
    onClose();
  };

  return (
    <AnimatedModal
      isOpen={Boolean(product)}
      onClose={onClose}
      maxWidth="max-w-2xl"
      ariaLabel={product ? product.name : 'Product Quick View'}
    >
      {product && (
        <div className="relative flex flex-col md:flex-row">
          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-stone-700 flex items-center justify-center shadow-md transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Product Image Container */}
          <div className="md:w-1/2 relative bg-[#F8F9FA] overflow-hidden min-h-[260px] md:min-h-[420px] flex items-center justify-center border-b md:border-b-0 md:border-r border-stone-200">
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
            />

            {product.badge && (
              <span className="absolute top-4 left-4 text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-md bg-[#18181B] text-[#F5D103] shadow-md z-10">
                {product.badge}
              </span>
            )}
          </div>

          {/* Product Details */}
          <div className="md:w-1/2 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold text-[#B45309] uppercase tracking-wider">
                  {product.categoryLabel}
                </span>
                {product.isOrganic && (
                  <span className="text-[10px] bg-amber-100 text-[#18181B] font-bold px-2 py-0.5 rounded-md border border-amber-200/60">
                    100% Organic
                  </span>
                )}
              </div>

              <h2 className="font-serif-heading text-2xl font-bold text-[#18181B] mb-2 leading-tight">
                {product.name}
              </h2>

              {/* Star Rating */}
              <div className="flex items-center gap-1.5 text-xs text-[#737A72] mb-3">
                <div className="flex items-center text-amber-400">
                  <Star className="w-3.5 h-3.5 fill-current" />
                </div>
                <span className="font-bold text-[#18181B]">{product.rating}</span>
                <span>({product.reviewsCount} verified reviews)</span>
              </div>

              {/* Price */}
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-2xl font-black text-[#18181B]">
                  £{product.price.toFixed(2)}
                </span>
                <span className="text-xs text-[#737A72]">
                  /{product.unit}
                </span>
                {product.originalPrice && (
                  <span className="text-xs text-stone-400 line-through">
                    £{product.originalPrice.toFixed(2)}
                  </span>
                )}
              </div>

              <p className="text-xs text-[#737A72] leading-relaxed mb-4">
                {product.description}
              </p>

              {/* Origin / Farm badge */}
              <div className="flex items-center gap-1.5 text-xs text-[#92400E] bg-amber-50 p-2.5 rounded-xl border border-amber-200/60 mb-5">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-[#B45309]" />
                <span>
                  Harvested &amp; packaged fresh: <strong>Hatfield &amp; St Albans Valley</strong>
                </span>
              </div>
            </div>

            {/* Stepper & Add to cart */}
            <div>
              <div className="flex items-center gap-3">
                {/* Quantity Stepper */}
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
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-bold px-3 text-[#18181B]">
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setQty(qty + 1);
                      soundEffects.playQuantityChange(true);
                    }}
                    className="w-8 h-8 rounded-lg bg-[#18181B] text-[#F5D103] flex items-center justify-center hover:bg-stone-800 transition-colors shadow-2xs cursor-pointer active:scale-90"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Add to Cart CTA */}
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="flex-1 py-3 px-4 rounded-xl bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Add to Basket</span>
                  <span>•</span>
                  <span>£{(product.price * qty).toFixed(2)}</span>
                </button>

                {/* Wishlist button */}
                <button
                  type="button"
                  onClick={() => toggleWishlist(product.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer active:scale-90 ${
                    isFavorited
                      ? 'bg-rose-50 border-rose-200 text-rose-600'
                      : 'border-stone-200 hover:bg-stone-50 text-stone-600'
                  }`}
                  aria-label="Save to wishlist"
                >
                  <Heart className={`w-4 h-4 ${isFavorited ? 'fill-current text-rose-500' : ''}`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AnimatedModal>
  );
};
