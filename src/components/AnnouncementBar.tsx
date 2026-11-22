import React from 'react';
import { Leaf, ChevronRight } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useCms } from '../cms/CmsProvider';
import { CmsA, InlineText } from '../cms/components';

export const AnnouncementBar: React.FC = () => {
  const cms = useCms();
  const { applyCoupon } = useCart();
  const code = cms.t('global.announcement.promo_code').trim();
  const links = cms.get('global.announcement.links');

  return (
    <aside
      aria-label={cms.t('global.announcement.aria')}
      className="bg-[#F5D103] text-[#18181B] text-xs py-2 px-3 sm:px-6 lg:px-10 xl:px-12 border-b border-black/10"
    >
      <div className="w-full flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[#18181B] flex-1 justify-between sm:justify-start min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Leaf className="w-3.5 h-3.5 text-[#18181B] fill-[#18181B] shrink-0" />
            <span className="text-[#18181B] font-semibold text-[10.5px] xs:text-[11px] sm:text-xs truncate">
              {cms.t('global.announcement.message').split('|').map((part, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="text-black/30 mx-1">|</span>}
                  <InlineText text={part.trim()} strongClass="font-extrabold" />
                </React.Fragment>
              ))}
            </span>
          </div>
          {code && (
            <button
              type="button"
              onClick={() => void applyCoupon(code)}
              className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-[#18181B] text-[#F5D103] font-mono font-bold text-[11px] hover:bg-stone-800 hover:scale-105 transition-all shadow-2xs ml-1 cursor-pointer"
              title={cms.t('global.announcement.promo_code_title', { code })}
            >
              {code}
            </button>
          )}
        </div>

        <div className="sm:hidden text-[#18181B] shrink-0">
          <ChevronRight className="w-3.5 h-3.5" />
        </div>

        {links.length > 0 && (
          <div className="hidden sm:flex items-center gap-4 sm:gap-6 text-[#18181B]/80 text-xs font-semibold">
            {links.map((l, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="w-1 h-1 rounded-full bg-black/20" />}
                <CmsA link={l.href} className="hover:text-[#18181B] transition-colors">{l.label}</CmsA>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
