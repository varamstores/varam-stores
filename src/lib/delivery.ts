import { useQuery } from '@tanstack/react-query';
import { args, rpc } from './api';
import { useCms } from '../cms/CmsProvider';
import type { Money } from '../types/api';

/** A delivery window as returned by Postgres (times in London). */
export interface RawSlot {
  id: string;
  startsAt: string;
  endsAt: string;
  cutoffAt: string;
  timezone: string;
  localDate: string; // YYYY-MM-DD
  startLocal: string; // HH:MM
  endLocal: string;
  serviceLabel: string | null;
  surcharge: Money | null;
  capacity: number;
  remaining: number;
  availability: 'available' | 'limited' | 'full';
}

export interface DeliverySlot extends RawSlot {
  /** "Today", "Tomorrow" or "Sat 28 Nov" */
  dayLabel: string;
  /** "08:00 – 10:00" */
  timeLabel: string;
}

export interface PostcodeCheck {
  postcode: string;
  deliverable: boolean;
  zone: { code: string; name: string; label: string } | null;
  minimumBasket: Money | null;
  freeDeliveryThreshold: Money | null;
  nextSlot: RawSlot | null;
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const londonDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()); // YYYY-MM-DD

/** Adds readable labels (London time, CMS words for today/tomorrow). */
export function useSlotLabeller() {
  const cms = useCms();
  return (s: RawSlot): DeliverySlot => {
    const today = londonDate();
    const tomorrow = new Date(`${today}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const dayLabel = s.localDate === today ? cms.t('checkout.slot.today')
      : s.localDate === tomorrow.toISOString().slice(0, 10) ? cms.t('checkout.slot.tomorrow')
      : dayFmt.format(new Date(`${s.localDate}T00:00:00Z`));
    return { ...s, dayLabel, timeLabel: `${s.startLocal} – ${s.endLocal}` };
  };
}

export function useDeliverySlots(postcode: string | null | undefined, days?: number) {
  const label = useSlotLabeller();
  const q = useQuery({
    queryKey: ['delivery-slots', postcode ?? '', days ?? null],
    queryFn: () => rpc<RawSlot[]>('list_delivery_slots', args({ p_postcode: postcode, p_days: days })),
    enabled: !!postcode,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  return { ...q, data: q.data?.map(label) };
}

export const checkPostcode = (postcode: string) => rpc<PostcodeCheck>('check_postcode', { p_postcode: postcode });
