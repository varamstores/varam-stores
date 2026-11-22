import { page, section, text, richtext, image, link, list, video, f, img } from '../define.mjs';

export default page('story', 'Our Story', {
  route: '/story',
  help: 'The "Our Story" page. Every section can be edited, reordered or hidden. Make sure dates and figures are accurate.',
  seo: { title: 'Our Story', description: 'Authentic South Indian groceries with the freshness of local British farms, delivered across Hertfordshire.' },
}, [
  section('hero', 'Top banner', 'Heading, text, buttons and the figures under them.', [
    text('crumb', 'Breadcrumb', 'Our Story', { max: 30 }),
    text('tagline', 'Line on the right of the breadcrumb', 'Varam Foods • Established in Hertfordshire', { max: 60 }),
    text('eyebrow', 'Small label', 'The Varam Foods Heritage • Founded 2021', { max: 60 }),
    text('title', 'Heading', 'Rooted in Tradition,\nCommitted to **Freshness**.', { max: 80, help: 'Press Enter for a new line. The **bold** word is underlined.' }),
    text('text', 'Text', 'We bridge the warmth of authentic South Indian kitchens with the crisp purity of British farms. No compromises on flavour, no artificial fillers, and zero guesswork.', { max: 240 }),
    link('primary', 'Main button', { label: 'Explore Our Produce', href: '/shop' }),
    text('video_button', 'Video button', 'Watch Brand Film', { max: 30, help: 'Opens the video pop-up (Homepage → Video pop-up). Leave empty to hide.' }),
    list('metrics', 'Figures', { value: f.text('Figure', { max: 12, help: 'Use {brands} or {products} for live counts.' }), label: f.text('Label', { max: 30 }) }, [
      { value: '{brands}', label: 'Authentic Brands' },
      { value: '{products}', label: 'Curated Items' },
      { value: '12,400+', label: 'Happy Families' },
      { value: '100%', label: 'Cold-Chain Fresh' },
    ], { maxItems: 4, help: 'Only use figures you can back up. {brands} and {products} are counted live.' }),
  ]),

  section('genesis', 'Why "Varam"', 'The story behind the name, with a picture.', [
    image('image', 'Picture', img('/promo-basket-delivery.jpg', 'Harvest of fresh ingredients and groceries in a rustic basket')),
    text('image_eyebrow', 'Caption: small label', 'Authentic Culinary Heritage', { max: 40 }),
    text('image_caption', 'Caption: text', 'Hand-picked ingredients that evoke the aromas of home.', { max: 100 }),
    text('eyebrow', 'Small label', 'Our Genesis', { max: 30 }),
    text('title', 'Heading', 'Why We Named It **“Varam”**', { max: 60, help: 'The **bold** part is highlighted.' }),
    richtext('body', 'Text', 'In Tamil and Telugu, the word **Varam (வரம் / వరం)** translates to *“A Blessing”* or *“A Precious Gift.”*\n\nLiving in the UK, many of us struggled with the same weekly chore: driving miles across multiple shops to find genuine sambar onions, cold-pressed gingelly oil, fresh curry leaves, and authentic Sona Masoori rice. Supermarket shelves frequently stocked stale spices that had lost their volatile essential oils months prior.\n\nWe created **Varam Foods** to be the definitive answer. An obsessive commitment to sourcing directly from the source, storing under immaculate climate-controlled conditions, and delivering directly to your door with warmth and care.'),
    list('points', 'Ticks', { text: f.text('Text', { max: 60 }) }, [
      { text: 'Unpolished pulses & natural grains' },
      { text: 'Cold-pressed virgin cooking oils' },
      { text: 'Same-day harvested greens' },
      { text: 'Strict zero-adulteration policy' },
    ], { maxItems: 6 }),
  ]),

  section('film', 'Film', 'A dark band with a looping video and a play button.', [
    text('eyebrow', 'Small label', 'Inside Our Journey', { max: 40 }),
    text('title', 'Heading', 'From Soil to Doorstep: Watch Our Story', { max: 60 }),
    text('text', 'Text', 'Follow our daily journey through rural grower fields, spice testing laboratories, and our temperature-controlled packing hub in Hatfield.', { max: 200 }),
    video('background_video', 'Looping video (URL)', 'https://assets.mixkit.co/videos/preview/mixkit-farmer-walking-in-a-crop-field-at-sunset-41221-large.mp4'),
    text('play_aria', 'Play button (screen readers)', 'Play the brand film', { max: 40 }),
  ]),

  section('pillars', 'Our principles', 'Four cards about how you work.', [
    text('eyebrow', 'Small label', 'Our Sourcing Philosophy', { max: 40 }),
    text('title', 'Heading', 'How We Deliver Unmatched Quality', { max: 60 }),
    text('text', 'Text', 'Four non-negotiable principles that shape every single product carton we pack.', { max: 160 }),
    list('items', 'Cards', { icon: f.icon('Icon'), badge: f.text('Small label', { max: 30 }), title: f.text('Title', { max: 50 }), text: f.text('Text', { max: 300 }) }, [
      { icon: 'award', badge: 'Heritage & Purity', title: 'Direct Brand Relationships', text: 'We procure directly from certified heritage mills and master food makers across India — including Aashirvaad, GRB, Sakthi, Aachi, Priya, and Grand Sweets. Never middlemen, never diluted quality.' },
      { icon: 'leaf', badge: 'Zero Air-Miles', title: 'Local British Farm Partnerships', text: 'For fresh seasonal greens, herbs, and organic dairy, we partner directly with independent family farms across Hertfordshire, Kent, and Suffolk. Harvested at sunrise, delivered to you by afternoon.' },
      { icon: 'truck', badge: 'Cold-Chain Integrity', title: 'Chilled Temperature Control', text: 'Fresh curry leaves, moringa drumsticks, and freshly ground idli-dosa batter require specialized care. Our refrigerated vehicles and thermal insulation preserve garden-fresh vitality.' },
      { icon: 'heart', badge: 'Sustainable Living', title: 'Eco-Conscious Packaging', text: 'From 100% compostable bio-bags to FSC-certified recyclable cardboard outer cartons, our goal is to nurture both your family and the earth we all share.' },
    ], { maxItems: 6 }),
  ]),

  section('timeline', 'Our journey', 'Milestones by year.', [
    text('eyebrow', 'Small label', 'Our Journey', { max: 30 }),
    text('title', 'Heading', 'Growing Step by Step', { max: 50 }),
    text('text', 'Text', 'From our first home delivery in Hatfield to becoming a regional favourite.', { max: 160 }),
    list('items', 'Milestones', { year: f.text('Year', { max: 10 }), title: f.text('Title', { max: 80 }), text: f.text('Text', { max: 300 }) }, [
      { year: '2021', title: 'The Seed is Planted in Hatfield', text: 'Frustrated by the lack of authentic, unadulterated South Indian staples in Hertfordshire, our founders started Varam Foods with just 50 curated items from a small family hub.' },
      { year: '2022', title: 'Cold-Chain Fleet Launch', text: 'Rolled out dedicated temperature-controlled delivery vans across Hatfield, St Albans, and Welwyn Garden City, ensuring fresh vegetables and batter arrive in peak condition.' },
      { year: '2024', title: '90+ Heritage Brands & Direct Mill Sourcing', text: 'Formed verified supply partnerships with over 90 premier Indian brands, expanding our catalog to over 8,000 authentic regional delicacies and organic staples.' },
      { year: '2026', title: '12,000+ UK Households Served', text: 'Today, Varam Foods is the trusted culinary partner for thousands of families across Hertfordshire and the wider London commuter belt, delivering same-day freshness daily.' },
    ], { maxItems: 12, help: 'Check every date and figure before publishing.' }),
  ]),

  section('promise', 'Personal promise', 'The closing card with buttons.', [
    text('title', 'Heading', 'A Personal Promise to Every Customer', { max: 60 }),
    text('quote', 'Quote', '“We treat every bag of groceries as if it were destined for our own family’s dinner table. If something isn’t as fresh or delicious as you expected, let us know within minutes, and we will replace or refund it immediately — no hassle, ever.”', { max: 400 }),
    link('primary', 'Main button', { label: "Shop Today's Arrivals", href: '/shop' }),
    link('secondary', 'Second button', { label: 'Return to Home', href: '/' }),
  ]),
]);
