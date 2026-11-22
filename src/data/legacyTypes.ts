// Shapes of the OLD mock data. Only the admin portal still reads the mocks; both go when it is rebuilt.
export interface LegacyProduct {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  price: number;
  originalPrice?: number;
  unit: string;
  image: string;
  rating: number;
  reviewsCount: number;
  badge?: string;
  isOrganic?: boolean;
  origin?: string;
  description: string;
  galleryImages?: string[];
  inStock?: boolean;
  storage?: string;
  sourcing?: string;
  nutrition?: {
    calories: string;
    carbs: string;
    protein: string;
    fat: string;
  };
}

export interface LegacyCategory {
  id: string;
  name: string;
  itemCount: string;
  image: string;
  accentBg: string;
  tagline?: string;
  badge?: string;
  accentColor?: string;
  cardBg?: string;
  slug?: string;
  subcategories?: string[];
}

export interface LegacyCartItem {
  product: LegacyProduct;
  quantity: number;
}

export interface LegacyReview {
  id: string;
  name: string;
  location: string;
  avatar: string;
  rating: number;
  text: string;
  verified: boolean;
  date: string;
}
