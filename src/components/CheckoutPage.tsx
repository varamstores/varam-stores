import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  Truck,
  CreditCard,
  Lock,
  MapPin,
  Plus,
  Minus,
  Trash2,
  Sparkles,
  Leaf,
  Phone,
  Mail,
  User,
  Printer,
  ShoppingBag
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useNavigation } from '../context/NavigationContext';
import { soundEffects } from '../utils/soundEffects';

interface CheckoutPageProps {
  postalCode?: string;
  onSelectPostalCode?: (code: string) => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({
  postalCode = 'Hatfield, AL10',
  onSelectPostalCode
}) => {
  const {
    items,
    updateQuantity,
    removeFromCart,
    clearCart,
    subtotal,
    discountAmount,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
    freeDeliveryThreshold,
    amountNeededForFreeDelivery
  } = useCart();

  const { goToShop, goToAccount } = useNavigation();

  // Step 1: Customer Contact Details
  const [firstName, setFirstName] = useState('Priya');
  const [lastName, setLastName] = useState('Sharma');
  const [email, setEmail] = useState('priya.sharma@example.co.uk');
  const [phone, setPhone] = useState('07700 900142');
  const [smsUpdates, setSmsUpdates] = useState(true);

  // Step 2: Delivery Address Details
  const [addressLine1, setAddressLine1] = useState('14 College Lane');
  const [addressLine2, setAddressLine2] = useState('Flat 4B');
  const [townCity, setTownCity] = useState('Hatfield');
  const [county, setCounty] = useState('Hertfordshire');
  const [postcode, setPostcode] = useState(
    postalCode.includes('AL10') ? 'AL10 9PJ' : postalCode.split(',')[1]?.trim() || 'AL10 9PJ'
  );
  const [deliveryNotes, setDeliveryNotes] = useState('Please leave in porch if unanswered. Ring bell once.');
  const [isContactless, setIsContactless] = useState(true);

  // Step 3: Delivery Window Slots
  const deliverySlots = [
    {
      id: 'today-eve',
      title: 'Today Evening Express',
      time: '6:00 PM – 8:00 PM',
      badge: 'Fastest',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      price: subtotal >= 50 ? 0 : 2.99,
      note: 'Order before 5:00 PM'
    },
    {
      id: 'tmrw-morn',
      title: 'Tomorrow Morning Fresh',
      time: '8:00 AM – 10:00 AM',
      badge: 'Sunrise Harvest',
      badgeColor: 'bg-amber-100 text-[#92400E] border-amber-200',
      price: subtotal >= 50 ? 0 : 1.99,
      note: 'Harvested at dawn'
    },
    {
      id: 'tmrw-eve',
      title: 'Tomorrow Evening Relaxed',
      time: '6:00 PM – 8:00 PM',
      badge: 'Standard',
      badgeColor: 'bg-stone-100 text-stone-700 border-stone-200',
      price: subtotal >= 50 ? 0 : 1.99,
      note: 'Ideal after work'
    },
    {
      id: 'eco-saver',
      title: 'Green Eco-Saver Slot',
      time: 'Friday, 10:00 AM – 2:00 PM',
      badge: 'Zero Extra CO₂',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      price: 0,
      note: 'Optimized electric van route'
    }
  ];

  const [selectedSlotId, setSelectedSlotId] = useState('today-eve');
  const selectedSlot = deliverySlots.find((s) => s.id === selectedSlotId) || deliverySlots[0];

  // Step 4: Payment Methods
  type PaymentType = 'card' | 'apple' | 'google' | 'cod';
  const [paymentMethod, setPaymentMethod] = useState<PaymentType>('apple');

  // Card fields
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('842');
  const [cardName, setCardName] = useState('Priya Sharma');
  const [saveCard, setSaveCard] = useState(true);

  // Promo code
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoError, setPromoError] = useState('');

  // Processing & Success State
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [orderReference, setOrderReference] = useState('');
  const [placedOrderItems, setPlacedOrderItems] = useState<typeof items>([]);
  const [placedOrderTotal, setPlacedOrderTotal] = useState(0);

  // Financial calculations
  const deliveryFee = selectedSlot.price;
  const grandTotal = Math.max(0, subtotal - discountAmount + deliveryFee);

  const handleApplyPromo = (e: React.FormEvent) => {
    e.preventDefault();
    setPromoError('');
    if (!promoCodeInput.trim()) return;

    const success = applyCoupon(promoCodeInput.trim());
    if (success) {
      setPromoCodeInput('');
    } else {
      setPromoError('Invalid coupon code. Try FRESH20 for 20% off.');
    }
  };

  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    setIsProcessing(true);

    // Simulate high-trust bank authorization handshake
    setTimeout(() => {
      const ref = `FM-${Math.floor(10000 + Math.random() * 90000)}`;
      setOrderReference(ref);
      setPlacedOrderItems([...items]);
      setPlacedOrderTotal(grandTotal);
      soundEffects.playOrderSuccess();
      clearCart();
      setIsProcessing(false);
      setOrderSuccess(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 1200);
  };

  // ---------------------------------------------------------------------------
  // VIEW: ORDER SUCCESS / CONFIRMATION
  // ---------------------------------------------------------------------------
  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] py-8 sm:py-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          {/* Success Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="bg-white rounded-3xl border border-stone-200/90 shadow-xl overflow-hidden"
          >
            {/* Header Banner */}
            <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white p-8 sm:p-10 text-center relative overflow-hidden">
              <div className="w-20 h-20 rounded-full bg-white text-emerald-600 flex items-center justify-center mx-auto mb-4 shadow-lg animate-bounce">
                <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
              </div>

              <span className="inline-block text-xs font-extrabold uppercase tracking-widest bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-white mb-2">
                Order Confirmed &amp; Dispatched to Packing
              </span>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-2">
                Thank you, {firstName}!
              </h1>
              <p className="text-emerald-100 text-sm sm:text-base max-w-md mx-auto">
                Your fresh farm order <span className="font-bold text-white underline underline-offset-4">{orderReference}</span> has been received and scheduled for cold-chain delivery.
              </p>
            </div>

            {/* Live Order Timeline */}
            <div className="p-6 sm:p-8 border-b border-stone-200 bg-emerald-50/40">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-5">
                Live Delivery Tracking
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 relative">
                {/* Step 1: Confirmed */}
                <div className="flex items-start gap-3 sm:flex-col sm:items-center sm:text-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                    ✓
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#18181B]">Order Placed</p>
                    <p className="text-[11px] text-stone-500">Just now</p>
                  </div>
                </div>

                {/* Step 2: Fresh Picking */}
                <div className="flex items-start gap-3 sm:flex-col sm:items-center sm:text-center">
                  <div className="w-8 h-8 rounded-full bg-[#F5D103] text-[#18181B] flex items-center justify-center font-bold text-xs shadow-xs shrink-0 ring-4 ring-amber-100 animate-pulse">
                    <Leaf className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#18181B]">Harvest &amp; Packing</p>
                    <p className="text-[11px] text-stone-500">In chilled hub</p>
                  </div>
                </div>

                {/* Step 3: Van Dispatch */}
                <div className="flex items-start gap-3 sm:flex-col sm:items-center sm:text-center opacity-70">
                  <div className="w-8 h-8 rounded-full bg-stone-200 text-stone-600 flex items-center justify-center font-bold text-xs shrink-0">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-stone-700">Refrigerated Van</p>
                    <p className="text-[11px] text-stone-500">Hatfield route</p>
                  </div>
                </div>

                {/* Step 4: Arrived */}
                <div className="flex items-start gap-3 sm:flex-col sm:items-center sm:text-center opacity-70">
                  <div className="w-8 h-8 rounded-full bg-stone-200 text-stone-600 flex items-center justify-center font-bold text-xs shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-stone-700">Doorstep Delivery</p>
                    <p className="text-[11px] text-stone-500">{selectedSlot.time}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery & Order Details Grid */}
            <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-stone-200">
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/80">
                <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block mb-1">
                  Delivery Destination
                </span>
                <p className="text-sm font-bold text-[#18181B]">{firstName} {lastName}</p>
                <p className="text-xs text-stone-600 mt-0.5">{addressLine1}, {addressLine2}</p>
                <p className="text-xs text-stone-600">{townCity}, {county} {postcode}</p>
                <p className="text-xs text-stone-500 mt-2 font-medium">📞 {phone}</p>
                <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                  {isContactless ? '✓ Contactless delivery requested' : ''}
                </p>
              </div>

              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/80">
                <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block mb-1">
                  Scheduled Delivery Slot
                </span>
                <p className="text-sm font-bold text-[#18181B]">{selectedSlot.title}</p>
                <p className="text-xs font-bold text-[#B45309] mt-0.5">{selectedSlot.time}</p>
                <p className="text-xs text-stone-600 mt-2">
                  Payment Method: <span className="font-bold text-[#18181B] uppercase">{paymentMethod}</span>
                </p>
                <p className="text-xs text-stone-600 mt-0.5">
                  Total Paid: <span className="font-bold text-[#18181B]">£{placedOrderTotal.toFixed(2)}</span>
                </p>
                <p className="text-[11px] text-stone-500 mt-1">
                  Confirmation receipt sent to <span className="font-bold">{email}</span>
                </p>
              </div>
            </div>

            {/* Purchased Items Recap */}
            <div className="p-6 sm:p-8">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-4">
                Items in This Delivery ({placedOrderItems.reduce((acc, i) => acc + i.quantity, 0)})
              </h3>

              <div className="divide-y divide-stone-100 max-h-60 overflow-y-auto">
                {placedOrderItems.map((item) => (
                  <div key={item.product.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={item.product.image}
                        alt={item.product.name}
                        className="w-12 h-12 rounded-xl object-cover bg-stone-100 border border-stone-200 shrink-0"
                      />
                      <div>
                        <p className="text-xs font-bold text-[#18181B]">{item.product.name}</p>
                        <p className="text-[11px] text-stone-500">
                          Qty: {item.quantity} · £{item.product.price.toFixed(2)} / {item.product.unit}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-extrabold text-[#18181B]">
                      £{(item.product.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="p-6 sm:p-8 bg-[#F8FAFC] border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 text-xs font-bold text-stone-600 hover:text-[#18181B] py-2.5 px-4 rounded-xl border border-stone-300 hover:bg-white transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Order Receipt</span>
              </button>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => goToAccount()}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 text-xs font-bold text-stone-800 bg-white hover:bg-stone-100 py-3 px-5 rounded-full border border-stone-200 shadow-2xs transition-all cursor-pointer"
                >
                  <User className="w-4 h-4" />
                  <span>View in My Account</span>
                </button>

                <button
                  type="button"
                  onClick={() => goToShop()}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 text-xs font-extrabold text-[#18181B] bg-[#F5D103] hover:bg-[#E5A800] py-3 px-6 rounded-full shadow-md transition-all cursor-pointer hover:scale-102"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Continue Shopping</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // VIEW: EMPTY BASKET FALLBACK
  // ---------------------------------------------------------------------------
  if (items.length === 0) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center px-4 py-16 bg-[#F8FAFC]">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 sm:p-10 border border-stone-200/90 shadow-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-[#B45309] flex items-center justify-center mx-auto mb-4 border border-amber-200/60 shadow-2xs">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-extrabold text-[#18181B] mb-2 tracking-tight">
            Your Basket is Empty
          </h2>
          <p className="text-sm text-stone-600 mb-6 leading-relaxed">
            Fill your basket with fresh farm vegetables, aromatic Indian spices, and pantry essentials to proceed with checkout.
          </p>
          <button
            type="button"
            onClick={() => goToShop({ category: 'all' })}
            className="w-full py-3.5 px-6 rounded-full bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] font-extrabold text-sm shadow-md transition-all cursor-pointer"
          >
            Explore Fresh Produce &amp; Groceries
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // MAIN VIEW: FULL 2-COLUMN CHECKOUT EXPERIENCE
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#F8FAFC] py-6 sm:py-10">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 max-w-7xl mx-auto">
        {/* Top Header Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <button
            type="button"
            onClick={() => goToShop()}
            className="inline-flex items-center gap-2 text-xs font-bold text-stone-600 hover:text-[#B45309] transition-colors cursor-pointer group self-start"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>Return to Shopping</span>
          </button>

          {/* Secure Checkout Trust Pill */}
          <div className="flex items-center gap-2 self-start sm:self-auto bg-white px-3.5 py-1.5 rounded-full border border-stone-200 shadow-2xs text-xs font-semibold text-[#18181B]">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>256-Bit Bank-Grade SSL Encrypted Checkout</span>
          </div>
        </div>

        {/* Page Title */}
        <div className="mb-8">
          <span className="text-xs font-bold uppercase tracking-widest text-[#B45309] block mb-1">
            Fast &amp; Fresh Hertfordshire Delivery
          </span>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#18181B] tracking-tight">
            Checkout &amp; Delivery Details
          </h1>
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* ================================================================= */}
          {/* LEFT COLUMN: CHECKOUT FORMS & OPTIONS (7 COLS)                   */}
          {/* ================================================================= */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-6">
            
            {/* 1. EXPRESS CHECKOUT WALLET BANNER */}
            <div className="bg-white rounded-3xl p-6 border border-stone-200/90 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-400 block mb-3">
                Express 1-Click Checkout
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('apple');
                    handlePlaceOrder({ preventDefault: () => {} } as React.FormEvent);
                  }}
                  className="w-full py-3 px-4 rounded-2xl bg-black hover:bg-stone-800 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                >
                  <span>Pay with</span>
                  <span className="text-base font-extrabold tracking-tight">Pay</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('google');
                    handlePlaceOrder({ preventDefault: () => {} } as React.FormEvent);
                  }}
                  className="w-full py-3 px-4 rounded-2xl bg-white hover:bg-stone-50 text-stone-800 border border-stone-300 font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                >
                  <span>Pay with</span>
                  <span className="font-extrabold text-[#4285F4]">G</span>
                  <span className="font-extrabold text-[#EA4335]">o</span>
                  <span className="font-extrabold text-[#FBBC05]">o</span>
                  <span className="font-extrabold text-[#4285F4]">g</span>
                  <span className="font-extrabold text-[#34A853]">l</span>
                  <span className="font-extrabold text-[#EA4335]">e</span>
                  <span className="font-bold">Pay</span>
                </button>
              </div>

              <div className="relative flex items-center justify-center mt-5">
                <div className="border-t border-stone-200 w-full" />
                <span className="bg-white px-3 text-[11px] font-bold text-stone-400 uppercase tracking-widest absolute">
                  Or Enter Delivery Address
                </span>
              </div>
            </div>

            {/* 2. CUSTOMER CONTACT DETAILS */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-stone-200/90 shadow-sm">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-7 h-7 rounded-full bg-[#18181B] text-white flex items-center justify-center text-xs font-bold">
                  1
                </div>
                <h2 className="text-lg font-bold text-[#18181B]">
                  Contact Information
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. name@example.co.uk"
                      required
                      className="w-full text-xs font-medium bg-[#F8FAFC] border border-stone-200 rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/40 focus:border-[#F5D103]"
                    />
                    <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                  <span className="text-[11px] text-stone-500 mt-1 block">
                    We will send digital receipt &amp; order updates here.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Mobile Phone <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 07700 900142"
                      required
                      className="w-full text-xs font-medium bg-[#F8FAFC] border border-stone-200 rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/40 focus:border-[#F5D103]"
                    />
                    <Phone className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                  <span className="text-[11px] text-stone-500 mt-1 block">
                    For local driver arrival alerts &amp; gate notifications.
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="smsUpdates"
                  checked={smsUpdates}
                  onChange={(e) => setSmsUpdates(e.target.checked)}
                  className="rounded border-stone-300 text-[#B45309] focus:ring-[#F5D103] cursor-pointer"
                />
                <label htmlFor="smsUpdates" className="text-xs text-stone-600 font-medium cursor-pointer">
                  Send live SMS &amp; WhatsApp tracking updates when driver is 10 mins away.
                </label>
              </div>
            </div>

            {/* 3. DELIVERY ADDRESS */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-stone-200/90 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#18181B] text-white flex items-center justify-center text-xs font-bold">
                    2
                  </div>
                  <h2 className="text-lg font-bold text-[#18181B]">
                    Hertfordshire Delivery Address
                  </h2>
                </div>

                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  {postalCode}
                </span>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">
                      First Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      className="w-full text-xs font-medium bg-[#F8FAFC] border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/40 focus:border-[#F5D103]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">
                      Last Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      className="w-full text-xs font-medium bg-[#F8FAFC] border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/40 focus:border-[#F5D103]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Address Line 1 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    placeholder="House / Building number and street"
                    required
                    className="w-full text-xs font-medium bg-[#F8FAFC] border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/40 focus:border-[#F5D103]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Address Line 2 (Optional)
                  </label>
                  <input
                    type="text"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    placeholder="Apartment, suite, unit, floor, building"
                    className="w-full text-xs font-medium bg-[#F8FAFC] border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/40 focus:border-[#F5D103]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">
                      Town / City <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={townCity}
                      onChange={(e) => setTownCity(e.target.value)}
                      required
                      className="w-full text-xs font-medium bg-[#F8FAFC] border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/40 focus:border-[#F5D103]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">
                      County
                    </label>
                    <input
                      type="text"
                      value={county}
                      onChange={(e) => setCounty(e.target.value)}
                      className="w-full text-xs font-medium bg-[#F8FAFC] border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/40 focus:border-[#F5D103]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">
                      Postcode <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={postcode}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setPostcode(val);
                        onSelectPostalCode?.(val);
                      }}
                      required
                      className="w-full text-xs font-bold uppercase bg-[#F8FAFC] border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/40 focus:border-[#F5D103]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Delivery Instructions / Safe Place
                  </label>
                  <textarea
                    rows={2}
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    placeholder="e.g. Leave in porch, ring bell twice, gate code 1234"
                    className="w-full text-xs font-medium bg-[#F8FAFC] border border-stone-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/40 focus:border-[#F5D103]"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="contactless"
                    checked={isContactless}
                    onChange={(e) => setIsContactless(e.target.checked)}
                    className="rounded border-stone-300 text-[#B45309] focus:ring-[#F5D103] cursor-pointer"
                  />
                  <label htmlFor="contactless" className="text-xs text-stone-700 font-semibold cursor-pointer">
                    Contactless Delivery (Driver leaves basket on doorstep &amp; steps back 2m)
                  </label>
                </div>
              </div>
            </div>

            {/* 4. CHOOSE DELIVERY SLOT */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-stone-200/90 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#18181B] text-white flex items-center justify-center text-xs font-bold">
                    3
                  </div>
                  <h2 className="text-lg font-bold text-[#18181B]">
                    Choose Delivery Window
                  </h2>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
                  <Truck className="w-4 h-4 text-emerald-600" />
                  <span>Refrigerated Van</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {deliverySlots.map((slot) => {
                  const isSelected = selectedSlotId === slot.id;
                  return (
                    <div
                      key={slot.id}
                      onClick={() => {
                        setSelectedSlotId(slot.id);
                        soundEffects.playTap();
                      }}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-[#F5D103] bg-amber-50/40 shadow-xs'
                          : 'border-stone-200 hover:border-stone-300 bg-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${slot.badgeColor}`}>
                            {slot.badge}
                          </span>
                          <span className="text-xs font-bold text-[#18181B]">
                            {slot.price === 0 ? 'FREE' : `£${slot.price.toFixed(2)}`}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-[#18181B] mb-0.5">{slot.title}</h4>
                        <p className="text-xs text-[#B45309] font-bold">{slot.time}</p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
                        <span>{slot.note}</span>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-[#B45309] bg-[#F5D103]' : 'border-stone-300'
                        }`}>
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#18181B]" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 p-3 bg-emerald-50 rounded-2xl border border-emerald-200/80 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-800 leading-relaxed font-medium">
                  <strong>Temperature-Controlled Cold Chain:</strong> Fresh curry leaves, moringa, and dosa batter are transported in insulated refrigerated compartments kept below 4°C.
                </p>
              </div>
            </div>

            {/* 5. PAYMENT METHOD */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-stone-200/90 shadow-sm">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-7 h-7 rounded-full bg-[#18181B] text-white flex items-center justify-center text-xs font-bold">
                  4
                </div>
                <h2 className="text-lg font-bold text-[#18181B]">
                  Payment Method
                </h2>
              </div>

              {/* Payment selector tabs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                {[
                  { id: 'apple', label: 'Apple Pay', icon: 'Pay' },
                  { id: 'card', label: 'Credit Card', icon: '💳 Card' },
                  { id: 'google', label: 'Google Pay', icon: 'GPay' },
                  { id: 'cod', label: 'Pay on Doorstep', icon: '💵 Doorstep' }
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(m.id as PaymentType);
                      soundEffects.playTap();
                    }}
                    className={`py-3 px-2 rounded-2xl border-2 text-xs font-bold transition-all cursor-pointer text-center ${
                      paymentMethod === m.id
                        ? 'border-[#18181B] bg-stone-900 text-white shadow-xs'
                        : 'border-stone-200 hover:border-stone-300 bg-white text-stone-700'
                    }`}
                  >
                    <div className="font-extrabold text-sm mb-0.5">{m.icon}</div>
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>

              {/* Card Inputs if Card chosen */}
              {paymentMethod === 'card' && (
                <div className="space-y-4 p-4 bg-stone-50 rounded-2xl border border-stone-200/80 animate-fadeIn">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">
                      Name on Card
                    </label>
                    <input
                      type="text"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      placeholder="e.g. Priya Sharma"
                      className="w-full text-xs font-medium bg-white border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">
                      Card Number
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        placeholder="4242 •••• •••• 4242"
                        className="w-full text-xs font-mono font-bold bg-white border border-stone-200 rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/40"
                      />
                      <CreditCard className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1.5">
                        Expiry Date
                      </label>
                      <input
                        type="text"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        placeholder="MM/YY"
                        className="w-full text-xs font-mono font-medium bg-white border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/40"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1.5">
                        Security CVC
                      </label>
                      <input
                        type="password"
                        maxLength={4}
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                        placeholder="•••"
                        className="w-full text-xs font-mono font-medium bg-white border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#F5D103]/40"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="saveCard"
                      checked={saveCard}
                      onChange={(e) => setSaveCard(e.target.checked)}
                      className="rounded border-stone-300 text-[#B45309] focus:ring-[#F5D103] cursor-pointer"
                    />
                    <label htmlFor="saveCard" className="text-xs text-stone-600 font-medium cursor-pointer">
                      Save card encrypted for faster 1-click orders in Hertfordshire
                    </label>
                  </div>
                </div>
              )}

              {paymentMethod === 'cod' && (
                <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-200/80 text-xs text-stone-700 leading-relaxed font-medium">
                  💵 <strong>Pay on Doorstep:</strong> You can pay the driver by Cash or Contactless Card terminal after you have personally inspected your produce freshness.
                </div>
              )}

              {paymentMethod === 'apple' && (
                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/80 text-xs text-stone-700 leading-relaxed font-medium flex items-center gap-3">
                  <span className="text-lg"></span>
                  <span>Instant biometric authorization with Apple Pay Touch ID / Face ID upon clicking Place Order.</span>
                </div>
              )}

              {paymentMethod === 'google' && (
                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/80 text-xs text-stone-700 leading-relaxed font-medium flex items-center gap-3">
                  <span className="text-base font-bold text-[#4285F4]">G</span>
                  <span>Fast, zero-contact checkout using your default Google Pay card.</span>
                </div>
              )}

              {/* Large Place Order CTA */}
              <div className="mt-6 pt-5 border-t border-stone-100">
                <button
                  type="button"
                  onClick={handlePlaceOrder}
                  disabled={isProcessing}
                  className="w-full py-4 px-8 rounded-full bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] font-extrabold text-base flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transition-all cursor-pointer active:scale-[0.98] disabled:opacity-75 disabled:pointer-events-none"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-[#18181B] border-t-transparent rounded-full animate-spin" />
                      <span>Securing &amp; Authorizing Payment...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 stroke-[2.5]" />
                      <span>Pay &amp; Place Order (£{grandTotal.toFixed(2)})</span>
                    </>
                  )}
                </button>

                <p className="text-[11px] text-stone-400 text-center mt-3 font-medium">
                  By clicking &ldquo;Pay &amp; Place Order&rdquo;, you agree to Varam Foods&apos; 100% Freshness Guarantee and local terms of supply.
                </p>
              </div>
            </div>

          </div>

          {/* ================================================================= */}
          {/* RIGHT COLUMN: STICKY ORDER SUMMARY & ITEMS (5 COLS)               */}
          {/* ================================================================= */}
          <div className="lg:col-span-5 xl:col-span-4 sticky top-20 space-y-5">
            
            {/* Basket Items Summary Box */}
            <div className="bg-white rounded-3xl p-6 border border-stone-200/90 shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-stone-100">
                <h3 className="font-extrabold text-base text-[#18181B]">
                  Order Summary
                </h3>
                <span className="text-xs font-bold text-stone-500 bg-stone-100 px-2.5 py-0.5 rounded-full">
                  {items.reduce((acc, i) => acc + i.quantity, 0)} Items
                </span>
              </div>

              {/* Items Scrollable List */}
              <div className="divide-y divide-stone-100 max-h-72 overflow-y-auto pr-1 no-scrollbar space-y-2">
                {items.map((item) => (
                  <div key={item.product.id} className="pt-2 pb-2 flex items-center justify-between gap-3 group">
                    <img
                      src={item.product.image}
                      alt={item.product.name}
                      className="w-14 h-14 rounded-2xl object-cover bg-stone-50 border border-stone-200 shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-[#18181B] truncate">
                        {item.product.name}
                      </h4>
                      <p className="text-[11px] text-stone-500">
                        £{item.product.price.toFixed(2)} / {item.product.unit}
                      </p>

                      {/* Stepper */}
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex items-center bg-stone-100 rounded-lg p-0.5 border border-stone-200">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                            className="w-5 h-5 rounded-md bg-white text-stone-700 flex items-center justify-center text-xs font-bold shadow-2xs hover:bg-stone-200 cursor-pointer"
                          >
                            <Minus className="w-2.5 h-2.5" />
                          </button>
                          <span className="text-xs font-bold px-2 text-[#18181B]">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => updateQuantity(item.product.id, item.quantity + 1, e.currentTarget)}
                            className="w-5 h-5 rounded-md bg-[#F5D103] text-[#18181B] flex items-center justify-center text-xs font-bold shadow-2xs hover:bg-[#E5A800] cursor-pointer"
                          >
                            <Plus className="w-2.5 h-2.5" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeFromCart(item.product.id)}
                          className="text-stone-400 hover:text-rose-500 p-1 cursor-pointer transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-extrabold text-[#18181B]">
                        £{(item.product.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Free delivery tracker */}
              <div className="mt-4 pt-3 border-t border-stone-100">
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span className="text-stone-600 flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5 text-[#B45309]" />
                    <span>Free Delivery Threshold</span>
                  </span>
                  <span className="text-[#B45309]">
                    {amountNeededForFreeDelivery <= 0
                      ? '✓ Unlocked'
                      : `£${amountNeededForFreeDelivery.toFixed(2)} to go`}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#F5D103] to-[#B45309] transition-all duration-300"
                    style={{
                      width: `${Math.min(100, (subtotal / freeDeliveryThreshold) * 100)}%`
                    }}
                  />
                </div>
              </div>

              {/* Promo Coupon Form */}
              <div className="mt-4 pt-4 border-t border-stone-100">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#B45309]" />
                      <span className="text-xs font-bold text-[#B45309]">
                        Code {appliedCoupon} applied (20% Off)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={removeCoupon}
                      className="text-xs font-bold text-stone-500 hover:text-stone-800 underline cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyPromo} className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={promoCodeInput}
                        onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                        placeholder="Voucher or Promo code"
                        className="flex-1 text-xs font-bold uppercase bg-[#F8FAFC] border border-stone-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#F5D103]"
                      />
                      <button
                        type="submit"
                        className="py-2 px-4 rounded-xl bg-[#18181B] hover:bg-stone-800 text-white text-xs font-bold transition-all cursor-pointer shadow-2xs"
                      >
                        Apply
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                      <span>Tip: Try</span>
                      <button
                        type="button"
                        onClick={() => {
                          applyCoupon('FRESH20');
                          soundEffects.playCoupon();
                        }}
                        className="font-extrabold text-[#B45309] underline hover:text-[#92400E] cursor-pointer"
                      >
                        FRESH20
                      </button>
                      <span>for 20% off your basket</span>
                    </div>

                    {promoError && (
                      <p className="text-[11px] text-rose-600 font-semibold">{promoError}</p>
                    )}
                  </form>
                )}
              </div>

              {/* Breakdown totals */}
              <div className="mt-5 pt-4 border-t border-stone-100 space-y-2 text-xs">
                <div className="flex items-center justify-between text-stone-600">
                  <span>Basket Subtotal</span>
                  <span className="font-bold text-[#18181B]">£{subtotal.toFixed(2)}</span>
                </div>

                {discountAmount > 0 && (
                  <div className="flex items-center justify-between text-emerald-700 font-bold">
                    <span>Voucher Discount</span>
                    <span>-£{discountAmount.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-stone-600">
                  <span>Delivery ({selectedSlot.title})</span>
                  <span className="font-bold text-[#18181B]">
                    {deliveryFee === 0 ? (
                      <span className="text-emerald-700 font-bold uppercase">Free</span>
                    ) : (
                      `£${deliveryFee.toFixed(2)}`
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between text-stone-600">
                  <span>100% Compostable Packaging</span>
                  <span className="text-emerald-700 font-bold uppercase">Included (£0.00)</span>
                </div>

                <div className="pt-3 border-t border-stone-200 flex items-baseline justify-between">
                  <div>
                    <span className="text-sm font-extrabold text-[#18181B] block">Total to Pay</span>
                    <span className="text-[10px] text-stone-400">Includes all applicable UK VAT</span>
                  </div>
                  <span className="text-2xl font-extrabold text-[#18181B] tracking-tight">
                    £{grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Freshness & Quality Assurance Box */}
            <div className="bg-stone-50 rounded-3xl p-5 border border-stone-200/80 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>The Varam Foods Promise</span>
              </h4>

              <div className="space-y-2 text-xs text-stone-600">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span><strong>100% Freshness Guarantee:</strong> Any bruised or unsatisfactory produce replaced or refunded immediately.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span><strong>Zero Air-Miles:</strong> Greens sourced from Hertfordshire, Kent &amp; Suffolk farms.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span><strong>Contactless Driver:</strong> Delivered straight to your doorstep safely.</span>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
};
