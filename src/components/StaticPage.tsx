import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Mail, Phone } from 'lucide-react';
import { useCms } from '../cms/CmsProvider';
import { RichText } from '../cms/components';
import { useSeo } from '../cms/hooks';
import { useNavigation } from '../context/NavigationContext';
import { useStorefrontConfig } from '../lib/catalogue';

/** A CMS content page (terms, privacy, FAQs…). Unpublished or unknown pages show "not found". */
export const StaticPage: React.FC<{ pageKey: string }> = ({ pageKey }) => {
  const cms = useCms();
  const { goToHome } = useNavigation();
  const { data: config } = useStorefrontConfig();
  const info = cms.page(pageKey);
  const [open, setOpen] = useState<number | null>(null);
  const live = info?.kind === 'static' && info.isPublished;
  useSeo(live ? pageKey : 'home', live ? undefined : { title: cms.t('global.common.page_not_found_title') });

  if (!live) {
    return (
      <div className="w-full min-h-[60vh] flex items-center justify-center px-4 py-20">
        <div className="text-center max-w-md">
          <h1 className="font-serif-heading font-bold text-3xl text-[#18181B] mb-2">{cms.t('global.common.page_not_found_title')}</h1>
          <p className="text-sm text-[#737A72] mb-6">{cms.t('global.common.page_not_found_body')}</p>
          <button type="button" onClick={goToHome} className="px-6 py-3 rounded-full bg-[#18181B] text-[#F5D103] text-xs font-bold cursor-pointer">{cms.t('global.common.back_home')}</button>
        </div>
      </div>
    );
  }

  const v = (name: string) => cms.lookup(`${pageKey}.content.${name}`);
  const title = String(v('title') ?? info.label);
  const intro = String(v('intro') ?? '');
  const body = String(v('body') ?? '');
  const updated = String(v('updated') ?? '');
  const faqs = (v('questions') as { question: string; answer: string }[] | undefined) ?? [];
  const contactHeading = v('show_details');

  return (
    <article className="w-full bg-white pb-24">
      <header className="border-b border-stone-200/80 py-10 sm:py-14">
        <div className="w-full max-w-3xl mx-auto px-4 sm:px-6">
          <nav aria-label={cms.t('shop.header.crumb_aria')} className="flex items-center gap-2 text-xs text-[#737A72] mb-3">
            <button type="button" onClick={goToHome} className="hover:text-[#B45309] cursor-pointer">{cms.t('shop.header.crumb_home')}</button>
            <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
            <span className="text-[#18181B] font-bold" aria-current="page">{title}</span>
          </nav>
          <h1 className="font-serif-heading text-3xl sm:text-4xl font-bold text-[#18181B]">{title}</h1>
          {intro && <p className="mt-3 text-sm sm:text-base text-stone-600">{intro}</p>}
          {updated && <p className="mt-2 text-xs text-stone-400">{updated}</p>}
        </div>
      </header>
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 pt-8 text-sm text-stone-700">
        {body && <RichText text={body} />}
        {typeof contactHeading === 'string' && contactHeading && (config?.supportEmail || config?.supportPhone) && (
          <section className="mt-8 p-5 rounded-2xl border border-stone-200 bg-[#F8FAFC]">
            <h2 className="font-bold text-base text-[#18181B] mb-3">{contactHeading}</h2>
            <ul className="space-y-2">
              {config?.supportEmail && <li className="flex items-center gap-2"><Mail className="w-4 h-4 text-[#B45309]" /><a className="underline" href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a></li>}
              {config?.supportPhone && <li className="flex items-center gap-2"><Phone className="w-4 h-4 text-[#B45309]" /><a className="underline" href={`tel:${config.supportPhone}`}>{config.supportPhone}</a></li>}
            </ul>
          </section>
        )}
        {faqs.length > 0 && (
          <div className="mt-8 divide-y divide-stone-200 border-y border-stone-200">
            {faqs.map((f, i) => (
              <div key={i}>
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? null : i)}
                  aria-expanded={open === i}
                  className="w-full flex items-center justify-between py-4 text-left font-semibold text-[#18181B] cursor-pointer"
                >
                  <span>{f.question}</span>
                  <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`} />
                </button>
                {open === i && <RichText text={f.answer} className="pb-4 text-stone-600" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
};
