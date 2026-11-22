import React from 'react';
import { ArrowRight, Leaf } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useNavigation } from '../context/NavigationContext';
import { useCms } from '../cms/CmsProvider';
import { InlineText, Picture } from '../cms/components';

export const PromoCardsRow: React.FC = () => {
  const cms = useCms();
  const { applyCoupon } = useCart();
  const { navigateHref } = useNavigation();
  const cards = cms.get('home.promo_cards.cards');
  if (!cards.length) return null;

  return (
    <section id="promotions" className="py-10 sm:py-14 bg-white">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div className={`grid grid-cols-1 gap-6 lg:gap-7 ${cards.length === 3 ? 'md:grid-cols-3' : cards.length === 2 ? 'md:grid-cols-2' : ''}`}>
          {cards.map((card, i) => {
            const light = card.theme === 'light';
            const code = card.code?.trim();
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (code) void applyCoupon(code);
                  if (card.href) navigateHref(card.href);
                }}
                className={`gsap-promo-card card-hover-elevate group relative rounded-[28px] overflow-hidden shadow-xs min-h-[360px] sm:min-h-[380px] p-7 sm:p-8 flex flex-col justify-between cursor-pointer text-left border ${light ? 'border-[#F5D103]/40' : 'border-stone-200/70'}`}
              >
                <div className="absolute inset-0 z-0 pointer-events-none">
                  <Picture image={card.image} className="img-zoom-hover w-full h-full object-cover object-center" />
                </div>
                <div className={`relative z-10 max-w-[64%] sm:max-w-[62%] flex flex-col items-start ${light ? 'text-white' : ''}`}>
                  {card.eyebrow && (
                    <div className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] mb-3 ${light ? 'text-stone-200' : 'text-[#B45309]'}`}>
                      <Leaf className={`w-3.5 h-3.5 ${light ? '' : 'fill-[#B45309] text-[#B45309]'}`} />
                      <span>{card.eyebrow}</span>
                    </div>
                  )}
                  <h3 className={`font-serif-heading font-bold text-2xl lg:text-[27px] leading-[1.1] uppercase tracking-tight mb-3 ${light ? 'text-white' : 'text-[#18181B]'}`}>
                    <InlineText text={card.title} emClass="italic font-normal" />
                  </h3>
                  <p className={`text-[12.5px] lg:text-[13px] leading-relaxed font-normal ${light ? 'text-stone-200/90' : 'text-stone-600'}`}>{card.text}</p>
                </div>
                <div className="relative z-10 mt-6 pt-1">
                  {code ? (
                    <div className="btn-magnetic inline-flex items-center gap-3.5 px-4 py-2.5 rounded-2xl bg-white/95 backdrop-blur-md border border-dashed border-stone-300/90 shadow-xs hover:shadow-md transition-all">
                      <div className="text-left">
                        <p className="text-[10px] text-stone-500 font-medium leading-tight">{cms.t('home.promo_cards.code_label')}</p>
                        <p className="text-sm font-sans font-bold text-[#18181B] tracking-wider leading-none mt-0.5">{code}</p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-[#18181B] group-hover:bg-[#E5A800] text-white flex items-center justify-center shadow-xs transition-colors">
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  ) : light ? (
                    <span className="btn-magnetic inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white text-[#18181B] hover:bg-stone-100 text-xs font-bold shadow-md transition-all">
                      <span>{card.button}</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </span>
                  ) : (
                    <span className="btn-magnetic inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-stone-900/5 border border-[#18181B]/60 text-[#18181B] group-hover:bg-[#F5D103] group-hover:text-[#18181B] group-hover:border-[#F5D103] text-xs font-bold transition-all shadow-2xs">
                      <span>{card.button}</span>
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
