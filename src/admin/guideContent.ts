import type { AreaName } from './ui';

// The words of the Guide screen: one entry per part of the store portal, written for staff who
// are not technical. Labels match the buttons and headings on the screens exactly.

export interface GuideSection {
  heading: string;
  text?: string;
  steps?: string[];
  bullets?: string[];
}
export interface GuideTopic {
  key: string;
  area: AreaName | 'Getting started';
  title: string;
  screen?: string;
  perms?: string[];
  summary: string;
  who: string;
  sections: GuideSection[];
  tips?: string[];
}

export const GUIDE: GuideTopic[] = [
  // ── getting started ─────────────────────────────────────────────────────────────────────────
  {
    key: 'setup', area: 'Getting started', title: 'Setting up a new shop',
    summary: 'The order to set the shop up in when you start. Each step builds on the one before, so doing them in this order avoids going back.',
    who: 'Mostly the Store Manager. Each step needs the permission for its screen.',
    sections: [
      { heading: 'Do these in order', steps: [
        'Categories — add the aisles of your shop (for example Rice, Atta & Flours, Spices & Masala), each with a picture. Put them in the order you want in the shop menu.',
        'Brands — add the brands you sell (for example Aashirvaad, Haldiram’s) with their logos.',
        'Products — add each product in six short steps, fill in its food information, then put it on sale.',
        'Stock — enter how many of each product you have and when to buy more.',
        'Suppliers — add the companies you buy from and link products to them, so purchase orders can be drafted for you.',
        'Delivery areas & slots — the postcodes you deliver to, the delivery charges and your weekly delivery times.',
        'Company & VAT — your company name, number, VAT number and registered address (Settings → Company & VAT). Needed for VAT invoices.',
        'Card payments — your developer adds the Stripe keys; then switch “How checkout takes payment” to Stripe in Settings.',
        'Emails — your developer connects Resend with your own sending address.',
        'Legal pages — write and publish Terms, Privacy, Cookies and Returns in Website content → Information pages.',
      ] },
      { heading: 'See how far you are', text: 'Home shows a “Set up your shop” checklist with a tick next to each step that is done and a “Go ›” link to the ones that are not. It disappears once everything is done. Press “Hide for now” to fold it away.' },
    ],
  },
  {
    key: 'day', area: 'Getting started', title: 'A normal day',
    summary: 'The jobs most days follow, from the first order to the last delivery.',
    who: 'Everyone, depending on their role.',
    sections: [
      { heading: 'Morning', steps: [
        'Open Home. The tiles at the top show orders to pick today, orders ready to send, orders on the road and refunds waiting.',
        'Check “Needs attention” on Home for anything to fix: products out of stock or running low, reviews to approve, emails that failed.',
      ] },
      { heading: 'Picking and sending', steps: [
        'Go to Orders. In the New column, press Start picking on the order with the earliest delivery time.',
        'Pick each item, then press Finish & charge. The order moves to Ready to send.',
        'Press Send out on each packed order, choose the van and the driver. The order moves to On the road and the customer is emailed.',
        'When the driver hands an order over, press Delivered (tick the ID check for age-restricted items).',
      ] },
      { heading: 'Through the day', bullets: [
        'Customer asks for money back? Open the order and press Refund…; a manager approves it in Refunds.',
        'A delivery from a supplier arrives? Suppliers & buying → Purchase orders → Receive delivery.',
        'Something broke or went out of date? Stock → Change → “Damaged, out of date or lost”.',
      ] },
    ],
  },
  {
    key: 'portal', area: 'Getting started', title: 'Finding your way around',
    summary: 'How the store portal is laid out, so every screen feels familiar.',
    who: 'Everyone.',
    sections: [
      { heading: 'The menu on the left', text: 'Screens are grouped into areas, each with its own colour: Today (ochre) for orders, Shop (green) for what you sell, Customers (blue), Marketing (plum) and Set-up (grey). You only see the screens your role allows. The numbers 1–5 next to the Shop screens are the order to set the shop up in.' },
      { heading: 'Every screen', bullets: [
        'The top bar shows where you are, for example “Shop / Products”. “Open the shop” opens the website in a new tab.',
        'The screen title has the area’s colour. Under it, one line says what the screen is for.',
        'The dark “How this works” panel explains the screen in a few steps. Press Hide to fold it away; the “How this works” button brings it back.',
        'The yellow button is the main thing to do on that screen (for example Add product).',
      ] },
      { heading: 'Lists and forms', bullets: [
        'A row with a › arrow opens when you press it.',
        'Long lists come in pages: use Previous, Next or a page number at the bottom.',
        'Drop-downs open a list; long ones have a search box at the top — start typing to find an option.',
        'Items marked “example” are sample data that is removed before the shop opens.',
        'If something cannot be saved, a red message at the bottom right says why in plain words.',
      ] },
      { heading: 'You', bullets: [
        'Your name and role are at the bottom of the menu.',
        'Set your status to Working, On a break or Off shift so the team knows.',
        'Sign out when you finish, especially on a shared computer.',
      ] },
    ],
  },

  // ── today ───────────────────────────────────────────────────────────────────────────────────
  {
    key: 'home', area: 'Today', title: 'Home', screen: 'dashboard',
    summary: 'The first screen you see: today’s work, anything that needs fixing, how far the shop set-up is, and how sales are going.',
    who: 'Everyone. Money figures are only shown to roles with the finance permission.',
    sections: [
      { heading: 'What you see, top to bottom', bullets: [
        '“Not fully live yet” — shown while card payments are in test mode or emails are not connected.',
        '“Set up your shop” — the set-up checklist (see Setting up a new shop).',
        'Today’s work tiles — Orders to pick today, Packed ready to send, On the road now, Refunds waiting for a decision. A tile with a dark border has work waiting; press it to go there.',
        'Needs attention — problems such as products out of stock, emails that failed, reviews waiting, products missing food information. Press a line to go straight to it.',
        'Sales — orders and money for Today, 7 days, 30 days or This year, with a chart. “Charged” is money taken; “Still to charge” is orders not yet picked.',
        'Best sellers, Orders by stage and Sales by category.',
      ] },
    ],
    tips: ['Home refreshes itself every minute, so you can leave it open.'],
  },
  {
    key: 'orders', area: 'Today', title: 'Orders', screen: 'orders', perms: ['order_status', 'packing_queue', 'orders_dispatch'],
    summary: 'Every order on one board that moves left to right: New → Picking → Ready to send → On the road → Delivered. Each order card has one button for its next step.',
    who: 'Pickers see New and Picking. Dispatch sees Ready to send and On the road. Store Managers see everything.',
    sections: [
      { heading: 'The board', bullets: [
        'New — paid with a card hold, waiting to be picked.',
        'Picking — someone is picking it now.',
        'Ready to send — packed and charged, waiting for a driver.',
        'On the road — with a driver.',
        'Delivered — the most recent deliveries.',
        'Each card shows the order number, total, customer, area, delivery time (bold when it is today), the number of items, and labels such as “ID check” or “Has a note”.',
        '“Delivery day” at the top shows All, Today or Tomorrow.',
      ] },
      { heading: 'Picking an order', steps: [
        'Press Start picking on a New order (or Continue picking on one already started).',
        'Read any customer note and whether substitutes are allowed at the top.',
        'For each item: use − and + to set how many you found, then press “Picked all” (or “Picked 2 of 3” if you found fewer).',
        'Weighed items: type the weight from the scale, choosing grams or kilos, then press Save weight.',
        'Not in stock? Press Missing, or “Replace with something similar” to choose a substitute (only when the customer allowed it). The customer pays the lower price.',
        'Each finished item turns green with a tick and says what was recorded. Press Change to correct it.',
        'When every item is done, press Finish & charge at the bottom. The exact amount is taken from the card hold (never more) and the order moves to Ready to send.',
      ] },
      { heading: 'Sending out and delivering', steps: [
        'On a Ready to send card press Send out, choose the van and the driver. “Arriving from / by” is optional; it defaults to the delivery slot.',
        'The customer is emailed that their order is on the way.',
        'When it is handed over, press Delivered. For age-restricted items you must tick that you checked photo ID.',
      ] },
      { heading: 'Everything about one order', text: 'Press a card (not its button) to open the order: customer and contact details, delivery address and notes, every item with its picking result, the money (items, discount, delivery, VAT, card held, charged, refunded), and its history. From here you can:', bullets: [
        'Message customer — an email about their order.',
        'Issue VAT invoice — for charged orders, once company details are saved.',
        'Refund… — ask for money back (a manager approves it in Refunds).',
        'Cancel order — only before it is charged. Give a reason; the customer sees it. The card hold, stock and delivery slot are released.',
      ] },
      { heading: 'All orders & search', text: 'The “All orders & search” switch at the top lists every order, including cancelled and refunded ones. Search by order number, customer name, email or postcode, and filter by stage or the dates it was placed.' },
    ],
    tips: [
      'A card hold is not a charge: the customer is only charged when picking is finished, for exactly what was picked.',
      'How substitutes are priced is set in Settings → Products & stock.',
    ],
  },
  {
    key: 'refunds', area: 'Today', title: 'Refunds', screen: 'refunds', perms: ['refund_requests', 'financials'],
    summary: 'Money back for charged orders. Anyone with refund rights asks; a manager with finance rights decides.',
    who: 'Asking: roles with “Ask for refunds”. Deciding: roles with the finance permission.',
    sections: [
      { heading: 'Asking for a refund', steps: [
        'Open the order (Orders → press the card) and press Refund….',
        'Choose “Refund items” and tick the items, or “Refund an amount” and type it.',
        'Write the reason, for example “2 eggs broken”, and press Ask for approval.',
      ] },
      { heading: 'Deciding', steps: [
        'Open Refunds. The Waiting list shows each request with the order, amount, reason and who asked.',
        'Press Approve to refund, or Reject.',
      ] },
      { heading: 'What happens when you approve', bullets: [
        'The money goes back to the customer’s card (it reaches them in 5–10 days).',
        'A credit note is issued.',
        'Loyalty points earned on the refunded amount are taken back.',
        'The customer is emailed.',
      ] },
    ],
  },

  // ── shop ────────────────────────────────────────────────────────────────────────────────────
  {
    key: 'categories', area: 'Shop', title: 'Categories (step 1)', screen: 'categories', perms: ['inventory_read'],
    summary: 'The aisles of the shop, shown in the shop menu and filters. Set these up first.',
    who: 'Viewing: anyone with product access. Changing: the inventory permission.',
    sections: [
      { heading: 'Adding a category', steps: [
        'Press Add category.',
        'Name — what shoppers see, for example “Rice”.',
        'Inside — leave as “Top level” for a main category, or choose the category it belongs in (for example Basmati inside Rice).',
        'Short description, Picture (computer) and Picture (phone, optional — leave empty to use the computer picture).',
        'Label (optional, for example “New”) and Colours for its card.',
        'Tick “Show in the shop” and, if wanted, “Show on the homepage” (the “Shop by category” section). Press Save.',
      ] },
      { heading: 'Changing the order', text: 'Use the up and down arrows on each row to move a category within its group. The shop menu follows this order straight away.' },
      { heading: 'Removing a category', text: 'Untick “Show in the shop” to hide it. A category can only be deleted (Edit → Delete) when it has no products and no categories inside it.' },
    ],
  },
  {
    key: 'brands', area: 'Shop', title: 'Brands (step 2)', screen: 'brands', perms: ['inventory_read'],
    summary: 'The brands you sell, and the strip of brand logos that scrolls across the homepage.',
    who: 'Viewing: anyone with product access. Changing brands: inventory. The logo strip: content.',
    sections: [
      { heading: 'Adding a brand', steps: [
        'Press Add brand.',
        'Name, Logo (a PNG or SVG with a see-through background looks best) and a short description.',
        'Tick “Visible in the shop” and, for popular brands, “Show in the shop’s brand filter”. Press Save.',
      ] },
      { heading: 'The homepage logo strip', steps: [
        'Open the “Logo strip on the homepage” tab.',
        'Choose “Add a brand to the strip…” to add one; use the arrows to change the order; the bin removes one.',
        'Press Save order. Only brands with a logo show on the website.',
      ] },
    ],
  },
  {
    key: 'products', area: 'Shop', title: 'Products (step 3)', screen: 'products', perms: ['inventory_read'],
    summary: 'Everything you sell: names, prices, photos, food information, stock and suppliers.',
    who: 'Viewing: anyone with product access. Adding and changing: inventory. Changing prices: pricing.',
    sections: [
      { heading: 'The list', bullets: [
        'Search by name or SKU.',
        'Show — On sale, Drafts, Archived or All (the number in brackets is how many).',
        'Category — only products in one category.',
        'Needs fixing — products missing food information, with no price, no photo, running low or out of stock.',
        'Press a product to open it. “Clear all filters” resets the list.',
      ] },
      { heading: 'Adding a product (six steps)', steps: [
        'Category — choose where it goes, or “Add a new category”.',
        'Brand — choose it, “No brand” (loose produce), or “Add a new brand”.',
        'How it’s sold — In a pack (one price per item) or By weight (price per kg, weighed when picked: set the typical weight, smallest amount and steps in grams or kilos). Tick whether it is food or drink and fresh/chilled/frozen; choose the VAT rate and any age limit.',
        'Name — the product name, pack size (for example 5 kg) and stock code (made for you; change it if you have your own).',
        'Price — the price (per kg for weighed items) and the maker’s recommended price if you want. You can add the price later.',
        'Photos — add as many as you like; the first is the main photo. Describe each one. Then press Create product. It is saved as a draft and opens in the editor.',
      ] },
      { heading: 'The product editor', bullets: [
        'Details — everything from the steps above, plus extra categories, origin, storage, where it comes from, a label on the photo and the position in “Featured” order.',
        'Price — change the price now or from a date and time, with a reason. Old prices are kept in the history (needed for honest “was” prices).',
        'Food information — ingredients (allergens in CAPITALS), the 14 allergens (contains / may contain), nutrition per 100 g or 100 ml, and the company named on the pack. Tick “I have checked the allergens” to record your name and the date.',
        'Photos — add, describe, reorder (first is the main photo) and remove, then Save photos.',
        'Stock & suppliers — stock at the hub, Change stock, Reorder levels, the suppliers you buy it from, and its stock history.',
      ] },
      { heading: 'On sale, draft or archived', bullets: [
        'Put on sale — shows it in the shop straight away (it needs a price).',
        'Take off sale — back to a draft, hidden from the shop.',
        'Archive — hides it for good without losing its order history; “Bring back” returns it as a draft.',
      ] },
      { heading: 'Many products at once (CSV)', steps: [
        'Press Download CSV and open it in Excel or Google Sheets.',
        'Change what you need (prices in pounds, e.g. 6.99). Keep the sku column; new SKUs become new products.',
        'Save it as CSV and press Upload CSV. The shop checks every row first and lists any problem; nothing changes until you press Import now. All rows go in together or none do.',
      ] },
      { heading: 'Homepage shelves', text: 'The “Homepage shelves” tab chooses which products appear on the homepage rows (for example “Fresh picks”) and in what order. The headings shoppers see are changed in Website content → Homepage.' },
    ],
    tips: ['UK law requires ingredients, allergens and nutrition for food sold online — use “Needs fixing → Food information missing” to work through them.'],
  },
  {
    key: 'stock', area: 'Shop', title: 'Stock (step 4)', screen: 'stock', perms: ['inventory_read'],
    summary: 'How many of each product you have, what is held for orders, and what is free to sell.',
    who: 'Viewing: anyone with product access. Changing: inventory.',
    sections: [
      { heading: 'What the columns mean', bullets: [
        'In stock — what is on the shelves.',
        'Held — set aside for orders that are not picked yet.',
        'Free to sell — what shoppers can still buy (In stock minus Held). Marked Low or Out.',
        'Reorder at → up to — when to buy more, and how many to fill back up to.',
        'On order — on purchase orders that have not arrived yet.',
      ] },
      { heading: 'Changing stock', steps: [
        'Press Change on a product.',
        'Choose what happened: Delivery arrived, Customer return, Damaged/out of date/lost, or Correction after counting (add or remove).',
        'Type how many and an optional note, then Save. It is recorded in the product’s history (press the product name to see it).',
      ] },
      { heading: 'Reorder levels', text: 'Press Levels to set “Buy more when stock is at or below”, “Fill back up to” and what one costs you. These drive the Low label and the automatic draft purchase orders.' },
      { heading: 'A full stock count', steps: [
        'Press Download count sheet.',
        'Write the number you counted in the on_hand column.',
        'Press Upload count. Every row is checked first; then press Import now.',
      ] },
    ],
    tips: ['Orders, picking and received purchase orders change stock automatically — Change is only for everything else.'],
  },
  {
    key: 'buying', area: 'Shop', title: 'Suppliers & buying (step 5)', screen: 'buying', perms: ['inventory_read'],
    summary: 'The companies you buy from, and the purchase orders you send them.',
    who: 'Viewing: anyone with product access. Changing: inventory.',
    sections: [
      { heading: 'Suppliers', steps: [
        'Open the Suppliers tab and press Add supplier.',
        'Company name, contact person, what they supply, order email, phone and the days from order to delivery.',
        'Tick “I have checked these contact details are right” only after checking them — only then does the shop email purchase orders to them.',
        'Link products to the supplier in the product’s Stock & suppliers tab, with their code and your cost.',
      ] },
      { heading: 'Purchase orders', steps: [
        'Press New purchase order, choose the supplier, add products, quantities and costs, and Save draft. Or press “Draft orders for low stock” to get one draft per supplier for everything running low.',
        'Open a draft and press Send to supplier (emails them) or Mark as sent (if you order by phone).',
        'When the delivery arrives, press Receive delivery and type what came. Stock goes up straight away. Part deliveries are fine — receive the rest later.',
        'Cancel order if it is no longer needed (tell the supplier yourself if it was sent).',
      ] },
      { heading: 'Statuses', bullets: ['Draft — not sent yet.', 'Sent — waiting for the delivery.', 'Part received — some items arrived.', 'Received — everything arrived.', 'Cancelled.'] },
    ],
  },

  // ── customers ───────────────────────────────────────────────────────────────────────────────
  {
    key: 'customers', area: 'Customers', title: 'Customers', screen: 'customers', perms: ['customer_messaging'],
    summary: 'Everyone who shops with you: orders, points, addresses and what they agreed to receive.',
    who: 'Roles with the customers permission. Giving or taking points: finance.',
    sections: [
      { heading: 'The list', text: 'Search by name, email or phone, and filter Active, VIP or Flagged. “Offers OK” means they agreed to marketing emails.' },
      { heading: 'One customer', bullets: [
        'Contact — email, phone, whether they have a login and what they agreed to.',
        'Status and private notes — mark them VIP, or Flagged to warn the team. Private notes are never shown to the customer.',
        'Orders — press one to open it.',
        'Loyalty points — balance, points earned ever, tier and history. “Give or take points” needs a reason the customer can see.',
        'Addresses, emails sent and reviews.',
        'Email customer — a service email about their order or account.',
      ] },
    ],
  },
  {
    key: 'reviews', area: 'Customers', title: 'Reviews', screen: 'reviews', perms: ['customer_messaging'],
    summary: 'Customer reviews wait here until someone approves them. Only published reviews show in the shop and count in star ratings.',
    who: 'Roles with the customers permission.',
    sections: [
      { heading: 'Deciding', steps: ['Open the Waiting list.', 'Read the review. “Verified buyer” means they bought it from you.', 'Press Publish or Reject. Published and Rejected keep a record of who decided and when.'] },
      { heading: 'What to publish', bullets: ['Publish honest reviews, good or bad — hiding fair negative reviews is not allowed under UK consumer law.', 'Reject reviews that are rude, off-topic, contain personal details or are clearly fake.'] },
    ],
  },
  {
    key: 'emails', area: 'Customers', title: 'Emails', screen: 'emails', perms: ['customer_messaging'],
    summary: 'The wording of every email the shop sends. The shop fills in names, orders and links for you.',
    who: 'Roles with the customers permission.',
    sections: [
      { heading: 'Changing an email', steps: [
        'Choose a group with the chips at the top: Orders, Account, Marketing or Suppliers.',
        'Press an email to open it.',
        'Change the subject and the message. Grey fill-in fields like {{first_name}} are replaced for each customer — click one to put it where your cursor is.',
        'Check the Preview underneath, then press Save wording. The next email of that kind uses the new words.',
      ] },
      { heading: 'What was sent', text: 'Press “See what was sent” for every email sent or waiting: Waiting to send, Sent, Failed or Not sent (no consent). If one failed, fix the cause (often the email address) and press Try again.' },
      { heading: 'Connection', text: 'Emails are sent through Resend from your own address. Until your developer connects it, they wait in a queue and go out once it is connected. Password-reset and staff-invitation emails use the same address.' },
    ],
    tips: ['Some links are required by law (for example unsubscribe) and cannot be removed.'],
  },

  // ── marketing ───────────────────────────────────────────────────────────────────────────────
  {
    key: 'offers', area: 'Marketing', title: 'Offers & codes', screen: 'offers', perms: ['pricing'],
    summary: 'Discounts, multi-buys, members’ prices, free delivery and promo codes.',
    who: 'Roles with the pricing permission.',
    sections: [
      { heading: 'Kinds of offer', bullets: [
        'Percentage off — e.g. 10% off the basket, or 20% off chosen products.',
        'Money off — e.g. £5 off orders over £40.',
        'Buy some, pay for fewer — e.g. 3 for the price of 2.',
        'Bundle price — e.g. any 2 for £5.',
        'Members’ price — a lower price for signed-in customers.',
        'Free delivery.',
      ] },
      { heading: 'Creating an offer', steps: [
        'Press New offer and pick the kind.',
        'Name — what shoppers see on the product, basket and receipt.',
        'How much — the percentage, amount or bundle.',
        'On what — the whole basket, or chosen products, categories or brands; minimum spend; first order only; whether it can be combined with other offers; delivery areas.',
        'Code — switch on “Shoppers need to type a code” and type it (e.g. SPRING10). Without a code it applies automatically.',
        'When and how often — start, end, total uses and uses per customer.',
        'The green line at the top says exactly what shoppers get. Press “Create and switch on”, or “Save as draft”.',
      ] },
      { heading: 'Managing offers', bullets: ['Pause or End now at any time.', 'Add more codes, or make single-use codes (for leaflets) and Download codes.', 'Switch a single code off with its switch.', 'Loyalty rewards appear here too but are changed under Loyalty.'] },
    ],
    tips: ['The basket tells shoppers why a code does not work (minimum spend, wrong area, expired…).'],
  },
  {
    key: 'loyalty', area: 'Marketing', title: 'Loyalty', screen: 'loyalty', perms: ['pricing'],
    summary: 'Points customers earn when their order is charged, and the rewards they swap them for.',
    who: 'Roles with the pricing permission. Switching loyalty on/off and the earning rate: Store Manager.',
    sections: [
      { heading: 'Earning', text: 'Points are earned on the products in an order (after discounts) once it is picked and charged; refunds take them back. Set “Points for every £1 spent” and switch loyalty on or off (balances are kept when it is off).' },
      { heading: 'Tiers', text: 'A tier is reached when a customer has earned a number of points in total (spending points does not lower it). Its multiplier gives more points on future orders, e.g. 1.5 = 50% more. Press Add tier or a tier to change it.' },
      { heading: 'Rewards', text: 'A reward is “£X off for N points”, with an optional minimum spend. Customers swap points for a one-time code in their account. Untick “Customers can choose this reward” to stop offering it.' },
    ],
  },
  {
    key: 'content', area: 'Marketing', title: 'Website content', screen: 'content', perms: ['content'],
    summary: 'The words, pictures and buttons on every page of the website. Saved changes appear on the live site straight away.',
    who: 'Roles with the content permission.',
    sections: [
      { heading: 'Pages', text: 'On the left: “Every page” (header, menus, footer and messages), “Shop pages” (Homepage, Shop, Product page, Checkout…) and “Information pages” (Delivery, FAQs, Terms…). “Find text” searches for any words you can see on the website.' },
      { heading: 'Sections of a page', bullets: [
        'A page is shown as its sections, top to bottom, each with a picture and its headline so you can recognise it.',
        'Who sees it — Everyone, Computers only, Phones only or Nobody (hidden). Changes straight away.',
        'The arrows move a section up or down; “Fixed place” sections always stay where they are.',
        'Edit opens the section.',
      ] },
      { heading: 'Editing a section', steps: [
        'Each field is marked by type: Words, Paragraphs, Picture, Button, Link, List, Icon, Colour, Number, On/off, Choice, Product shelf or Video.',
        'Buttons ask “What should the button say?” and “Where should it take people?” — choose a page, a category, a brand, a product, offers, a search, an information page, part of the homepage, another website, an email or a phone number. “Goes to:” confirms it.',
        'Pictures have a computer picture and an optional phone picture; choose from the picture library or upload one, and describe it.',
        'Lists (slides, cards, links…) — Add another, reorder with the arrows, duplicate or remove items.',
        'Paragraphs have buttons for headings, bold, italic, lists and links, and a Preview.',
        'Changed fields are outlined in yellow. Press Save changes (or Undo my changes).',
        'The preview on the right shows the saved page as a computer or a phone; it refreshes after you save.',
      ] },
      { heading: 'Information pages', text: 'Write the page, then switch on Published. Legal pages (Terms, Privacy, Cookies, Returns) should be checked by your solicitor before publishing. “How this page looks on Google” sets the title, description and sharing picture.' },
    ],
  },

  // ── set-up ──────────────────────────────────────────────────────────────────────────────────
  {
    key: 'delivery', area: 'Set-up', title: 'Delivery areas & slots', screen: 'delivery', perms: ['fleet_management'],
    summary: 'Where you deliver, what it costs, the times shoppers can book, and your vans and drivers.',
    who: 'Roles with the fleet permission.',
    sections: [
      { heading: 'Areas', steps: [
        'Press Add area (it starts with the same times and charges as your first area).',
        'Area name, what shoppers see (e.g. “Hatfield, AL10”) and the postcode districts, separated by commas (e.g. AL10, AL9; use “AL10 9” for part of a district).',
        'Minimum order, “Delivering here” and “Show in the list of popular areas”.',
      ] },
      { heading: 'Delivery charges', text: 'The first row is the charge for every basket; add levels for cheaper or free delivery above an amount (e.g. £3.50, free from £50). New charges apply from now; placed orders keep theirs.' },
      { heading: 'Weekly times', text: 'Each row is a delivery window: day, from, to, how many orders it takes, the order-by time, a name and an optional extra charge. “Copy Monday to Tue–Fri” saves typing. Bookable slots for the coming days are rebuilt when you save; slots with bookings stay as they are.' },
      { heading: 'Upcoming slots', text: 'The next two weeks, day by day. Change size sets how many orders one slot takes (never below what is booked); Close stops new bookings (existing ones stay).' },
      { heading: 'Vans & drivers', text: 'Add vans (short code, name, chilled) and drivers (name, mobile). Only working vans and drivers can be chosen when sending orders out. Customers see the driver’s first name only.' },
    ],
  },
  {
    key: 'staff', area: 'Set-up', title: 'Staff & roles', screen: 'staff', perms: ['user_management'],
    summary: 'Who can use the store portal, and what each role is allowed to do.',
    who: 'Roles with the staff permission. Changing what roles can do: Store Manager.',
    sections: [
      { heading: 'Inviting someone', steps: [
        'Press Invite someone.',
        'Type their full name and email and choose a role (each role says what it is for).',
        'Press Send invitation. They get an email with a link to choose a password and land in the portal. If they already have an account with the shop, they are added straight away and sign in with their usual password.',
      ] },
      { heading: 'Changing someone', bullets: [
        'Press a person to change their name or role.',
        '“Send invitation again” if they did not get the email.',
        'Deactivate people who leave — they can no longer sign in; their past work stays in the records. Reactivate brings them back.',
        'There is always at least one Store Manager; the last one cannot be removed.',
      ] },
      { heading: 'What each role can do', text: 'The “What each role can do” tab is a grid of permissions per role. Tick or untick, then press Save under that role. The Store Manager always keeps everything. People see the change the next time their page loads.' },
    ],
  },
  {
    key: 'settings', area: 'Set-up', title: 'Settings', screen: 'settings', perms: ['full_access', 'financials'],
    summary: 'How the shop works, and your company and VAT details.',
    who: 'Shop settings: Store Manager. Company & VAT: the finance permission.',
    sections: [
      { heading: 'Shop settings', bullets: [
        'Store details — support email and phone, website address, the address emails are sent from.',
        'Checkout & payments — test mode or Stripe, minutes to finish paying, the extra hold for weighed items, the most of one item per order.',
        'Delivery — days of slots shown, minutes a slot is held, what free delivery is worked out on.',
        'Products & stock — how substitutes are priced, when to show “only a few left”, automatic draft purchase orders.',
        'Loyalty, Customer emails (welcome code, basket reminders, alerts, repeat orders) and Legal & invoices.',
        'Switches and drop-downs save straight away; typed boxes have a Save button. Grey settings at the bottom are fixed by the developer.',
      ] },
      { heading: 'Company & VAT', text: 'Registered company name, company number, VAT number, registered address and the start of invoice and credit-note numbers. Then switch on “Issue VAT invoices” under Shop settings → Legal & invoices. Under VAT rates, press Confirm once your accountant has checked each rate.' },
    ],
  },
  {
    key: 'activity', area: 'Set-up', title: 'Activity log', screen: 'activity', perms: ['full_access'],
    summary: 'Every change made in the store portal and by the system: who, what and when. Nothing here can be changed or deleted.',
    who: 'Store Manager.',
    sections: [
      { heading: 'Using it', bullets: ['Search by action or item number, or choose a kind of item (orders, products, settings…).', 'Press a line to see exactly what changed.', 'Newest first; use “Older ›” to go back further.'] },
    ],
    tips: ['Use it to answer questions like “who changed this price?” or “when was this order cancelled?”.'],
  },
];
