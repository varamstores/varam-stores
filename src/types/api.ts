// Shapes returned by the Postgres `api` functions (backend/docs/API_CONTRACT.md).
// All money is integer minor units (pence) with its currency.

export type Money = { amount: number; currency: string };
export type Page<T> = { items: T[]; nextCursor: string | null; total: number };
export type ImageRef = { url: string; mobileUrl: string | null; alt: string };

export type Allergen =
  | 'celery' | 'cereals_gluten' | 'crustaceans' | 'eggs' | 'fish' | 'lupin' | 'milk' | 'molluscs'
  | 'mustard' | 'tree_nuts' | 'peanuts' | 'sesame' | 'soya' | 'sulphites';
export type Availability = 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown_location';

export interface StorefrontConfig {
  locale: string;
  currency: string;
  timezone: string;
  environment: string;
  supportEmail: string | null;
  supportPhone: string | null;
  guestCheckout: boolean;
  loyaltyEnabled: boolean;
  freeDeliveryThreshold: Money | null;
  termsVersion: string;
  privacyVersion: string;
  paymentMode: 'stripe' | 'simulated';
}

export interface ProductSummary {
  id: string;
  slug: string;
  sku: string;
  legacyRef: string | null;
  name: string;
  brand: { slug: string; name: string } | null;
  category: { slug: string; name: string };
  image: ImageRef | null;
  price: Money;
  rrp: Money | null;
  wasPrice: Money | null;
  lowestPrice30d: Money | null;
  unitPrice: { price: Money; per: 'kg' | 'l' | 'each' } | null;
  saleUnit: 'each' | 'weight';
  packSize: string;
  estimatedWeightGrams: number | null;
  minWeightGrams: number | null;
  weightStepGrams: number | null;
  maxPerOrder: number | null;
  badge: string | null;
  promotions: { id: string; label: string }[];
  isOrganic: boolean;
  ageRestriction: { minAge: number } | null;
  rating: { average: number | null; count: number };
  availability: Availability;
}

export interface Nutrition {
  basis: 'per_100g' | 'per_100ml';
  energyKj: number | null;
  energyKcal: number | null;
  fat: number | null;
  saturates: number | null;
  carbohydrate: number | null;
  sugars: number | null;
  fibre: number | null;
  protein: number | null;
  salt: number | null;
}

export interface ProductDetail extends ProductSummary {
  description: string;
  gallery: ImageRef[];
  origin: string | null;
  storage: string | null;
  sourcing: string | null;
  isFood: boolean;
  isPerishable: boolean;
  isReturnable: boolean;
  deposit: { label: string; amount: Money } | null;
  foodInfo: null | {
    ingredients: string | null;
    allergens: { contains: Allergen[]; mayContain: Allergen[] };
    allergensReviewed: boolean;
    nutrition: Nutrition | null;
    foodBusinessOperator: { name: string; address: string } | null;
    countryOfOrigin: string | null;
    isComplete: boolean;
  };
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  badge: string | null;
  image: ImageRef | null;
  accentBg: string | null;
  accentColor: string | null;
  cardBg: string | null;
  position: number;
  showOnHomepage: boolean;
  productCount: number;
  children: Category[];
}

export interface Brand {
  id: string;
  slug: string;
  name: string;
  group: string;
  isPopular: boolean;
  logo: ImageRef | null;
  tagline: string | null;
  productCount: number;
}

export interface ProductFacets {
  brands: { slug: string; name: string; count: number }[];
  priceRange: { min: Money | null; max: Money | null };
  onSaleCount: number;
  organicCount: number;
}
export type ProductListing = Page<ProductSummary> & { facets: ProductFacets };

export type ProductSort = 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'name-asc' | 'name-desc';

export interface ProductFilters {
  category?: string;
  brands?: string[];
  q?: string;
  organic?: boolean;
  onSale?: boolean;
  minPrice?: number; // pence
  maxPrice?: number; // pence
  minRating?: number;
  sort?: ProductSort;
  postcode?: string;
  limit?: number;
  cursor?: string | null;
}

export interface SearchSuggestions {
  products: ProductSummary[];
  categories: { slug: string; name: string }[];
  brands: { slug: string; name: string }[];
}

export interface Collection {
  code: string;
  title: string;
  products: ProductSummary[];
}

export interface Review {
  id: string;
  rating: number;
  body: string;
  displayName: string;
  locationLabel: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: string;
}
export type ReviewPage = Page<Review> & { summary: { count: number; average: number | null } };

export interface CartLine {
  id: string;
  product: ProductSummary;
  quantity: number | null;
  weightGrams: number | null;
  unitPrice: Money;
  lineSubtotal: Money;
  discount: Money;
  lineTotal: Money;
  deposit: Money | null;
  vatRateBp: number;
  vat: Money;
  substitutionAllowed: boolean;
  isEstimate: boolean;
  purchasable: boolean;
  promotions: { promotionId: string; discount: number }[];
}

export type CouponReason =
  | 'INVALID' | 'INACTIVE' | 'NOT_STARTED' | 'EXPIRED' | 'USAGE_LIMIT' | 'SIGN_IN_REQUIRED' | 'NOT_YOURS'
  | 'FIRST_ORDER_ONLY' | 'POSTCODE_REQUIRED' | 'ZONE' | 'MIN_BASKET' | 'NOT_STACKABLE' | 'NO_MATCHING_ITEMS' | 'CART_EMPTY';

export type CartWarning =
  | { code: 'OUT_OF_STOCK' | 'PRODUCT_UNAVAILABLE' | 'LOW_STOCK'; lineId: string }
  | { code: 'INSUFFICIENT_STOCK'; lineId: string; details: { available?: number; availableGrams?: number } }
  | { code: 'MAX_PER_ORDER'; lineId: string; details: { max: number } }
  | { code: 'NOT_DELIVERABLE' };

export interface CartTotals {
  itemsSubtotal: Money;
  discountTotal: Money;
  depositTotal: Money;
  deliveryFee: Money;
  slotSurcharge: Money;
  total: Money;
  vatTotal: Money;
  isEstimate: boolean;
  vatBreakdown: { rateBp: number; net: Money; vat: Money; gross: Money }[];
}

export interface CartView {
  id: string | null;
  cartToken: string | null;
  itemCount: number;
  lineCount: number;
  currency: string;
  postcode: string | null;
  zone: { code: string; name: string; label: string } | null;
  lines: CartLine[];
  totals: CartTotals;
  deliveryLines: { rateBp: number; gross: Money; vat: Money }[];
  appliedPromotions: {
    promotionId: string;
    label: string;
    code: string | null;
    type: 'percent_off' | 'fixed_off' | 'multibuy_x_for_y' | 'multibuy_x_for_price' | 'member_price' | 'free_delivery';
    discount: Money;
    lineIds: string[];
  }[];
  coupon: { code: string; status: 'applied' | 'not_eligible'; reasonCode: CouponReason | null; details: { amountNeeded?: Money } | null } | null;
  delivery: {
    fee: Money;
    isEstimate: boolean;
    freeDeliveryThreshold: Money | null;
    amountNeededForFreeDelivery: Money;
    freeDeliveryApplied: boolean;
    minimumBasket: Money | null;
    minimumBasketMet: boolean;
  };
  warnings: CartWarning[];
  skipped?: { ref: string; reason: string }[];
}

export interface Address {
  id: string;
  label: string;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  countryCode: string;
  phone: string | null;
  deliveryNotes: string | null;
  isDefault: boolean;
  zone: { code: string; name: string; label: string } | null;
  deliverable: boolean;
}

export interface CheckoutView {
  id: string;
  status: 'open' | 'placed' | 'expired' | 'abandoned';
  expiresAt: string;
  holdActive: boolean;
  slot: import('../lib/delivery').RawSlot | null;
  address: Omit<Address, 'zone' | 'deliverable' | 'isDefault'> | null;
  deliveryNotes: string | null;
  substitutionDefault: 'allow' | 'dont_allow';
  ageCheck: { required: boolean; minAge: number | null; confirmed: boolean };
  cart: CartView;
  paymentMode: 'stripe' | 'simulated';
  termsVersion: string;
  authAmount?: Money;
}

export interface PlaceOrderResult {
  orderNumber: string;
  mode: 'stripe' | 'simulated';
  clientSecret: string | null;
  amount: Money;
}

export type OrderStatus = 'pending_payment' | 'placed' | 'picking' | 'picked' | 'paid' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'partially_refunded' | 'refunded';

export interface OrderTotalsBlock { items: Money; discount: Money; deposit: Money; delivery: Money; vat: Money; total: Money }

export interface OrderView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  placedAt: string | null;
  currency: string;
  slot: import('../lib/delivery').RawSlot | null;
  address: Record<string, string | null>;
  deliveryNotes: string | null;
  substitutionDefault: 'allow' | 'dont_allow';
  ageCheckRequired: boolean;
  lines: {
    id: string; productId: string | null; slug: string | null; name: string; packSize: string | null; image: ImageRef | null;
    saleUnit: 'each' | 'weight' | null; quantityOrdered: number | null; weightOrderedGrams: number | null;
    quantityPicked: number | null; weightPickedGrams: number | null; status: string; substitutionAllowed: boolean;
    substituteFor: string | null; unitPrice: Money; estimatedTotal: Money; finalTotal: Money | null; vatRateBp: number;
  }[];
  totals: { estimated: OrderTotalsBlock; final: OrderTotalsBlock | null; authorised: Money; captured: Money | null; refunded: Money };
  promotions: { label: string; discount: Money; code: string | null }[];
  payment: { provider: string; status: string; brand: string | null; last4: string | null; wallet: string | null } | null;
  tracking: { vanLabel: string | null; driverFirstName: string | null; trackingCode: string | null; etaStart: string | null; etaEnd: string | null } | null;
  timeline: { status: OrderStatus; at: string }[];
  invoice: { number: string; issuedAt: string } | null;
  cancelReason: string | null;
  canCancel: boolean;
  canReorder: boolean;
  paymentState?: string;
}

export interface OrderSummary {
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  placedAt: string | null;
  slot: import('../lib/delivery').RawSlot | null;
  total: Money;
  isFinal: boolean;
  itemCount: number;
  images: (ImageRef | null)[];
}

export interface PopularArea {
  code: string;
  name: string;
  label: string;
}
