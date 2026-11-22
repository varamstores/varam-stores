import { useQuery } from '@tanstack/react-query';
import { args, rpc } from './api';
import type { Address, OrderSummary, OrderView, Page, ProductSummary } from '../types/api';

// Signed-in customer data. Keys start with "account" so signing out clears them all.
export const accountKeys = {
  profile: ['account', 'profile'] as const,
  preferences: ['account', 'preferences'] as const,
  addresses: ['account', 'addresses'] as const,
  orders: (state: string) => ['account', 'orders', state] as const,
  order: (no: string) => ['account', 'order', no] as const,
  buyAgain: ['account', 'buy-again'] as const,
  loyalty: ['account', 'loyalty'] as const,
  alerts: ['account', 'alerts'] as const,
  subscriptions: ['account', 'subscriptions'] as const,
};

export interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: string;
  memberSince: string;
  consents: Record<string, { granted: boolean; at: string; version: string | null }>;
}

export interface Preferences {
  substitutionDefault: 'allow' | 'dont_allow';
  ripeness: 'ready' | 'shelf_life';
  smsDeliveryAlerts: boolean;
  emailInvoices: boolean;
  doorstepBell: boolean;
  ecoPackaging: boolean;
}

export function useProfile(enabled = true) {
  return useQuery({ queryKey: accountKeys.profile, queryFn: () => rpc<Profile>('get_my_profile'), enabled });
}
export function usePreferences(enabled = true) {
  return useQuery({ queryKey: accountKeys.preferences, queryFn: () => rpc<Preferences>('get_my_preferences'), enabled });
}
export function useAddresses(enabled = true) {
  return useQuery({ queryKey: accountKeys.addresses, queryFn: () => rpc<Address[]>('list_my_addresses'), enabled });
}
export function useMyOrders(state: 'active' | 'past', enabled = true) {
  return useQuery({
    queryKey: accountKeys.orders(state),
    queryFn: () => rpc<Page<OrderSummary>>('list_my_orders', { p_state: state, p_limit: 50 }),
    enabled,
  });
}
export function useMyOrder(orderNumber: string | null) {
  return useQuery({
    queryKey: accountKeys.order(orderNumber ?? ''),
    queryFn: () => rpc<OrderView>('get_my_order', { p_order_number: orderNumber }),
    enabled: !!orderNumber,
    refetchInterval: (q) => (q.state.data && ['delivered', 'cancelled', 'refunded'].includes(q.state.data.status) ? false : 60_000),
  });
}
export function useBuyAgain(enabled = true) {
  return useQuery({ queryKey: accountKeys.buyAgain, queryFn: () => rpc<ProductSummary[]>('list_buy_again', { p_limit: 12 }), enabled });
}

export const saveAddress = (a: Partial<Address> & { fullName: string; line1: string; city: string; postcode: string }) =>
  rpc<Address>('save_my_address', { p: args(a as unknown as Record<string, unknown>) });
