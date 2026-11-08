import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  Heart,
  Plus,
  Minus,
  ShoppingCart,
  Star,
  MapPin,
  Leaf,
  Truck,
  ShieldCheck,
  RotateCcw,
  Clock,
  CheckCircle2,
  Share2,
} from 'lucide-react';
import { TIMING, EASING } from '../motion';
import { products } from '../data/products';
import { customerReviews } from '../data/reviews';
import { ProductCard } from './ProductCard';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useNavigation } from '../context/NavigationContext';
import type { Product } from '../types';
import { soundEffects } from '../utils/soundEffects';

interface ProductDetailPageProps {
  productId: string | null;
  onQuickView: (product: Product) => void;
}

export const ProductDetailPage: React.FC<ProductDetailPageProps> = ({
  productId,
  onQuickView,
}) => {
  const { items, addToCart, showToast } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { goToHome, goToShop, goToProduct } = useNavigation();

  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<'overview' | 'nutrition' | 'sourcing' | 'reviews'>('overview');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Find product
  const product = products.find((p) => p.id === productId);

  // Scroll to top on product change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setQuantity(1);
    setSelectedImageIndex(0);
    setActiveTab('overview');
  }, [productId]);

  // Handle Invalid Product ID
  if (!product) {
    return (
      <div className="w-full bg-white min-h-[60vh] flex items-center justify-center py-20 px-4">
        <div className="bg-white rounded-3xl border border-stone-200 p-8 sm:p-12 text-center max-w-md shadow-sm">
          <div className="w-16 h-16 rounded-full bg-[#F8F9FA] text-[#B45309] flex items-center justify-center mx-auto mb-4">
            <Leaf className="w-8 h-8" />
          </div>
          <h2 className="font-serif-heading font-bold text-2xl text-[#18181B] mb-2">
            Product Not Found
          </h2>
          <p className="text-xs sm:text-sm text-[#737A72] mb-6">
            The grocery item you are looking for may have been rotated with the season or is currently out of stock.
          </p>
          <button
            type="button"
            onClick={() => goToShop()}
            className="px-6 py-3 rounded-full bg-[#18181B] text-[#F5D103] text-xs font-bold hover:bg-[#E5A800] transition-colors cursor-pointer"
          >
            Explore Full Catalogue
          </button>
        </div>
      </div>
    );
  }

  const isFavorited = isInWishlist(product.id);
  const cartItem = items.find((i) => i.product.id === product.id);
  const inCartQty = cartItem ? cartItem.quantity : 0;

  // Gallery images (fallback to product image duplicates with different framing)
  const galleryImages = [
    product.image,
    product.image,
  ];

  // Related products from same category
  const relatedProducts = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  const handleAddToCart = (e?: React.MouseEvent<HTMLButtonElement>) => {
    addToCart(product, quantity, e?.currentTarget);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `${product.name} | FreshMart`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      showToast('Product link copied to clipboard!');
    }
  };

  return (
    <div className="w-full bg-white min-h-screen pb-24 animate-fadeIn">
      {/* 1. Breadcrumb Bar */}
      <div className="border-b border-stone-200/80 bg-white py-3.5 px-4 sm:px-6 lg:px-10">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 flex items-center justify-between">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[#737A72] truncate">
            <button
              type="button"
              onClick={goToHome}
              className="hover:text-[#B45309] transition-colors cursor-pointer"
            >
              Home
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <button
              type="button"
              onClick={() => goToShop({ category: 'all' })}
              className="hover:text-[#B45309] transition-colors cursor-pointer"
            >
              Catalogue
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <button
              type="button"
              onClick={() => goToShop({ category: product.category })}
              className="hover:text-[#B45309] transition-colors cursor-pointer capitalize truncate"
            >
              {product.categoryLabel}
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <span className="text-[#18181B] font-bold truncate">
              {product.name}
            </span>
          </nav>

          <button
            type="button"
            onClick={handleShare}
            className="hidden sm:flex items-center gap-1.5 text-xs text-[#737A72] hover:text-[#B45309] transition-colors cursor-pointer shrink-0 ml-4"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Share</span>
          </button>
        </div>
      </div>

      {/* 2. Main Product Showcase */}
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 pt-8 sm:pt-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Left Column: Image Gallery (lg:col-span-6) */}
          <div className="lg:col-span-6 flex flex-col gap-4">
            <div className="relative w-full aspect-square rounded-3xl bg-white border border-stone-200/90 overflow-hidden shadow-sm flex items-center justify-center group">
              <AnimatePresence mode="wait">
                <motion.img
                  key={selectedImageIndex}
                  src={galleryImages[selectedImageIndex]}
                  alt={product.name}
                  initial={{ opacity: 0.6, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0.6, scale: 0.98 }}
                  transition={{ duration: TIMING.FAST, ease: EASING.EASE_OUT }}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 will-change-transform"
                />
              </AnimatePresence>

              {/* Badges on main image */}
              <div className="absolute top-4 left-4 flex flex-col gap-1.5 z-10 pointer-events-none">
                {product.badge && (
                  <span className="px-2.5 py-1 rounded-md bg-[#18181B] text-[#F5D103] text-xs font-black uppercase tracking-wider shadow-sm">
                    {product.badge}
                  </span>
                )}
                {product.isOrganic && (
                  <span className="px-2.5 py-1 rounded-md bg-amber-100/90 text-[#92400E] border border-amber-200/60 text-xs font-extrabold uppercase tracking-wider shadow-2xs inline-flex items-center gap-1 backdrop-blur-xs">
                    <Leaf className="w-3 h-3 text-[#B45309]" />
                    <span>100% Organic</span>
                  </span>
                )}
              </div>

              {/* Wishlist Button */}
              <button
                type="button"
                onClick={() => toggleWishlist(product.id)}
                className={`absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center shadow-md backdrop-blur-md transition-all active:scale-125 cursor-pointer z-10 ${
                  isFavorited
                    ? 'bg-rose-50 text-rose-500'
                    : 'bg-white/90 text-stone-500 hover:text-stone-900 hover:bg-white'
                }`}
                aria-label={isFavorited ? 'Remove from wishlist' : 'Save to wishlist'}
              >
                <Heart className={`w-5 h-5 ${isFavorited ? 'fill-current' : ''}`} />
              </button>
            </div>

            {/* Thumbnail Gallery Strip */}
            <div className="flex items-center gap-3">
              {galleryImages.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedImageIndex(idx)}
                  className={`w-20 h-20 rounded-2xl bg-white border overflow-hidden flex items-center justify-center cursor-pointer transition-all ${
                    selectedImageIndex === idx
                      ? 'border-[#F5D103] ring-2 ring-[#F5D103]/30 shadow-xs'
                      : 'border-stone-200/80 hover:border-stone-400'
                  }`}
                  aria-label={`View photo ${idx + 1}`}
                >
                  <img
                    src={img}
                    alt={`${product.name} thumbnail ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>

            {/* Quality & Fresh Guarantee Badge */}
            <div className="bg-[#F8F9FA] rounded-2xl border border-stone-200/80 p-4 flex items-center gap-3 mt-2">
              <div className="w-9 h-9 rounded-xl bg-[#18181B] text-[#F5D103] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="text-xs">
                <span className="font-bold text-[#18181B] block">FreshMart 100% Freshness Promise</span>
                <span className="text-[#737A72]">
                  If you are not delighted with your produce freshness, we refund or replace with no hassle.
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Product Metadata, Pricing & Order CTAs (lg:col-span-6) */}
          <div className="lg:col-span-6 flex flex-col items-start">
            {/* Category and Origin */}
            <div className="flex flex-wrap items-center gap-2 mb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#92400E] bg-amber-100/70 border border-amber-200/60 px-2 py-0.5 rounded-md">
                {product.categoryLabel}
              </span>
              {product.origin && (
                <span className="text-xs text-stone-600 flex items-center gap-1 font-medium">
                  <MapPin className="w-3.5 h-3.5 text-[#B45309]" />
                  <span>Harvested in {product.origin}</span>
                </span>
              )}
            </div>

            {/* Product Headline */}
            <h1 className="font-serif-heading font-bold text-3xl sm:text-4xl lg:text-[40px] text-[#18181B] leading-[1.18] mb-3">
              {product.name}
            </h1>

            {/* Star Rating and Customer Reviews Count */}
            <div className="flex items-center gap-3 text-xs mb-5">
              <div className="flex items-center gap-1 text-amber-500 font-bold bg-amber-50 px-2.5 py-1 rounded-lg">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span className="text-[#18181B]">{product.rating}</span>
                <span className="text-stone-400 font-normal">/ 5.0</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('reviews')}
                className="text-[#B45309] hover:underline font-semibold cursor-pointer"
              >
                {product.reviewsCount} Verified Customer Reviews
              </button>
            </div>

            {/* Price Presentation */}
            <div className="flex items-baseline gap-3 mb-4 bg-white p-4 rounded-2xl border border-stone-200/80 w-full shadow-2xs">
              <span className="font-serif-heading font-bold text-3xl sm:text-4xl text-[#18181B]">
                £{product.price.toFixed(2)}
              </span>
              <span className="text-sm font-semibold text-[#737A72]">
                per {product.unit}
              </span>
              {product.originalPrice && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-sm text-stone-400 line-through">
                    £{product.originalPrice.toFixed(2)}
                  </span>
                  <span className="text-xs font-extrabold px-2 py-0.5 rounded-md bg-[#F5D103] text-[#18181B]">
                    SAVE £{(product.originalPrice - product.price).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Stock & Delivery Window Info */}
            <div className="w-full space-y-2 mb-6">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#B45309]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>In Stock &amp; Freshly Selected for You</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#737A72]">
                <Clock className="w-4 h-4 text-stone-400 shrink-0" />
                <span>Order within the next 45 mins for delivery today in Hatfield (AL10)</span>
              </div>
            </div>

            {/* Product Description */}
            <p className="text-sm sm:text-base text-[#18181B]/80 leading-relaxed mb-6">
              {product.description}
            </p>

            {/* Quantity Selector & Add to Basket Button */}
            <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-4 pb-6 border-y border-stone-200/80">
              {/* Stepper */}
              <div className="flex items-center justify-between bg-white rounded-2xl border border-stone-300 p-1.5 shadow-2xs sm:w-36">
                <button
                  type="button"
                  onClick={() => {
                    if (quantity > 1) {
                      setQuantity(quantity - 1);
                      soundEffects.playQuantityChange(false);
                    }
                  }}
                  className="w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 text-[#18181B] flex items-center justify-center font-bold transition-colors cursor-pointer"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-sm font-bold text-[#18181B] px-3">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setQuantity(quantity + 1);
                    soundEffects.playQuantityChange(true);
                  }}
                  className="w-9 h-9 rounded-xl bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] flex items-center justify-center font-bold transition-colors cursor-pointer"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Main Add to Basket Button */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={handleAddToCart}
                className="flex-1 py-3.5 px-6 rounded-2xl bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] text-sm sm:text-base font-extrabold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer btn-magnetic group"
              >
                <ShoppingCart className="w-5 h-5 text-[#18181B] group-hover:scale-110 transition-transform" />
                <span>Add {quantity > 1 ? `${quantity} Items` : 'to Basket'}</span>
                <span className="text-xs font-bold text-[#18181B]/80 ml-1">
                  • £{(product.price * quantity).toFixed(2)}
                </span>
              </motion.button>

              {/* Wishlist Button on Desktop */}
              <button
                type="button"
                onClick={() => toggleWishlist(product.id)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-center ${
                  isFavorited
                    ? 'bg-rose-50 border-rose-200 text-rose-500'
                    : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50 hover:text-stone-900'
                }`}
                aria-label={isFavorited ? 'Remove from wishlist' : 'Save to wishlist'}
                title={isFavorited ? 'Remove from wishlist' : 'Save to wishlist'}
              >
                <Heart className={`w-5 h-5 ${isFavorited ? 'fill-current' : ''}`} />
              </button>
            </div>

            {/* Current in basket reminder */}
            {inCartQty > 0 && (
              <div className="mt-3 text-xs font-semibold text-[#92400E] bg-amber-50 border border-amber-200/60 px-3 py-1.5 rounded-xl">
                ✓ You currently have {inCartQty} in your basket
              </div>
            )}

            {/* 3 Key Trust Perks */}
            <div className="grid grid-cols-3 gap-3 w-full mt-6 pt-2">
              <div className="flex flex-col items-center text-center p-3 rounded-2xl bg-white border border-stone-200/70">
                <Truck className="w-5 h-5 text-[#B45309] mb-1.5" />
                <span className="text-xs font-bold text-[#18181B]">Free Over £50</span>
                <span className="text-[10px] text-[#737A72]">Fast courier drop</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 rounded-2xl bg-white border border-stone-200/70">
                <Leaf className="w-5 h-5 text-[#B45309] mb-1.5" />
                <span className="text-xs font-bold text-[#18181B]">Direct Harvest</span>
                <span className="text-[10px] text-[#737A72]">Zero air-miles</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 rounded-2xl bg-white border border-stone-200/70">
                <RotateCcw className="w-5 h-5 text-[#B45309] mb-1.5" />
                <span className="text-xs font-bold text-[#18181B]">Easy Returns</span>
                <span className="text-[10px] text-[#737A72]">100% money back</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Deep Dive Specification Tabs (Overview, Nutrition, Sourcing, Reviews) */}
        <section className="mt-14 sm:mt-20 bg-white rounded-3xl border border-stone-200/80 p-6 sm:p-10 shadow-xs">
          {/* Tab Navigation Header */}
          <div className="flex items-center gap-2 sm:gap-6 border-b border-stone-200 pb-4 overflow-x-auto scrollbar-none">
            {[
              { id: 'overview', label: 'Overview & Culinary Use' },
              { id: 'nutrition', label: 'Nutritional Breakdown' },
              { id: 'sourcing', label: 'Sustainable Sourcing' },
              { id: 'reviews', label: `Reviews (${product.reviewsCount})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`py-2 px-3 text-xs sm:text-sm font-bold whitespace-nowrap rounded-xl transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[#18181B] text-[#F5D103] shadow-xs'
                    : 'text-[#737A72] hover:text-[#18181B] hover:bg-stone-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: TIMING.FAST, ease: EASING.EASE_OUT }}
            >
              {/* Tab 1: Overview */}
              {activeTab === 'overview' && (
                <div className="py-6 space-y-4 max-w-3xl">
                  <h3 className="font-serif-heading font-bold text-xl text-[#18181B]">
                    Flavor Profile &amp; Chef Tips
                  </h3>
                  <p className="text-sm text-[#737A72] leading-relaxed">
                    {product.description}
                  </p>
                  {product.storage && (
                    <div className="bg-[#F8F9FA] p-4 rounded-2xl border border-stone-200/80">
                      <h4 className="text-xs font-bold text-[#18181B] uppercase tracking-wider mb-1">
                        Optimal Storage Guidance
                      </h4>
                      <p className="text-xs text-[#737A72] leading-relaxed">
                        {product.storage}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Nutrition */}
              {activeTab === 'nutrition' && (
                <div className="py-6 max-w-2xl">
                  <h3 className="font-serif-heading font-bold text-xl text-[#18181B] mb-3">
                    Nutritional Values (Per 100g / Serving)
                  </h3>
                  {product.nutrition ? (
                    <div className="border border-stone-200 rounded-2xl overflow-hidden divide-y divide-stone-100">
                      <div className="flex justify-between px-4 py-3 bg-stone-50 text-xs font-bold text-[#18181B]">
                        <span>Nutrient</span>
                        <span>Amount</span>
                      </div>
                      <div className="flex justify-between px-4 py-3 text-xs">
                        <span className="text-[#737A72]">Energy / Calories</span>
                        <span className="font-bold text-[#18181B]">{product.nutrition.calories}</span>
                      </div>
                      <div className="flex justify-between px-4 py-3 text-xs">
                        <span className="text-[#737A72]">Carbohydrates</span>
                        <span className="font-bold text-[#18181B]">{product.nutrition.carbs}</span>
                      </div>
                      <div className="flex justify-between px-4 py-3 text-xs">
                        <span className="text-[#737A72]">Protein</span>
                        <span className="font-bold text-[#18181B]">{product.nutrition.protein}</span>
                      </div>
                      <div className="flex justify-between px-4 py-3 text-xs">
                        <span className="text-[#737A72]">Fat</span>
                        <span className="font-bold text-[#18181B]">{product.nutrition.fat}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[#737A72]">
                      Standard nutritional data for this seasonal pantry selection. High in natural vitamins and dietary micronutrients.
                    </p>
                  )}
                </div>
              )}

              {/* Tab 3: Sustainable Sourcing */}
              {activeTab === 'sourcing' && (
                <div className="py-6 max-w-3xl space-y-4">
                  <h3 className="font-serif-heading font-bold text-xl text-[#18181B]">
                    From Soil to Table Without Compromise
                  </h3>
                  <p className="text-sm text-[#737A72] leading-relaxed">
                    {product.sourcing ||
                      `Our ${product.name} is grown in close cooperation with independent growers in ${product.origin || 'the UK'}. By cutting out unnecessary supply chains, your food reaches you up to 4 days fresher than typical supermarkets.`}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="p-4 rounded-2xl bg-[#F0F5EC] border border-[#DCE3D6]">
                      <h4 className="text-xs font-bold text-[#18181B] mb-1">Zero Air-Miles Guarantee</h4>
                      <p className="text-xs text-[#B45309]">
                        Delivered via ground eco-couriers directly from farm gates.
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-stone-200">
                      <h4 className="text-xs font-bold text-[#18181B] mb-1">Eco Packaging</h4>
                      <p className="text-xs text-[#737A72]">
                        Compostable cornstarch wrappers and FSC certified cardboard trays.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Reviews */}
              {activeTab === 'reviews' && (
                <div className="py-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-stone-100 mb-6">
                    <div>
                      <h3 className="font-serif-heading font-bold text-2xl text-[#18181B] flex items-center gap-2">
                        <span>{product.rating}</span>
                        <span className="text-amber-500 flex">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className="w-5 h-5 fill-current" />
                          ))}
                        </span>
                      </h3>
                      <p className="text-xs text-[#737A72]">
                        Based on {product.reviewsCount} verified customer reviews in Hertfordshire
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => showToast('Review form opened for verified purchasers.')}
                      className="px-5 py-2.5 rounded-full bg-[#18181B] text-[#F5D103] text-xs font-bold hover:bg-[#E5A800] transition-colors cursor-pointer self-start sm:self-auto"
                    >
                      Write a Review
                    </button>
                  </div>

                  <div className="space-y-4">
                    {customerReviews.map((rev) => (
                      <div key={rev.id} className="p-4 rounded-2xl bg-[#F8F9FA] border border-stone-200/70">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#18181B]">{rev.name}</span>
                            {rev.verified && (
                              <span className="text-[10px] text-[#92400E] bg-amber-100 border border-amber-200/60 px-1.5 py-0.5 rounded font-bold">
                                Verified Buyer
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-stone-400">{rev.date}</span>
                        </div>
                        <div className="flex text-amber-400 mb-2">
                          {[...Array(rev.rating)].map((_, i) => (
                            <Star key={i} className="w-3.5 h-3.5 fill-current" />
                          ))}
                        </div>
                        <p className="text-xs sm:text-sm text-[#737A72] leading-relaxed">
                          &ldquo;{rev.text}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </section>

        {/* 4. Related Products Section */}
        {relatedProducts.length > 0 && (
          <section className="mt-16 sm:mt-24">
            <div className="flex items-end justify-between mb-8">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#B45309] block mb-1">
                  Frequently Enjoyed Together
                </span>
                <h2 className="font-serif-heading font-bold text-2xl sm:text-3xl text-[#18181B]">
                  You May Also Like
                </h2>
              </div>
              <button
                type="button"
                onClick={() => goToShop({ category: product.category })}
                className="text-xs font-bold text-[#18181B] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>View all in {product.categoryLabel}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
              {relatedProducts.map((rel) => (
                <ProductCard
                  key={rel.id}
                  product={rel}
                  onQuickView={onQuickView}
                  onSelectProduct={(p) => goToProduct(p.id)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
