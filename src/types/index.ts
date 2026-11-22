// Frontend domain types. Products, categories and reviews come straight from the Postgres API
// (see ./api.ts); the old mock shapes are gone.
import type { Money, ProductSummary } from './api';

export type { Category, Review, Brand, ProductDetail, ProductSummary, Money } from './api';

/** A product as shown in lists and cards. */
export type Product = ProductSummary;

/** One basket line. `id` is the server line id once the basket is saved. */
export interface CartItem {
  id: string;
  product: ProductSummary;
  quantity: number;
  weightGrams: number | null;
  unitPrice: Money;
  lineTotal: Money;
  substitutionAllowed: boolean;
  isEstimate: boolean;
}
