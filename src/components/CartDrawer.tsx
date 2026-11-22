import React, { useState, useEffect } from 'react';
import { X, Plus, Minus, Trash2, ShoppingBag, ArrowRight, Sparkles, Truck, Volume2, VolumeX, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart, couponReasonText } from '../context/CartContext';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { backdropVariants, drawerRightVariants } from '../motion/variants';
import { useCms } from '../cms/CmsProvider';
import { InlineText, Picture } from '../cms/components';
import { formatMoney, formatGrams } from '../lib/money';
import type { CartWarning } from '../types/api';

interface CartDrawerProps {
  onCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ onCheckout }) => {
  const cms = useCms();
  const {
    cart, items, isCartOpen, setIsCartOpen, updateQuantity, removeFromCart, setSubstitution,
    coupon, applyCoupon, removeCoupon, isUpdating,
  } = useCart();
  const { isMuted, toggleSound } = useSoundEffects();
  const [promoInput, setPromoInput] = useState('');

  useEffect(() => {
    if (!isCartOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsCartOpen(false);
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener('keydown', onKey);
    };
  }, [isCartOpen, setIsCartOpen]);

  const handleApplyPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoInput.trim()) return;
    if (await applyCoupon(promoInput)) setPromoInput('');
  };

  const totals = cart?.totals;
  const delivery = cart?.delivery;
  const threshold = delivery?.freeDeliveryThreshold;
  const needed = delivery?.amountNeededForFreeDelivery?.amount ?? 0;
  const progress = threshold && threshold.amount > 0 ? Math.min(100, ((threshold.amount - needed) / threshold.amount) * 100) : 100;
  const warningsFor = (lineId: string) => (cart?.warnings ?? []).filter((w): w is Extract<CartWarning, { lineId: string }> => 'lineId' in w && w.lineId === lineId);
  const lineFor = (productId: string) => cart?.lines.find((l) => l.product.id === productId);
  const blocking = (cart?.lines ?? []).some((l) => !l.purchasable) || delivery?.minimumBasketMet === false;
  const notDeliverable = cart?.warnings.some((w) => w.code === 'NOT_DELIVERABLE');

  return (
    <AnimatePresence>
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 bg-black/50 backdrop-blur-xs cursor-pointer"
            onClick={() => setIsCartOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10 pointer-events-none">
            <motion.div
              variants={drawerRightVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-screen max-w-md bg-white shadow-2xl flex flex-col justify-between pointer-events-auto"
              role="dialog"
              aria-modal="true"
              aria-label={cms.t('basket.drawer.aria')}
            >
              {/* Header */}
              <div className="p-5 sm:p-6 border-b border-[#E8ECE5] bg-[#F8FAFC]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#18181B] text-[#F5D103] flex items-center justify-center shadow-xs">
                      <ShoppingBag className="w-4 h-4" />
                    </div>
                    <h3 className="font-serif-heading text-xl font-bold text-[#18181B]">{cms.t('basket.drawer.title')}</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={toggleSound}
                      className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-colors cursor-pointer"
                      aria-label={isMuted ? cms.t('global.header.sound_on_aria') : cms.t('global.header.sound_off_aria')}
                    >
                      {isMuted ? <VolumeX className="w-4 h-4 text-stone-400" /> : <Volume2 className="w-4 h-4 text-[#B45309]" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCartOpen(false)}
                      className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-colors cursor-pointer"
                      aria-label={cms.t('basket.drawer.close_aria')}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {threshold && items.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="flex items-center gap-1.5 text-[#18181B]">
                        <Truck className="w-3.5 h-3.5 text-[#B45309]" />
                        {needed <= 0 ? (
                          <span className="text-[#92400E] font-bold">{cms.t('basket.drawer.free_unlocked')}</span>
                        ) : (
                          <span><InlineText text={cms.t('basket.drawer.free_progress', { amount: formatMoney(delivery!.amountNeededForFreeDelivery) })} strongClass="text-[#18181B]" /></span>
                        )}
                      </span>
                      <span className="text-[#64748B] text-[11px]">{cms.t('basket.drawer.threshold', { amount: formatMoney(threshold) })}</span>
                    </div>
                    <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                        className="h-full bg-gradient-to-r from-[#18181B] to-[#F8BE17] rounded-full"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Lines */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 divide-y divide-stone-100 scrollbar-none" data-lenis-prevent="true">
                {items.length === 0 ? (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-16 px-4">
                    <div className="w-16 h-16 rounded-full bg-[#F1F5F9] text-[#B45309] flex items-center justify-center mx-auto mb-4">
                      <ShoppingBag className="w-8 h-8" />
                    </div>
                    <h4 className="font-serif-heading text-xl font-bold text-[#0B133C] mb-2">{cms.t('basket.drawer.empty_title')}</h4>
                    <p className="text-sm text-[#64748B] mb-6 max-w-xs mx-auto">{cms.t('basket.drawer.empty_text')}</p>
                    <button
                      type="button"
                      onClick={() => setIsCartOpen(false)}
                      className="px-6 py-3 rounded-full bg-[#F5D103] text-[#18181B] text-sm font-bold hover:bg-[#E5A800] transition-all active:scale-95 cursor-pointer shadow-xs"
                    >
                      {cms.t('basket.drawer.empty_button')}
                    </button>
                  </motion.div>
                ) : (
                  <AnimatePresence initial={false}>
                    {items.map((item) => {
                      const line = lineFor(item.product.id);
                      const isWeight = item.product.saleUnit === 'weight';
                      const atMax = item.product.maxPerOrder != null && !isWeight && item.quantity >= item.product.maxPerOrder;
                      return (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, x: 25, height: 0, transition: { duration: 0.22, ease: 'easeInOut' } }}
                          className="py-4 flex gap-4 items-start overflow-hidden"
                        >
                          <Picture image={item.product.image} alt={item.product.name} className={`w-16 h-16 rounded-xl object-cover bg-stone-50 border border-stone-100 flex-shrink-0 ${line?.purchasable === false ? 'opacity-50' : ''}`} />
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-[#0B133C] truncate">{item.product.name}</h4>
                            <p className="text-xs text-[#64748B]">
                              {formatMoney(item.unitPrice)} {isWeight ? cms.t('global.common.per_kg_short') : cms.t('global.common.per_pack', { pack: item.product.packSize })}
                            </p>
                            {line?.purchasable === false && <p className="text-[11px] font-bold text-rose-600 mt-0.5">{cms.t('basket.drawer.unavailable')}</p>}
                            {warningsFor(item.id).map((w, i) => (
                              <p key={i} className="text-[11px] font-semibold text-[#B45309] mt-0.5 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {w.code === 'LOW_STOCK' ? cms.t('basket.drawer.warning_low_stock')
                                  : w.code === 'INSUFFICIENT_STOCK' ? cms.t('basket.drawer.warning_insufficient', { available: w.details.available ?? (w.details.availableGrams != null ? formatGrams(w.details.availableGrams) : 0) })
                                  : w.code === 'MAX_PER_ORDER' ? cms.t('basket.drawer.warning_max', { max: w.details.max })
                                  : null}
                              </p>
                            ))}
                            {item.isEstimate && <p className="text-[11px] text-stone-500 mt-0.5">{cms.t('basket.drawer.estimate_note')}</p>}
                            <div className="flex items-center gap-2 mt-2">
                              <div className="flex items-center bg-[#F1F5F9] rounded-lg border border-[#CBD5E1] p-0.5">
                                <button
                                  type="button"
                                  onClick={() => void updateQuantity(item.product.id, item.quantity - 1)}
                                  className="w-6 h-6 rounded bg-white text-[#18181B] flex items-center justify-center hover:bg-stone-100 active:scale-90 text-xs transition-transform cursor-pointer shadow-2xs"
                                  aria-label={cms.t('global.common.decrease_aria')}
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="text-xs font-bold px-2.5 text-[#0B133C] min-w-[2.5rem] text-center">
                                  {isWeight ? formatGrams(item.weightGrams ?? 0) : item.quantity}
                                </span>
                                <button
                                  type="button"
                                  disabled={atMax || line?.purchasable === false}
                                  onClick={(e) => void updateQuantity(item.product.id, item.quantity + 1, e.currentTarget)}
                                  className="w-6 h-6 rounded bg-[#18181B] text-[#F5D103] flex items-center justify-center active:scale-90 text-xs transition-transform cursor-pointer shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                                  aria-label={cms.t('global.common.increase_aria')}
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => void removeFromCart(item.product.id)}
                                className="text-stone-400 hover:text-rose-500 p-1 transition-colors cursor-pointer active:scale-90"
                                aria-label={cms.t('basket.drawer.remove_aria', { name: item.product.name })}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <label className="mt-2 flex items-center gap-2 text-[11px] text-stone-600 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={item.substitutionAllowed}
                                onChange={(e) => void setSubstitution(item.product.id, e.target.checked)}
                                className="w-3.5 h-3.5 rounded accent-[#F5D103] cursor-pointer"
                              />
                              <span>{cms.t('basket.drawer.substitute')}</span>
                            </label>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-extrabold text-[#18181B]">{formatMoney(item.lineTotal)}</span>
                            {line && line.discount.amount > 0 && (
                              <span className="block text-[11px] text-stone-400 line-through">{formatMoney(line.lineSubtotal)}</span>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>

              {/* Footer */}
              {items.length > 0 && totals && delivery && (
                <div className="p-5 sm:p-6 border-t border-[#E8ECE5] bg-[#F8FAFC] space-y-4">
                  {coupon ? (
                    <div className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs border ${coupon.status === 'applied' ? 'bg-amber-50 border-amber-200/70' : 'bg-stone-50 border-stone-200'}`}>
                      <span className={`flex items-center gap-1.5 font-semibold ${coupon.status === 'applied' ? 'text-amber-900' : 'text-stone-600'}`}>
                        <Sparkles className="w-3.5 h-3.5 text-[#B45309] shrink-0" />
                        {coupon.status === 'applied'
                          ? cms.t('basket.drawer.promo_applied', { code: coupon.code })
                          : cms.t('basket.drawer.promo_saved', { code: coupon.code, reason: couponReasonText(cms, coupon) })}
                      </span>
                      <button type="button" onClick={() => void removeCoupon()} className="text-[#B45309] hover:text-rose-600 font-bold ml-2 cursor-pointer transition-colors shrink-0">
                        {cms.t('basket.drawer.promo_remove')}
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleApplyPromo} className="flex gap-2">
                      <input
                        type="text"
                        value={promoInput}
                        onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                        placeholder={cms.t('basket.drawer.promo_placeholder')}
                        aria-label={cms.t('basket.drawer.promo_placeholder')}
                        className="flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-[#F5D103] uppercase tracking-wider bg-white"
                      />
                      <button type="submit" disabled={isUpdating} className="px-4 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 transition-colors active:scale-95 cursor-pointer disabled:opacity-60">
                        {cms.t('basket.drawer.promo_apply')}
                      </button>
                    </form>
                  )}

                  <div className="space-y-1.5 text-xs text-[#64748B] pt-2 border-t border-stone-200/60">
                    <div className="flex justify-between">
                      <span>{cms.t('basket.drawer.subtotal')}</span>
                      <span className="font-semibold text-[#18181B]">{formatMoney(totals.itemsSubtotal)}</span>
                    </div>
                    {cart!.appliedPromotions.filter((p) => p.type !== 'free_delivery').map((p) => (
                      <div key={p.promotionId} className="flex justify-between text-[#92400E] font-semibold">
                        <span className="truncate pr-2">{p.label}</span>
                        <span>-{formatMoney(p.discount)}</span>
                      </div>
                    ))}
                    {totals.depositTotal.amount > 0 && (
                      <div className="flex justify-between">
                        <span>{cms.t('basket.drawer.deposit')}</span>
                        <span className="font-semibold text-[#18181B]">{formatMoney(totals.depositTotal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>{delivery.isEstimate ? cms.t('basket.drawer.delivery_estimate') : cms.t('basket.drawer.delivery')}</span>
                      <span className="font-semibold text-[#18181B]">
                        {totals.deliveryFee.amount === 0 ? <span className="text-[#92400E] font-bold uppercase text-[10px]">{cms.t('basket.drawer.free')}</span> : formatMoney(totals.deliveryFee)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-extrabold text-[#18181B] pt-2 border-t border-stone-200">
                      <span>{cms.t('basket.drawer.total')}</span>
                      <span className="text-base text-[#18181B]">{formatMoney(totals.total)}</span>
                    </div>
                    <p className="text-[10.5px] text-stone-400">{cms.t('basket.drawer.vat_note')}</p>
                  </div>

                  {delivery.minimumBasketMet === false && delivery.minimumBasket && (
                    <p className="text-[11px] font-semibold text-[#B45309]">{cms.t('basket.drawer.minimum_not_met', { amount: formatMoney(delivery.minimumBasket) })}</p>
                  )}
                  {notDeliverable && cart?.postcode && (
                    <p className="text-[11px] font-semibold text-rose-600">{cms.t('basket.drawer.warning_not_deliverable', { postcode: cart.postcode })}</p>
                  )}

                  <button
                    type="button"
                    disabled={blocking}
                    onClick={() => {
                      setIsCartOpen(false);
                      onCheckout();
                    }}
                    className="w-full py-3.5 rounded-full bg-[#18181B] hover:bg-[#E5A800] active:scale-[0.98] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>{cms.t('basket.drawer.checkout')}</span>
                    <ArrowRight className="w-4 h-4 text-[#F8BE17] group-hover:translate-x-1 transition-transform" />
                  </button>
                  <p className="text-[11px] text-center text-[#64748B]">{cms.t('basket.drawer.secure_note')}</p>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
