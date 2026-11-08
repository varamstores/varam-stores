import React from 'react';
import { Heart, ShoppingCart, Plus, Minus, Star, Eye, Leaf } from 'lucide-react';
import type { Product } from '../types';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useNavigation } from '../context/NavigationContext';
import { soundEffects } from '../utils/soundEffects';

interface ProductCardProps {
  product: Product;
  onQuickView?: (product: Product) => void;
  onSelectProduct?: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onQuickView,
  onSelectProduct,
}) => {
  const { items, addToCart, updateQuantity } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { goToProduct } = useNavigation();

  const cartItem = items.find((i) => i.product.id === product.id);
  const quantityInCart = cartItem ? cartItem.quantity : 0;
  const isFavorited = isInWishlist(product.id);

  const handleCardClick = () => {
    if (onSelectProduct) {
      onSelectProduct(product);
    } else {
      goToProduct(product.id);
    }
  };

  return (
    <div
      data-product-id={product.id}
      className="gsap-product-card card-hover-elevate group bg-white rounded-2xl border border-stone-200/90 p-3 sm:p-3.5 shadow-2xs flex flex-col justify-between relative h-full"
    >
      {/* Clean Product Image Container with refined catalog presentation */}
      <div className="relative w-full aspect-square overflow-hidden rounded-xl bg-stone-100 flex items-center justify-center mb-3 group/img">
        <button
          type="button"
          onClick={handleCardClick}
          className="w-full h-full flex items-center justify-center cursor-pointer focus:outline-none"
          aria-label={`View details for ${product.name}`}
        >
          <img
            src={product.image}
            alt={product.name}
            className="img-zoom-hover w-full h-full object-cover"
            loading="lazy"
          />
        </button>

        {/* Floating Top Badges overlaid cleanly on the image */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none z-10">
          {product.badge ? (
            <span className="text-[10px] sm:text-[11px] font-black uppercase px-2 py-0.5 rounded-md bg-[#F5D103] text-[#18181B] shadow-2xs pointer-events-auto">
              {product.badge}
            </span>
          ) : product.isOrganic ? (
            <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-100 text-[#92400E] border border-amber-200/60 shadow-2xs pointer-events-auto">
              <Leaf className="w-2.5 h-2.5 text-[#B45309]" />
              <span>Organic</span>
            </span>
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleWishlist(product.id);
            }}
            className={`w-8 h-8 rounded-full flex items-center justify-center shadow-xs backdrop-blur-xs transition-all pointer-events-auto active:scale-125 cursor-pointer ${
              isFavorited
                ? 'text-rose-500 bg-white shadow-sm'
                : 'text-stone-500 bg-white/90 hover:text-stone-900 hover:bg-white'
            }`}
            aria-label={isFavorited ? 'Remove from wishlist' : 'Save to wishlist'}
            title={isFavorited ? 'Remove from wishlist' : 'Save to wishlist'}
          >
            <Heart
              className={`w-4 h-4 ${isFavorited ? 'fill-current text-rose-500' : ''}`}
            />
          </button>
        </div>

        {/* Quick View Button on Hover */}
        {onQuickView && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              soundEffects.playTap();
              onQuickView(product);
            }}
            className="absolute inset-x-3 bottom-2.5 bg-white/95 backdrop-blur-xs text-[#18181B] text-xs font-bold py-2 rounded-xl shadow-md border border-stone-200/80 opacity-0 translate-y-2 group-hover/img:opacity-100 group-hover/img:translate-y-0 transition-all duration-200 flex items-center justify-center gap-1.5 hover:bg-[#F5D103] hover:text-[#18181B] hover:text-white cursor-pointer z-10"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Quick View</span>
          </button>
        )}
      </div>

      {/* Product Details */}
      <div className="flex flex-col flex-1 justify-between">
        <div>
          <button
            type="button"
            onClick={handleCardClick}
            className="text-left w-full cursor-pointer focus:outline-none"
          >
            <p className="text-[11px] font-medium text-[#737A72] uppercase tracking-wider mb-0.5">
              {product.categoryLabel}
            </p>
            <h4 className="text-sm font-bold text-[#18181B] group-hover:text-[#B45309] transition-colors line-clamp-1">
              {product.name}
            </h4>
          </button>

          {/* Pricing */}
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-base font-extrabold text-[#18181B]">
              £{product.price.toFixed(2)}
            </span>
            <span className="text-xs text-[#737A72]">
              /{product.unit}
            </span>
            {product.originalPrice && (
              <span className="text-xs text-stone-400 line-through ml-1">
                £{product.originalPrice.toFixed(2)}
              </span>
            )}
          </div>

          {/* Star Rating */}
          <div className="flex items-center gap-1 text-xs text-[#737A72] mt-1 mb-3">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span className="font-bold text-[#18181B]">{product.rating}</span>
            <span>({product.reviewsCount})</span>
          </div>
        </div>

        {/* Signature Golden Yellow Add to Cart Button */}
        <div>
          {quantityInCart > 0 ? (
            <div className="flex items-center justify-between bg-amber-50/70 rounded-xl p-1 border border-amber-200/60">
              <button
                type="button"
                onClick={() => updateQuantity(product.id, quantityInCart - 1)}
                className="w-7 h-7 rounded-lg bg-white text-[#18181B] hover:bg-stone-100 flex items-center justify-center text-xs font-bold shadow-2xs cursor-pointer"
                aria-label="Decrease quantity"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-bold text-[#18181B]">
                {quantityInCart} in cart
              </span>
              <button
                type="button"
                onClick={(e) => updateQuantity(product.id, quantityInCart + 1, e.currentTarget)}
                className="w-7 h-7 rounded-lg bg-[#F5D103] text-[#18181B] hover:bg-[#E5A800] flex items-center justify-center text-xs font-bold shadow-2xs cursor-pointer"
                aria-label="Increase quantity"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => addToCart(product, 1, e.currentTarget)}
              className="btn-magnetic w-full py-2.5 px-3 rounded-xl bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all active:scale-[0.97] shadow-2xs hover:shadow-xs group/btn cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4 text-[#18181B]" />
              <span>Add to Cart</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
