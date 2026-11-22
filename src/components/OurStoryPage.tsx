import React, { useState } from 'react';
import { ChevronRight, Sparkles, Heart, CheckCircle2, Play, ArrowRight, ShoppingBag, Users } from 'lucide-react';
import { useNavigation } from '../context/NavigationContext';
import { VideoModal } from './VideoModal';
import { useCms } from '../cms/CmsProvider';
import { CmsA, CmsImg, CmsSection, InlineText, RichText } from '../cms/components';
import { CmsIcon } from '../cms/icons';
import { useSeo } from '../cms/hooks';
import { useBrands, useProducts } from '../lib/catalogue';
import type { CmsSectionKey } from '../cms/content.gen';

/** "Our Story": every section comes from the CMS (Content → Our Story), in the order the admin set. */
export const OurStoryPage: React.FC = () => {
  const cms = useCms();
  useSeo('story');
  const { goToHome } = useNavigation();
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const { data: brands = [] } = useBrands();
  const { data: listing } = useProducts({ limit: 1 });
  const live = (v: string) => v.replace('{brands}', String(brands.length)).replace('{products}', String(listing?.total ?? ''));
  const primary = cms.link('story.hero.primary');
  const videoButton = cms.t('story.hero.video_button');

  const sections: Record<string, React.ReactNode> = {
    hero: (
      <section className="relative w-full bg-[#F8FAFC] border-b border-stone-200 py-16 sm:py-24 lg:py-28 overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#F5D103]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-[#FEF08A]/40 rounded-full blur-3xl pointer-events-none" />
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-stone-200 shadow-2xs text-[#B45309] text-xs font-bold uppercase tracking-widest mb-6">
              <Sparkles className="w-3.5 h-3.5 text-[#B45309]" />
              <span>{cms.t('story.hero.eyebrow')}</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#18181B] tracking-tight leading-[1.08] mb-6">
              <InlineText text={cms.t('story.hero.title')} strongClass="font-extrabold underline decoration-[#F5D103] decoration-4 underline-offset-8" />
            </h1>
            <p className="text-base sm:text-xl text-stone-600 leading-relaxed font-normal max-w-2xl mx-auto mb-10">{cms.t('story.hero.text')}</p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              {primary.label && (
                <CmsA link={primary} className="btn-magnetic inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] text-sm font-bold shadow-sm transition-all cursor-pointer group">
                  <span>{primary.label}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </CmsA>
              )}
              {videoButton && (
                <button type="button" onClick={() => setIsVideoModalOpen(true)} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-white hover:bg-stone-50 border border-stone-200 text-[#18181B] text-sm font-bold shadow-2xs transition-all cursor-pointer">
                  <Play className="w-4 h-4 fill-current text-[#B45309]" />
                  <span>{videoButton}</span>
                </button>
              )}
            </div>
          </div>
          {cms.get('story.hero.metrics').length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mt-16 sm:mt-20 max-w-5xl mx-auto">
              {cms.get('story.hero.metrics').map((m, i) => (
                <div key={i} className="bg-white rounded-2xl p-5 border border-stone-200/90 shadow-2xs text-center">
                  <p className="text-3xl sm:text-4xl font-extrabold text-[#18181B] mb-1">{live(m.value)}</p>
                  <p className="text-xs sm:text-sm text-stone-500 font-medium">{m.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    ),
    genesis: (
      <section className="py-16 sm:py-24 bg-white border-b border-stone-200/80">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="lg:col-span-6 order-2 lg:order-1">
              <div className="relative rounded-3xl overflow-hidden shadow-xl border border-stone-200/90 aspect-[4/3] group">
                <CmsImg k="story.genesis.image" className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-6 left-6 right-6 text-white">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#F5D103] mb-1">{cms.t('story.genesis.image_eyebrow')}</p>
                  <p className="text-lg font-bold">{cms.t('story.genesis.image_caption')}</p>
                </div>
              </div>
            </div>
            <div className="lg:col-span-6 order-1 lg:order-2 flex flex-col items-start">
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#B45309] mb-3">
                <Heart className="w-3.5 h-3.5 text-[#B45309]" />
                <span>{cms.t('story.genesis.eyebrow')}</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#18181B] tracking-tight mb-5 leading-[1.15]">
                <InlineText text={cms.t('story.genesis.title')} strongClass="bg-amber-100 text-[#B45309] px-2 py-0.5 rounded-lg" />
              </h2>
              <RichText text={cms.t('story.genesis.body')} className="space-y-4 text-stone-600 text-sm sm:text-base leading-relaxed font-normal" />
              {cms.get('story.genesis.points').length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-8 w-full">
                  {cms.get('story.genesis.points').map((p, i) => (
                    <div key={i} className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-[#18181B]">
                      <CheckCircle2 className="w-4 h-4 text-[#B45309] shrink-0" />
                      <span>{p.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    ),
    film: (
      <section className="py-16 sm:py-20 bg-[#18181B] text-white relative overflow-hidden">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 relative z-10">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-bold uppercase tracking-widest text-[#F5D103] block mb-2">{cms.t('story.film.eyebrow')}</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4 text-white">{cms.t('story.film.title')}</h2>
            <p className="text-sm sm:text-base text-white/80 max-w-xl mx-auto">{cms.t('story.film.text')}</p>
          </div>
          <div className="relative max-w-4xl mx-auto rounded-3xl overflow-hidden shadow-2xl border border-stone-700 aspect-[16/9] bg-stone-950 group">
            {cms.get('story.film.background_video') && (
              <video autoPlay muted loop playsInline className="w-full h-full object-cover opacity-80 group-hover:scale-102 transition-transform duration-700">
                <source src={cms.get('story.film.background_video')} type="video/mp4" />
              </video>
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <button type="button" onClick={() => setIsVideoModalOpen(true)} aria-label={cms.t('story.film.play_aria')}
                className="w-20 h-20 rounded-full bg-[#F5D103] text-[#18181B] hover:bg-[#E5A800] flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-2xl cursor-pointer group/btn">
                <Play className="w-8 h-8 fill-current ml-1 group-hover/btn:scale-110 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </section>
    ),
    pillars: (
      <section className="py-16 sm:py-24 bg-[#F8FAFC] border-b border-stone-200/80">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-[#B45309] block mb-2">{cms.t('story.pillars.eyebrow')}</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#18181B] tracking-tight mb-3">{cms.t('story.pillars.title')}</h2>
            <p className="text-sm sm:text-base text-stone-600">{cms.t('story.pillars.text')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {cms.get('story.pillars.items').map((p, i) => (
              <div key={i} className="bg-white rounded-3xl p-7 border border-stone-200/90 hover:border-stone-400 hover:shadow-xl transition-all duration-300 flex flex-col justify-between group">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 text-[#B45309] flex items-center justify-center mb-5"><CmsIcon name={p.icon} className="w-6 h-6" /></div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-600 block mb-1">{p.badge}</span>
                  <h3 className="text-lg font-bold text-[#18181B] mb-3">{p.title}</h3>
                  <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-normal">{p.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    ),
    timeline: (
      <section className="py-16 sm:py-24 bg-white border-b border-stone-200/80">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-[#B45309] block mb-2">{cms.t('story.timeline.eyebrow')}</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#18181B] tracking-tight mb-3">{cms.t('story.timeline.title')}</h2>
            <p className="text-sm sm:text-base text-stone-600">{cms.t('story.timeline.text')}</p>
          </div>
          <div className="max-w-4xl mx-auto space-y-5">
            {cms.get('story.timeline.items').map((m, i) => (
              <div key={i} className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-2xs flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-8 hover:shadow-md transition-shadow">
                <span className="text-2xl sm:text-3xl font-extrabold text-[#B45309] bg-amber-100 px-4 py-2 rounded-2xl shrink-0 self-start">{m.year}</span>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-[#18181B] mb-1.5">{m.title}</h3>
                  <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-normal">{m.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    ),
    promise: (
      <section className="py-16 sm:py-24 bg-[#F8FAFC]">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
          <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-stone-200 p-8 sm:p-12 text-center shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 text-[#B45309] flex items-center justify-center mx-auto mb-5"><Users className="w-7 h-7" /></div>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-[#18181B] mb-4">{cms.t('story.promise.title')}</h3>
            <p className="text-sm sm:text-base text-stone-600 leading-relaxed font-normal mb-8">{cms.t('story.promise.quote')}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {cms.link('story.promise.primary').label && (
                <CmsA link={cms.link('story.promise.primary')} className="btn-magnetic px-8 py-3 rounded-full bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4" /><span>{cms.link('story.promise.primary').label}</span>
                </CmsA>
              )}
              {cms.link('story.promise.secondary').label && (
                <CmsA link={cms.link('story.promise.secondary')} className="px-6 py-3 rounded-full bg-white hover:bg-stone-50 border border-stone-200 text-xs font-bold text-[#18181B] transition-all cursor-pointer" />
              )}
            </div>
          </div>
        </div>
      </section>
    ),
  };

  return (
    <div className="w-full bg-white min-h-screen text-[#18181B] pb-24 animate-fadeIn">
      <div className="border-b border-stone-200 bg-[#F8FAFC] py-3.5 px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div className="w-full flex items-center justify-between">
          <nav aria-label={cms.t('shop.header.crumb_aria')} className="flex items-center gap-2 text-xs text-stone-600">
            <button type="button" onClick={goToHome} className="hover:text-[#B45309] transition-colors cursor-pointer">{cms.t('shop.header.crumb_home')}</button>
            <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
            <span className="text-[#18181B] font-bold" aria-current="page">{cms.t('story.hero.crumb')}</span>
          </nav>
          <span className="text-xs text-stone-500 hidden sm:inline-block">{cms.t('story.hero.tagline')}</span>
        </div>
      </div>
      {cms.sectionOrder('story').filter((k) => k in sections).map((k) => (
        <CmsSection key={k} k={`story.${k}` as CmsSectionKey}>{sections[k]}</CmsSection>
      ))}
      <VideoModal isOpen={isVideoModalOpen} onClose={() => setIsVideoModalOpen(false)} />
    </div>
  );
};
