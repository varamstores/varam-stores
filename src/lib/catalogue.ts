import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { args, rpc } from './api';
import type {
  Brand, Category, Collection, PopularArea, ProductDetail, ProductFilters, ProductListing,
  ProductSummary, ReviewPage, Review, SearchSuggestions, StorefrontConfig,
} from '../types/api';

// Catalogue data changes rarely while a shopper browses; prices/stock refresh on navigation.
const MINUTE = 60_000;

export const catalogueKeys = {
  config: ['storefront-config'] as const,
  categories: ['categories'] as const,
  category: (slug: string) => ['category', slug] as const,
  brands: (popular?: boolean) => ['brands', popular ?? 'all'] as const,
  marquee: ['marquee-brands'] as const,
  products: (f: ProductFilters) => ['products', f] as const,
  product: (ref: string) => ['product', ref] as const,
  related: (id: string, limit: number) => ['related', id, limit] as const,
  collection: (code: string, limit?: number) => ['collection', code, limit ?? null] as const,
  suggest: (q: string) => ['suggest', q] as const,
  featuredReviews: (limit: number) => ['featured-reviews', limit] as const,
  productReviews: (id: string) => ['product-reviews', id] as const,
  areas: ['popular-areas'] as const,
  reviewSummary: ['review-summary'] as const,
};

function productArgs(f: ProductFilters) {
  return args({
    p_category: f.category && f.category !== 'all' ? f.category : undefined,
    p_brands: f.brands?.length ? f.brands : undefined,
    p_q: f.q?.trim() ? f.q.trim() : undefined,
    p_organic: f.organic ? true : undefined,
    p_on_sale: f.onSale ? true : undefined,
    p_min_price: f.minPrice,
    p_max_price: f.maxPrice,
    p_min_rating: f.minRating,
    p_sort: f.sort,
    p_postcode: f.postcode,
    p_limit: f.limit,
    p_cursor: f.cursor ?? undefined,
  });
}

export const fetchProducts = (f: ProductFilters) => rpc<ProductListing>('list_products', productArgs(f));
export const fetchProduct = (ref: string) => rpc<ProductDetail>('get_product', { p_slug_or_legacy_ref: ref });

export function useStorefrontConfig() {
  return useQuery({ queryKey: catalogueKeys.config, queryFn: () => rpc<StorefrontConfig>('get_storefront_config'), staleTime: 10 * MINUTE });
}

export function useCategories() {
  return useQuery({ queryKey: catalogueKeys.categories, queryFn: () => rpc<Category[]>('list_categories'), staleTime: 10 * MINUTE });
}

export function useBrands(popular?: boolean) {
  return useQuery({
    queryKey: catalogueKeys.brands(popular),
    queryFn: () => rpc<Brand[]>('list_brands', args({ p_popular: popular })),
    staleTime: 10 * MINUTE,
  });
}

export function useMarqueeBrands() {
  return useQuery({ queryKey: catalogueKeys.marquee, queryFn: () => rpc<Brand[]>('list_marquee_brands'), staleTime: 10 * MINUTE });
}

export function useProducts(f: ProductFilters, enabled = true) {
  return useQuery({
    queryKey: catalogueKeys.products(f),
    queryFn: () => fetchProducts(f),
    placeholderData: keepPreviousData,
    staleTime: MINUTE,
    enabled,
  });
}

/** Shop grid with "load more": pages are fetched with the cursor the previous page returned. */
export function useInfiniteProducts(f: Omit<ProductFilters, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: ['products-infinite', f],
    queryFn: ({ pageParam }) => fetchProducts({ ...f, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
    staleTime: MINUTE,
  });
}

export function useProduct(ref: string | null) {
  return useQuery({
    queryKey: catalogueKeys.product(ref ?? ''),
    queryFn: () => fetchProduct(ref!),
    enabled: !!ref,
    staleTime: MINUTE,
    retry: (count, err) => (err as { code?: string }).code !== 'PRODUCT_NOT_FOUND' && count < 2,
  });
}

export function useRelatedProducts(productId: string | null | undefined, limit = 8) {
  return useQuery({
    queryKey: catalogueKeys.related(productId ?? '', limit),
    queryFn: () => rpc<ProductSummary[]>('list_related_products', { p_product_id: productId, p_limit: limit }),
    enabled: !!productId,
    staleTime: 5 * MINUTE,
  });
}

export function useCollection(code: string | null | undefined, limit?: number) {
  return useQuery({
    queryKey: catalogueKeys.collection(code ?? '', limit),
    queryFn: () => rpc<Collection>('get_collection', args({ p_code: code, p_limit: limit })),
    enabled: !!code,
    staleTime: 5 * MINUTE,
  });
}

export function useSearchSuggestions(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: catalogueKeys.suggest(term),
    queryFn: () => rpc<SearchSuggestions>('search_suggest', { p_q: term, p_limit: 6 }),
    enabled: term.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: MINUTE,
  });
}

export function useFeaturedReviews(limit = 12) {
  return useQuery({
    queryKey: catalogueKeys.featuredReviews(limit),
    queryFn: () => rpc<Review[]>('list_featured_reviews', { p_limit: limit }),
    staleTime: 10 * MINUTE,
  });
}

export function useProductReviews(productId: string | null | undefined) {
  return useQuery({
    queryKey: catalogueKeys.productReviews(productId ?? ''),
    queryFn: () => rpc<ReviewPage>('list_product_reviews', { p_product_id: productId }),
    enabled: !!productId,
    staleTime: 5 * MINUTE,
  });
}

export function useReviewSummary() {
  return useQuery({
    queryKey: catalogueKeys.reviewSummary,
    queryFn: () => rpc<{ count: number; average: number | null }>('get_review_summary'),
    staleTime: 10 * MINUTE,
  });
}

/** Product cards for ids/slugs/old ids (e.g. a guest's saved items). */
export function useProductsByRefs(refs: string[]) {
  return useQuery({
    queryKey: ['products-by-refs', [...refs].sort()],
    queryFn: () => rpc<ProductSummary[]>('list_products_by_refs', { p_refs: refs }),
    enabled: refs.length > 0,
    staleTime: MINUTE,
  });
}

export function usePopularAreas() {
  return useQuery({ queryKey: catalogueKeys.areas, queryFn: () => rpc<PopularArea[]>('list_popular_areas'), staleTime: 30 * MINUTE });
}

/** Depth-first search of the category tree. */
export function findCategory(tree: Category[] | undefined, slug: string): Category | undefined {
  if (!tree) return undefined;
  for (const c of tree) {
    if (c.slug === slug) return c;
    const hit = findCategory(c.children, slug);
    if (hit) return hit;
  }
  return undefined;
}
