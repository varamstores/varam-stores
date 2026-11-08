import React, { useState } from 'react';
import { X, CheckCircle2, ShieldCheck, CreditCard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { AnimatedModal } from './transitions/AnimatedModal';
import { soundEffects } from '../utils/soundEffects';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  postalCode: string;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  postalCode,
}) => {
  const { total, items, clearCart } = useCart();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'apple' | 'card'>('apple');
  const [orderRef, setOrderRef] = useState('FM-49821');

  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();
    soundEffects.playOrderSuccess();
    setOrderRef(`FM-${Math.floor(10000 + Math.random() * 90000)}`);
    setIsSubmitted(true);
    setTimeout(() => {
      clearCart();
    }, 1500);
  };

  const handleClose = () => {
    setIsSubmitted(false);
    onClose();
  };

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="max-w-lg"
      className="p-6 sm:p-8"
      ariaLabel="Checkout Dialog"
    >
      <button
        type="button"
        onClick={handleClose}
        className="absolute top-4 right-4 w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center justify-center transition-colors cursor-pointer"
        aria-label="Close checkout"
      >
        <X className="w-4 h-4" />
      </button>

      <AnimatePresence mode="wait">
        {!isSubmitted ? (
          <motion.div
            key="checkout-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-[#18181B] text-[#F5D103] flex items-center justify-center shadow-xs">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h3 className="font-serif-heading text-2xl font-bold text-[#18181B]">
                Complete Your Order
              </h3>
            </div>

            <p className="text-xs text-[#737A72] mb-6">
              Review your delivery slot and preferred payment method.
            </p>

            <div className="bg-[#F8F9FA] p-4 rounded-2xl border border-stone-200 space-y-2 mb-6 text-xs">
              <div className="flex justify-between">
                <span className="text-[#737A72]">Destination:</span>
                <span className="font-bold text-[#0B133C]">{postalCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#737A72]">Delivery Window:</span>
                <span className="font-bold text-[#B45309]">Today, 6:00 PM - 8:00 PM</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#737A72]">Basket Items:</span>
                <span className="font-semibold text-[#0B133C]">{items.length} unique produce</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-stone-200 text-sm font-bold text-[#18181B]">
                <span>Order Total:</span>
                <span>£{total.toFixed(2)}</span>
              </div>
            </div>

            <form onSubmit={handlePlaceOrder} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[#0B133C] block mb-2">
                  Select Payment Method:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('apple')}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer active:scale-98 ${
                      paymentMethod === 'apple'
                        ? 'border-[#F5D103] bg-[#F5D103] text-[#18181B] shadow-xs'
                        : 'border-stone-200 text-[#0B133C] hover:bg-stone-50'
                    }`}
                  >
                    <span> Apple Pay</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer active:scale-98 ${
                      paymentMethod === 'card'
                        ? 'border-[#F5D103] bg-[#F5D103] text-[#18181B] shadow-xs'
                        : 'border-stone-200 text-[#0B133C] hover:bg-stone-50'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Credit / Debit Card</span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-full bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <span>Pay &amp; Place Order (£{total.toFixed(2)})</span>
              </button>

              <p className="text-[11px] text-center text-[#737A72]">
                🔒 256-bit SSL encrypted checkout. No card details stored.
              </p>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="order-confirmed"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="text-center py-6"
          >
            <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 text-[#B45309] flex items-center justify-center mx-auto mb-4 shadow-sm">
              <CheckCircle2 className="w-10 h-10 text-[#B45309]" />
            </div>

            <h3 className="font-serif-heading text-2xl font-bold text-[#18181B] mb-2">
              Order Confirmed!
            </h3>

            <p className="text-sm text-[#737A72] mb-6 max-w-xs mx-auto">
              Your farm-fresh groceries are being picked by our Hertfordshire
              team for delivery to <strong>{postalCode}</strong> today.
            </p>

            <div className="bg-[#F8F9FA] p-4 rounded-2xl border border-stone-200 text-xs text-left mb-6 space-y-1">
              <p>
                <strong>Order Ref:</strong> #{orderRef}
              </p>
              <p>
                <strong>Confirmation email:</strong> Sent with live courier link
              </p>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="px-8 py-3 rounded-full bg-[#F5D103] text-[#18181B] text-xs font-bold hover:bg-[#E5A800] cursor-pointer active:scale-95 transition-all shadow-xs"
            >
              Continue Browsing
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatedModal>
  );
};
