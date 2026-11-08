import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  ArrowRight,
  Sparkles,
  Truck,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { backdropVariants, drawerRightVariants } from '../motion/variants';

interface CartDrawerProps {
  onCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ onCheckout }) => {
  const {
    items,
    isCartOpen,
    setIsCartOpen,
    updateQuantity,
    removeFromCart,
    subtotal,
    discountAmount,
    deliveryFee,
    total,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
    freeDeliveryThreshold,
    amountNeededForFreeDelivery,
  } = useCart();
  const { isMuted, toggleSound } = useSoundEffects();

  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState('');

  // Body scroll lock & Escape key handling
  useEffect(() => {
    if (!isCartOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsCartOpen(false);
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCartOpen, setIsCartOpen]);

  const handleApplyPromo = (e: React.FormEvent) => {
    e.preventDefault();
    setPromoError('');
    if (!promoInput.trim()) return;

    const success = applyCoupon(promoInput);
    if (!success) {
      setPromoError('Invalid code. Try FRESH20 for 20% off.');
    } else {
      setPromoInput('');
    }
  };

  const deliveryProgressPercent = Math.min(
    100,
    (subtotal / freeDeliveryThreshold) * 100
  );

  return (
    <AnimatePresence>
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Animated Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 bg-black/50 backdrop-blur-xs cursor-pointer"
            onClick={() => setIsCartOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer container */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10 pointer-events-none">
            <motion.div
              variants={drawerRightVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-screen max-w-md bg-white shadow-2xl flex flex-col justify-between pointer-events-auto"
              role="dialog"
              aria-modal="true"
              aria-label="Shopping Basket"
            >
              {/* Header */}
              <div className="p-5 sm:p-6 border-b border-[#E8ECE5] bg-[#F8FAFC]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#18181B] text-[#F5D103] flex items-center justify-center shadow-xs">
                      <ShoppingBag className="w-4 h-4" />
                    </div>
                    <h3 className="font-serif-heading text-xl font-bold text-[#18181B]">
                      Your Fresh Basket
                    </h3>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={toggleSound}
                      className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-colors cursor-pointer"
                      aria-label={isMuted ? 'Enable sound effects' : 'Mute sound effects'}
                      title={isMuted ? 'Sound effects muted (Click to enable)' : 'Sound effects active (Click to mute)'}
                    >
                      {isMuted ? (
                        <VolumeX className="w-4 h-4 text-stone-400" />
                      ) : (
                        <Volume2 className="w-4 h-4 text-[#B45309]" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsCartOpen(false)}
                      className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-colors cursor-pointer"
                      aria-label="Close cart"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Free Delivery Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5 text-[#18181B]">
                      <Truck className="w-3.5 h-3.5 text-[#B45309]" />
                      {amountNeededForFreeDelivery <= 0 ? (
                        <span className="text-[#92400E] font-bold">
                          🎉 You unlocked FREE Delivery!
                        </span>
                      ) : (
                        <span>
                          Add <strong className="text-[#18181B]">£{amountNeededForFreeDelivery.toFixed(2)}</strong> for free delivery
                        </span>
                      )}
                    </span>
                    <span className="text-[#64748B] text-[11px]">
                      Threshold: £{freeDeliveryThreshold.toFixed(2)}
                    </span>
                  </div>

                  <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${deliveryProgressPercent}%` }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                      className="h-full bg-gradient-to-r from-[#18181B] to-[#F8BE17] rounded-full"
                    />
                  </div>
                </div>
              </div>

              {/* Cart Item List */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 divide-y divide-stone-100 scrollbar-none">
                {items.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-16 px-4"
                  >
                    <div className="w-16 h-16 rounded-full bg-[#F1F5F9] text-[#B45309] flex items-center justify-center mx-auto mb-4">
                      <ShoppingBag className="w-8 h-8" />
                    </div>
                    <h4 className="font-serif-heading text-xl font-bold text-[#0B133C] mb-2">
                      Your basket is empty
                    </h4>
                    <p className="text-sm text-[#64748B] mb-6 max-w-xs mx-auto">
                      Explore today&apos;s harvest of farm-fresh fruits, vegetables, and pantry staples.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsCartOpen(false)}
                      className="px-6 py-3 rounded-full bg-[#F5D103] text-[#18181B] text-sm font-bold hover:bg-[#E5A800] transition-all active:scale-95 cursor-pointer shadow-xs"
                    >
                      Start Shopping
                    </button>
                  </motion.div>
                ) : (
                  <AnimatePresence initial={false}>
                    {items.map((item) => (
                      <motion.div
                        key={item.product.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{
                          opacity: 0,
                          x: 25,
                          height: 0,
                          transition: { duration: 0.22, ease: 'easeInOut' },
                        }}
                        className="py-4 flex gap-4 items-center overflow-hidden"
                      >
                        <img
                          src={item.product.image}
                          alt={item.product.name}
                          className="w-16 h-16 rounded-xl object-cover bg-stone-50 border border-stone-100 flex-shrink-0"
                        />

                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-[#0B133C] truncate">
                            {item.product.name}
                          </h4>
                          <p className="text-xs text-[#64748B]">
                            £{item.product.price.toFixed(2)} / {item.product.unit}
                          </p>

                          {/* Stepper */}
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex items-center bg-[#F1F5F9] rounded-lg border border-[#CBD5E1] p-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuantity(item.product.id, item.quantity - 1)
                                }
                                className="w-6 h-6 rounded bg-white text-[#18181B] flex items-center justify-center hover:bg-stone-100 active:scale-90 text-xs transition-transform cursor-pointer shadow-2xs"
                                aria-label="Decrease quantity"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="text-xs font-bold px-2.5 text-[#0B133C]">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuantity(item.product.id, item.quantity + 1)
                                }
                                className="w-6 h-6 rounded bg-[#18181B] text-[#F5D103] flex items-center justify-center active:scale-90 text-xs transition-transform cursor-pointer shadow-2xs"
                                aria-label="Increase quantity"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => removeFromCart(item.product.id)}
                              className="text-stone-400 hover:text-rose-500 p-1 transition-colors cursor-pointer active:scale-90"
                              aria-label="Remove item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-sm font-extrabold text-[#18181B]">
                            £{(item.product.price * item.quantity).toFixed(2)}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>

              {/* Footer with promo code & checkout */}
              {items.length > 0 && (
                <div className="p-5 sm:p-6 border-t border-[#E8ECE5] bg-[#F8FAFC] space-y-4">
                  {/* Promo code field */}
                  {appliedCoupon ? (
                    <div className="flex items-center justify-between bg-amber-50 border border-amber-200/70 px-3 py-2 rounded-xl text-xs">
                      <span className="flex items-center gap-1.5 text-amber-900 font-semibold">
                        <Sparkles className="w-3.5 h-3.5 text-[#B45309]" />
                        Code {appliedCoupon} applied (20% OFF)
                      </span>
                      <button
                        type="button"
                        onClick={removeCoupon}
                        className="text-[#B45309] hover:text-rose-600 font-bold ml-2 cursor-pointer transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleApplyPromo} className="space-y-1">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={promoInput}
                          onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                          placeholder="Promo code (e.g. FRESH20)"
                          className="flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-[#F5D103] uppercase tracking-wider bg-white"
                        />
                        <button
                          type="submit"
                          className="px-4 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 transition-colors active:scale-95 cursor-pointer"
                        >
                          Apply
                        </button>
                      </div>
                      {promoError && (
                        <p className="text-[11px] text-rose-500 font-medium pl-1">
                          {promoError}
                        </p>
                      )}
                    </form>
                  )}

                  {/* Summary Totals */}
                  <div className="space-y-1.5 text-xs text-[#64748B] pt-2 border-t border-stone-200/60">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span className="font-semibold text-[#18181B]">
                        £{subtotal.toFixed(2)}
                      </span>
                    </div>

                    {discountAmount > 0 && (
                      <div className="flex justify-between text-[#92400E] font-semibold">
                        <span>Discount (FRESH20)</span>
                        <span>-£{discountAmount.toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <span>Standard Delivery</span>
                      <span className="font-semibold text-[#18181B]">
                        {deliveryFee === 0 ? (
                          <span className="text-[#92400E] font-bold uppercase text-[10px]">
                            FREE
                          </span>
                        ) : (
                          `£${deliveryFee.toFixed(2)}`
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between text-sm font-extrabold text-[#18181B] pt-2 border-t border-stone-200">
                      <span>Estimated Total</span>
                      <span className="text-base text-[#18181B]">
                        £{total.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Checkout Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsCartOpen(false);
                      onCheckout();
                    }}
                    className="w-full py-3.5 rounded-full bg-[#18181B] hover:bg-[#E5A800] active:scale-[0.98] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all group cursor-pointer"
                  >
                    <span>Proceed to Checkout</span>
                    <ArrowRight className="w-4 h-4 text-[#F8BE17] group-hover:translate-x-1 transition-transform" />
                  </button>

                  <p className="text-[11px] text-center text-[#64748B]">
                    Safe &amp; encrypted 256-bit payment checkout
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
