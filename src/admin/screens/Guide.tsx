import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import { useAuth } from '../../context/AuthContext';
import { AREA, Card, Screen, SearchInput, cx, type AreaName } from '../ui';

// One place that explains every part of the store portal in plain English: what each screen is
// for, how to do the common jobs, and the order to set a new shop up in.

interface Topic { screen: string; area: AreaName; title: string; what: string; steps: string[]; perms?: string[] }

const SETUP: Array<{ title: string; text: string; screen: string }> = [
  { title: 'Categories', text: 'Add the aisles of your shop (Rice, Spices & Masala…), with a picture each.', screen: 'categories' },
  { title: 'Brands', text: 'Add the brands you sell, with their logos.', screen: 'brands' },
  { title: 'Products', text: 'Add each product in six short steps, fill in food information, then put it on sale.', screen: 'products' },
  { title: 'Stock', text: 'Enter how many of each product you have, and when to buy more.', screen: 'stock' },
  { title: 'Suppliers', text: 'Add who you buy from, so purchase orders can be drafted for you.', screen: 'buying' },
  { title: 'Delivery areas & times', text: 'Postcodes you deliver to, delivery charges and weekly delivery times.', screen: 'delivery' },
  { title: 'Company & VAT', text: 'Company name, number, VAT number and address for invoices (Settings).', screen: 'settings' },
  { title: 'Website content & legal pages', text: 'Check the homepage words and pictures; publish Terms, Privacy, Cookies and Returns.', screen: 'content' },
];

const DAY: string[] = [
  'Open Home: the tiles show orders to pick, ready to send and on the road.',
  'Orders → New: press Start picking on the earliest delivery, pick each item, then Finish & charge.',
  'Orders → Ready to send: press Send out and choose the van and driver.',
  'Orders → On the road: press Delivered when each order is handed over.',
  'Check Needs attention on Home: low stock, reviews to approve, refunds to decide.',
];

const TOPICS: Topic[] = [
  { screen: 'dashboard', area: 'Today', title: 'Home', what: 'Today’s work, anything that needs fixing, the set-up checklist and how sales are going.',
    steps: ['The big tiles are today’s work — press one to go straight there.', 'Needs attention lists problems such as low stock or missing food information.', 'Sales shows orders and money for today, 7 days, 30 days or the year.'] },
  { screen: 'orders', area: 'Today', title: 'Orders', what: 'Every order on one board, from New to Delivered. Each card has one button for its next step.', perms: ['order_status', 'packing_queue', 'orders_dispatch'],
    steps: ['New → Start picking. Pick each item: Picked, Missing, or Replace with something similar.', 'Weighed items: type the weight from the scale in grams or kilos.', 'Finish & charge takes the exact amount from the card hold.', 'Ready to send → Send out (van and driver). On the road → Delivered.', 'All orders & search finds any order, including cancelled and refunded ones. Press an order to cancel, refund, message the customer or issue a VAT invoice.'] },
  { screen: 'refunds', area: 'Today', title: 'Refunds', what: 'Refund requests waiting for a manager.', perms: ['refund_requests', 'financials'],
    steps: ['Anyone with refund rights opens an order and presses Refund… (items or an amount, with a reason).', 'A manager approves or rejects it here. Approving returns the money to the card, issues a credit note and emails the customer.'] },
  { screen: 'categories', area: 'Shop', title: '1 · Categories', what: 'The aisles of the shop. Set these up first.', perms: ['inventory_read'],
    steps: ['Add category: name, picture, and whether it sits inside another category.', 'Use the arrows to set the order in the shop menu.', 'Hide a category instead of deleting it if it has products.'] },
  { screen: 'brands', area: 'Shop', title: '2 · Brands', what: 'The brands you sell, and the logo strip on the homepage.', perms: ['inventory_read'],
    steps: ['Add brand: name and logo.', 'Tick “Show in the shop’s brand filter” for popular brands.', 'Logo strip tab: choose and order the logos that scroll on the homepage.'] },
  { screen: 'products', area: 'Shop', title: '3 · Products', what: 'Everything you sell.', perms: ['inventory_read'],
    steps: ['Add product: category → brand → how it’s sold → name → price → photos. It is saved as a draft.', 'Open it and fill in Food information (ingredients, allergens, nutrition) — needed by law for food.', 'Press Put on sale. Archive hides a product for good.', 'Use “Needs fixing” to find products missing food information, a price or a photo.', 'Homepage shelves tab: choose the products on homepage rows like “Fresh picks”.', 'Download CSV / Upload CSV changes many products at once.'] },
  { screen: 'stock', area: 'Shop', title: '4 · Stock', what: 'How many you have, what is held for orders and what is free to sell.', perms: ['inventory_read'],
    steps: ['Change: record deliveries, breakages, returns or corrections.', 'Levels: when to buy more and how many to fill up to.', 'Did a full count? Download the count sheet, fill it in, upload it.'] },
  { screen: 'buying', area: 'Shop', title: '5 · Suppliers & buying', what: 'Who you buy from, and purchase orders.', perms: ['inventory_read'],
    steps: ['Add suppliers, then link products to them in the product’s Stock & suppliers tab.', 'Draft orders for low stock creates one draft per supplier.', 'Send the order, then Receive delivery when it arrives — stock goes up straight away.'] },
  { screen: 'customers', area: 'Customers', title: 'Customers', what: 'Everyone who shops with you: orders, points, addresses and what they agreed to receive.', perms: ['customer_messaging'],
    steps: ['Mark a customer VIP or Flagged; add private notes only staff see.', 'Email a customer about their order or account.', 'Give or take loyalty points with a reason.'] },
  { screen: 'reviews', area: 'Customers', title: 'Reviews', what: 'Reviews wait here until approved.', perms: ['customer_messaging'],
    steps: ['Publish honest reviews, good or bad.', 'Reject rude, fake or off-topic ones.'] },
  { screen: 'emails', area: 'Customers', title: 'Emails', what: 'The wording of every email the shop sends.', perms: ['customer_messaging'],
    steps: ['Open an email and change the subject and message.', 'Grey fill-in fields such as {{first_name}} are replaced for each customer — click one to insert it.', 'Emails are sent through Resend from your own address once it is connected.'] },
  { screen: 'offers', area: 'Marketing', title: 'Offers & codes', what: 'Discounts, multi-buys, members’ prices, free delivery and promo codes.', perms: ['pricing'],
    steps: ['New offer: pick the kind of offer and answer the questions.', 'Add a code if shoppers should type one; otherwise it applies automatically.', 'Switch it on, pause it or end it any time.'] },
  { screen: 'loyalty', area: 'Marketing', title: 'Loyalty', what: 'Points customers earn and the rewards they swap them for.', perms: ['pricing'],
    steps: ['Set how many points £1 earns.', 'Tiers multiply points for loyal customers.', 'Rewards are “£X off for N points”.'] },
  { screen: 'content', area: 'Marketing', title: 'Website content', what: 'The words, pictures and buttons on every page of the website.', perms: ['content'],
    steps: ['Pick a page; its sections are listed top to bottom with a picture and headline.', 'Choose who sees a section: everyone, computers only, phones only, or nobody.', 'Edit → change words, pictures and buttons → Save. The preview shows the real page.', 'For a button, answer “What should it say?” and “Where should it take people?”.', 'Use Find text to search for any words you can see on the site.'] },
  { screen: 'delivery', area: 'Set-up', title: 'Delivery areas & slots', what: 'Where you deliver, what it costs and when.', perms: ['fleet_management'],
    steps: ['Each area is a list of postcode districts (e.g. AL10).', 'Delivery charges: a charge from £0 and cheaper or free above an amount.', 'Weekly times become bookable slots automatically; close or resize a single slot under Upcoming slots.', 'Vans & drivers are chosen when orders are sent out.'] },
  { screen: 'staff', area: 'Set-up', title: 'Staff & roles', what: 'Who can use the store portal and what each role can do.', perms: ['user_management'],
    steps: ['Invite someone with their name, email and role — they get an email to set a password.', 'Deactivate people who leave.', 'What each role can do: tick permissions per role.'] },
  { screen: 'settings', area: 'Set-up', title: 'Settings', what: 'How the shop works, and company & VAT details.', perms: ['full_access', 'financials'],
    steps: ['Switches and drop-downs save straight away; typed boxes have a Save button.', 'Company & VAT: needed before VAT invoices can be issued.'] },
  { screen: 'activity', area: 'Set-up', title: 'Activity log', what: 'Every change, by whom and when. Nothing can be edited here.', perms: ['full_access'],
    steps: ['Search by action or item number; press a line to see exactly what changed.'] },
];

export default function GuideScreen({ go }: ScreenProps) {
  const { hasPermission } = useAuth();
  const [q, setQ] = useState('');
  const can = (t: Topic) => !t.perms || t.perms.some((p) => hasPermission(p));
  const topics = useMemo(() => {
    const s = q.trim().toLowerCase();
    return TOPICS.filter((t) => !s || `${t.title} ${t.what} ${t.steps.join(' ')}`.toLowerCase().includes(s));
  }, [q]);

  return (
    <Screen title="Guide" intro="How every part of the store portal works, in plain English.">
      <SearchInput value={q} onChange={setQ} placeholder="Search the guide, e.g. refund, allergens, delivery charge…" />

      {!q && (
        <div className="grid xl:grid-cols-2 gap-4">
          <Card title="Setting up a new shop, in order" description="Do these once. Each step builds on the one before.">
            <ol className="space-y-2.5">
              {SETUP.map((s, i) => (
                <li key={s.title} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#18181B] text-[#F5D103] text-[12px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <button type="button" onClick={() => go(s.screen)} className="font-semibold text-[14.5px] hover:underline underline-offset-2 cursor-pointer">{s.title}</button>
                    <p className="text-[13.5px] text-[#4B5563]">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
          <Card title="A normal day" description="The jobs most days follow.">
            <ol className="space-y-2.5">
              {DAY.map((d, i) => (
                <li key={i} className="flex items-start gap-3 text-[14px]">
                  <span className="w-6 h-6 rounded-full bg-[#9A5B13] text-white text-[12px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <span className="pt-0.5">{d}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {topics.map((t) => {
          const allowed = can(t);
          return (
            <Card key={t.screen} title={<span className="flex items-center gap-2"><span className={cx('w-2 h-2 rounded-full', AREA[t.area].dot)} />{t.title}</span>} description={t.what}
              actions={allowed ? <button type="button" onClick={() => go(t.screen)} className="inline-flex items-center gap-1 text-[13px] font-semibold hover:underline cursor-pointer">Open <ArrowRight className="w-3.5 h-3.5" /></button>
                : <span className="text-[12px] text-[#7A8594]">Not available for your role</span>}>
              <ul className="space-y-1.5 text-[14px] list-disc pl-5 marker:text-[#9AA3AF]">{t.steps.map((s) => <li key={s}>{s}</li>)}</ul>
            </Card>
          );
        })}
        {!topics.length && <Card><p className="text-[14px] text-[#5F6B7A]">Nothing in the guide matches “{q}”.</p></Card>}
      </div>
    </Screen>
  );
}

