import React, { useState } from 'react';
import { ArrowRight, Play, Volume2, VolumeX } from 'lucide-react';
import { VideoModal } from './VideoModal';
import { useNavigation } from '../context/NavigationContext';

export const BrandStory: React.FC = () => {
  const { goToStory } = useNavigation();
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  return (
    <section id="story" className="py-6 sm:py-10 bg-white">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div className="relative rounded-3xl sm:rounded-[32px] overflow-hidden min-h-[460px] sm:min-h-[520px] lg:min-h-[560px] flex items-center bg-stone-950 border border-stone-800/40">
          {/* Subtle Ambient Video / Poster Background */}
          <video
            autoPlay
            loop
            muted={isMuted}
            playsInline
            poster="https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?auto=format&fit=crop&w=1920&q=80"
            className="absolute inset-0 w-full h-full object-cover scale-[1.02]"
          >
            <source
              src="https://assets.mixkit.co/videos/preview/mixkit-farmer-walking-in-a-crop-field-at-sunset-41221-large.mp4"
              type="video/mp4"
            />
          </video>

          {/* Minimalist Cinematic Gradient Overlay - Ensures effortless readability without text-shadow clutter */}
          <div className="absolute inset-0 bg-gradient-to-r from-stone-950/90 via-stone-950/65 to-stone-950/30" />

          {/* Content Layout */}
          <div className="relative z-10 w-full px-6 sm:px-12 lg:px-16 py-12 sm:py-16">
            <div className="max-w-2xl">
              {/* Subtle Minimal Eyebrow */}
              <div className="inline-flex items-center gap-2 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F5D103]" />
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#F5D103]">
                  Ethical Sourcing &amp; Heritage
                </span>
              </div>

              {/* Minimal Editorial Title */}
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-[1.15] mb-4">
                Organic produce, <br />
                <span className="text-white/65 font-normal">direct from family farms.</span>
              </h2>

              {/* Quiet Narrative */}
              <p className="text-sm sm:text-base text-stone-300 leading-relaxed font-normal mb-8 max-w-xl">
                We work directly with certified local growers in Hertfordshire and Kent. Fresh harvest delivered with genuine care, zero air-miles, and completely plastic-free packaging.
              </p>

              {/* Minimal Inline Metrics */}
              <div className="grid grid-cols-3 gap-4 sm:gap-8 pt-6 pb-8 border-t border-white/10 max-w-lg mb-8">
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">0 mi</div>
                  <div className="text-xs text-stone-400 mt-1">Air-mile sourcing</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">100%</div>
                  <div className="text-xs text-stone-400 mt-1">Plastic-free trays</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">48h</div>
                  <div className="text-xs text-stone-400 mt-1">Farm to doorstep</div>
                </div>
              </div>

              {/* Refined CTAs */}
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={goToStory}
                  className="btn-magnetic inline-flex items-center gap-2.5 px-6 py-3 rounded-full bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] text-xs sm:text-sm font-bold transition-all shadow-sm cursor-pointer"
                >
                  <span>Explore Our Story</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsVideoModalOpen(true)}
                  className="inline-flex items-center gap-2.5 px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/15 text-xs sm:text-sm font-medium backdrop-blur-md transition-all cursor-pointer"
                  aria-label="Watch our farm documentary"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Watch Film</span>
                </button>
              </div>
            </div>
          </div>

          {/* Understated Origin Attribution Badge (Bottom Right) */}
          <div className="absolute bottom-5 right-5 sm:bottom-6 sm:right-6 hidden sm:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-xs text-stone-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="font-medium text-stone-200">Broadwater Farm</span>
            <span className="text-stone-400 text-[11px]">· Hertfordshire</span>
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className="ml-1 text-stone-400 hover:text-white transition-colors cursor-pointer"
              aria-label={isMuted ? 'Unmute video audio' : 'Mute video audio'}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-[#F5D103]" />}
            </button>
          </div>
        </div>
      </div>

      <VideoModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
      />
    </section>
  );
};
