import React, { useState } from 'react';
import { ArrowRight, Play, Volume2, VolumeX } from 'lucide-react';
import { VideoModal } from './VideoModal';
import { useCms } from '../cms/CmsProvider';
import { CmsA } from '../cms/components';

export const BrandStory: React.FC = () => {
  const cms = useCms();
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const bg = cms.get('home.brand_story.background_video');
  const poster = cms.img('home.brand_story.poster');
  const stats = cms.get('home.brand_story.stats');
  const button = cms.link('home.brand_story.button');
  const videoButton = cms.t('home.brand_story.video_button');
  const place = cms.t('home.brand_story.place');

  return (
    <section id="story" className="py-6 sm:py-10 bg-white">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div className="relative rounded-3xl sm:rounded-[32px] overflow-hidden min-h-[460px] sm:min-h-[520px] lg:min-h-[560px] flex items-center bg-stone-950 border border-stone-800/40">
          {bg ? (
            <video key={bg} autoPlay loop muted={isMuted} playsInline poster={poster.desktop ?? undefined} className="absolute inset-0 w-full h-full object-cover scale-[1.02]">
              <source src={bg} type="video/mp4" />
            </video>
          ) : (
            poster.desktop && <img src={poster.desktop} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-stone-950/90 via-stone-950/65 to-stone-950/30" />

          <div className="relative z-10 w-full px-6 sm:px-12 lg:px-16 py-12 sm:py-16">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F5D103]" />
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#F5D103]">{cms.t('home.brand_story.eyebrow')}</span>
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-[1.15] mb-4">
                {cms.t('home.brand_story.title')} <br />
                <span className="text-white/65 font-normal">{cms.t('home.brand_story.title_muted')}</span>
              </h2>
              <p className="text-sm sm:text-base text-stone-300 leading-relaxed font-normal mb-8 max-w-xl">{cms.t('home.brand_story.text')}</p>
              {stats.length > 0 && (
                <div className="grid gap-4 sm:gap-8 pt-6 pb-8 border-t border-white/10 max-w-lg mb-8" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
                  {stats.map((s, i) => (
                    <div key={i}>
                      <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">{s.value}</div>
                      <div className="text-xs text-stone-400 mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                {button.label && (
                  <CmsA
                    link={button}
                    className="btn-magnetic inline-flex items-center gap-2.5 px-6 py-3 rounded-full bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] text-xs sm:text-sm font-bold transition-all shadow-sm cursor-pointer"
                  >
                    <span>{button.label}</span>
                    <ArrowRight className="w-4 h-4" />
                  </CmsA>
                )}
                {videoButton && (
                  <button
                    type="button"
                    onClick={() => setIsVideoModalOpen(true)}
                    className="inline-flex items-center gap-2.5 px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/15 text-xs sm:text-sm font-medium backdrop-blur-md transition-all cursor-pointer"
                    aria-label={cms.t('home.brand_story.video_button_aria')}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{videoButton}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {place && (
            <div className="absolute bottom-5 right-5 sm:bottom-6 sm:right-6 hidden sm:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-xs text-stone-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="font-medium text-stone-200">{place}</span>
              <span className="text-stone-400 text-[11px]">· {cms.t('home.brand_story.place_area')}</span>
              {bg && (
                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  className="ml-1 text-stone-400 hover:text-white transition-colors cursor-pointer"
                  aria-label={isMuted ? cms.t('home.brand_story.unmute_aria') : cms.t('home.brand_story.mute_aria')}
                  title={isMuted ? cms.t('home.brand_story.unmute_aria') : cms.t('home.brand_story.mute_aria')}
                >
                  {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-[#F5D103]" />}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <VideoModal isOpen={isVideoModalOpen} onClose={() => setIsVideoModalOpen(false)} />
    </section>
  );
};
