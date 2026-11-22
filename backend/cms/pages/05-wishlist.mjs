import { page, section, text } from '../define.mjs';

export default page('wishlist', 'Saved items', {
  route: '/wishlist',
  help: 'The saved items (wishlist) page.',
  seo: { title: 'Saved Items', description: 'Your saved groceries.' },
}, [
  section('main', 'Page', 'Heading, buttons and the empty state.', [
    text('crumb_home', 'Breadcrumb: home', 'Home', { max: 20 }),
    text('crumb', 'Breadcrumb: this page', 'Saved Wishlist', { max: 30 }),
    text('eyebrow', 'Small label', 'Your Curated Favourites', { max: 40 }),
    text('title', 'Heading', 'My Saved Wishlist', { max: 40 }),
    text('clear', 'Clear button', 'Clear All', { max: 20 }),
    text('add_all', 'Add all button', 'Add All ({count}) to Basket', { max: 30 }),
    text('added_all', 'Added all message', 'Added {count} saved items to your basket', { max: 60 }),
    text('count', 'Count line', 'You have **{count}** saved grocery items', { max: 60 }),
    text('count_one', 'Count line (one)', 'You have **1** saved grocery item', { max: 60 }),
    text('guest_note', 'Signed-out note', 'Sign in to keep your saved items on all your devices.', { max: 100 }),
    text('empty_title', 'Empty: heading', 'Your Wishlist is Empty', { max: 40 }),
    text('empty_text', 'Empty: text', 'Save your favourite fresh veggies, bakery loaves and pantry essentials here by tapping the heart on any product.', { max: 200 }),
    text('empty_button', 'Empty: button', 'Browse Fresh Catalogue', { max: 30 }),
  ], { reorderable: false }),
]);
