import { useAdminQuery } from './lib';

/** Everything the admin dropdowns need, loaded once and shared (api.admin_catalogue_lookups). */
export interface Lookups {
  brands: Array<{ id: string; name: string; slug: string; isActive: boolean }>;
  allergens: Array<{ code: string; name: string }>;
  locations: Array<{ id: string; code: string; name: string }>;
  categories: Array<{ id: string; name: string; path: string; slug: string; isActive: boolean; parentId: string | null }>;
  collections: Array<{ code: string; title: string }>;
  staticPages: Array<{ key: string; label: string; route: string; isPublished: boolean }>;
  taxCategories: Array<{ code: string; name: string; rateBp: number; description: string }>;
  depositSchemes: Array<{ code: string; name: string; amountMinor?: number }>;
  ageRestrictions: Array<{ code: string; name: string; minAge: number | null }>;
}

export function useLookups() {
  return useAdminQuery<Lookups>('admin_catalogue_lookups', undefined, { staleTime: 60_000 });
}
