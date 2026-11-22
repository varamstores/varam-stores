import { page, section, text, image, link, list, number, collection, video, f, optional, img } from '../define.mjs';

// Homepage. Sections can be reordered, switched off, or shown on desktop/mobile only.
// Headings accept line breaks (press Enter), **bold** and *italic*.

const shelf = (key, label, help, o) => section(key, label, help, [
  text('eyebrow', 'Small label above the heading', o.eyebrow, { max: 40, help: 'Leave empty to hide.' }),
  text('title', 'Heading', o.title, { max: 60 }),
  link('view_all', '"View all" link', o.viewAll),
  collection('collection', 'Products shown', o.collection, { help: 'The code of a product collection. Edit which products are in it under Products → Collections.' }),
  number('limit', 'How many products', 5, { help: 'Products shown in the row (5 fills one row on desktop).' }),
]);

export default page('home', 'Homepage', {
  route: '/',
  help: 'The first page shoppers see. Drag sections to reorder them.',
  seo: {
    title: 'Fresh South Asian Groceries Delivered',
    description: 'Fresh vegetables, rice, spices, flours, snacks and essentials delivered across Hertfordshire and North London.',
  },
}, [
  section('hero', 'Hero slideshow', 'The big rotating banner at the top. Each slide has its own desktop and mobile image.', [
    list('slides', 'Slides', {
      badge: f.text('Small label', { max: 50 }),
      title: f.text('Heading line 1', { max: 40 }),
      titleLine2: f.text('Heading line 2', { max: 40 }),
      description: f.text('Text', { max: 220 }),
      primary: f.link('Main button'),
      secondary: f.link('Second button', { help: 'Use the link "#video" to open the video pop-up.' }),
      secondaryIcon: f.select('Second button icon', ['play', 'book', 'tag']),
      image: f.image('Picture', { help: 'Desktop: wide (about 16:9). Mobile: about 4:3.' }),
    }, [
      {
        badge: 'Fresh Groceries, Delivered Daily', title: 'Good Food', titleLine2: 'Brighter Days',
        description: 'Fresh fruits, vegetables, dairy and more — delivered to your door in Hatfield and beyond, fresh and hassle-free.',
        primary: { label: 'Shop Groceries', href: '/shop' }, secondary: { label: 'Watch Video', href: '#video' }, secondaryIcon: 'play',
        image: img('/hero-banner.jpg', 'Fresh groceries in a bag', '/hero-bag.jpg'),
      },
      {
        badge: '100% Certified Organic Harvest', title: 'Crisp Harvest', titleLine2: 'Farm to Table',
        description: 'Cultivated by certified family growers across Hertfordshire, Kent & Suffolk. Hand-harvested and dispatched at peak morning freshness.',
        primary: { label: 'Shop Fresh Produce', href: '/shop?category=vegetables-fruits' }, secondary: { label: 'Our Story', href: '/story' }, secondaryIcon: 'book',
        image: img('/hero-slide-organic.jpg', 'Fresh organic vegetables'),
      },
      {
        badge: 'Baked Before Dawn & Farmhouse Dairy', title: 'Warm Loaves', titleLine2: 'Fresh Mornings',
        description: 'Slow-fermented artisan sourdough, flaky French butter croissants, grass-fed organic milk, and free-range eggs straight from pasture.',
        primary: { label: 'Shop Bakery & Dairy', href: '/shop?category=bakery-dairy' }, secondary: { label: 'Special Deals', href: '/shop?sale=1' }, secondaryIcon: 'tag',
        image: img('/hero-slide-bakery.jpg', 'Fresh bread and dairy'),
      },
    ], { min: 1, maxItems: 6 }),
    number('autoplay_seconds', 'Seconds per slide', 6, { help: 'How long each slide shows before moving on. 0 turns autoplay off.' }),
    list('highlights', 'Highlights strip', { icon: f.icon('Icon'), title: f.text('Bold word', { max: 20 }), subtitle: f.text('Small word', { max: 24 }) }, [
      { icon: 'truck', title: 'Same-day', subtitle: 'Delivery' },
      { icon: 'leaf', title: '100%', subtitle: 'Fresh Produce' },
      { icon: 'shopping-basket', title: 'Wide', subtitle: 'Selection' },
      { icon: 'shield-check', title: 'Quality', subtitle: 'Guaranteed' },
    ], { maxItems: 4, help: 'The four small promises under the slideshow.' }),
    text('prev_aria', 'Previous button (screen readers)', 'Previous slide', { max: 40 }),
    text('next_aria', 'Next button (screen readers)', 'Next slide', { max: 40 }),
    text('dot_aria', 'Slide dots (screen readers)', 'Go to slide {number}', { max: 40 }),
  ]),

  section('brands', 'Brand logos (scrolling)', 'A moving strip of brand logos. Choose which brands appear under Products → Brands ("Show in logo strip").', [
    text('eyebrow', 'Small label', 'Authentic Heritage Brands', { max: 40 }),
    text('title', 'Heading', 'Shop by Trusted Brands', { max: 60 }),
    text('subtitle', 'Text beside the link', '{count} authentic brands delivered to your doorstep', { max: 80, help: '{count} is the number of brands.' }),
    text('view_all', 'Link text', 'View All Brands', { max: 30 }),
    text('brand_title', 'Logo hint', 'Shop {name}', { max: 40, help: '{name} is the brand.' }),
    text('aria', 'Section description (screen readers)', 'Shop by trusted brands', { max: 60 }),
  ]),

  section('categories', 'Category grid', 'Pictures of your categories. Choose which ones appear under Products → Categories ("Show on homepage").', [
    text('title', 'Heading', 'Shop by Popular **Categories**', { max: 60, help: 'The **bold** part is highlighted in orange.' }),
  ]),

  shelf('fresh_picks', 'Product row: Fresh picks', 'A row of products from a collection.', {
    eyebrow: '', title: "Today's Fresh Picks", viewAll: { label: 'View All', href: '/shop' }, collection: 'fresh-picks',
  }),
  shelf('bakery_dairy', 'Product row: Bakery & dairy', 'A row of products from a collection.', {
    eyebrow: 'Oven-Fresh & Grass-Fed', title: 'Morning Bakery & Farm Dairy', viewAll: { label: 'View All Bakery & Dairy', href: '/shop?category=bakery-dairy' }, collection: 'bakery-dairy',
  }),

  section('promo_cards', 'Offer cards', 'Three picture cards. A card with a promo code applies it when tapped.', [
    list('cards', 'Cards', {
      eyebrow: f.text('Small label', { max: 40 }),
      title: f.text('Heading', { max: 80, help: 'Press Enter for a new line. *Stars* for italics.' }),
      text: f.text('Text', { max: 160 }),
      image: f.image('Background picture'),
      href: f.href('Goes to'),
      button: f.text('Button text', { max: 30, help: 'Ignored when a promo code is set (the code is shown instead).' }),
      code: optional(f.text('Promo code', { max: 20, help: 'Optional. Tapping the card applies this code.' })),
      theme: f.select('Text colour', ['dark', 'light'], { help: 'Use "light" on dark pictures.' }),
    }, [
      { eyebrow: 'A Fresh Beginning', title: 'New Here?\nEnjoy 20% Off\nYour First Order', text: 'Fresh groceries, everyday essentials and more — delivered to your door.',
        image: img('/promo-card-bag.jpg', 'Grocery bag filled with vegetables and bread'), href: '/shop?sale=1', button: 'Shop now', code: 'FRESH20', theme: 'dark' },
      { eyebrow: 'Groceries, Delivered Fresh', title: 'Free Delivery\nOn Orders Over £50', text: 'Stock up on your favourites with fast, reliable delivery to your doorstep.',
        image: img('/promo-card-basket.jpg', 'Wicker basket of fresh farm produce'), href: '/shop', button: 'Shop Now', code: '', theme: 'light' },
      { eyebrow: 'Healthy Homes. Happier Days.', title: 'Fresh Groceries\nFor Your Family,\n*Without Hassle.*', text: 'Carefully selected produce, trusted brands and everyday essentials — all in one place.',
        image: img('/promo-card-family.jpg', 'Bowl of fresh lemons, garlic and basil'), href: '/shop', button: 'Explore Store', code: '', theme: 'dark' },
    ], { maxItems: 3 }),
    text('code_label', 'Promo code label', 'Use code', { max: 20 }),
  ]),

  section('farm_banner', 'Fresh produce banner', 'A wide banner with a picture and a button.', [
    text('title', 'Heading', 'Farm Fresh\nFruits & Vegetables\nDelivered Daily.', { max: 80, help: 'Press Enter for a new line.' }),
    text('text', 'Text', 'We source everything you need straight to your door.', { max: 160 }),
    link('button', 'Button', { label: 'Shop Fresh Produce', href: '/shop?category=vegetables-fruits' }),
    image('image', 'Picture', img('/promo-basket-delivery.jpg', 'Fresh fruits and vegetables in a wicker basket')),
    text('stamp_top', 'Round stamp: top', '100%', { max: 8, help: 'Leave both stamp lines empty to hide the stamp.' }),
    text('stamp_bottom', 'Round stamp: bottom', 'Fresh', { max: 10 }),
  ]),

  shelf('most_selling', 'Product row: Most selling', 'A row of products from a collection.', {
    eyebrow: '', title: 'Most Selling Products', viewAll: { label: 'View All', href: '/shop?sort=rating' }, collection: 'most-selling',
  }),
  shelf('pantry', 'Product row: Pantry & superfoods', 'A row of products from a collection.', {
    eyebrow: 'Gourmet & Nutrition', title: 'Pantry Staples & Superfoods', viewAll: { label: 'View All', href: '/shop' }, collection: 'pantry-superfoods',
  }),

  section('why_us', 'Why choose us', 'Four reasons to shop with you.', [
    text('eyebrow', 'Small label', 'The Varam Foods Promise', { max: 40 }),
    text('title', 'Heading', 'Why Choose Varam Foods?', { max: 60 }),
    text('aside', 'Text on the right', 'Because fresh just hits different 🌿', { max: 60 }),
    list('items', 'Reasons', { icon: f.icon('Icon'), title: f.text('Title', { max: 40 }), text: f.text('Text', { max: 160 }), link: f.link('Link') }, [
      { icon: 'truck', title: 'Same-day Delivery', text: 'Swift, temperature-controlled delivery straight to your doorstep across Hertfordshire.', link: { label: 'Check 2hr time slots', href: '/shop' } },
      { icon: 'sprout', title: '100% Fresh Produce', text: 'Harvested directly from certified local growers and ethical organic farms.', link: { label: 'Browse fresh harvest', href: '/shop?category=vegetables-fruits' } },
      { icon: 'shopping-bag', title: 'Wide Selection', text: 'Curated items spanning pantry staples, authentic spices, and daily essentials.', link: { label: 'Explore all aisles', href: '/shop' } },
      { icon: 'shield-check', title: 'Ethical Quality Guarantee', text: 'Transparent sourcing and 100% money-back freshness guarantee on every order.', link: { label: 'Read our standards', href: '/story' } },
    ], { maxItems: 4 }),
  ]),

  section('brand_story', 'Our story banner', 'A dark banner with a background video.', [
    text('eyebrow', 'Small label', 'Ethical Sourcing & Heritage', { max: 40 }),
    text('title', 'Heading', 'Organic produce,', { max: 60 }),
    text('title_muted', 'Heading (second line, lighter)', 'direct from family farms.', { max: 60 }),
    text('text', 'Text', 'We work directly with certified local growers in Hertfordshire and Kent. Fresh harvest delivered with genuine care, zero air-miles, and completely plastic-free packaging.', { max: 300 }),
    list('stats', 'Figures', { value: f.text('Figure', { max: 10 }), label: f.text('Label', { max: 30 }) }, [
      { value: '0 mi', label: 'Air-mile sourcing' },
      { value: '100%', label: 'Plastic-free trays' },
      { value: '48h', label: 'Farm to doorstep' },
    ], { maxItems: 3, help: 'Only show figures you can back up — advertising rules require it.' }),
    link('button', 'Main button', { label: 'Explore Our Story', href: '/story' }),
    text('video_button', 'Video button', 'Watch Film', { max: 24, help: 'Opens the video pop-up. Leave empty to hide.' }),
    text('video_button_aria', 'Video button (screen readers)', 'Watch our farm film', { max: 60 }),
    video('background_video', 'Background video (URL)', 'https://assets.mixkit.co/videos/preview/mixkit-farmer-walking-in-a-crop-field-at-sunset-41221-large.mp4', { help: 'A link to an .mp4 file. Plays silently in the background.' }),
    image('poster', 'Picture shown before the video loads', img('https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?auto=format&fit=crop&w=1920&q=80', 'Farmer walking in a field at sunset')),
    text('place', 'Place badge: name', 'Broadwater Farm', { max: 40, help: 'Leave empty to hide the badge.' }),
    text('place_area', 'Place badge: area', 'Hertfordshire', { max: 40 }),
    text('unmute_aria', 'Unmute (screen readers)', 'Unmute video', { max: 40 }),
    text('mute_aria', 'Mute (screen readers)', 'Mute video', { max: 40 }),
  ]),

  section('testimonials', 'Customer reviews', 'Moving cards with customer reviews. Reviews are approved under Customers → Reviews. Hidden when there are none.', [
    text('eyebrow', 'Small label', 'Verified Customer Stories', { max: 40 }),
    text('title', 'Heading', 'Loved by Thousands', { max: 60 }),
    text('text', 'Text', 'Fresh groceries, happier homes. Here is what our community across Hertfordshire says about their weekly Varam Foods deliveries.', { max: 200 }),
    text('pause', 'Pause button', 'Pause', { max: 16 }),
    text('resume', 'Resume button', 'Resume', { max: 16 }),
    text('pause_aria', 'Pause (screen readers)', 'Pause moving cards', { max: 40 }),
    text('resume_aria', 'Resume (screen readers)', 'Resume moving cards', { max: 40 }),
    text('prev_aria', 'Left arrow (screen readers)', 'Scroll reviews left', { max: 40 }),
    text('next_aria', 'Right arrow (screen readers)', 'Scroll reviews right', { max: 40 }),
    text('verified', 'Verified badge', 'Verified', { max: 16 }),
    text('rating_summary', 'Rating summary', 'Based on **{count}** customer reviews', { max: 80, help: '{count} is the number of approved reviews. The star average is worked out automatically.' }),
    list('assurances', 'Promises (right of the summary)', { text: f.text('Text', { max: 40 }) }, [
      { text: 'Freshness guarantee on every order' },
      { text: '100% Satisfaction Guarantee' },
    ], { maxItems: 3 }),
  ]),

  section('video', 'Video pop-up', 'The film that opens from the "Watch video" buttons. Not shown on the page by itself.', [
    text('title', 'Title', 'From Local Farms to Your Table', { max: 60 }),
    text('subtitle', 'Subtitle', 'A documentary journey through Hertfordshire & Suffolk organic pastures', { max: 120 }),
    video('url', 'Video (URL)', 'https://assets.mixkit.co/videos/preview/mixkit-farmer-walking-in-a-crop-field-at-sunset-41221-large.mp4', { help: 'A link to an .mp4 file.' }),
    image('poster', 'Picture shown before playing', img('https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?auto=format&fit=crop&w=1200&q=80', 'Farm at sunset')),
    text('close_aria', 'Close button (screen readers)', 'Close video', { max: 40 }),
    text('unsupported', 'Old-browser message', 'Your browser does not support the video.', { max: 80 }),
  ], { reorderable: false }),
]);
