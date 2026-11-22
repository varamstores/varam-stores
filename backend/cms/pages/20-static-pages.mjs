import { page, section, text, richtext, list, f } from '../define.mjs';

// Content pages. They start UNPUBLISHED with empty bodies: legal and policy wording must come from
// you (or your solicitor), never be made up. Links to an unpublished page are hidden on the site
// automatically; publish a page from Content → Pages once its text is ready.

const STATIC_HELP = 'Write the page in the "Page text" box. Use ## for a heading, - for a bullet, **bold**, and [link text](/shop). The page stays hidden until you switch on "Published".';

const contentPage = (key, label, title, intro, extra = []) => page(key, label, {
  route: `/pages/${key}`,
  kind: 'static',
  published: false,
  help: STATIC_HELP,
  seo: { title, description: null },
}, [
  section('content', 'Page content', STATIC_HELP, [
    text('title', 'Heading', title, { max: 80 }),
    text('intro', 'Short introduction', intro, { max: 300, help: 'Optional line under the heading.' }),
    richtext('body', 'Page text', '', { help: 'Leave empty until the final wording is ready.' }),
    text('updated', 'Last updated line', '', { max: 60, help: 'e.g. "Last updated 22 November 2026". Leave empty to hide.' }),
    ...extra,
  ], { reorderable: false }),
]);

export default [
  contentPage('terms', 'Terms & Conditions', 'Terms & Conditions', ''),
  contentPage('privacy', 'Privacy Policy', 'Privacy Policy', ''),
  contentPage('cookies', 'Cookie Policy', 'Cookie Policy', ''),
  contentPage('returns', 'Returns & Refunds', 'Returns & Refunds', ''),
  contentPage('delivery', 'Delivery Information', 'Delivery Information', ''),
  contentPage('faq', 'FAQs', 'Frequently Asked Questions', '', [
    list('questions', 'Questions & answers', { question: f.text('Question', { max: 160 }), answer: f.richtext('Answer') }, [],
      { maxItems: 60, help: 'Shown as an expandable list under the page text.' }),
  ]),
  contentPage('contact', 'Contact Us', 'Contact Us', '', [
    text('show_details', 'Contact details heading', 'Get in touch', { max: 40, help: 'Your email and phone number (from Settings → Store details) are shown under this heading.' }),
  ]),
  contentPage('sustainability', 'Sustainability', 'Sustainability', ''),
  contentPage('careers', 'Careers', 'Careers', ''),
  contentPage('press', 'Press & Media', 'Press & Media', ''),
  contentPage('nutrition_tips', 'Health & Nutrition Tips', 'Health & Nutrition Tips', ''),
];
