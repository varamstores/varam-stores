import type { LegacyReview as Review } from './legacyTypes';

export const customerReviews: Review[] = [
  {
    id: 'rev-1',
    name: 'Priya S.',
    location: 'Hatfield, Hertfordshire',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
    rating: 5,
    text: 'Amazing quality and super fast delivery. The produce always feels crisp, fresh, and hand-selected.',
    verified: true,
    date: '2 days ago',
  },
  {
    id: 'rev-2',
    name: 'Rahul K.',
    location: 'St Albans, Hertfordshire',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
    rating: 5,
    text: "Best grocery experience I've had. Great selection, transparent sourcing, and remarkably easy to order.",
    verified: true,
    date: '1 week ago',
  },
  {
    id: 'rev-3',
    name: 'Sneha M.',
    location: 'Welwyn Garden City',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=150&q=80',
    rating: 5,
    text: 'FreshMart has made my weekly family shopping so much easier. The artisan bakery and eggs are second to none!',
    verified: true,
    date: '3 days ago',
  },
  {
    id: 'rev-4',
    name: 'Oliver W.',
    location: 'Hertford, Hertfordshire',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80',
    rating: 5,
    text: 'The difference in flavour between supermarket produce and FreshMart is immediate. You can taste the care.',
    verified: true,
    date: '5 days ago',
  },
];
