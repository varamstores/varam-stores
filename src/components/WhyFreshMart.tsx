import React from 'react';
import { useNavigation } from '../context/NavigationContext';
import { Link001 } from './ui/skiper40';
import { useCms } from '../cms/CmsProvider';
import { CmsIcon } from '../cms/icons';

export const WhyFreshMart: React.FC = () => {
  const cms = useCms();
  const { navigateHref } = useNavigation();
  const items = cms.get('home.why_us.items');
  if (!items.length) return null;

  return (
    <section className="py-16 sm:py-20 bg-white border-y border-stone-200">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-14">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-[#B45309] block mb-1">{cms.t('home.why_us.eyebrow')}</span>
            <h2 className="text-3xl sm:text-4xl text-[#18181B] font-extrabold tracking-tight">{cms.t('home.why_us.title')}</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm sm:text-base text-stone-500 font-medium">{cms.t('home.why_us.aside')}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map((b, i) => (
            <div key={i} className="bg-[#F8FAFC] rounded-2xl p-6 border border-stone-200 hover:border-[#F5D103] hover:shadow-md transition-all duration-200 flex flex-col items-start justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-white border border-stone-200 text-[#18181B] flex items-center justify-center mb-5 shadow-2xs">
                  <CmsIcon name={b.icon} className="w-6 h-6 text-[#B45309]" />
                </div>
                <h3 className="text-base font-bold text-[#18181B] mb-2">{b.title}</h3>
                <p className="text-sm text-stone-600 leading-relaxed font-normal mb-5">{b.text}</p>
              </div>
              {b.link.label && (
                <Link001
                  href={b.link.href}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateHref(b.link.href);
                  }}
                  className="text-xs font-bold text-[#B45309] hover:text-[#D97706] transition-colors"
                >
                  {b.link.label}
                </Link001>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export const WhyVaramStores = WhyFreshMart;
