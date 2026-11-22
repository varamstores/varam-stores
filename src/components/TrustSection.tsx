import React, { useRef, useState } from 'react';
import { Star, CheckCircle, Quote, ChevronLeft, ChevronRight, Play, Pause, User } from 'lucide-react';
import { useFeaturedReviews, useReviewSummary } from '../lib/catalogue';
import { useCms } from '../cms/CmsProvider';
import { InlineText } from '../cms/components';

const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });

/** Customer reviews. Only approved reviews are shown; the section hides itself when there are none. */
export const TrustSection: React.FC = () => {
  const cms = useCms();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const { data: reviews = [] } = useFeaturedReviews(12);
  const { data: summary } = useReviewSummary();
  if (!reviews.length) return null;
  const doubled = [...reviews, ...reviews];
  const assurances = cms.get('home.testimonials.assurances');

  const scroll = (direction: 'left' | 'right') => scrollContainerRef.current?.scrollBy({ left: direction === 'left' ? -380 : 380, behavior: 'smooth' });

  return (
    <section aria-label={cms.t('home.testimonials.title')} className="py-16 sm:py-24 bg-white border-b border-stone-200 overflow-hidden">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 sm:mb-14">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[#B45309] mb-2.5">
              <CheckCircle className="w-3.5 h-3.5 text-[#B45309]" />
              <span>{cms.t('home.testimonials.eyebrow')}</span>
            </div>
            <h2 className="text-3xl sm:text-4xl text-[#18181B] font-extrabold tracking-tight mb-3">{cms.t('home.testimonials.title')}</h2>
            <p className="text-sm sm:text-base text-stone-600 leading-relaxed font-normal">{cms.t('home.testimonials.text')}</p>
          </div>
          <div className="flex items-center gap-2 self-start md:self-end shrink-0">
            <button
              type="button"
              onClick={() => setIsPaused(!isPaused)}
              aria-label={isPaused ? cms.t('home.testimonials.resume_aria') : cms.t('home.testimonials.pause_aria')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-stone-200 bg-[#F8FAFC] hover:bg-white text-xs font-semibold text-[#18181B] transition-colors shadow-2xs cursor-pointer mr-1"
            >
              {isPaused ? <Play className="w-3.5 h-3.5 text-[#B45309] fill-current" /> : <Pause className="w-3.5 h-3.5 text-[#B45309] fill-current" />}
              <span>{isPaused ? cms.t('home.testimonials.resume') : cms.t('home.testimonials.pause')}</span>
            </button>
            <button
              type="button"
              onClick={() => scroll('left')}
              aria-label={cms.t('home.testimonials.prev_aria')}
              className="w-10 h-10 rounded-full border border-stone-200 bg-[#F8FAFC] hover:bg-white flex items-center justify-center text-[#18181B] hover:text-[#B45309] transition-all shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => scroll('right')}
              aria-label={cms.t('home.testimonials.next_aria')}
              className="w-10 h-10 rounded-full border border-stone-200 bg-[#F8FAFC] hover:bg-white flex items-center justify-center text-[#18181B] hover:text-[#B45309] transition-all shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div ref={scrollContainerRef} className="relative w-full overflow-x-auto no-scrollbar group-testimonials select-none">
        <div className="absolute left-0 top-0 bottom-0 w-12 sm:w-28 z-10 pointer-events-none bg-gradient-to-r from-white via-white/85 to-transparent" aria-hidden="true" />
        <div className="absolute right-0 top-0 bottom-0 w-12 sm:w-28 z-10 pointer-events-none bg-gradient-to-l from-white via-white/85 to-transparent" aria-hidden="true" />
        <div style={{ animationPlayState: isPaused ? 'paused' : undefined }} className="animate-testimonials-infinite flex items-stretch gap-5 sm:gap-6 py-4 px-4 sm:px-8">
          {doubled.map((review, idx) => (
            <div
              key={`${review.id}-${idx}`}
              aria-hidden={idx >= reviews.length ? true : undefined}
              className="w-[300px] xs:w-[340px] sm:w-[380px] md:w-[420px] shrink-0 bg-white rounded-3xl p-6 sm:p-7 border border-stone-200 shadow-2xs hover:shadow-md hover:border-[#F5D103] transition-all duration-300 flex flex-col justify-between group/card"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-1 text-[#F5D103]" aria-label={`${review.rating}/5`}>
                    {Array.from({ length: review.rating }, (_, i) => (
                      <Star key={i} className="w-4 h-4 fill-[#F5D103] text-[#B45309]" />
                    ))}
                  </div>
                  <Quote className="w-6 h-6 text-stone-200 group-hover/card:text-[#F5D103] transition-colors" />
                </div>
                <p className="text-sm sm:text-[15px] text-[#18181B] leading-relaxed font-normal mb-6">&ldquo;{review.body}&rdquo;</p>
              </div>
              <div className="flex items-center gap-3.5 pt-4 border-t border-stone-100 mt-auto">
                {review.avatarUrl ? (
                  <img src={review.avatarUrl} alt="" loading="lazy" className="w-11 h-11 rounded-full object-cover border border-stone-200 shrink-0" />
                ) : (
                  <span className="w-11 h-11 rounded-full bg-stone-100 border border-stone-200 shrink-0 flex items-center justify-center text-stone-400">
                    <User className="w-5 h-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs sm:text-sm font-bold text-[#18181B] truncate">{review.displayName}</h4>
                    {review.isVerified && (
                      <span className="text-[10px] font-semibold text-[#92400E] bg-amber-100 px-2 py-0.5 rounded border border-amber-200/60 shrink-0">{cms.t('home.testimonials.verified')}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-stone-500 font-normal truncate mt-0.5">
                    {review.locationLabel && <><span className="truncate">{review.locationLabel}</span><span>•</span></>}
                    <span className="shrink-0">{monthYear.format(new Date(review.createdAt))}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {summary && summary.count > 0 && summary.average != null && (
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 mt-10">
          <div className="bg-[#F8FAFC] rounded-2xl border border-stone-200 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 max-w-4xl mx-auto shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center text-[#18181B] bg-white border border-stone-200 px-3 py-1 rounded-lg font-bold text-sm shadow-2xs">
                <Star className="w-4 h-4 fill-[#F5D103] text-[#B45309] mr-1.5" />
                <span>{summary.average.toFixed(1)} / 5.0</span>
              </div>
              <span className="text-xs sm:text-sm text-stone-600 font-medium">
                <InlineText text={cms.t('home.testimonials.rating_summary', { count: summary.count.toLocaleString('en-GB') })} strongClass="text-[#18181B] font-bold" />
              </span>
            </div>
            {assurances.length > 0 && (
              <div className="flex items-center gap-4 text-xs font-semibold text-[#18181B]">
                {assurances.map((a, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="text-stone-300">|</span>}
                    <span className="flex items-center gap-1.5">
                      {i === 0 && <span className="w-2 h-2 rounded-full bg-[#F5D103] inline-block" />}
                      {a.text}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
