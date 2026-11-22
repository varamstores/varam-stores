import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowRight, Play, ChevronLeft, ChevronRight, BookOpen, Tag, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { VideoModal } from './VideoModal';
import { useNavigation } from '../context/NavigationContext';
import { useCms } from '../cms/CmsProvider';
import { CmsIcon } from '../cms/icons';
import type { CmsEntries } from '../cms/content.gen';

type Slide = CmsEntries['home.hero.slides'][number];

const SecondaryIcon: React.FC<{ icon: Slide['secondaryIcon']; size: 'sm' | 'md' }> = ({ icon, size }) => {
  const box = size === 'sm' ? 'w-5 h-5' : 'w-8 h-8 bg-white shadow-sm border border-stone-200/80 group-hover:scale-108 transition-all';
  const glyph = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5';
  if (icon === 'play') {
    return (
      <div className={`${box} rounded-full ${size === 'sm' ? 'bg-[#18181B] text-[#F5D103]' : 'text-[#18181B]'} flex items-center justify-center`}>
        <Play className={`${glyph} fill-current ml-0.5`} />
      </div>
    );
  }
  return (
    <div className={`${box} rounded-full ${size === 'sm' ? (icon === 'book' ? 'bg-[#F5D103]/20' : 'bg-[#F5D103]') : ''} text-[#18181B] flex items-center justify-center`}>
      {icon === 'book' ? <BookOpen className={glyph} /> : <Tag className={glyph} />}
    </div>
  );
};

export const HeroSection: React.FC = () => {
  const cms = useCms();
  const slides = cms.get('home.hero.slides');
  const highlights = cms.get('home.hero.highlights');
  const autoplayMs = Math.max(0, Number(cms.get('home.hero.autoplay_seconds')) || 0) * 1000;
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const { navigateHref } = useNavigation();
  const touchStartXRef = useRef<number | null>(null);
  const count = slides.length;

  const nextSlide = useCallback(() => setCurrentSlide((p) => (count ? (p + 1) % count : 0)), [count]);
  const prevSlide = useCallback(() => setCurrentSlide((p) => (count ? (p - 1 + count) % count : 0)), [count]);

  useEffect(() => {
    if (currentSlide >= count) setCurrentSlide(0);
  }, [count, currentSlide]);

  useEffect(() => {
    if (isPaused || !autoplayMs || count < 2) return;
    const interval = setInterval(nextSlide, autoplayMs);
    return () => clearInterval(interval);
  }, [isPaused, nextSlide, autoplayMs, count]);

  if (!count) return null;
  const active = slides[Math.min(currentSlide, count - 1)];

  const follow = (href: string) => {
    if (href === '#video') setIsVideoModalOpen(true);
    else navigateHref(href);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const diff = touchStartXRef.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) (diff > 0 ? nextSlide : prevSlide)();
    touchStartXRef.current = null;
  };

  const dots = (variant: 'mobile' | 'desktop') =>
    slides.map((s, idx) => {
      const isActive = idx === currentSlide;
      return (
        <button
          key={`${s.title}-${idx}`}
          type="button"
          onClick={() => setCurrentSlide(idx)}
          aria-label={cms.t('home.hero.dot_aria', { number: idx + 1 })}
          aria-current={isActive}
          className={
            variant === 'mobile'
              ? `transition-all duration-300 rounded-full cursor-pointer ${isActive ? 'w-7 h-1.5 bg-[#18181B]' : 'w-2 h-1.5 bg-stone-300 hover:bg-stone-400'}`
              : `relative rounded-full transition-all duration-300 cursor-pointer overflow-hidden ${isActive ? 'w-8 h-2 bg-[#18181B] shadow-sm' : 'w-2 h-2 bg-stone-300 hover:bg-stone-500'}`
          }
        >
          {variant === 'desktop' && isActive && !isPaused && autoplayMs > 0 && (
            <motion.span
              key={`progress-${idx}`}
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: autoplayMs / 1000, ease: 'linear' }}
              className="absolute inset-y-0 left-0 bg-[#F5D103] rounded-full"
            />
          )}
        </button>
      );
    });

  return (
    <>
      {/* MOBILE HERO */}
      <section
        className="block md:hidden relative w-full bg-white overflow-hidden pt-6 pb-8 px-4 border-b border-stone-200/60"
        onTouchStart={(e) => (touchStartXRef.current = e.touches[0].clientX)}
        onTouchEnd={handleTouchEnd}
      >
        <div className="max-w-md mx-auto flex flex-col items-start">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="w-full"
            >
              {active.badge && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F5D103]/20 text-[#18181B] border border-[#F5D103]/40 text-[11px] font-bold tracking-wider uppercase mb-3">
                  <Sparkles className="w-3 h-3 text-[#B45309] fill-[#F5D103]" />
                  <span>{active.badge}</span>
                </div>
              )}
              <h1 className="text-3xl sm:text-4xl font-extrabold text-[#18181B] leading-[1.08] tracking-tight mb-3">
                <span className="block">{active.title}</span>
                <span className="block text-[#18181B]">{active.titleLine2}</span>
              </h1>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed mb-5 max-w-sm font-normal">{active.description}</p>
              <div className="flex items-center gap-3 w-full mb-6">
                {active.primary.label && (
                  <button
                    type="button"
                    onClick={() => follow(active.primary.href)}
                    className="flex-1 py-3.5 px-5 rounded-full bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md active:scale-98 transition-all cursor-pointer"
                  >
                    <span>{active.primary.label}</span>
                    <ArrowRight className="w-4 h-4 text-[#18181B]" />
                  </button>
                )}
                {active.secondary.label && (
                  <button
                    type="button"
                    onClick={() => follow(active.secondary.href)}
                    className="py-3.5 px-4 rounded-full bg-white border border-stone-200 text-[#18181B] text-xs font-bold flex items-center justify-center gap-2 shadow-2xs hover:bg-stone-50 active:scale-98 transition-all cursor-pointer shrink-0"
                  >
                    <SecondaryIcon icon={active.secondaryIcon} size="sm" />
                    <span>{active.secondary.label}</span>
                  </button>
                )}
              </div>
              <div className="w-full relative rounded-2xl overflow-hidden bg-white border border-stone-200/90 shadow-md mb-4 aspect-[4/3] flex items-center justify-center">
                {/* Mobile layout always uses the slide's mobile picture */}
                <img
                  src={active.image.mobile ?? active.image.desktop ?? undefined}
                  alt={active.image.alt}
                  className="w-full h-full object-cover object-center"
                  width={400}
                  height={300}
                />
              </div>
            </motion.div>
          </AnimatePresence>

          {count > 1 && <div className="flex items-center justify-center gap-1.5 w-full mb-6">{dots('mobile')}</div>}

          {highlights.length > 0 && (
            <div className="w-full bg-white rounded-2xl border border-stone-200/80 p-3 shadow-2xs grid grid-cols-4 divide-x divide-stone-100 text-center" style={{ gridTemplateColumns: `repeat(${highlights.length}, minmax(0, 1fr))` }}>
              {highlights.map((h, i) => (
                <div key={i} className="flex flex-col items-center px-1">
                  <CmsIcon name={h.icon} className="w-4 h-4 text-[#B45309] mb-1" />
                  <span className="text-[10px] font-bold text-[#18181B] leading-tight">{h.title}</span>
                  <span className="text-[8.5px] text-[#737A72]">{h.subtitle}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* DESKTOP & TABLET HERO */}
      <section
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        className="hidden md:flex relative w-full h-[calc(100vh-80px)] min-h-[620px] max-h-[840px] lg:min-h-[680px] lg:max-h-[880px] flex-col overflow-hidden bg-white select-none group/hero"
      >
        <div className="absolute inset-0 w-full h-full pointer-events-none z-0">
          {slides.map((slide, idx) => (
            <motion.div
              key={`${slide.title}-${idx}`}
              initial={false}
              animate={{ opacity: idx === currentSlide ? 1 : 0, scale: idx === currentSlide ? 1 : 1.04 }}
              transition={{ duration: 0.9, ease: [0.25, 1, 0.5, 1] }}
              className="absolute inset-0 w-full h-full"
            >
              <img
                src={slide.image.desktop ?? slide.image.mobile ?? undefined}
                alt={idx === currentSlide ? slide.image.alt : ''}
                className="w-full h-full object-cover object-[82%_center]"
              />
            </motion.div>
          ))}
          <div className="absolute inset-0 bg-gradient-to-r from-white/50 via-white/15 via-32% to-transparent pointer-events-none" />
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={prevSlide}
              className="absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white/85 hover:bg-white text-[#18181B] shadow-lg hover:shadow-xl border border-stone-200/80 backdrop-blur-md flex items-center justify-center transition-all duration-200 opacity-0 group-hover/hero:opacity-100 focus-visible:opacity-100 hover:scale-108 active:scale-95 cursor-pointer"
              aria-label={cms.t('home.hero.prev_aria')}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={nextSlide}
              className="absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white/85 hover:bg-white text-[#18181B] shadow-lg hover:shadow-xl border border-stone-200/80 backdrop-blur-md flex items-center justify-center transition-all duration-200 opacity-0 group-hover/hero:opacity-100 focus-visible:opacity-100 hover:scale-108 active:scale-95 cursor-pointer"
              aria-label={cms.t('home.hero.next_aria')}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 relative z-10 flex-1 flex items-center">
          <div className="w-full pl-12 lg:pl-16 xl:pl-20">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="max-w-md lg:max-w-xl flex flex-col items-start"
              >
                {active.badge && (
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F5D103]/20 text-[#18181B] border border-[#F5D103]/40 text-xs font-bold tracking-wider uppercase mb-4 shadow-2xs">
                    <Sparkles className="w-3.5 h-3.5 text-[#B45309] fill-[#F5D103]" />
                    <span>{active.badge}</span>
                  </div>
                )}
                <h1 className="text-5xl sm:text-6xl lg:text-[72px] xl:text-[78px] font-extrabold tracking-tight text-[#18181B] leading-[1.02] mb-5">
                  <span className="block">{active.title}</span>
                  <span className="block text-[#18181B]">{active.titleLine2}</span>
                </h1>
                <p className="text-sm lg:text-base text-stone-600 leading-relaxed mb-7 font-normal max-w-md">{active.description}</p>
                <div className="flex items-center gap-4 mb-2">
                  {active.primary.label && (
                    <button
                      type="button"
                      onClick={() => follow(active.primary.href)}
                      className="btn-magnetic inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] text-sm font-bold shadow-md hover:shadow-lg transition-all cursor-pointer group"
                    >
                      <span>{active.primary.label}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#18181B] group-hover:translate-x-1 transition-transform" />
                    </button>
                  )}
                  {active.secondary.label && (
                    <button
                      type="button"
                      onClick={() => follow(active.secondary.href)}
                      className="inline-flex items-center gap-2.5 text-sm font-bold text-[#18181B] hover:text-[#B45309] cursor-pointer group transition-colors py-1"
                    >
                      <SecondaryIcon icon={active.secondaryIcon} size="md" />
                      <span>{active.secondary.label}</span>
                    </button>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 relative z-10 pb-4 shrink-0">
          {count > 1 && <div className="flex items-center justify-center gap-2 mb-3.5">{dots('desktop')}</div>}
          {highlights.length > 0 && (
            <div className="w-full bg-white/95 backdrop-blur-md rounded-3xl shadow-xl border border-black/[0.06] p-4">
              <div className="grid divide-x divide-stone-200/80" style={{ gridTemplateColumns: `repeat(${highlights.length}, minmax(0, 1fr))` }}>
                {highlights.map((h, i) => (
                  <div key={i} className="flex flex-col items-center text-center px-2">
                    <CmsIcon name={h.icon} className="w-5 h-5 text-[#B45309] mb-1.5" strokeWidth={1.8} />
                    <p className="text-xs font-bold text-[#18181B] leading-tight">{h.title}</p>
                    <p className="text-[10.5px] text-[#737A72] leading-tight mt-0.5">{h.subtitle}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <VideoModal isOpen={isVideoModalOpen} onClose={() => setIsVideoModalOpen(false)} />
    </>
  );
};

