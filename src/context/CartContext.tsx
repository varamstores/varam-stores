import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Product, CartItem } from '../types';
import { animateFlyToCart } from '../utils/flyToCart';
import { soundEffects } from '../utils/soundEffects';

interface CartContextType {
  items: CartItem[];
  addToCart: (
    product: Product,
    quantity?: number,
    source?: HTMLElement | React.MouseEvent | { x: number; y: number } | null
  ) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (
    productId: string,
    quantity: number,
    source?: HTMLElement | React.MouseEvent | { x: number; y: number } | null
  ) => void;
  clearCart: () => void;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  appliedCoupon: string | null;
  discountPercent: number;
  applyCoupon: (code: string) => boolean;
  removeCoupon: () => void;
  totalItems: number;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  total: number;
  freeDeliveryThreshold: number;
  amountNeededForFreeDelivery: number;
  toastMessage: string | null;
  showToast: (msg: string) => void;
  flyToCart: (
    product: Product,
    source?: HTMLElement | React.MouseEvent | { x: number; y: number } | null
  ) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = 'freshmart_cart_v1';
const LEGACY_CART_KEY = 'varamstores_cart_v1';
const COUPON_STORAGE_KEY = 'freshmart_coupon_v1';
const LEGACY_COUPON_KEY = 'varamstores_coupon_v1';
const FREE_DELIVERY_THRESHOLD = 50.0;

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY) || localStorage.getItem(LEGACY_CART_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isCartOpen, setIsCartOpenState] = useState(false);

  const setIsCartOpen = (open: boolean) => {
    setIsCartOpenState(open);
    soundEffects.playDrawer(open);
  };
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(() => {
    try {
      return localStorage.getItem(COUPON_STORAGE_KEY) || localStorage.getItem(LEGACY_COUPON_KEY) || null;
    } catch {
      return null;
    }
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.error('Failed to save cart to localStorage', e);
    }
  }, [items]);

  useEffect(() => {
    if (appliedCoupon) {
      localStorage.setItem(COUPON_STORAGE_KEY, appliedCoupon);
    } else {
      localStorage.removeItem(COUPON_STORAGE_KEY);
    }
  }, [appliedCoupon]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 2800);
  };

  const addToCart = (
    product: Product,
    quantity: number = 1,
    source?: HTMLElement | React.MouseEvent | { x: number; y: number } | null
  ) => {
    // Play tactile sound feedback & trigger fly-to-cart animation!
    soundEffects.playAddToCart();
    animateFlyToCart(product, source);

    setItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { product, quantity }];
    });
    showToast(`Added ${product.name} to basket`);
  };

  const removeFromCart = (productId: string) => {
    soundEffects.playRemoveFromCart();
    setItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const updateQuantity = (
    productId: string,
    quantity: number,
    source?: HTMLElement | React.MouseEvent | { x: number; y: number } | null
  ) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setItems((prev) => {
      const existing = prev.find((item) => item.product.id === productId);
      if (existing) {
        if (quantity > existing.quantity) {
          soundEffects.playQuantityChange(true);
          // Trigger fly to cart animation on increment!
          animateFlyToCart(existing.product, source);
        } else if (quantity < existing.quantity) {
          soundEffects.playQuantityChange(false);
        }
      }
      return prev.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      );
    });
  };

  const clearCart = () => {
    soundEffects.playRemoveFromCart();
    setItems([]);
  };

  const applyCoupon = (code: string): boolean => {
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode === 'FRESH20') {
      setAppliedCoupon('FRESH20');
      soundEffects.playCoupon();
      showToast('Offer applied: 20% off your basket!');
      return true;
    }
    return false;
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    showToast('Promo code removed');
  };

  const discountPercent = appliedCoupon === 'FRESH20' ? 20 : 0;
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  const discountAmount = (subtotal * discountPercent) / 100;
  const effectiveSubtotal = subtotal - discountAmount;
  const deliveryFee =
    items.length === 0 ? 0 : subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : 3.5;
  const total = items.length === 0 ? 0 : effectiveSubtotal + deliveryFee;
  const amountNeededForFreeDelivery = Math.max(
    0,
    FREE_DELIVERY_THRESHOLD - subtotal
  );

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        isCartOpen,
        setIsCartOpen,
        appliedCoupon,
        discountPercent,
        applyCoupon,
        removeCoupon,
        totalItems,
        subtotal,
        discountAmount,
        deliveryFee,
        total,
        freeDeliveryThreshold: FREE_DELIVERY_THRESHOLD,
        amountNeededForFreeDelivery,
        toastMessage,
        showToast,
        flyToCart: animateFlyToCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
