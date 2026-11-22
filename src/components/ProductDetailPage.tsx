import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Heart, Plus, Minus, ShoppingCart, Star, MapPin, Leaf, ShieldCheck, CheckCircle2, Clock, Share2, AlertTriangle } from 'lucide-react';
import { TIMING, EASING } from '../motion';
import { ProductCard } from './ProductCard';
import { ProductCardSkeleton } from './ProductShelf';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useNavigation } from '../context/NavigationContext';
import { useAuth } from '../context/AuthContext';
import type { Product } from '../types';
import type { Allergen, ProductDetail } from '../types/api';
import { soundEffects } from '../utils/soundEffects';
import { useProduct, useProductReviews, useRelatedProducts } from '../lib/catalogue';
import { useDeliverySlots } from '../lib/delivery';
import { formatMoney } from '../lib/money';
import { rpc } from '../lib/api';
import { useCms } from '../cms/CmsProvider';
import { InlineText, Picture } from '../cms/components';
import { CmsIcon } from '../cms/icons';
import { useErrorMessage, useSeo } from '../cms/hooks';
import { AvailabilityNote, ProductPrice, amountLabel } from './product/ProductPrice';

interface ProductDetailPageProps {
  productId: string | null;
  onQuickView: (product: Product) => void;
}

type Tab = 'overview' | 'food' | 'sourcing' | 'reviews';
const NUTRIENTS = ['energy', 'fat', 'saturates', 'carbohydrate', 'sugars', 'fibre', 'protein', 'salt'] as const;
const monthYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const FoodInformation: React.FC<{ product: ProductDetail }> = ({ product }) => {
  const cms = useCms();
  const info = product.foodInfo;
  const allergenName = (a: Allergen) => {
    const v = cms.lookup(`product.food_info.allergen_${a}`);
    return typeof v === 'string' ? v : a;
  };
  if (!info) return null;
  const n = info.nutrition;
  const value = (k: (typeof NUTRIENTS)[number]): string | null => {
    if (!n) return null;
    if (k === 'energy') return n.energyKj == null && n.energyKcal == null ? null : [n.energyKj != null ? `${n.energyKj} kJ` : null, n.energyKcal != null ? `${n.energyKcal} kcal` : null].filter(Boolean).join(' / ');
    const v = n[k];
    return v == null ? null : `${v} g`;
  };
  return (
    <div className="py-6 max-w-2xl space-y-6">
      {!info.isComplete && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200/70 text-xs text-[#92400E]" role="note">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{cms.t('product.food_info.incomplete')}</span>
        </div>
      )}
      {info.ingredients && (
        <div>
          <h4 className="text-xs font-bold text-[#18181B] uppercase tracking-wider mb-1">{cms.t('product.food_info.ingredients')}</h4>
          <p className="text-sm text-[#737A72] leading-relaxed">{info.ingredients}</p>
        </div>
      )}
      <div>
        <h4 className="text-xs font-bold text-[#18181B] uppercase tracking-wider mb-1">{cms.t('product.food_info.allergens')}</h4>
        {info.allergens.contains.length === 0 && info.allergens.mayContain.length === 0 ? (
          info.allergensReviewed && <p className="text-sm text-[#737A72]">{cms.t('product.food_info.no_allergens')}</p>
        ) : (
          <div className="text-sm text-[#737A72] space-y-1">
            {info.allergens.contains.length > 0 && (
              <p><span className="font-semibold text-[#18181B]">{cms.t('product.food_info.contains')}</span> <strong>{info.allergens.contains.map(allergenName).join(', ')}</strong></p>
            )}
            {info.allergens.mayContain.length > 0 && (
              <p><span className="font-semibold text-[#18181B]">{cms.t('product.food_info.may_contain')}</span> {info.allergens.mayContain.map(allergenName).join(', ')}</p>
            )}
          </div>
        )}
      </div>
      {n && (
        <div>
          <h4 className="text-xs font-bold text-[#18181B] uppercase tracking-wider mb-2">{cms.t('product.food_info.nutrition')}</h4>
          <table className="w-full border border-stone-200 rounded-2xl overflow-hidden text-xs">
            <thead>
              <tr className="bg-stone-50 text-[#18181B]">
                <th className="text-left font-bold px-4 py-3" scope="col"><span className="sr-only">{cms.t('product.food_info.nutrition')}</span></th>
                <th className="text-right font-bold px-4 py-3" scope="col">{n.basis === 'per_100ml' ? cms.t('product.food_info.per_100ml') : cms.t('product.food_info.per_100g')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {NUTRIENTS.map((k) => {
                const v = value(k);
                if (v == null) return null;
                return (
                  <tr key={k}>
                    <th scope="row" className={`text-left font-normal px-4 py-2.5 text-[#737A72] ${k === 'saturates' || k === 'sugars' ? 'pl-8' : ''}`}>{cms.t(`product.food_info.${k}`)}</th>
                    <td className="text-right px-4 py-2.5 font-bold text-[#18181B]">{v}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {(info.countryOfOrigin || info.foodBusinessOperator) && (
        <dl className="text-xs text-[#737A72] grid grid-cols-1 sm:grid-cols-2 gap-3">
          {info.countryOfOrigin && <div><dt className="font-bold text-[#18181B]">{cms.t('product.food_info.country')}</dt><dd>{info.countryOfOrigin}</dd></div>}
          {info.foodBusinessOperator && <div><dt className="font-bold text-[#18181B]">{cms.t('product.food_info.operator')}</dt><dd>{info.foodBusinessOperator.name}, {info.foodBusinessOperator.address}</dd></div>}
        </dl>
      )}
    </div>
  );
};

const ReviewForm: React.FC<{ productId: string; onDone: () => void }> = ({ productId, onDone }) => {
  const cms = useCms();
  const errorMessage = useErrorMessage();
  const { showToast } = useCart();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  return (
    <form
      className="p-4 rounded-2xl border border-stone-200 bg-white space-y-3 mb-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setSending(true);
        try {
          await rpc('submit_review', { p_product_id: productId, p_rating: rating, p_body: body.trim() });
          showToast(cms.t('product.reviews.form_thanks'));
          onDone();
        } catch (err) {
          showToast(errorMessage(err));
        } finally {
          setSending(false);
        }
      }}
    >
      <h4 className="font-bold text-sm text-[#18181B]">{cms.t('product.reviews.form_title')}</h4>
      <fieldset>
        <legend className="text-xs font-semibold text-[#18181B] mb-1">{cms.t('product.reviews.form_rating')}</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} aria-label={cms.t('product.reviews.star_aria', { count: n })} aria-pressed={rating === n} className="cursor-pointer">
              <Star className={`w-6 h-6 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-stone-300'}`} />
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="text-xs font-semibold text-[#18181B]">{cms.t('product.reviews.form_body')}</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={4} className="mt-1 w-full text-sm p-3 rounded-xl border border-stone-200 focus:outline-none focus:border-[#F5D103]" />
      </label>
      <button type="submit" disabled={sending || !body.trim()} className="px-5 py-2.5 rounded-full bg-[#18181B] text-[#F5D103] text-xs font-bold cursor-pointer disabled:opacity-50">
        {cms.t('product.reviews.form_submit')}
      </button>
    </form>
  );
};

/** "Email me when it is back" / "Email me if the price drops" (signed-in customers). */
const ProductAlerts: React.FC<{ productId: string; soldOut: boolean }> = ({ productId, soldOut }) => {
  const cms = useCms();
  const errorMessage = useErrorMessage();
  const { isCustomer } = useAuth();
  const { goToAccount } = useNavigation();
  const { showToast } = useCart();
  const set = async (kind: 'back_in_stock' | 'price_drop') => {
    if (!isCustomer) return goToAccount('sign-in');
    try {
      await rpc('create_product_alert', { p_product_id: productId, p_kind: kind });
      showToast(cms.t('product.main.alert_set'));
    } catch (err) {
      showToast(errorMessage(err));
    }
  };
  return (
    <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold">
      {soldOut && <button type="button" onClick={() => void set('back_in_stock')} className="text-[#B45309] hover:underline cursor-pointer" title={isCustomer ? undefined : cms.t('product.main.alert_sign_in')}>{cms.t('product.main.notify_stock')}</button>}
      <button type="button" onClick={() => void set('price_drop')} className="text-stone-600 hover:underline cursor-pointer" title={isCustomer ? undefined : cms.t('product.main.alert_sign_in')}>{cms.t('product.main.notify_price')}</button>
    </div>
  );
};

export const ProductDetailPage: React.FC<ProductDetailPageProps> = ({ productId, onQuickView }) => {
  const cms = useCms();
  const { quantityOf, addToCart, showToast, cart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { goToHome, goToShop, goToProduct, goToAccount } = useNavigation();
  const { isCustomer } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const { data: product, isLoading, isError, error } = useProduct(productId);
  const { data: related = [], isLoading: relatedLoading } = useRelatedProducts(product?.id, 4);
  const { data: reviews } = useProductReviews(product?.id);
  const { data: slots = [] } = useDeliverySlots(cart?.zone ? cart.postcode : null, 2);
  const nextSlot = slots.find((s) => s.availability !== 'full');

  useSeo('product', product ? { title: product.name, description: product.description?.slice(0, 160), image: product.image?.url ?? null } : undefined);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setQuantity(1);
    setSelectedImageIndex(0);
    setActiveTab('overview');
    setShowReviewForm(false);
  }, [productId]);

  if (isLoading) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 pt-12 grid grid-cols-1 lg:grid-cols-12 gap-8 animate-pulse" aria-busy="true">
        <div className="lg:col-span-6 aspect-square rounded-3xl bg-stone-100" />
        <div className="lg:col-span-6 space-y-4">
          <div className="h-4 w-24 bg-stone-100 rounded" />
          <div className="h-10 w-3/4 bg-stone-100 rounded" />
          <div className="h-20 w-full bg-stone-100 rounded-2xl" />
          <div className="h-24 w-full bg-stone-100 rounded" />
        </div>
      </div>
    );
  }

  if (!product || isError) {
    const notFound = !product || (error as { code?: string } | null)?.code === 'PRODUCT_NOT_FOUND';
    return (
      <div className="w-full bg-white min-h-[60vh] flex items-center justify-center py-20 px-4">
        <div className="bg-white rounded-3xl border border-stone-200 p-8 sm:p-12 text-center max-w-md shadow-sm">
          <div className="w-16 h-16 rounded-full bg-[#F8F9FA] text-[#B45309] flex items-center justify-center mx-auto mb-4">
            <Leaf className="w-8 h-8" />
          </div>
          <h2 className="font-serif-heading font-bold text-2xl text-[#18181B] mb-2">{notFound ? cms.t('product.main.not_found_title') : cms.t('global.common.load_failed_title')}</h2>
          <p className="text-xs sm:text-sm text-[#737A72] mb-6">{notFound ? cms.t('product.main.not_found_text') : cms.t('global.common.load_failed_body')}</p>
          <button type="button" onClick={() => goToShop()} className="px-6 py-3 rounded-full bg-[#18181B] text-[#F5D103] text-xs font-bold hover:bg-[#E5A800] transition-colors cursor-pointer">
            {cms.t('product.main.not_found_button')}
          </button>
        </div>
      </div>
    );
  }

  const isFavorited = isInWishlist(product.id);
  const inCart = quantityOf(product.id);
  const gallery = product.gallery.length ? product.gallery : product.image ? [product.image] : [];
  const soldOut = product.availability === 'out_of_stock';
  const max = product.saleUnit === 'each' ? Math.max(1, (product.maxPerOrder ?? 50) - inCart) : 50;
  const lineAmount = product.saleUnit === 'weight'
    ? Math.round((product.price.amount * ((product.minWeightGrams ?? 1000) + (quantity - 1) * (product.weightStepGrams ?? 1000))) / 1000)
    : product.price.amount * quantity;
  const reviewCount = reviews?.summary.count ?? product.rating.count;

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: product.name, url: window.location.href }).catch(() => {});
    } else {
      void navigator.clipboard.writeText(window.location.href);
      showToast(cms.t('product.main.link_copied'));
    }
  };

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'overview', label: cms.t('product.tabs.overview'), show: true },
    { id: 'food', label: cms.t('product.tabs.food_info'), show: product.isFood && !!product.foodInfo },
    { id: 'sourcing', label: cms.t('product.tabs.sourcing'), show: true },
    { id: 'reviews', label: cms.t('product.tabs.reviews', { count: reviewCount }), show: true },
  ];

  return (
    <div className="w-full bg-white min-h-screen pb-24 animate-fadeIn">
      <div className="border-b border-stone-200/80 bg-white py-3.5 px-4 sm:px-6 lg:px-10">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 flex items-center justify-between">
          <nav aria-label={cms.t('shop.header.crumb_aria')} className="flex items-center gap-2 text-xs text-[#737A72] truncate">
            <button type="button" onClick={goToHome} className="hover:text-[#B45309] transition-colors cursor-pointer">{cms.t('product.main.crumb_home')}</button>
            <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <button type="button" onClick={() => goToShop()} className="hover:text-[#B45309] transition-colors cursor-pointer">{cms.t('product.main.crumb_catalogue')}</button>
            <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <button type="button" onClick={() => goToShop({ category: product.category.slug })} className="hover:text-[#B45309] transition-colors cursor-pointer truncate">{product.category.name}</button>
            <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <span className="text-[#18181B] font-bold truncate" aria-current="page">{product.name}</span>
          </nav>
          <button type="button" onClick={handleShare} className="hidden sm:flex items-center gap-1.5 text-xs text-[#737A72] hover:text-[#B45309] transition-colors cursor-pointer shrink-0 ml-4">
            <Share2 className="w-3.5 h-3.5" />
            <span>{cms.t('product.main.share')}</span>
          </button>
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 pt-8 sm:pt-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Gallery */}
          <div className="lg:col-span-6 flex flex-col gap-4">
            <div className="relative w-full aspect-square rounded-3xl bg-white border border-stone-200/90 overflow-hidden shadow-sm flex items-center justify-center group">
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedImageIndex}
                  initial={{ opacity: 0.6, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0.6, scale: 0.98 }}
                  transition={{ duration: TIMING.FAST, ease: EASING.EASE_OUT }}
                  className="w-full h-full"
                >
                  <Picture image={gallery[selectedImageIndex] ?? null} alt={product.name} className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 will-change-transform ${soldOut ? 'opacity-60' : ''}`} />
                </motion.div>
              </AnimatePresence>
              <div className="absolute top-4 left-4 flex flex-col gap-1.5 z-10 pointer-events-none">
                {product.badge && <span className="px-2.5 py-1 rounded-md bg-[#18181B] text-[#F5D103] text-xs font-black uppercase tracking-wider shadow-sm">{product.badge}</span>}
                {product.isOrganic && (
                  <span className="px-2.5 py-1 rounded-md bg-amber-100/90 text-[#92400E] border border-amber-200/60 text-xs font-extrabold uppercase tracking-wider shadow-2xs inline-flex items-center gap-1 backdrop-blur-xs">
                    <Leaf className="w-3 h-3 text-[#B45309]" />
                    <span>{cms.t('global.common.organic')}</span>
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => toggleWishlist(product)}
                className={`absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center shadow-md backdrop-blur-md transition-all active:scale-125 cursor-pointer z-10 ${isFavorited ? 'bg-rose-50 text-rose-500' : 'bg-white/90 text-stone-500 hover:text-stone-900 hover:bg-white'}`}
                aria-label={isFavorited ? cms.t('product.main.wishlist_remove') : cms.t('product.main.wishlist_add')}
                aria-pressed={isFavorited}
              >
                <Heart className={`w-5 h-5 ${isFavorited ? 'fill-current' : ''}`} />
              </button>
            </div>
            {gallery.length > 1 && (
              <div className="flex items-center gap-3 flex-wrap">
                {gallery.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedImageIndex(idx)}
                    className={`w-20 h-20 rounded-2xl bg-white border overflow-hidden flex items-center justify-center cursor-pointer transition-all ${selectedImageIndex === idx ? 'border-[#F5D103] ring-2 ring-[#F5D103]/30 shadow-xs' : 'border-stone-200/80 hover:border-stone-400'}`}
                    aria-label={cms.t('product.main.photo_aria', { number: idx + 1 })}
                    aria-current={selectedImageIndex === idx}
                  >
                    <Picture image={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            {cms.section('product.promise').enabled && (
              <div className="bg-[#F8F9FA] rounded-2xl border border-stone-200/80 p-4 flex items-center gap-3 mt-2">
                <div className="w-9 h-9 rounded-xl bg-[#18181B] text-[#F5D103] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="text-xs">
                  <span className="font-bold text-[#18181B] block">{cms.t('product.promise.title')}</span>
                  <span className="text-[#737A72]">{cms.t('product.promise.text')}</span>
                </div>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="lg:col-span-6 flex flex-col items-start">
            <div className="flex flex-wrap items-center gap-2 mb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#92400E] bg-amber-100/70 border border-amber-200/60 px-2 py-0.5 rounded-md">{product.category.name}</span>
              {product.brand && <span className="text-xs font-semibold text-stone-600">{product.brand.name}</span>}
              {product.origin && (
                <span className="text-xs text-stone-600 flex items-center gap-1 font-medium">
                  <MapPin className="w-3.5 h-3.5 text-[#B45309]" />
                  <span>{cms.t('product.main.origin', { origin: product.origin })}</span>
                </span>
              )}
            </div>
            <h1 className="font-serif-heading font-bold text-3xl sm:text-4xl lg:text-[40px] text-[#18181B] leading-[1.18] mb-3">{product.name}</h1>
            <div className="flex items-center gap-3 text-xs mb-5">
              {product.rating.count > 0 && product.rating.average != null && (
                <div className="flex items-center gap-1 text-amber-500 font-bold bg-amber-50 px-2.5 py-1 rounded-lg">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span className="text-[#18181B]">{product.rating.average.toFixed(1)}</span>
                  <span className="text-stone-400 font-normal">{cms.t('product.main.rating_of')}</span>
                </div>
              )}
              <button type="button" onClick={() => setActiveTab('reviews')} className="text-[#B45309] hover:underline font-semibold cursor-pointer">
                {reviewCount > 0 ? cms.t('product.main.reviews_link', { count: reviewCount }) : cms.t('product.main.no_reviews_link')}
              </button>
            </div>

            <div className="mb-4 bg-white p-4 rounded-2xl border border-stone-200/80 w-full shadow-2xs flex items-center justify-between gap-3">
              <ProductPrice product={product} size="lg" />
              {product.rrp && product.rrp.amount > product.price.amount && (
                <span className="text-xs font-extrabold px-2 py-0.5 rounded-md bg-[#F5D103] text-[#18181B]">
                  {cms.t('global.common.save_amount', { amount: formatMoney({ amount: product.rrp.amount - product.price.amount, currency: product.price.currency }) })}
                </span>
              )}
            </div>
            {product.saleUnit === 'weight' && <p className="text-[11px] text-stone-500 -mt-2 mb-4">{cms.t('global.common.estimated_weight')}</p>}
            {product.ageRestriction && <p className="text-xs font-bold text-rose-700 mb-3">{cms.t('global.common.age_restricted', { age: product.ageRestriction.minAge })}</p>}

            <div className="w-full space-y-2 mb-6">
              {product.availability === 'in_stock' ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-[#B45309]">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{cms.t('product.main.in_stock')}</span>
                </div>
              ) : (
                <AvailabilityNote product={product} />
              )}
              {nextSlot && (
                <div className="flex items-center gap-2 text-xs text-[#737A72]">
                  <Clock className="w-4 h-4 text-stone-400 shrink-0" />
                  <span>{cms.t('product.main.next_slot', { slot: `${nextSlot.dayLabel}, ${nextSlot.timeLabel}` })}</span>
                </div>
              )}
            </div>

            {product.description && <p className="text-sm sm:text-base text-[#18181B]/80 leading-relaxed mb-6">{product.description}</p>}

            <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-4 pb-6 border-y border-stone-200/80">
              <div className="flex items-center justify-between bg-white rounded-2xl border border-stone-300 p-1.5 shadow-2xs sm:w-40">
                <button
                  type="button"
                  onClick={() => { if (quantity > 1) { setQuantity(quantity - 1); soundEffects.playQuantityChange(false); } }}
                  className="w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 text-[#18181B] flex items-center justify-center font-bold transition-colors cursor-pointer"
                  aria-label={cms.t('global.common.decrease_aria')}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-sm font-bold text-[#18181B] px-2 text-center">{amountLabel(product, quantity)}</span>
                <button
                  type="button"
                  disabled={quantity >= max}
                  onClick={() => { setQuantity(quantity + 1); soundEffects.playQuantityChange(true); }}
                  className="w-9 h-9 rounded-xl bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] flex items-center justify-center font-bold transition-colors cursor-pointer disabled:opacity-40"
                  aria-label={cms.t('global.common.increase_aria')}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                disabled={soldOut}
                onClick={(e) => void addToCart(product, quantity, e.currentTarget)}
                className="flex-1 py-3.5 px-6 rounded-2xl bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] text-sm sm:text-base font-extrabold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer btn-magnetic group disabled:bg-stone-200 disabled:text-stone-500 disabled:cursor-not-allowed"
              >
                <ShoppingCart className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span>{soldOut ? cms.t('global.common.out_of_stock') : quantity > 1 && product.saleUnit === 'each' ? cms.t('product.main.add_many', { count: quantity }) : cms.t('product.main.add')}</span>
                {!soldOut && <span className="text-xs font-bold text-[#18181B]/80 ml-1">• {formatMoney({ amount: lineAmount, currency: product.price.currency })}</span>}
              </motion.button>
              <button
                type="button"
                onClick={() => toggleWishlist(product)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-center ${isFavorited ? 'bg-rose-50 border-rose-200 text-rose-500' : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50 hover:text-stone-900'}`}
                aria-label={isFavorited ? cms.t('product.main.wishlist_remove') : cms.t('product.main.wishlist_add')}
                aria-pressed={isFavorited}
              >
                <Heart className={`w-5 h-5 ${isFavorited ? 'fill-current' : ''}`} />
              </button>
            </div>
            <ProductAlerts productId={product.id} soldOut={soldOut} />
            {inCart > 0 && (
              <div className="mt-3 text-xs font-semibold text-[#92400E] bg-amber-50 border border-amber-200/60 px-3 py-1.5 rounded-xl">
                {cms.t('product.main.in_basket', { count: amountLabel(product, inCart) })}
              </div>
            )}

            {cms.section('product.perks').enabled && cms.get('product.perks.items').length > 0 && (
              <div className="grid grid-cols-3 gap-3 w-full mt-6 pt-2">
                {cms.get('product.perks.items').map((p, i) => (
                  <div key={i} className="flex flex-col items-center text-center p-3 rounded-2xl bg-white border border-stone-200/70">
                    <CmsIcon name={p.icon} className="w-5 h-5 text-[#B45309] mb-1.5" />
                    <span className="text-xs font-bold text-[#18181B]">{p.title}</span>
                    <span className="text-[10px] text-[#737A72]">{p.subtitle}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <section className="mt-14 sm:mt-20 bg-white rounded-3xl border border-stone-200/80 p-6 sm:p-10 shadow-xs">
          <div className="flex items-center gap-2 sm:gap-6 border-b border-stone-200 pb-4 overflow-x-auto scrollbar-none" role="tablist">
            {tabs.filter((t) => t.show).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-3 text-xs sm:text-sm font-bold whitespace-nowrap rounded-xl transition-all cursor-pointer ${activeTab === tab.id ? 'bg-[#18181B] text-[#F5D103] shadow-xs' : 'text-[#737A72] hover:text-[#18181B] hover:bg-stone-100'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} role="tabpanel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: TIMING.FAST, ease: EASING.EASE_OUT }}>
              {activeTab === 'overview' && (
                <div className="py-6 space-y-4 max-w-3xl">
                  <h3 className="font-serif-heading font-bold text-xl text-[#18181B]">{cms.t('product.tabs.overview_title')}</h3>
                  <p className="text-sm text-[#737A72] leading-relaxed">{product.description}</p>
                  {product.storage && (
                    <div className="bg-[#F8F9FA] p-4 rounded-2xl border border-stone-200/80">
                      <h4 className="text-xs font-bold text-[#18181B] uppercase tracking-wider mb-1">{cms.t('product.tabs.storage_title')}</h4>
                      <p className="text-xs text-[#737A72] leading-relaxed">{product.storage}</p>
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'food' && <FoodInformation product={product} />}
              {activeTab === 'sourcing' && (
                <div className="py-6 max-w-3xl space-y-4">
                  <h3 className="font-serif-heading font-bold text-xl text-[#18181B]">{cms.t('product.tabs.sourcing_title')}</h3>
                  {product.sourcing && <p className="text-sm text-[#737A72] leading-relaxed">{product.sourcing}</p>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    {cms.get('product.tabs.sourcing_cards').map((c, i) => (
                      <div key={i} className={`p-4 rounded-2xl border ${i === 0 ? 'bg-[#F0F5EC] border-[#DCE3D6]' : 'bg-[#F8F9FA] border-stone-200'}`}>
                        <h4 className="text-xs font-bold text-[#18181B] mb-1">{c.title}</h4>
                        <p className={`text-xs ${i === 0 ? 'text-[#B45309]' : 'text-[#737A72]'}`}>{c.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeTab === 'reviews' && (
                <div className="py-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-stone-100 mb-6">
                    <div>
                      {reviews && reviews.summary.count > 0 && reviews.summary.average != null ? (
                        <>
                          <h3 className="font-serif-heading font-bold text-2xl text-[#18181B] flex items-center gap-2">
                            <span>{reviews.summary.average.toFixed(1)}</span>
                            <span className="text-amber-500 flex" aria-hidden="true">
                              {Array.from({ length: 5 }, (_, i) => <Star key={i} className={`w-5 h-5 ${i < Math.round(reviews.summary.average ?? 0) ? 'fill-current' : ''}`} />)}
                            </span>
                          </h3>
                          <p className="text-xs text-[#737A72]">{cms.t('product.reviews.summary', { count: reviews.summary.count })}</p>
                        </>
                      ) : (
                        <p className="text-sm text-[#737A72]">{cms.t('product.reviews.none')}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => (isCustomer ? setShowReviewForm((v) => !v) : goToAccount())}
                      className="px-5 py-2.5 rounded-full bg-[#18181B] text-[#F5D103] text-xs font-bold hover:bg-[#E5A800] transition-colors cursor-pointer self-start sm:self-auto"
                      title={isCustomer ? undefined : cms.t('product.reviews.form_sign_in')}
                    >
                      {cms.t('product.reviews.write')}
                    </button>
                  </div>
                  {showReviewForm && isCustomer && <ReviewForm productId={product.id} onDone={() => setShowReviewForm(false)} />}
                  <div className="space-y-4">
                    {(reviews?.items ?? []).map((rev) => (
                      <div key={rev.id} className="p-4 rounded-2xl bg-[#F8F9FA] border border-stone-200/70">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#18181B]">{rev.displayName}</span>
                            {rev.isVerified && <span className="text-[10px] text-[#92400E] bg-amber-100 border border-amber-200/60 px-1.5 py-0.5 rounded font-bold">{cms.t('product.reviews.verified')}</span>}
                          </div>
                          <span className="text-[10px] text-stone-400">{monthYear.format(new Date(rev.createdAt))}</span>
                        </div>
                        <div className="flex text-amber-400 mb-2" aria-label={`${rev.rating}/5`}>
                          {Array.from({ length: rev.rating }, (_, i) => <Star key={i} className="w-3.5 h-3.5 fill-current" />)}
                        </div>
                        <p className="text-xs sm:text-sm text-[#737A72] leading-relaxed">&ldquo;{rev.body}&rdquo;</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </section>

        {cms.section('product.related').enabled && (relatedLoading || related.length > 0) && (
          <section className="mt-16 sm:mt-24">
            <div className="flex items-end justify-between mb-8">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#B45309] block mb-1">{cms.t('product.related.eyebrow')}</span>
                <h2 className="font-serif-heading font-bold text-2xl sm:text-3xl text-[#18181B]">{cms.t('product.related.title')}</h2>
              </div>
              <button type="button" onClick={() => goToShop({ category: product.category.slug })} className="text-xs font-bold text-[#18181B] hover:underline flex items-center gap-1 cursor-pointer">
                <span><InlineText text={cms.t('product.related.view_all', { category: product.category.name })} /></span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
              {relatedLoading
                ? Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)
                : related.map((rel) => <ProductCard key={rel.id} product={rel} onQuickView={onQuickView} onSelectProduct={(p) => goToProduct(p.slug)} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
